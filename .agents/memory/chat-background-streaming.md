---
name: Background AI streaming via module store
description: How to keep AI chat streaming alive when the user navigates away — module-level store + useSyncExternalStore pattern.
---

## Rule
AI chat state (items, isStreaming, abortController) lives in `src/lib/chatStore.ts` — a module-level Map that is never garbage-collected by React's unmount lifecycle. ChatPanel subscribes via `useSyncExternalStore`, so store writes work even after the component unmounts.

**Why:** When the user navigates away from WorkspacePage, ChatPanel unmounts. React state setters become no-ops and all in-flight streaming updates are lost. By writing to the module store instead of React state, the fetch loop keeps running and messages accumulate; on remount the component re-subscribes and sees the complete result.

**How to apply:**
- `chatStore.setItems(projectId, updater)` — drop-in for `setItems(...)` — accepts array or functional updater
- `chatStore.setStreaming(projectId, bool)` — drop-in for `setIsStreaming(...)`
- `chatStore.setAbortController(projectId, ctrl)` — mirror `abortRef.current` on stream start/end so `abortAll()` can reach it after remount
- On mount, guard `fetchMessages()`: skip if `chatStore.hasItems(projectId) || chatStore.getSnapshot(projectId).isStreaming` to avoid overwriting in-flight items
- Global indicator: Navbar subscribes to `chatStore.subscribeGlobal` / `chatStore.getGlobalSnapshot()` and shows an animated "Claude is thinking…" pill that links back to the streaming workspace

**Key gotcha:** ChatPanel's `setItems` wrapper must explicitly type its parameter as `ListItem[] | ((prev: ListItem[]) => ListItem[])` (not inferred from the store's `unknown[]`). Cast to `unknown[]` only at the call site into the store.
