# OrahAI

An AI-powered browser IDE where users write, run, debug, and deploy code with a built-in AI pair programmer.

## Run & Operate

- `pnpm --filter @workspace/orahai run dev` — run the Vite frontend (auto-assigned port)
- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env:
  - `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)
  - `JWT_SECRET` — secret for signing auth tokens (set in Replit Secrets)
  - `SANDBOX_INTERNAL_KEY` — shared secret for sandbox→API callback auth (set in Replit Secrets; required in production)
  - Optional: `AI_SERVICE_URL` + `AI_SERVICE_INTERNAL_KEY` — self-hosted AI service endpoint; omit to use built-in fallback
  - Optional: `SANDBOX_URL` — sandbox execution service URL; omit if not running a code execution backend

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: Vite + React 18, Wouter (routing), SWR (data fetching), Tailwind CSS v4, Monaco Editor, xterm.js
- **API**: Express 5, PostgreSQL + Drizzle ORM
- **AI**: Streaming SSE from `/api/ai/chat/:projectId`
- **Realtime**: Socket.IO for terminal output
- **Auth**: JWT stored in `localStorage` as `orahai_token`

## Where things live

- Frontend: `artifacts/orahai/src/`
  - Pages: `src/pages/` (Landing, Login, Register, Dashboard, Workspace, not-found)
  - Components: `src/components/{ui,layout,editor,chat,terminal}/`
  - Hooks: `src/hooks/` (useAuth, useProjects, useFiles, useSocket, etc.)
  - Types: `src/types/index.ts`
  - API client: `src/lib/api.ts`
  - Auth utils: `src/lib/auth.ts`
- API: `artifacts/api-server/src/`
- Theme: CSS custom properties in `src/index.css`

## Architecture decisions

- Next.js ported to Vite + Wouter — no SSR needed, simpler dev/deploy story on Replit
- JWT in `localStorage` (not cookies) — simpler for the browser IDE use case
- Monaco editor loaded via dynamic `import()` to avoid blocking initial load
- xterm.js also dynamically imported; terminal runs shell commands via `/api/runs/:projectId`
- SWR used instead of React Query — lighter weight, sufficient for this app's data needs

## Product

- **Landing page** — marketing page with features and pricing sections
- **Auth** — email/password login & registration
- **Dashboard** — project grid with search, create/open project actions
- **Workspace** — Monaco editor + file sidebar + xterm terminal + AI chat panel

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Vercel Deployment

Run locally to verify before pushing:
```
pnpm run vercel:build   # builds api/index.js + artifacts/orahai/dist/public
```

Connect repo to Vercel. Framework: **Other**. Vercel reads `vercel.json` for all settings (build command, output dir, routing). No Vercel dashboard overrides needed.

Environment variables to set in the Vercel project dashboard:
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string — use [Neon](https://neon.tech) or Vercel Postgres |
| `JWT_SECRET` | ✅ | Secret for signing auth tokens |
| `SANDBOX_INTERNAL_KEY` | ⚠️ | Required if using an external sandbox service |
| `SANDBOX_URL` | optional | URL of external code-execution sandbox |
| `AI_SERVICE_URL` | optional | Self-hosted AI endpoint |
| `AI_SERVICE_INTERNAL_KEY` | optional | Auth key for self-hosted AI |
| `VITE_API_URL` | — | Leave unset — defaults to `""` (same-origin relative) |

How it works:
- `/api/*` → `api/index.js` (Express app bundled by esbuild, Node.js 22)
- `/*` → `artifacts/orahai/dist/public` (Vite static build, CDN-cached)
- SPA fallback: any non-asset path serves `index.html` so client-side routing works
- Startup migrations run once per Lambda cold start

## Gotchas

- API calls use `VITE_API_URL` env var; defaults to `""` (relative) — works via Replit proxy routing
- `BASE_URL` (Vite) is used in the Wouter `<Router base>` for correct path-based routing on Replit
- Monaco and xterm are dynamically imported to keep initial bundle small — expect a brief load delay on first open
- The scaffolded shadcn components live in `src/components/ui/` (lowercase) alongside our custom uppercase versions

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Original Next.js source preserved in `.migration-backup/`
