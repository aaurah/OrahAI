---
name: Run entry-point detection must be root-scoped and existence-validated
description: How OrahAI decides the run command for a project and the traps to avoid
---

When auto-detecting a project's run command (`detectProjectSetup` in
`artifacts/api-server/src/routes/runs.ts`), two rules are mandatory:

1. **Marker files only count at the project ROOT.** Match `requirements.txt`,
   `pyproject.toml`, `cargo.toml`, `go.mod`, lockfiles, `package.json` by exact
   root path, never with `paths.some(p => p.includes(...))`. A vendored
   `requirements.txt` buried in a subdirectory (e.g. an `.agents/skills/.../scripts/`
   dump) must NOT switch the runtime to Python.

2. **Only choose a command from an entry file that actually exists.** Never
   hardcode `python main.py` / `node index.js`. Use `findEntryCommand` to pick
   from conventional entry names that are present, ordered by the project's
   declared language.

**Why:** A TS project whose only files were vendored docs had a buried
`requirements.txt`; detection forced `python main.py`, which doesn't exist, and
the user saw a cryptic `python: can't open file '.../main.py'` OS error.

**How to apply:** Before `spawnProcess`, extract the entry file from the command
(`extractEntryFile`) and verify it exists on disk with a path-traversal
containment check; if missing, emit a friendly terminal message + list of
runnable root files instead of letting the raw OS error surface. Same pattern for
the "no command detected" case.
