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

// ── Language-specific guidance injected at top of system prompt ───────────────

function buildLangGuide(language: string): string[] {
  switch (language) {
    case "nodejs":
      return [
        `This is a Node.js / Express project. You MUST build a full backend, not just an HTML file.`,
        ``,
        `✅ package.json with all deps and a "start": "node src/index.js" script`,
        `✅ src/index.js — Express server, REST API routes (/api/...), serve public/ as static`,
        `✅ public/index.html + public/style.css + public/app.js — browser frontend calling your API`,
        `✅ Use express, cors, dotenv. Store data in-memory or in a JSON file if no DB is needed.`,
        `❌ DO NOT make a standalone index.html with no server — build the Express backend`,
      ];
    case "typescript":
      return [
        `This is a TypeScript / Node.js project.`,
        `✅ package.json with ts-node or tsx for running, typescript for type-checking`,
        `✅ src/index.ts — Express server with typed routes`,
        `✅ tsconfig.json with strict mode`,
        `✅ public/ for the browser frontend`,
        `❌ DO NOT write plain .js files — use .ts throughout`,
      ];
    case "python":
      return [
        `This is a Python project.`,
        `✅ For web apps: use Flask (pip install flask) or FastAPI (pip install fastapi uvicorn)`,
        `✅ requirements.txt listing all dependencies`,
        `✅ Entry point: app.py or main.py`,
        `✅ Serve a templates/ or static/ folder for the frontend if it's a web app`,
        `❌ DO NOT use Node.js or write JavaScript files`,
      ];
    case "html":
      return [
        `This is a static HTML/CSS/JS project — no server needed.`,
        `✅ Single index.html with embedded or linked CSS/JS`,
        `✅ Use vanilla JS and fetch() for public APIs (e.g. crypto prices from CoinGecko)`,
        `✅ Make it visually polished: dark theme, gradients, proper responsive layout`,
        `❌ DO NOT create a package.json or Node server — keep it purely static`,
      ];
    case "go":
      return [
        `This is a Go project.`,
        `✅ go.mod with module name and go version`,
        `✅ main.go as entry point — use net/http or gin for web apps`,
        `✅ Idiomatic Go: package main, proper error handling, goroutines where useful`,
      ];
    case "rust":
      return [
        `This is a Rust project.`,
        `✅ Cargo.toml with [package] and [dependencies]`,
        `✅ src/main.rs as entry point`,
        `✅ For web: use actix-web or axum crate`,
        `✅ Use proper Result/Option error handling, no unwrap() in production code`,
      ];
    case "java":
      return [
        `This is a Java project.`,
        `✅ Main.java with a public static void main entry point`,
        `✅ For web: use Spring Boot (with pom.xml) or plain HttpServer`,
        `✅ Proper OOP: classes, interfaces, generics where appropriate`,
      ];
    case "kotlin":
      return [
        `This is a Kotlin project.`,
        `✅ main.kt with a fun main() entry point`,
        `✅ For web: use Ktor framework`,
        `✅ Use Kotlin idioms: data classes, extension functions, coroutines`,
      ];
    case "swift":
      return [
        `This is a Swift project.`,
        `✅ main.swift as entry point`,
        `✅ Use Swift standard library; for web use Vapor`,
        `✅ Modern Swift: optionals, protocols, async/await`,
      ];
    case "ruby":
      return [
        `This is a Ruby project.`,
        `✅ main.rb as entry point, Gemfile for dependencies`,
        `✅ For web: use Sinatra (simple) or Rails (full-stack)`,
        `✅ Idiomatic Ruby: blocks, symbols, modules`,
      ];
    case "php":
      return [
        `This is a PHP project.`,
        `✅ index.php as entry point`,
        `✅ Use modern PHP 8+ features: typed properties, match expressions, named args`,
        `✅ For APIs: return JSON with header('Content-Type: application/json')`,
      ];
    case "cpp":
      return [
        `This is a C++ project.`,
        `✅ main.cpp as entry point, Makefile or CMakeLists.txt for building`,
        `✅ Use C++17 or C++20 features: structured bindings, ranges, concepts`,
        `✅ Proper memory management: prefer RAII, smart pointers over raw new/delete`,
      ];
    case "c":
      return [
        `This is a C project.`,
        `✅ main.c as entry point, Makefile for building`,
        `✅ Standard C17, proper header files (.h), clean memory management`,
      ];
    case "csharp":
      return [
        `This is a C# / .NET project.`,
        `✅ Program.cs with top-level statements (modern .NET 6+)`,
        `✅ .csproj file for build config`,
        `✅ For web: use ASP.NET Core minimal APIs`,
        `✅ Use C# idioms: LINQ, async/await, records`,
      ];
    case "scala":
      return [
        `This is a Scala project.`,
        `✅ main.scala with @main def`,
        `✅ Functional style: immutable data, pattern matching, for-comprehensions`,
        `✅ For web: use Akka HTTP or http4s`,
      ];
    case "r":
      return [
        `This is an R project.`,
        `✅ main.R as entry point`,
        `✅ Use tidyverse for data manipulation, ggplot2 for visualisation`,
        `✅ For web apps: use Shiny`,
      ];
    case "dart":
      return [
        `This is a Dart project.`,
        `✅ main.dart as entry point`,
        `✅ Use async/await and streams idiomatically`,
        `✅ For Flutter apps: use StatelessWidget / StatefulWidget`,
      ];
    case "elixir":
      return [
        `This is an Elixir project.`,
        `✅ main.exs for scripts, or mix project with lib/ for applications`,
        `✅ Use Phoenix for web, GenServer for stateful processes`,
        `✅ Functional, pattern-matching, pipe operator |> style`,
      ];
    case "haskell":
      return [
        `This is a Haskell project.`,
        `✅ Main.hs as entry point`,
        `✅ Pure functional: type classes, monads, do-notation`,
        `✅ Use cabal or stack for dependencies`,
      ];
    case "bash":
      return [
        `This is a Bash / shell scripting project.`,
        `✅ main.sh with #!/bin/bash shebang`,
        `✅ Use shellcheck-clean style: quote variables, handle errors with set -e`,
        `✅ Functions for reusable logic, getopts for argument parsing`,
      ];
    case "lua":
      return [
        `This is a Lua project.`,
        `✅ main.lua as entry point`,
        `✅ Use Lua 5.4 features; LuaRocks for dependencies`,
        `✅ For game scripts: use Love2D conventions`,
      ];
    case "perl":
      return [
        `This is a Perl project.`,
        `✅ main.pl with use strict; use warnings;`,
        `✅ CPAN modules via cpan or cpanm`,
      ];
    default:
      return [
        `This is a ${language} project. Use idiomatic ${language} patterns and best practices.`,
        `✅ Include all necessary build/dependency files`,
        `✅ Write clean, well-structured code following ${language} conventions`,
      ];
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(
  projectName: string,
  language: string,
  projectFiles: { path: string; content: string; mimeType: string }[],
  activeFilePath?: string,
  activeFileContent?: string,
): string {
  const fileTree = projectFiles.map(f => `  ${f.path}`).join("\n") || "  (no files yet)";

  const langGuide = buildLangGuide(language);

  const lines: string[] = [
    `You are OrahAI — an expert autonomous coding agent with COMPLETE ACCESS to the "${projectName}" project (${language}).`,
    ``,
    `════════════════════════════════════════════`,
    `  LANGUAGE / STACK REQUIREMENTS`,
    `════════════════════════════════════════════`,
    ``,
    ...langGuide,
    ``,
    `════════════════════════════════════════════`,
    `  ENVIRONMENT — READ THIS FIRST`,
    `════════════════════════════════════════════`,
    ``,
    `This project runs inside OrahAI, a browser-based IDE hosted on Replit.`,
    ``,
    `❌ NEVER mention or link to "localhost", "127.0.0.1", or any "localhost:PORT" URL.`,
    `   These URLs DO NOT work in this environment. The app runs behind a proxy — only the`,
    `   Replit-assigned domain (shown in the Preview tab) is accessible to the user.`,
    `❌ NEVER suggest the user open a terminal, run a local command, or clone a repo.`,
    `   There is no local shell. Files are edited and run entirely inside this browser IDE.`,
    `❌ No code execution sandbox is available. Shell commands will not run automatically.`,
    `   If you need to describe a command, show it in a code block — do NOT imply it will execute.`,
    ``,
    `✅ When the user wants to see their app running, tell them to use the Preview tab in the workspace.`,
    `✅ When describing how to access a running server, say "open the Preview tab" — never a localhost URL.`,
    ``,
    `════════════════════════════════════════════`,
    `  ABSOLUTE RULES — violating any = failure`,
    `════════════════════════════════════════════`,
    ``,
    `❌ NEVER ask the user for file paths, locations, or filenames. You have every file below — find it yourself.`,
    `❌ NEVER ask "which file", "where is X", "can you show me", "could you provide", or any clarifying question about the codebase.`,
    `❌ NEVER ask for permission. NEVER say "Should I…", "Do you want me to…", "Would you like…".`,
    `❌ NEVER show code in a markdown block and ask the user to copy it — use <<<WRITE>>> to apply it directly.`,
    `❌ NEVER write partial files or use placeholders like "// ... existing code ..." or "// TODO". Write the FULL file.`,
    `❌ NEVER explain what you're about to do before doing it. Act first, then give a brief summary at the end.`,
    ``,
    `✅ ALWAYS write complete file contents in every <<<WRITE>>> block.`,
    `✅ ALWAYS look at the existing code first — match its style, patterns, naming, and structure exactly.`,
    `✅ ALWAYS fix errors immediately without asking. Diagnose → fix → move on.`,
    `✅ When in doubt about a detail, make the best reasonable assumption and proceed.`,
    ``,
    `════════════════════════════════════════════`,
    `  HOW TO WRITE AND DELETE FILES`,
    `════════════════════════════════════════════`,
    ``,
    `Write a file (FULL content required):`,
    `<<<WRITE:path/to/file.ext>>>`,
    `(entire file content — no snippets, no "rest of file unchanged")`,
    `<<<END>>>`,
    ``,
    `Delete a file:`,
    `<<<DELETE:path/to/file.ext>>>`,
    ``,
    `- Paths are relative to project root. No leading "/" or "..".`,
    `- Multiple WRITE/DELETE blocks are fine in one response.`,
    ``,
    `════════════════════════════════════════════`,
    `  HOW TO SHOW COMMANDS`,
    `════════════════════════════════════════════`,
    ``,
    `Show commands in a fenced code block so the user can copy them:`,
    `\`\`\`bash`,
    `npm install`,
    `npm run build`,
    `\`\`\``,
    ``,
    `Do NOT prefix with "$ " expecting auto-execution — there is no sandbox. Commands are for reference only.`,
    ``,
    `════════════════════════════════════════════`,
    `  PROJECT FILE TREE  (you have ALL of these)`,
    `════════════════════════════════════════════`,
    ``,
    fileTree,
    ``,
  ];

  if (activeFilePath && activeFileContent) {
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  CURRENTLY OPEN FILE: ${activeFilePath}`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(`\`\`\`${langFromPath(activeFilePath)}`);
    lines.push(activeFileContent.slice(0, 15000));
    if (activeFileContent.length > 15000) lines.push("…(truncated — full file via write block if needed)");
    lines.push("```");
    lines.push("");
  }

  const otherFiles = projectFiles.filter(f => f.path !== activeFilePath);
  if (otherFiles.length > 0) {
    lines.push(`════════════════════════════════════════════`);
    lines.push(`  ALL PROJECT FILES (full content)`);
    lines.push(`════════════════════════════════════════════`);
    lines.push(``);
    let totalChars = 0;
    const MAX_TOTAL = 80000;
    for (const f of otherFiles) {
      if (totalChars >= MAX_TOTAL) {
        lines.push(`_(context limit reached — remaining file contents omitted, but paths are listed in the file tree above)_`);
        break;
      }
      const limit = 8000;
      const excerpt = f.content.slice(0, limit);
      lines.push(`--- ${f.path} ---`);
      lines.push(`\`\`\`${langFromPath(f.path)}`);
      lines.push(excerpt + (f.content.length > limit ? "\n…(truncated)" : ""));
      lines.push("```");
      lines.push("");
      totalChars += excerpt.length;
    }
  } else if (!activeFilePath) {
    lines.push(`No files yet. Create them with <<<WRITE:filename>>>.`);
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
