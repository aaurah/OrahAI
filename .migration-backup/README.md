# OrahAI

A Replit-style AI-powered browser IDE. Write, run, and ship code with an integrated AI pair programmer.

## Architecture

```
apps/
  web/        Next.js 14 IDE (Monaco editor, file tree, AI chat, run output)
  api/        Express + TypeScript REST API (auth, workspaces, projects, files, runs, AI)
  sandbox/    Node.js code execution service (child_process + WebSocket log streaming)
  ai/         Python FastAPI AI service (streams from OpenAI / Anthropic)

packages/
  db/         Prisma schema + client (PostgreSQL)
  types/      Shared TypeScript interfaces
```

## MVP Features

| Feature | Status |
|---|---|
| Email/password auth (JWT) | ✅ |
| Workspaces + membership | ✅ |
| Projects with starter files | ✅ |
| File tree CRUD | ✅ |
| Monaco in-browser editor | ✅ |
| Code execution (Node.js, Python) | ✅ |
| Real-time log streaming (WebSocket) | ✅ |
| AI chat (project-aware, streaming) | ✅ |
| OpenAI + Anthropic support | ✅ |

## Quick Start

### 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Python 3.12+ (for AI service, or use Docker)

### 2. Clone & install

```bash
git clone https://github.com/aaurah/OrahAI.git
cd OrahAI
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — add DATABASE_URL, JWT_SECRET, OPENAI_API_KEY at minimum
```

### 4. Start database

```bash
docker compose up db -d
```

### 5. Run Prisma migrations

```bash
cd packages/db
npm install
npx prisma generate
npx prisma migrate dev --name init
cd ../..
```

### 6. Start all services

**Option A — Docker Compose (all services)**
```bash
docker compose up
```

**Option B — Local dev (faster iteration)**
```bash
# Terminal 1 — API
cd apps/api && npm install && npm run dev

# Terminal 2 — Web
cd apps/web && npm install && npm run dev

# Terminal 3 — Sandbox
cd apps/sandbox && npm install && npm run dev

# Terminal 4 — AI service
cd apps/ai && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

App runs at **http://localhost:3000**

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Current user + workspaces |
| PATCH | `/api/auth/me` | Update profile |

### Workspaces
| Method | Path | Description |
|---|---|---|
| GET | `/api/workspaces` | List user's workspaces |
| POST | `/api/workspaces` | Create workspace (becomes owner) |
| GET | `/api/workspaces/:id/members` | List members |
| POST | `/api/workspaces/:id/members` | Invite member by email |

### Projects
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects?workspaceId=` | List projects |
| POST | `/api/projects` | Create project (seeds starter files) |
| GET | `/api/projects/:id` | Get project |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Soft-delete project |

### Files
| Method | Path | Description |
|---|---|---|
| GET | `/api/files/:projectId` | File tree + flat list |
| GET | `/api/files/:projectId/read?path=` | Read single file |
| PUT | `/api/files/:projectId` | Create or update file |
| DELETE | `/api/files/:projectId?path=` | Delete file |
| POST | `/api/files/:projectId/rename` | Rename/move file |

### Runs
| Method | Path | Description |
|---|---|---|
| POST | `/api/runs/:projectId` | Execute project (queues a run) |
| GET | `/api/runs/:projectId` | List recent runs |
| GET | `/api/runs/:projectId/:runId` | Get single run + output |

### AI Chat
| Method | Path | Description |
|---|---|---|
| POST | `/api/ai/chat/:projectId` | Streaming chat (SSE) |
| GET | `/api/ai/chat/:projectId` | Fetch chat history |
| DELETE | `/api/ai/chat/:projectId` | Clear chat history |

## Roadmap

- **Phase 2**: Deployments (static + Node.js), custom domains, preview URLs
- **Phase 3**: Team collaboration (live cursors, shared terminals), RBAC
- **Phase 4**: Enterprise (SSO, audit logs, private runners, billing)

## License

MIT
