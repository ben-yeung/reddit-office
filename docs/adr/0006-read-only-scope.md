# ADR-0006: Read-only monitor scope

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Clicking a worker opens a modal with post content + comments. Open question was whether the
app also performs write actions (vote/comment/save/subscribe), which expand OAuth scopes and
surface area and shift the project from "ambient monitor" toward "full Reddit client."

## Decision
v1 is a **read-only monitor**. The worker modal shows the post (metadata, content) and a
**top-comments preview**. Any write action (vote, comment, save) is delegated to reddit.com
via an **"Open in Reddit"** hand-off link.

**OAuth scopes requested (minimal):** `identity`, `mysubreddits`, `read`.

## Consequences
- No write-path UI, no comment composer, no optimistic-update/error-recovery complexity in v1.
- Smaller, more trustworthy OAuth consent screen; easier Reddit app registration.
- Comment preview is read-rendered (default: a handful of top-level comments; depth/count is a
  UI detail, not a scope concern).
- Upgrade path to "read + light actions" (add `vote`/`save`) stays open without rearchitecting.
