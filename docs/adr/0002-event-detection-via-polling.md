# ADR-0002: Event detection via polling + sliding-window tracked sample

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
The product's core utility (ADR-0001) is real-time, event-driven worker animations.
Reddit's API offers **no push/webhooks** - only polling - and caps OAuth apps at
~**100 requests/minute**. Subreddits can contain thousands of posts, so rendering/tracking
every post is both visually and API-budget infeasible. Desired latency is ~5-10s for
changes on watched posts.

## Decision
Do **not** track every post. Each cubicle maintains a bounded **Roster**: a small
"sliding window" sample of **notable Workers** that we actively track. Events are derived
by **diffing snapshots over time**, using a **two-speed polling** scheme:

1. **Discovery poll** (per-subreddit, ~15-30s): `GET /r/{sub}/new` and `/rising` to find
   newly-arrived posts and trending/rising flags. New notable posts enter the Roster.
2. **Tracking poll** (batched across ALL cubicles, ~5-10s): a single
   `GET /api/info?id=t3_a,t3_b,...` (up to **100 fullnames per call**) refreshes the live
   score/state of every tracked Worker in one request. This drives:
   - **Upvote surge** - score delta / time exceeds a threshold (heuristic; vote counts are
     fuzzed by Reddit, so this is "notable acceleration," not exact).
   - **Post removed** - tracked post returns `[removed]` / `removed_by_category`, or drops
     out of listings. Modeled as generic **"post removed"**; we do NOT claim moderator
     attribution (not reliably knowable without mod rights).

## Consequences
- API budget scales with **number of subreddits polled for discovery**, not number of posts,
  because tracking is batched. Rough budget: `discovery_calls/min + tracking_calls/min <= 100`.
- The **Roster + pruning rules** become first-class domain concepts (see glossary): how many
  workers per cubicle, how "notable" is chosen, and when a worker is pruned (age, or falling
  upvotes-per-minute / lost traction).
- Latency is **two-tier**: watched-worker actions ~5-10s; brand-new-post arrival ~15-30s.
- Score-derived events are **heuristic**, not exact; UI copy/animation should not imply
  false precision.
