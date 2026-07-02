# ADR-0001: Purpose and scope

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
`CONTEXT.md` described the *how* (SVG cubicles, worker entities, Framer Motion) in
detail but never stated the *why*. Every technical requirement depends on knowing who
this is for and what "it worked" means.

## Decision
This is a **portfolio / craft piece built for fun**, but with a **genuine utility goal**:
let the user see their favorite subreddits *at a glance*, updating in **real time** as new
posts arrive and posts start trending. The office-worker-per-post metaphor is the delivery
mechanism: workers perform **Actions** (animations) that encode real Reddit **Events**
- new post, upvote surge, moderator removal, etc.

Success is therefore judged on two axes:
1. **Craft:** it looks striking enough to be a portfolio showcase.
2. **Utility:** it delivers real, legible, real-time signal about subreddit activity that
   the author would actually glance at.

## Consequences
- "Real-time" and "Event detection" are now **load-bearing**, not decorative. They must be
  designed against Reddit's actual API capabilities (see ADR-0002).
- Because it's a portfolio piece (not a multi-tenant product yet), we can prefer the
  simplest auth/hosting that still demonstrates the craft, and defer scale/ToS-at-scale
  concerns - but we should not paint ourselves into a corner that makes multi-user
  impossible later.
