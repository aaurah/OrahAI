---
name: Run-command detection for nested/monorepo apps
description: Why Run must detect apps in subdirectories and the pnpm-workspace standalone-install limitation
---

`detectProjectSetup()` in `artifacts/api-server/src/routes/runs.ts` historically only inspected the project ROOT, so any project whose runnable app lives in a subdirectory (monorepo, imported repo, app scaffolded under a folder) returned "No run command detected" and every Run errored instantly — the preview flips "Process running…" → "Dev server not running".

The fix: detection returns a relative `cwd`; the POST `/api/runs` handler resolves `execDir = path.resolve(dir, cwd)` with a within-workspace traversal guard and threads `execDir` through the entry-existence check, `installDeps`, `installPythonDeps`, and `spawnProcess`. `cwd` is also sent in the `SANDBOX_URL` `/execute` body so external sandbox mode stays consistent.

**Why:** Run must work for the common case where the app isn't at the repo root.

**How to apply:** Any new run-mode or executor branch MUST honour `cwd`/`execDir`, not the workspace root, or the bug reappears in that path.

**Known limitation (not a detection bug):** a pnpm/yarn *workspace* member can't be installed/run standalone in the sandbox — `workspace:*` deps don't resolve without the repo root + root install, so install/build surfaces real "Cannot find package" errors. This is honest output, strictly better than the old silent "No run command detected". Package-manager inference for a nested app falls back to root workspace markers (`pnpm-workspace.yaml`/root lockfile) when the subdir has no lockfile.
