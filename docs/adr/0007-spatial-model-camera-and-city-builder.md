# ADR-0007: Spatial model - world coordinates, camera, city-builder roadmap

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
The office navigation model was chosen as a **pan/zoom floor** (not a single fixed screen),
with an explicit future roadmap of **city-builder-style rearranging**: letting the user drag
cubicles around and group subreddits spatially. The office must be built with this in mind.

## Decision
Model the office as a **world with a coordinate system and a camera**, not a CSS/flex grid:
- Each **Cubicle** is an entity with an `(x, y)` position (and footprint) in world space.
- A **Camera** provides pan + zoom over that world; only what's in view is rendered/animated.
- **Cubicle positions are persisted layout state** (part of the Office Policy / saved layout),
  generated once on onboarding and thereafter stable - and, later, user-editable.

**v1 vs roadmap:**
- **v1:** auto-generated (randomized-but-persistent) layout + working pan/zoom camera.
- **Fast-follow:** drag-to-rearrange cubicles and spatial grouping (city-builder). Cheap once
  the coordinate + camera system exists; implement in v1 only if straightforward.

## Consequences
- Reinforces ADR-0004's **renderer abstraction** + Canvas/WebGL migration path: pan/zoom over
  many animated sprites is precisely where SVG hits limits and Canvas wins. Build the office
  behind a renderer interface so the swap is localized.
- **Viewport culling / level-of-detail** move from "maybe later" to "expected" as caps rise -
  only animate cubicles/workers currently on-screen.
- Layout persistence schema must store per-cubicle coordinates, not just a subreddit whitelist.
- "At a glance" is delivered by a sensible default zoom that frames the whole office on load;
  the user can then zoom into a cubicle for detail.
