import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { db, chatMessages, projects, memberships, files } from "@workspace/db";
import { eq, and, or, isNull, asc, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createError } from "../middlewares/errorHandler";
import { aiRateLimiter } from "../middlewares/rateLimit";
import { cuid } from "../lib/cuid";
import { logger } from "../lib/logger";
import { runInProject } from "../lib/executor";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function assertProjectAccess(projectId: string, userId: string) {
  const memberSubquery = db.select({ workspaceId: memberships.workspaceId })
    .from(memberships).where(eq(memberships.userId, userId));
  const [p] = await db.select().from(projects).where(and(
    eq(projects.id, projectId),
    isNull(projects.deletedAt),
    or(eq(projects.ownerId, userId), sql`${projects.workspaceId} IN (${memberSubquery})`),
  )).limit(1);
  if (!p) throw createError("Project not found", 404);
  return p;
}

// ── Extract $ command lines the AI wants to auto-run ──────────────────────────
function extractAutoRunCommands(content: string): { command: string; idx: number }[] {
  const results: { command: string; idx: number }[] = [];
  let idx = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("$ ")) {
      const cmd = trimmed.slice(2).trim();
      if (cmd) results.push({ command: cmd, idx: idx++ });
    }
  }
  return results;
}

// ── Parse <<<WRITE:path>>> ... <<<END>>> and <<<DELETE:path>>> blocks ─────────
interface FileOp {
  action: "write" | "delete";
  path: string;
  content?: string;
}

function extractFileOps(content: string): FileOp[] {
  const ops: FileOp[] = [];

  // WRITE blocks: <<<WRITE:path>>>\ncontent\n<<<END>>>
  const writeRe = /<<<WRITE:([^\n>]+)>>>\n([\s\S]*?)<<<END>>>/g;
  let m: RegExpExecArray | null;
  while ((m = writeRe.exec(content)) !== null) {
    const path = m[1].trim();
    const fileContent = m[2];
    if (path && !path.includes("..") && !path.startsWith("/")) {
      ops.push({ action: "write", path, content: fileContent });
    }
  }

  // DELETE blocks: <<<DELETE:path>>>
  const deleteRe = /<<<DELETE:([^\n>]+)>>>/g;
  while ((m = deleteRe.exec(content)) !== null) {
    const path = m[1].trim();
    if (path && !path.includes("..") && !path.startsWith("/")) {
      ops.push({ action: "delete", path });
    }
  }

  return ops;
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript", ts: "text/typescript", tsx: "text/typescript",
    jsx: "text/javascript", py: "text/x-python", html: "text/html", css: "text/css",
    json: "application/json", md: "text/markdown", sh: "text/x-shellscript",
    yaml: "text/yaml", yml: "text/yaml", go: "text/x-go", rs: "text/x-rust",
    java: "text/x-java", sql: "text/x-sql", toml: "text/plain", env: "text/plain",
  };
  return map[ext] ?? "text/plain";
}

// Write or update a file in the DB
async function upsertFile(projectId: string, filePath: string, content: string) {
  const name = filePath.split("/").pop() ?? filePath;
  const mime = mimeFromPath(filePath);
  const size = Buffer.byteLength(content, "utf8");

  // Ensure parent directories exist
  const parts = filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dirPath = parts.slice(0, i).join("/");
    const dirName = parts[i - 1];
    const [existingDir] = await db.select({ id: files.id })
      .from(files).where(and(eq(files.projectId, projectId), eq(files.path, dirPath))).limit(1);
    if (!existingDir) {
      await db.insert(files).values({
        id: cuid(), projectId, path: dirPath, name: dirName,
        content: "", mimeType: "inode/directory", size: 0, isDir: true,
      }).onConflictDoNothing();
    }
  }

  const [existing] = await db.select({ id: files.id })
    .from(files).where(and(eq(files.projectId, projectId), eq(files.path, filePath))).limit(1);

  let file;
  if (existing) {
    [file] = await db.update(files)
      .set({ content, size, mimeType: mime, deletedAt: null, updatedAt: new Date() })
      .where(eq(files.id, existing.id)).returning();
  } else {
    [file] = await db.insert(files).values({
      id: cuid(), projectId, path: filePath, name, content, mimeType: mime, size, isDir: false,
    }).returning();
  }

  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  return file;
}

// Soft-delete a file in the DB
async function deleteFile(projectId: string, filePath: string) {
  const [existing] = await db.select({ id: files.id })
    .from(files).where(and(eq(files.projectId, projectId), eq(files.path, filePath), isNull(files.deletedAt))).limit(1);
  if (!existing) return false;
  await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, existing.id));
  return true;
}

interface FileOpResult {
  path: string; action: string; success: boolean; size?: number; error?: string;
}
interface CmdResult {
  command: string; status: string; output: string; exitCode?: number;
}

function buildContinuationMessage(step: number, fileOps: FileOpResult[], cmds: CmdResult[]): string {
  const lines: string[] = [`[Tool results from step ${step}]`];

  if (fileOps.length > 0) {
    lines.push("\nFile operations:");
    for (const op of fileOps) {
      if (op.success) {
        lines.push(`  ✓ ${op.action.toUpperCase()} ${op.path}${op.size !== undefined ? ` (${op.size} bytes)` : ""}`);
      } else {
        lines.push(`  ✗ ${op.action.toUpperCase()} ${op.path} — ERROR: ${op.error}`);
      }
    }
  }

  if (cmds.length > 0) {
    lines.push("\nCommand results:");
    for (const cmd of cmds) {
      lines.push(`\n$ ${cmd.command}`);
      lines.push(`Exit code: ${cmd.exitCode ?? "?"}`);
      if (cmd.output) {
        const trimmed = cmd.output.slice(0, 4000);
        lines.push(`Output:\n${trimmed}${cmd.output.length > 4000 ? "\n...(truncated)" : ""}`);
      }
    }
  }

  const hasErrors = fileOps.some(o => !o.success) || cmds.some(c => c.status === "error" || (c.exitCode !== undefined && c.exitCode !== 0));
  if (hasErrors) {
    lines.push("\nSome operations had errors. Diagnose and fix them now — don't ask for permission.");
  } else {
    lines.push("\nAll operations succeeded. Continue if there are more steps needed to fully complete the task, or wrap up with a summary if done.");
  }

  return lines.join("\n");
}

router.post("/chat/:projectId", requireAuth, aiRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        message: z.string().min(1).max(32000),
        fileContext: z.string().optional(),
        filePath: z.string().optional(),
        imageData: z.string().optional(),
        imageMimeType: z.string().optional(),
        images: z.array(z.object({ data: z.string(), mimeType: z.string() })).max(10).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(createError("Validation error", 400, parsed.error.errors));

      const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
      const { message, fileContext, filePath, imageData, imageMimeType, images } = parsed.data;

      const allImages: { data: string; mimeType: string }[] = images?.length
        ? images
        : imageData && imageMimeType
          ? [{ data: imageData, mimeType: imageMimeType }]
          : [];

      const projectFiles = await db.select({ path: files.path, content: files.content, mimeType: files.mimeType })
        .from(files)
        .where(and(eq(files.projectId, project.id), isNull(files.deletedAt), eq(files.isDir, false)))
        .orderBy(asc(files.path))
        .limit(80);

      const history = await db.select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages).where(eq(chatMessages.projectId, project.id))
        .orderBy(desc(chatMessages.createdAt)).limit(30);
      history.reverse();

      const userContent = message || "Please analyze these images.";
      await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, userId: req.user!.id, role: "user", content: userContent,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

      const systemPrompt = buildSystemPrompt(project.name, project.language, projectFiles, filePath, fileContext);

      const userMessageContent: OpenAI.ChatCompletionContentPart[] = [{ type: "text", text: userContent }];
      for (const img of allImages) {
        userMessageContent.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: "high" },
        });
      }

      const MAX_STEPS = 6;
      let allContent = "";

      const agentMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: allImages.length ? userMessageContent : userContent },
      ];

      // ── Agentic loop ──────────────────────────────────────────────────────
      for (let step = 1; step <= MAX_STEPS; step++) {
        send({ type: "agent_step", step, maxSteps: MAX_STEPS });

        if (step > 1) {
          send({ type: "delta", content: "\n\n---\n" });
          allContent += "\n\n---\n";
        }

        let stepContent = "";
        try {
          const stream = await openai.chat.completions.create({
            model: "gpt-5.1",
            max_completion_tokens: 16000,
            messages: agentMessages,
            stream: true,
          });
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              stepContent += delta;
              allContent += delta;
              send({ type: "delta", content: delta });
            }
          }
        } catch (e) {
          logger.warn({ err: e }, "OpenAI error");
          const errMsg = "AI service is temporarily unavailable. Please try again.";
          stepContent = errMsg;
          allContent += errMsg;
          send({ type: "delta", content: errMsg });
          break;
        }

        // ── File operations ──────────────────────────────────────────────────
        const fileOps = extractFileOps(stepContent);
        const fileOpResults: FileOpResult[] = [];
        if (fileOps.length > 0) {
          send({ type: "file_ops_start", count: fileOps.length });
          for (const op of fileOps) {
            try {
              if (op.action === "write" && op.content !== undefined) {
                const saved = await upsertFile(project.id, op.path, op.content);
                send({ type: "file_write", path: op.path, size: saved.size });
                fileOpResults.push({ path: op.path, action: "write", success: true, size: saved.size });
              } else if (op.action === "delete") {
                const deleted = await deleteFile(project.id, op.path);
                send({ type: "file_delete", path: op.path, found: deleted });
                fileOpResults.push({ path: op.path, action: "delete", success: true });
              }
            } catch (e) {
              logger.warn({ err: e, op }, "File op failed");
              const errMsg = (e as Error).message;
              send({ type: "file_op_error", path: op.path, action: op.action, error: errMsg });
              fileOpResults.push({ path: op.path, action: op.action, success: false, error: errMsg });
            }
          }
          send({ type: "file_ops_done" });
        }

        // ── Shell commands ───────────────────────────────────────────────────
        const autoRunCmds = extractAutoRunCommands(stepContent);
        const cmdResults: CmdResult[] = [];
        if (autoRunCmds.length > 0) {
          send({ type: "runs_start", count: autoRunCmds.length });
          for (const { command, idx } of autoRunCmds) {
            send({ type: "run_start", idx, command });
            try {
              const result = await runInProject(project.id, command, projectFiles);
              send({ type: "run_result", idx, command, ...result });
              cmdResults.push({ command, status: result.status, output: result.output ?? "", exitCode: result.exitCode });
            } catch (e) {
              const errMsg = (e as Error).message;
              send({ type: "run_result", idx, command, status: "error", output: errMsg, exitCode: 1 });
              cmdResults.push({ command, status: "error", output: errMsg, exitCode: 1 });
            }
          }
          send({ type: "runs_done" });
        }

        // If no actions were taken, the agent is done
        if (fileOps.length === 0 && autoRunCmds.length === 0) break;
        if (step === MAX_STEPS) break;

        // Feed results back so the agent can react and continue
        agentMessages.push({ role: "assistant", content: stepContent });
        agentMessages.push({ role: "user", content: buildContinuationMessage(step, fileOpResults, cmdResults) });
      }

      const [saved] = await db.insert(chatMessages).values({
        id: cuid(), projectId: project.id, role: "assistant", content: allContent,
      }).returning();

      send({ type: "done", messageId: saved.id });
      res.end();
    } catch (err) { next(err); }
  });

router.get("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await assertProjectAccess(String(req.params.projectId), req.user!.id);
    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.projectId, project.id))
      .orderBy(asc(chatMessages.createdAt)).limit(200);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

router.delete("/chat/:projectId", requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, String(req.params.projectId)), eq(projects.ownerId, req.user!.id), isNull(projects.deletedAt))).limit(1);
    if (!project) return next(createError("Project not found", 404));
    await db.delete(chatMessages).where(eq(chatMessages.projectId, project.id));
    res.json({ data: null, message: "Chat history cleared" });
  } catch (err) { next(err); }
});

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(
  projectName: string,
  language: string,
  projectFiles: { path: string; content: string; mimeType: string }[],
  activeFilePath?: string,
  activeFileContent?: string,
): string {
  const lines: string[] = [
    `You are OrahAI, an expert autonomous coding agent embedded in a cloud IDE — similar to Replit Agent.`,
    `Project: "${projectName}" (primary language: ${language}).`,
    ``,
    `## Your capabilities`,
    `- Read every file in the project (provided below in full)`,
    `- Create, overwrite, or delete any file using the WRITE/DELETE syntax`,
    `- Run shell commands that execute in the project sandbox`,
    `- Iterate: after you act, you receive tool results and can continue fixing/improving`,
    ``,
    `## Core principles`,
    `1. **Be proactive and autonomous.** When asked to do something, DO IT immediately — never ask for permission or say "I'll show you the code." Apply changes directly.`,
    `2. **Think before you act.** For non-trivial tasks, briefly outline your plan (1–3 lines), then execute it.`,
    `3. **Always write complete files.** Every WRITE block must contain the full file content — never partial snippets or placeholders.`,
    `4. **Verify your work.** After writing code, run the relevant build/test/lint command (e.g. \`$ npm run build\`, \`$ python -c "import main"\`) to catch errors early.`,
    `5. **Fix errors immediately.** If a command fails or has a non-zero exit code, diagnose the error from the output and fix it in the next step — do not ask the user.`,
    `6. **Match existing style.** Look at existing code before writing new code. Follow the same patterns, naming conventions, and file structure.`,
    `7. **Install missing packages.** If code needs a package that isn't in the project, run \`$ npm install <pkg>\` (or the equivalent for the language) before using it.`,
    `8. **Be thorough.** Don't leave partial implementations. Complete the full task including edge cases, error handling, and any glue code needed.`,
    ``,
    `## File operation syntax`,
    ``,
    `### Write / create a file:`,
    `<<<WRITE:path/to/file.ts>>>`,
    `(complete file content here — no truncation, no placeholders)`,
    `<<<END>>>`,
    ``,
    `### Delete a file:`,
    `<<<DELETE:path/to/file.ts>>>`,
    ``,
    `Rules:`,
    `- Paths are relative to project root — no leading "/" or ".." allowed.`,
    `- You can include multiple WRITE and DELETE blocks in one response.`,
    `- NEVER show code in a markdown block and ask the user to apply it — always use <<<WRITE>>>.`,
    `- NEVER leave placeholder comments like "// TODO: add logic here" — write the actual logic.`,
    ``,
    `## Shell command syntax`,
    `Put commands on their own line starting with \`$ \`:`,
    `$ npm install`,
    `$ npm run build`,
    `$ python main.py`,
    `$ cargo build`,
    `Commands run automatically in the project sandbox. Use them to: install deps, run builds, execute tests, verify output.`,
    `Run commands AFTER writing files (not before). Run the build/test to confirm correctness.`,
    ``,
    `## Iteration`,
    `After you write files and run commands, you receive a tool-results message showing what succeeded or failed.`,
    `- If there are errors: diagnose from the output and fix immediately (rewrite the affected file, adjust the command, etc.).`,
    `- If everything succeeded and the task is fully done: write a concise summary of what you built/changed.`,
    `- If there is more work: continue with the next step.`,
    `You can iterate up to 6 times — use them wisely.`,
    ``,
  ];

  if (activeFilePath && activeFileContent) {
    lines.push(`## Currently open file: \`${activeFilePath}\``);
    lines.push(`\`\`\`${langFromPath(activeFilePath)}`);
    lines.push(activeFileContent.slice(0, 12000));
    lines.push("```");
    lines.push("");
  }

  const otherFiles = projectFiles.filter(f => f.path !== activeFilePath);
  if (otherFiles.length > 0) {
    lines.push("## Project files:");
    let totalChars = 0;
    const MAX_TOTAL = 60000;
    for (const f of otherFiles) {
      if (totalChars >= MAX_TOTAL) {
        lines.push(`\n_(remaining files omitted — total context limit reached)_`);
        break;
      }
      const excerpt = f.content.slice(0, 6000);
      lines.push(`\n### \`${f.path}\``);
      lines.push(`\`\`\`${langFromPath(f.path)}`);
      lines.push(excerpt + (f.content.length > 6000 ? "\n…(file truncated for context)" : ""));
      lines.push("```");
      totalChars += excerpt.length;
    }
  } else if (!activeFilePath) {
    lines.push("## Project files: (none yet — start by creating files with <<<WRITE:filename>>>)");
  }

  return lines.join("\n");
}

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", html: "html", css: "css",
    scss: "scss", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "bash", sql: "sql", toml: "toml",
  };
  return map[ext] ?? ext;
}

export default router;
