---
name: Workspace desktop/mobile dual-layout mounting
description: WorkspacePage renders both desktop and mobile layout trees simultaneously, hidden via responsive CSS — components mount twice.
---

In `artifacts/orahai/src/pages/WorkspacePage.tsx` the desktop tree (`hidden md:flex`) and the
mobile tree (`flex md:hidden`) are BOTH always in the React tree at the same time; only CSS
(`display`) hides one. React still mounts every component in both subtrees.

**Why:** A component placed once in each subtree (e.g. `<Terminal>`, `<ChatPanel>`, `<PreviewPanel>`)
mounts TWICE → duplicate socket subscriptions / duplicate background work / double effects, even
though the user only ever sees one.

**How to apply:** For anything that must be a single instance (background shell/Terminal, socket
owner, polling effect), mount it ONCE at the page root outside both layout subtrees — not once per
desktop/mobile branch. Visible, per-layout UI (editors, tabs) can stay duplicated since only one
shows; stateful singletons must not.
