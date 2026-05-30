---
name: Vite config must not throw on missing PORT/BASE_PATH
description: Why the orahai vite.config falls back to defaults instead of throwing
---

The orahai `vite.config.ts` must NOT `throw` when `PORT` or `BASE_PATH` env vars
are absent — it must fall back to defaults (PORT 5000, BASE_PATH "/").

**Why:** The app is launched by multiple runners. Our explicit "Start application"
workflow passes `PORT=5000 BASE_PATH=/`, but Replit's artifact-managed preview
(the "OrahAI" entry in the preview picker) runs `pnpm --filter @workspace/orahai
run dev` and only injects its own PORT — no BASE_PATH. A config that throws on a
missing var crashes the artifact preview instantly, so it shows as broken while
"Start application" works. Vercel/CI builds also run without these vars.

**How to apply:** Keep env-var reads as `?? default` fallbacks, never hard
throws, for any var the artifact runner or build pipeline might not set. The
artifact system assigns its own non-5000 port, so there's no conflict with the
running "Start application" on 5000.
