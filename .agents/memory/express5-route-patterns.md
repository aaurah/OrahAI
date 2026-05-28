---
name: Express 5 / path-to-regexp v8 route syntax
description: Breaking changes in path patterns for Express 5 routes
---

Express 5 uses path-to-regexp v8 which breaks several Express 4 patterns:

- `:name(*)` — INVALID, throws PathError at startup
- `(.*)` — INVALID
- `*` alone works as unnamed wildcard; access via `req.params[0]`

**For model names or paths with colons/special chars (e.g. `llama3.1:70b`)**:
Use query parameters (`?name=llama3.1:70b`) rather than URL path segments.
The DELETE /api/ai/models route uses `?name=` for this reason.

**Why:** path-to-regexp v8 (used by Express 5) removed legacy glob syntax.
Any route with `(*` at position 13+ in the path string will cause a startup crash.
**How to apply:** Review all routes for `(*)` or `(.*)` patterns when adding new routes.
