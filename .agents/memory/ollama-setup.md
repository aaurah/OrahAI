---
name: Ollama local AI setup
description: How Ollama is installed and run in this Replit environment
---

Ollama is installed via `installSystemDependencies({ packages: ["ollama"] })` (Nix).
Direct downloads from ollama.com CDN and GitHub releases both return 404 in this environment.

Installed version: 0.9.5 at `/nix/store/.../bin/ollama`
Models dir: `/home/runner/.ollama/models`
Workflow command: `OLLAMA_MODELS=/home/runner/.ollama/models OLLAMA_HOST=127.0.0.1:11434 ollama serve`
Workflow name: "Ollama AI Service"
Listens on: `http://127.0.0.1:11434`
No GPU — CPU only; available RAM ~2.7 GiB so only small models (1B–3B) run comfortably.

**Why:** ollama.com CDN URLs (both /download/ollama-linux-amd64 and tgz variants) return 404 from this environment; Nix works.
**How to apply:** Always use `installSystemDependencies` for Ollama, not curl downloads.
