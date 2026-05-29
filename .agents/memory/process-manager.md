---
name: Process manager architecture
description: How persistent process execution works — spawn-based, Socket.IO streaming, port detection
---

All runs use `spawnProcess()` in `processManager.ts` instead of `exec`. The process stays alive indefinitely (important for dev servers like `npm run dev`).

**Why:** `exec` has a 60s timeout and buffers all output — useless for dev servers that run forever. `spawn` streams output chunk-by-chunk.

**How it works:**
1. `spawnProcess()` creates a `ChildProcess` stored in `Map<projectId, ManagedProcess>`
2. stdout/stderr chunks are emitted to Socket.IO room `project:{projectId}` as `terminal:output` events
3. Port detection: regex patterns on output detect when process starts listening on a port → emits `process:port` event
4. On exit: emits `process:stopped` event, removes from map

**Frontend wiring:**
- `Terminal.tsx` listens for `terminal:output` + `process:stopped` (writes prompt when stopped)
- `WorkspacePage.tsx` listens for `process:port` → sets `livePort` state → PreviewPanel auto-switches to Live tab
- WorkspaceTopbar shows Stop button when `processRunning=true`

**Key files:**
- `artifacts/api-server/src/lib/processManager.ts`
- `artifacts/api-server/src/lib/ioSingleton.ts`
- `artifacts/api-server/src/index.ts` — Socket.IO server setup
- `artifacts/api-server/src/routes/runs.ts` — calls prepareWorkspace + installDeps + spawnProcess
- `artifacts/orahai/src/components/terminal/Terminal.tsx`
