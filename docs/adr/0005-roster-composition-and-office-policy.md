# ADR-0005: Roster composition and Office Policy knobs

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
"Notable" was defined as a weighted **Momentum** score. Two further decisions: how Momentum
is normalized, and how much control the user has over what the office shows.

## Decision

### Momentum is per-subreddit relative
Momentum (weighted upvotes/min + comments/min + ...) is judged **relative to each subreddit's
own baseline**, not on a global absolute scale. So every cubicle surfaces *its* most-alive
posts and niche favorites never look permanently dead. (A future "global intensity" tint is
noted as a possible enhancement, not v1.)

### Office Policy has two distinct, user-controllable axes
1. **Worker sourcing (spawn rule)** - what population fills a cubicle's Roster. User-selectable:
   - **New** - workers are the newest posts.
   - **Momentum/Trending** - workers are the highest-Momentum posts.
   - **Blend** - a mix of both.
   Configurable globally, with room to override per-cubicle later.
2. **Event-animation toggles** - which Events produce a visible Action (new-post arrival,
   upvote surge, post removed, trending). Each can be enabled/disabled by the user.

"New post" is intentionally **both** a sourcing option and an event - toggling them is
independent (e.g. show momentum-only workers but still flash when any new post lands, or
vice versa).

## Consequences
- Momentum needs a **per-subreddit rolling baseline** (posts/min, typical score velocity) to
  normalize against - computed from the discovery poll history.
- Office Policy is a structured settings object persisted client-side (per ADR-0003), covering
  subreddit whitelist, sourcing rule, and per-event toggles.
- Selection + pruning both use the same Momentum ranking: low-Momentum / stale workers are
  pruned to make room, subject to a new-post grace period so fresh posts can prove traction.
