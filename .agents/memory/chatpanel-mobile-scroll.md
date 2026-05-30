---
name: ChatPanel mobile scroll / overflow
description: Why the AI ChatPanel must use flex-1 + min-h-0 (not h-full) and how nested flex scroll breaks on iOS WebKit.
---

# ChatPanel must flex to fill, not force h-full

ChatPanel is rendered as a flex-column sibling **below** an optional `SetupBanner` (both desktop right panel and mobile AI tab in `WorkspacePage.tsx`, inside `flex flex-col overflow-hidden` parents).

**Rule:** ChatPanel's root must be `flex-1 min-h-0`, NOT `h-full`.

**Why:** `h-full` = 100% of the parent. When SetupBanner is also present, banner-height + 100% overflows the `overflow-hidden` container, clipping the input off-screen and breaking the inner `overflow-y-auto` (symptom: "chat won't scroll, input gone" — reported from the iOS in-app browser). `flex-1` takes only the *remaining* space after the banner; when no banner, it still fills the panel.

**How to apply:** Any scrollable region inside a nested flex column needs `min-h-0` on itself AND on its flex-growing ancestors, or WebKit/iOS won't let it shrink and `overflow-y-auto` never engages. The fixed-height footer/input must be `shrink-0` so the message area shrinks first instead of pushing the input out. This pattern applies to all four AI modes (chat/explain/generate/complete) scroll areas.
