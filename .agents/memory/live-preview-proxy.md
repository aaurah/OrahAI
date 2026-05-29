---
name: Live preview proxy
description: How the live preview proxy works — proxies running process port through /api/preview/:projectId/live
---

The live preview at `/api/preview/:projectId/live/*` uses Node's built-in `http` module to proxy requests to `localhost:{port}` where the user's dev server is running.

**Why:** Replit-style live preview requires forwarding the running process's port through the API since we can't create per-port subdomains.

**How to apply:** For HTML responses, the proxy rewrites absolute paths (src="/xxx", href="/xxx") to go through the proxy base path so assets load correctly. Non-HTML responses are piped directly.

**Key files:**
- `artifacts/api-server/src/routes/preview.ts` — `proxyToLocalPort()` + `rewriteHtmlPaths()`
- `artifacts/api-server/src/lib/processManager.ts` — `getProcess(projectId)` returns running port
- `artifacts/orahai/src/components/editor/PreviewPanel.tsx` — "Live" tab auto-activates when `livePort` prop is set
