# ADR-0004: Curated office, onboarding selection, SVG rendering

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
A typical Reddit user follows 50-200 subreddits; rendering all of them as animated cubicles
would put hundreds-to-1000+ animated nodes on screen, well past where SVG + Framer Motion
(the CONTEXT.md stack) stays smooth. The stated utility is watching *favorite* subreddits.

## Decision
The office is **curated, not exhaustive**. After OAuth login, an **onboarding flow** lets the
user pick which subscribed subreddits to "listen to." Only those become cubicles.

Rendering stays **SVG + Framer Motion** for v1, kept viable by bounding the entity count.

**Provisional caps (to be perf-tested and tuned after implementation, not final):**
- Cubicles (listened subreddits): soft cap ~**15-20** to start.
- Roster size per cubicle: ~**4-8** workers.
- Target on-screen animated entities: ~**100-200**.

Scaling posture: build at this modest size first, measure real frame budget, then decide
whether to raise caps, add viewport virtualization / level-of-detail, or migrate the office
to Canvas/WebGL. That migration path is explicitly kept open.

## Consequences
- **Whitelisting / subreddit selection is a required feature** (the onboarding flow), not an
  optional sidebar nicety.
- Perf is a first-class acceptance criterion; the entity budget is a design constraint.
- The renderer should be abstracted enough that an SVG-→-Canvas swap later doesn't require
  rewriting the domain/event logic.
