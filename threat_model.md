# Threat Model

## Project Overview

OrahAI is a browser-based coding IDE with a React/Vite web frontend, an Express 5 API, PostgreSQL storage, optional Expo mobile clients, AI-assisted file editing, and project preview/run features. Production traffic reaches the public autoscaled deployment at `https://orahai.replit.app`; the browser and mobile clients are untrusted, while the API is trusted to enforce authentication, authorization, and isolation between users, workspaces, projects, secrets, and AI/runtime actions.

Assumptions for this scan:
- Only production-reachable code matters.
- `NODE_ENV` is `production` in deployed environments.
- `artifacts/mockup-sandbox/` is dev-only and out of scope unless production reachability is demonstrated.
- Replit provides TLS for deployed traffic.
- This deployment is public, so unauthenticated endpoints are reachable from the internet.

## Assets

- **User accounts and sessions** — email/password credentials, JWT bearer tokens, admin flags, and workspace membership state. Compromise enables account takeover and privilege escalation.
- **Workspace and project data** — source files, chat history, run history, GitHub repository linkage, and project metadata. This is the core tenant data that must stay isolated between users and workspaces.
- **Project secrets** — environment variables and API keys stored in `projectSecrets`. These can grant access to third-party services or downstream deployments.
- **AI execution capability** — the AI chat route can write files and invoke a local command executor. Abuse of this capability can become server-side code execution.
- **Third-party tokens and credentials** — GitHub OAuth access tokens, GitHub personal access tokens, database credentials, JWT signing secrets, and sandbox callback secrets.

## Trust Boundaries

- **Browser/mobile client → API** — every request to `/api/*` crosses from an untrusted client into trusted server code. The API must authenticate and authorize every sensitive operation.
- **API → PostgreSQL** — the API has broad access to user, project, workspace, secret, and GitHub token data. Query scoping mistakes become data exposure or privilege-escalation bugs.
- **API → local execution environment** — `artifacts/api-server/src/lib/executor.ts` runs shell commands on the server host. Any route that reaches this boundary is high risk.
- **API → external services** — OpenAI and GitHub calls use server-side credentials or stored user tokens; misuse can expose private repos or leak secrets.
- **Project content → app origin** — previewed user code is rendered by the application itself. If preview isolation fails, untrusted project HTML/JS can attack the OrahAI origin and steal user sessions.
- **Public / authenticated / admin boundaries** — health, auth registration/login, preview token entry, and GitHub OAuth bootstrap are public-facing; most project routes require authentication; `/api/admin/*` must remain admin-only.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/orahai/src/main.tsx`.
- **Highest-risk server areas**: `routes/ai.ts`, `lib/executor.ts`, `routes/preview.ts`, `routes/secrets.ts`, `routes/github.ts`, `middlewares/auth.ts`.
- **Authenticated surfaces**: project/files/runs/chat/workspace/secrets/GitHub/admin APIs and the web IDE pages under `artifacts/orahai/src/pages/`.
- **Dev-only areas to usually ignore**: `artifacts/mockup-sandbox/`, `.migration-backup/`, local build scripts unless they become production-reachable.

## Threat Categories

### Spoofing

OrahAI relies on bearer JWTs stored client-side and accepted by the API on sensitive routes. The system must verify JWT signatures and expiry on every protected request, must not trust client-provided identity hints, and must ensure internal callbacks such as sandbox result updates cannot be spoofed by external callers.

### Tampering

Users can create projects, edit files, invoke AI-assisted modifications, and connect GitHub repositories. The API must treat all file paths, commands, repository metadata, and preview content as attacker-controlled input; file writes and destructive actions must stay scoped to the authorized project, and the AI layer must not be able to tamper with the host environment outside isolated sandboxes.

### Information Disclosure

This product stores sensitive assets beyond normal source files: project secrets, GitHub tokens, chat history, and preview/session tokens. The system must keep those assets isolated by user and role, avoid putting bearer credentials in URLs or logs, and ensure previewed project content cannot read application-origin storage or API responses belonging to another user.

### Denial of Service

Public auth and other unauthenticated endpoints are internet-facing, while authenticated users can trigger AI generation, project imports, file operations, and command execution. The service must rate-limit expensive endpoints, constrain body sizes and command execution, and prevent a single user or public client from exhausting CPU, memory, or external API quotas.

### Elevation of Privilege

The highest-impact risks in this codebase are broken authorization between collaborators, preview-origin isolation failures, and server-side command execution reachable from ordinary authenticated users. The system must enforce admin-only functions server-side, restrict secret management to appropriately privileged principals, isolate untrusted project code from the OrahAI origin, and ensure any code execution happens only inside a hardened sandbox rather than on the API host.