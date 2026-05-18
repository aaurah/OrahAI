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

    // ── Bitcoin SV ─────────────────────────────────────────────────────────
    case "bsv":
      return [
        `This is a Bitcoin SV (BSV) project. You are an expert in the original Bitcoin protocol as restored in BSV.`,
        ``,
        `════ STACK ════`,
        `✅ Primary SDK: @bsv/sdk (npm install @bsv/sdk) — the official BSV TypeScript SDK`,
        `   Imports: { PrivateKey, P2PKH, P2PK, Transaction, Script, ARC, WhatsOnChain, MerklePath } from "@bsv/sdk"`,
        `✅ package.json: "type": "module" (ESM), or use ts-node with tsconfig for TypeScript`,
        ``,
        `════ WHATSONCHAIN API ════`,
        `Base URLs:`,
        `  mainnet: https://api.whatsonchain.com/v1/bsv/main`,
        `  testnet: https://api.whatsonchain.com/v1/bsv/test`,
        `  STN:     https://api.whatsonchain.com/v1/bsv/stn`,
        ``,
        `Endpoints (all GET unless noted):`,
        `  /address/{address}/balance      → { confirmed, unconfirmed } in satoshis`,
        `  /address/{address}/history      → [{ tx_hash, height }]`,
        `  /address/{address}/unspent      → [{ tx_hash, tx_pos, height, value }]  ← UTXOs`,
        `  /tx/hash/{txid}                 → full decoded transaction JSON`,
        `  /tx/{txid}/hex                  → raw transaction hex`,
        `  /tx/{txid}/proof               → BUMP (BSV Unified Merkle Path) for SPV`,
        `  /block/hash/{hash}              → block details`,
        `  /block/{height}/header          → block header`,
        `  /chain/info                     → current chain tip info`,
        `  POST /tx/raw { txhex: "..." }   → broadcast raw transaction, returns txid`,
        `  /search/leaderboard             → top addresses by balance`,
        ``,
        `✅ Always handle WoC rate limits (429) gracefully with retry logic`,
        `✅ For bulk queries use /txs/detail (POST with array of txids, max 20)`,
        ``,
        `════ TERANODE ════`,
        `✅ TeraNode is BSV's enterprise-grade node implementation designed for massive scale (1TB+ blocks)`,
        `✅ It exposes a standard JSON-RPC interface (same as Bitcoin Core RPC):`,
        `   POST http://<node>:<port>/ with { jsonrpc:"2.0", method:"...", params:[...], id:1 }`,
        `   Auth: HTTP Basic (user:password in Authorization header)`,
        `✅ Key RPC methods: getblockchaininfo, getblockcount, getblockhash, getblock, getrawtransaction,`,
        `   sendrawtransaction, getmempoolinfo, getrawmempool, gettxout (UTXO lookup)`,
        `✅ TeraNode supports IPv6, SPV headers, and block streaming for high-throughput apps`,
        `✅ For production, connect to a node provider (TAAL, GorillaPool) rather than self-hosting`,
        ``,
        `════ BITCOIN SCRIPT (BSV Script) ════`,
        `BSV restores the FULL original Bitcoin Script — all disabled opcodes are active:`,
        ``,
        `Standard locking scripts:`,
        `  P2PKH:  OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG`,
        `  P2PK:   <pubKey> OP_CHECKSIG`,
        `  P2MS:   OP_M <pubKey1>...<pubKeyN> OP_N OP_CHECKMULTISIG`,
        `  OP_RETURN: OP_FALSE OP_RETURN <data>   ← on-chain data storage (up to ~100KB)`,
        ``,
        `Restored opcodes (BSV ONLY — NOT available on BTC):`,
        `  OP_CAT    — concatenate two stack items`,
        `  OP_SPLIT  — split a byte sequence at position N`,
        `  OP_AND / OP_OR / OP_XOR — bitwise operations`,
        `  OP_NUM2BIN / OP_BIN2NUM — number ↔ byte array conversion`,
        `  OP_LSHIFT / OP_RSHIFT   — bit shift operations`,
        `  OP_DIV / OP_MOD         — integer division`,
        `  OP_INVERT               — bitwise NOT`,
        ``,
        `Advanced patterns:`,
        `  OP_PUSH_TX   — push the full serialized transaction for introspection (covenant)`,
        `  OP_CODESEPARATOR — used in signature verification customization`,
        `  Covenant scripts — constrain outputs to specific scripts (chain behavior)`,
        `  R-puzzle     — pay to whoever knows a k value (r, s) ECDSA pair`,
        ``,
        `✅ When writing raw Script: use @bsv/sdk Script class`,
        `   Script.fromASM("OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG")`,
        `   Or Script.fromHex("76a914...")`,
        ``,
        `════ TRANSACTIONS ════`,
        `✅ UTXO model — inputs spend previous outputs, outputs create new lockingScripts`,
        `✅ Transaction structure: version | inputs[] | outputs[] | locktime`,
        `✅ Input: prevTxid + outputIndex + unlockingScript + sequence`,
        `✅ Output: satoshis + lockingScript`,
        `✅ Fee: sum(inputs) - sum(outputs) — goes to miner, no separate fee field`,
        `✅ Typical fee rate: 1 sat/byte (BSV fees are tiny vs other chains)`,
        `✅ SIGHASH flags: ALL, NONE, SINGLE, ANYONECANPAY variants`,
        ``,
        `ARC (Transaction Broadcast API — replaces old /tx/broadcast):`,
        `✅ Use ARC class from @bsv/sdk: new ARC("https://api.taal.com/arc", { apiKey: "..." })`,
        `✅ await arc.broadcast(tx) — returns { txid, status, extraInfo }`,
        `✅ ARC validates, stores, and monitors tx status; use await arc.queryTxStatus(txid) to poll`,
        ``,
        `BEEF format (Background Evaluation Extended Format):`,
        `✅ BEEF = raw transaction + embedded ancestor txs + Merkle proofs (BUMPs)`,
        `✅ Allows SPV verification without a full node`,
        `✅ @bsv/sdk: tx.toHexBEEF() / Transaction.fromHexBEEF(hex)`,
        ``,
        `════ SPV & MERKLE PROOFS ════`,
        `✅ SPV = Simplified Payment Verification — verify tx included in a block via Merkle path`,
        `✅ BUMP = BSV Unified Merkle Path — standard compact proof format`,
        `✅ WoC endpoint: /tx/{txid}/proof returns BUMP JSON`,
        `✅ @bsv/sdk: MerklePath.fromObject(bumpJson).verify(txid, blockHeader)`,
        ``,
        `════ METANET & ON-CHAIN DATA ════`,
        `✅ Metanet = BSV protocol for structured on-chain data, like a permanent internet`,
        `✅ OP_RETURN payloads: prefix protocols like B:// (file), MAP (metadata), AIP (signature)`,
        `✅ 1Sat Ordinals — BSV's inscription protocol (similar to BTC ordinals but much cheaper)`,
        `✅ For OP_RETURN: output with 0 satoshis, lockingScript = OP_FALSE OP_RETURN <data chunks>`,
        `✅ To query Metanet/OP_RETURN data: use GorillaPool's Junglebus or BMAP API`,
        ``,
        `════ NETWORKS ════`,
        `  mainnet — production BSV blockchain`,
        `  testnet — BSV test network (free test coins from faucet.bitcoinsv.io)`,
        `  STN     — Scaling Test Network (for stress testing, large blocks)`,
        ``,
        `════ SECURITY ════`,
        `❌ NEVER hardcode private keys in source code — load from env vars or encrypted keystore`,
        `❌ NEVER broadcast unsigned transactions`,
        `❌ NEVER trust unverified UTXO sets — verify with SPV or a trusted node`,
        `❌ NEVER use deprecated bsv.js (npm: bsv) — use @bsv/sdk instead`,
        `✅ Always validate addresses before sending (checksum, network match)`,
        `✅ Always check UTXO is unspent before spending (double-spend prevention)`,
      ];

    case "scrypt":
      return [
        `This is a sCrypt smart contract project for Bitcoin SV (BSV).`,
        `sCrypt compiles TypeScript to native Bitcoin Script — contracts run on-chain as Script.`,
        ``,
        `════ STACK ════`,
        `✅ Package: scrypt-ts (npm install scrypt-ts)`,
        `✅ Compiler CLI: npx scrypt-cli compile — generates .json artifact files`,
        `✅ TypeScript with experimentalDecorators: true, emitDecoratorMetadata: true`,
        ``,
        `════ CONTRACT STRUCTURE ════`,
        `\`\`\`typescript`,
        `import { method, prop, SmartContract, assert, ByteString, sha256, Sha256, PubKey, Sig, hash160, Ripemd160 } from "scrypt-ts";`,
        ``,
        `export class MyContract extends SmartContract {`,
        `  @prop()                        // on-chain state (stored in UTXO)`,
        `  readonly myProp: bigint;`,
        ``,
        `  @prop(true)                    // stateful — can be updated between calls`,
        `  counter: bigint;`,
        ``,
        `  constructor(myProp: bigint) {`,
        `    super(...arguments);         // ALWAYS call super(...arguments) first`,
        `    this.myProp = myProp;`,
        `    this.counter = 0n;`,
        `  }`,
        ``,
        `  @method()                      // public = entrypoint (unlocking function)`,
        `  public unlock(sig: Sig, pubKey: PubKey) {`,
        `    assert(this.checkSig(sig, pubKey), "Invalid signature");`,
        `  }`,
        ``,
        `  @method()                      // private = internal helper`,
        `  increment(): void {`,
        `    this.counter++;`,
        `  }`,
        `}`,
        `\`\`\``,
        ``,
        `════ TYPES ════`,
        `✅ bigint   — integers (all Script numbers are big integers)`,
        `✅ boolean  — true/false`,
        `✅ ByteString — byte arrays (toByteString("hello", true) for UTF-8)`,
        `✅ PubKey   — 33-byte compressed public key`,
        `✅ Sig      — DER-encoded ECDSA signature`,
        `✅ Ripemd160, Sha256, Sha1 — fixed-length hash types`,
        `✅ FixedArray<T, N>  — fixed-size arrays (dynamic arrays NOT allowed in Script)`,
        ``,
        `════ BUILT-IN FUNCTIONS ════`,
        `✅ sha256(data: ByteString): Sha256`,
        `✅ hash160(data: ByteString): Ripemd160`,
        `✅ sha1(data: ByteString): Sha1`,
        `✅ assert(condition: boolean, msg?: string)  — abort if false`,
        `✅ this.checkSig(sig: Sig, pubKey: PubKey): boolean`,
        `✅ this.checkMultiSig(sigs: Sig[], pubKeys: PubKey[]): boolean`,
        `✅ len(b: ByteString): bigint`,
        `✅ slice(b: ByteString, start: bigint, end: bigint): ByteString`,
        `✅ byteString2Int(b: ByteString): bigint`,
        `✅ int2ByteString(n: bigint, len: bigint): ByteString`,
        ``,
        `════ STATEFUL CONTRACTS ════`,
        `✅ @prop(true) — mutable state (stored in locking script, updated each call)`,
        `✅ this.buildStateOutput(satoshis) — create output containing updated state`,
        `✅ this.changeAmount — remaining satoshis after fee`,
        `✅ In @method(): always call this.buildStateOutput() to continue the contract chain`,
        ``,
        `════ DEPLOYMENT & TESTING ════`,
        `✅ Compile: npx scrypt-cli compile → generates artifacts/*.json`,
        `✅ Load artifact: await MyContract.loadArtifact()`,
        `✅ Test without node: instance.verify(() => instance.myMethod(...)) — local execution`,
        `✅ Deploy to testnet: use TestWallet + DefaultProvider from scrypt-ts`,
        `✅ Fund testnet address at: https://faucet.bitcoinsv.io`,
        `✅ Check deployment on: https://test.whatsonchain.com`,
        ``,
        `════ RESTRICTIONS (Script limits) ════`,
        `❌ NO dynamic-length arrays — use FixedArray<T, N> with compile-time N`,
        `❌ NO recursion — Script has no call stack`,
        `❌ NO floating point — use bigint, represent decimals as integer * 10^n`,
        `❌ NO external calls or I/O inside @method() — contracts are pure Script`,
        `❌ NO for-loops with variable count — loop bounds must be compile-time constants`,
        `❌ NO delete, continue, break inside loops`,
        `❌ NEVER omit super(...arguments) in constructor`,
      ];

    // ── Blockchain ─────────────────────────────────────────────────────────
    case "solidity":
      return [
        `This is a Solidity / EVM smart contract project using Hardhat.`,
        ``,
        `REQUIRED FILE STRUCTURE:`,
        `✅ contracts/<Name>.sol  — the main Solidity contract (pragma ^0.8.20)`,
        `✅ hardhat.config.js     — Hardhat config with solidity version + network config`,
        `✅ package.json          — with hardhat, @nomicfoundation/hardhat-toolbox, dotenv`,
        `✅ scripts/deploy.js     — Hardhat deployment script`,
        `✅ test/test.js          — Hardhat + Chai + Ethers unit tests`,
        `✅ .env.example          — template with SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY`,
        ``,
        `SOLIDITY BEST PRACTICES (enforce all):`,
        `✅ Always start with // SPDX-License-Identifier: MIT`,
        `✅ Use OpenZeppelin contracts for standard patterns (ERC-20, ERC-721, ERC-1155, Ownable, ReentrancyGuard, Pausable, AccessControl)`,
        `✅ Import OpenZeppelin: "@openzeppelin/contracts/token/ERC20/ERC20.sol" etc.`,
        `✅ Check-Effects-Interactions pattern to prevent reentrancy`,
        `✅ Use custom errors instead of revert strings: error Unauthorized(); revert Unauthorized();`,
        `✅ Use events for all state changes: emit Transfer(from, to, amount);`,
        `✅ Add NatSpec comments: @title, @notice, @param, @return on all public functions`,
        `✅ Use modifiers for access control (onlyOwner, onlyRole, whenNotPaused)`,
        `✅ Mark functions view/pure where applicable — saves gas`,
        `✅ Use SafeMath is NOT needed in ^0.8.x — overflow/underflow is built in`,
        `✅ Use immutable for values set once in constructor (saves gas vs storage)`,
        `✅ Declare variables with smallest type that fits (uint8, uint128) to pack storage slots`,
        ``,
        `SECURITY — NEVER violate these:`,
        `❌ NEVER use tx.origin for authentication — use msg.sender`,
        `❌ NEVER call external contracts before updating state (reentrancy)`,
        `❌ NEVER use block.timestamp for randomness — it can be manipulated`,
        `❌ NEVER leave unbounded loops over user-supplied arrays`,
        `❌ NEVER use delegatecall to untrusted contracts`,
        `❌ NEVER store private keys or secrets on-chain — blockchain is public`,
        `❌ NEVER use deprecated transfer()/send() — use call{value:}("") with checks`,
        ``,
        `DeFi / Protocol patterns (use when relevant):`,
        `✅ ERC-20: OpenZeppelin ERC20.sol with mint/burn`,
        `✅ NFT: ERC-721 with ERC721URIStorage + ERC721Enumerable`,
        `✅ DAO: Governor.sol + GovernorTimelockControl`,
        `✅ Staking: ReentrancyGuard + nonReentrant modifier`,
        `✅ Proxy/Upgradeable: TransparentUpgradeableProxy or UUPS`,
        `✅ Flash loans: ERC-3156 interface`,
        ``,
        `DEPLOYMENT:`,
        `✅ Support both hardhat local network AND Sepolia/Polygon testnets via env vars`,
        `✅ Verify contract on Etherscan: hre.run("verify:verify", { address, constructorArguments })`,
        `✅ Write comprehensive tests: happy path, edge cases, access control, events emitted`,
      ];

    case "vyper":
      return [
        `This is a Vyper smart contract project.`,
        ``,
        `✅ Use Vyper ^0.3.10 syntax: @version ^0.3.10 at top of file`,
        `✅ Entry file: contracts/<name>.vy`,
        `✅ requirements.txt: vyper>=0.3.10, web3>=6.0.0`,
        `✅ deploy.py: Python script using web3.py to compile + deploy`,
        ``,
        `VYPER SPECIFICS:`,
        `✅ State variables declared at module level (not inside functions)`,
        `✅ @deploy decorator on __init__ (Vyper 0.3.10+)`,
        `✅ @external, @internal, @view, @pure decorators on all functions`,
        `✅ DynArray[Type, maxSize] for dynamic arrays (must declare max size)`,
        `✅ Use Bytes[N] for fixed-size byte arrays`,
        `✅ assert with reason string instead of require()`,
        `✅ No inheritance — use interfaces instead`,
        ``,
        `SECURITY:`,
        `❌ NEVER use raw_call without checking return value`,
        `❌ NEVER leave re-entrancy unguarded — Vyper has @nonreentrant("lock") decorator`,
      ];

    case "move":
      return [
        `This is a Move language project (Aptos or Sui blockchain).`,
        ``,
        `REQUIRED FILES:`,
        `✅ Move.toml — package manifest with [package], [addresses], [dependencies]`,
        `✅ sources/<module>.move — the main Move module`,
        ``,
        `MOVE LANGUAGE RULES:`,
        `✅ Every file starts with: module <address>::<module_name> { ... }`,
        `✅ Structs with abilities: has key (global storage), has store (nested in other structs), has copy, has drop`,
        `✅ Resources (has key) are owned by accounts — use move_to, move_from, borrow_global, borrow_global_mut`,
        `✅ Entry functions: public entry fun name(account: &signer, ...)`,
        `✅ View functions: #[view] public fun name(...): ReturnType acquires ResourceName`,
        `✅ Use std::string::utf8(b"...") for string literals`,
        `✅ Use aptos_framework::signer::address_of(account) to get address from signer`,
        `✅ Events: use aptos_framework::event module, emit with event::emit(...)`,
        `✅ Errors: use const E_NOT_OWNER: u64 = 1; abort E_NOT_OWNER; pattern`,
        `✅ Coin transfers: aptos_framework::coin::transfer<AptosCoin>(from, to_addr, amount)`,
        ``,
        `APTOS vs SUI:`,
        `✅ Aptos: uses account-based resource model, Move 1.x, aptos_framework`,
        `✅ Sui: uses object-based model, Move 2.x, sui::object, sui::transfer`,
        ``,
        `SECURITY:`,
        `❌ NEVER allow unauthorized access — always check signer address`,
        `❌ NEVER ignore resource exhaustion — Move enforces linear types, do not drop resources`,
        `❌ NEVER use assert! without a clear abort code constant`,
      ];

    case "web3":
      return [
        `This is a Web3 dApp frontend (no smart contract code needed unless asked).`,
        ``,
        `REQUIRED FILES:`,
        `✅ index.html — styled dark-themed Web3 UI with MetaMask connect button`,
        `✅ app.js     — wallet connection, chain detection, contract interaction`,
        `✅ style.css  — optional separate stylesheet (or inline in HTML)`,
        ``,
        `STACK:`,
        `✅ Use ethers.js v5 via CDN: https://cdn.ethers.io/lib/ethers-5.7.2.umd.min.js`,
        `✅ Or wagmi + viem if building with React/TypeScript (include package.json)`,
        `✅ MetaMask: window.ethereum.request({ method: "eth_requestAccounts" })`,
        `✅ provider = new ethers.providers.Web3Provider(window.ethereum)`,
        `✅ signer = provider.getSigner(); address = await signer.getAddress();`,
        `✅ Network check: provider.getNetwork() — warn if wrong chain`,
        `✅ Contract interaction: new ethers.Contract(address, abi, signer)`,
        ``,
        `UX REQUIREMENTS:`,
        `✅ Show wallet address (shortened: 0x1234...5678) when connected`,
        `✅ Show network name and chain ID`,
        `✅ Show ETH balance`,
        `✅ Handle MetaMask not installed gracefully (prompt to install)`,
        `✅ Handle user rejection of connection gracefully`,
        `✅ Listen for account/chain changes: window.ethereum.on("accountsChanged", ...)`,
        `✅ Dark themed, gradient accents, professional Web3 aesthetic`,
        ``,
        `SECURITY:`,
        `❌ NEVER hardcode private keys — wallets sign client-side only`,
        `❌ NEVER trust user-supplied contract addresses without validation`,
        `❌ NEVER skip chain ID verification before contract calls`,
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
