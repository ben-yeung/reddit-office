# PRD: Reddit Office

Status: Draft v1 (in active grilling).
Supersedes: the seed PRD in `../CONTEXT.md`.
Companion docs: `glossary.md` (ubiquitous language), `adr/` (decision records).

## 1. Vision

Reddit Office is an ambient, real-time dashboard that renders your favorite subreddits as a
bird's-eye, 8-bit pixel-art office.
Each listened subreddit is a **Cubicle**; notable posts are **Workers** inside it.
Workers perform short animated **Actions** that encode real Reddit **Events** - a new post
walking in, a worker glowing as it surges in upvotes, a worker being escorted out when its
post is removed.
The point is to turn "what's happening across my subreddits right now" into something you can
take in at a glance, and enjoy looking at.

## 2. Goals and non-goals

### Goals
- Deliver genuine, legible, real-time signal about activity in a curated set of subreddits.
- Be visually striking enough to stand as a portfolio / craft piece.
- Keep the whole thing runnable as a single Next.js app with minimal infrastructure.

### Non-goals (v1)
- Not a full Reddit client: no in-app voting, commenting, posting, or subscribing (read-only).
- Not a background service: tracking runs only while a tab is open.
- Not exhaustive: it does not render every subscribed subreddit, only the ones the user picks.
- No moderator attribution: we detect that a post was removed, not who removed it or why.

### Success criteria
1. Craft: the office reads as a polished, cohesive pixel-art scene that people react to.
2. Utility: the author actually glances at it to gauge subreddit activity, and the animations
   correctly reflect real events with acceptable latency.
3. Performance: the office holds a smooth frame rate at the v1 entity budget (see section 7).

## 3. Target user

Primary user is the author (portfolio-for-fun), who wants an at-a-glance, real-time view of a
handful of favorite subreddits, including niche ones.
The design must not architecturally preclude a future multi-user version, but multi-tenancy is
not a v1 requirement.

See ADR-0001 for the purpose-and-scope decision.

## 4. Core concepts

Defined in `glossary.md`; the load-bearing ones:
Office, Cubicle, Worker, Roster, Action, Event, Momentum, Baseline, Office Policy, Camera,
Layout, Discovery poll, Tracking poll.

## 5. Functional requirements

### 5.1 Authentication and onboarding
- OAuth2 with Reddit, using a "web app" credential; the token exchange happens on the backend
  so the client secret is never exposed (ADR-0003).
- Requested scopes are minimal: `identity`, `mysubreddits`, `read` (ADR-0006).
- After login, an **Onboarding** flow fetches the user's subscribed subreddits and lets them
  pick which ones to "listen to."
- Listened subreddits become Cubicles; the rest are ignored (ADR-0004).

### 5.2 The office (rendering and navigation)
- The office is a **world with coordinates and a Camera**, not a fixed grid (ADR-0007).
- v1 ships an auto-generated, randomized-but-persistent **Layout** plus a working pan/zoom
  camera; the default zoom frames the whole office for the at-a-glance read.
- Cubicle positions are persisted so the office is stable across reloads.
- Drag-to-rearrange cubicles (city-builder grouping) is a planned fast-follow, built into v1
  only if it falls out cheaply from the coordinate/camera system.
- All office visuals use SVG (plus CSS/geometry) for the pixel-art look, behind a renderer
  abstraction that keeps a future Canvas/WebGL swap localized (ADR-0004, ADR-0007).

### 5.3 Data acquisition (two-speed polling)
- No push is available from Reddit; all Events are derived by diffing polled snapshots
  (ADR-0002).
- **Discovery poll** (per listened subreddit, ~15-30s): `/new` and `/rising` to find new and
  trending posts and to maintain each subreddit's Baseline.
- **Tracking poll** (batched across all cubicles, ~5-10s): a single `/api/info` call (up to 100
  post fullnames) refreshes score and comment counts for every tracked Worker at once.
- The client owns cadence and state; the backend is a thin proxy plus the auth token exchange
  (ADR-0003).
- The system respects Reddit's ~100 requests/minute budget: discovery scales with number of
  subreddits, tracking is a single batched call, and the two-speed split keeps the total under
  budget for the v1 cubicle cap.

### 5.4 Roster and Momentum
- Each Cubicle maintains a bounded **Roster** (sliding window) of notable Workers, not every
  post (ADR-0002).
- Notability is a weighted **Momentum** score combining rates of change (upvotes/min,
  comments/min, and possibly others), **normalized per-subreddit** against that sub's rolling
  **Baseline** so small and large subreddits are comparable (ADR-0005).
- Workers are pruned when Momentum decays or they go stale, subject to a grace period so new
  posts can prove traction before being dropped.

### 5.5 Events and Actions
- v1 Events: new post arrives, trending/rising, upvote surge, post removed (ADR-0002).
- Upvote surge and post-removed are detected on tracked Workers via the tracking poll; surge is
  a heuristic (Reddit fuzzes vote counts), and removal is modeled generically without moderator
  attribution.
- Each Event maps to a short Worker Action animation via Framer Motion.

### 5.6 Office Policy (user configuration)
- **Worker sourcing (spawn rule):** New / Momentum(Trending) / Blend - what population fills a
  Roster (ADR-0005).
- **Event-animation toggles:** each Event type (new post, surge, removed, trending) can be
  enabled or disabled independently.
- Plus the subreddit whitelist from onboarding and the persisted Layout.
- Office Policy is a structured object persisted client-side (localStorage), with a clean
  upgrade path to a per-user store for multi-device sync later (ADR-0003).

### 5.7 Interaction (worker modal)
- Clicking a Worker opens a Framer Motion modal showing the post (metadata, content) and a
  top-comments preview (ADR-0006).
- All write actions (vote, comment, save) are delegated to reddit.com via an "Open in Reddit"
  link; the app itself performs no writes in v1.

## 6. Architecture summary

- Single Next.js (App Router) app: thin backend (API routes) for OAuth token exchange and a
  Reddit proxy; client owns polling, Roster/window state, and event diffing (ADR-0003).
- Framer Motion for Actions and modal transitions; TanStack Query for fetching/caching.
- SVG-based renderer behind an abstraction, with a documented path to Canvas/WebGL (ADR-0004,
  ADR-0007).
- No server database required for v1; layout and Office Policy live in localStorage.

## 7. Performance plan and budgets

- v1 provisional caps (to be perf-tested and tuned, not final): ~15-20 cubicles, ~4-8 workers
  each, ~100-200 animated entities total (ADR-0004).
- Only on-screen entities animate; viewport culling / level-of-detail is expected as caps rise
  (ADR-0007).
- Smooth frame rate at the v1 budget is an acceptance criterion, not an afterthought.
- If SVG cannot hold the budget once real animations are in, the renderer abstraction allows a
  contained migration to Canvas/WebGL.

## 8. MVP scope and roadmap

v1 is built as a **mock-first vertical slice**: get the fun/craft part working against fake
data, then wire real Reddit behind the same interfaces (matches the CONTEXT.md ordering).

1. Setup: Next.js + TypeScript + CSS Modules project scaffold.
2. Renderer + camera: SVG office world with pan/zoom, cubicles, and workers driven by MOCK
   data; establish the renderer abstraction.
3. Actions: Framer Motion animations for new-post, surge, trending, and removed Events, still
   from mock event streams.
4. Data layer: Reddit OAuth (backend token exchange) + two-speed polling + `/api/info` batching
   behind the same interfaces the mock used.
5. Momentum + Roster: per-subreddit Baseline, Momentum scoring, roster selection and pruning.
6. Office Policy UI: onboarding subreddit selection, worker-sourcing rule, per-event toggles.
7. Interaction: worker modal with post + comments preview and Open-in-Reddit.

Fast-follows (post-v1): drag-to-rearrange / city-builder grouping, higher caps with
culling/LOD, possible Canvas renderer, "read + light actions" (vote/save).

## 9. Open questions (still to grill or decide during build)

- Momentum formula: exact signal weights, the rate window, and how the per-subreddit Baseline
  is computed and smoothed.
- Roster mechanics: concrete size, new-post grace period, and pruning thresholds.
- Surge heuristic: what score-velocity delta counts as a "surge," and debouncing against vote
  fuzz.
- Comment preview: how many comments and what depth in the modal.
- Token/session storage: cookie strategy and refresh handling for the OAuth flow.
- Whether drag-to-rearrange makes it into v1 or stays a fast-follow.
- Final entity caps after real-world perf testing.

## 10. Decision log (ADR index)

- ADR-0001: Purpose and scope (portfolio piece with real at-a-glance utility).
- ADR-0002: Event detection via polling + sliding-window tracked sample.
- ADR-0003: Thin backend + client-side diffing.
- ADR-0004: Curated office, onboarding selection, SVG rendering.
- ADR-0005: Roster composition and Office Policy knobs.
- ADR-0006: Read-only monitor scope.
- ADR-0007: Spatial model - world coordinates, camera, city-builder roadmap.
