# Glossary (Ubiquitous Language)

The shared vocabulary for the Reddit Office project. Every term here should be used
consistently in code, UI copy, and docs. Update as the model sharpens.

| Term | Definition | Notes / open questions |
|------|-----------|------------------------|
| **Office** | The whole bird's-eye view: the user's entire subscribed-subreddit ecosystem rendered as one pixel-art floor. | One office per user. |
| **Cubicle** | The visual container for a single subreddit; a positioned entity at an `(x, y)` in world space. | One per listened subreddit. Position persisted; user-movable later (city-builder). See ADR-0007. |
| **Camera** | The pan/zoom viewport over the office world. Default zoom frames the whole office ('at a glance'); user can zoom into a cubicle. | Only on-screen entities are animated (culling). See ADR-0007. |
| **Layout** | The persisted map of which subreddits are cubicles and where each sits in world space. | Generated at onboarding, stable thereafter, later user-editable. |
| **Worker** | A single Reddit post, rendered as a persistent animated entity inside its subreddit's cubicle. | Lifespan = TBD (how long does a post stay a worker?). |
| **Action** | A short animation a worker performs to encode a real-world Reddit event (new post, upvote surge, mod removal, etc.). | The core "utility as spectacle" mechanic. |
| **Event** | A detected change in Reddit state that triggers an Action. | Source = polling diffs, not push (see ADR-0002). |
| **Office Policy** | The user's config controlling the office. Two axes: (1) **Worker sourcing** (New / Momentum / Blend) - who fills a Roster; (2) **Event-animation toggles** - which Events fire visible Actions. Plus the subreddit whitelist. | Persisted client-side. See ADR-0005. |
| **Onboarding** | Post-login flow where the user picks which subscribed subreddits to "listen to" (become cubicles). | Curated, not exhaustive. See ADR-0004. |
| **Roster** | The bounded "sliding window" set of notable Workers a cubicle is actively tracking. Not every post - a curated sample. | Size + selection + pruning rules TBD (grilling). |
| **Discovery poll** | Slower per-subreddit poll (`/new`, `/rising`) that finds new/trending posts. | ~15-30s. See ADR-0002. |
| **Tracking poll** | Fast batched poll (`/api/info`, ≤100 IDs/call) refreshing live stats of all tracked Workers. | ~5-10s. Drives surge/removal. See ADR-0002. |
| **Velocity** | A Worker's upvotes-per-minute (score delta over time). Basis for surge detection and traction-based pruning. | Heuristic; Reddit fuzzes vote counts. |
| **Notable** | The criterion that qualifies a post to join/stay in a Roster: a high **Momentum** score. | See Momentum. |
| **Momentum** | A weighted composite of a post's rates of change - upvotes/min, comments/min, (more TBD) - **normalized per-subreddit** (relative to that sub's own baseline). Ranks posts for Roster inclusion + pruning. | `num_comments` comes free in the `/api/info` batch. See ADR-0005. |
| **Baseline** | A subreddit's rolling "normal" pace (posts/min, typical score velocity) that Momentum is measured against, so small and large subs are comparable. | Computed from discovery-poll history. |

## Event types (v1 confirmed)
- **New post arrives** - reliable, cheap.
- **Trending / rising** - reliable via `/rising`.
- **Upvote surge** - heuristic via Velocity on tracked Workers.
- **Post removed** - detectable on tracked Workers; NOT attributed to a moderator specifically.
