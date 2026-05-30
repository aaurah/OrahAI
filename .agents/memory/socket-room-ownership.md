---
name: Socket room ownership for live preview
description: Why WorkspacePage (not Terminal) must own project-room join/leave for the OrahAI workspace.
---

The live preview depends on the `process:port` socket event, which the server emits to the `project:<id>` room. The browser only receives it if it has joined that room via `workspace:join`.

**Rule:** `WorkspacePage` is the single owner of `workspace:join`/`workspace:leave`. Do NOT also emit them from the `Terminal` (console) component.

**Why:** Socket.IO room membership is set-based with no refcounting (server does a plain `socket.join`/`socket.leave`). If both Terminal and WorkspacePage emit join/leave on the shared singleton socket, a Terminal unmount (e.g. mobile/desktop swap at the 767px breakpoint) emits `workspace:leave` and silently removes the socket from the room while WorkspacePage is still mounted — dropping one-shot events like `process:port`, so the live preview hangs on "Process running…". Coupling room membership to the console was especially fragile once the console became a hidden/background element.

**How to apply:** Register `process:port`/`process:stopped` listeners BEFORE emitting `workspace:join`. Rejoin on reconnect (`socket.on("connect", join)`) since room membership is lost on disconnect. Terminal keeps only its own `terminal:output`/`process:stopped` listeners (same shared socket, same room) but emits no join/leave.
