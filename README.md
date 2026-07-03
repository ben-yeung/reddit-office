# Reddit Office

An ambient, real-time dashboard that renders a set of subreddits as a bird's-eye, 8-bit pixel-art office.

<img width="1862" height="1077" alt="Screenshot 2025-03-04 110716" src="https://github.com/user-attachments/assets/54ca5649-d1c4-4b74-91cc-89a8dbf90118" />

Each subreddit is a **Cubicle**.

Trending posts scored by **Momentum** are represented as **Workers** inside the cubicle.

Workers animate Reddit **Events** - a new post walks in, a worker glows as it surges in upvotes, a worker is escorted out when its post is removed.

Clicking on workers opens a Reddit-style modal with the post content, comments, and an interactive **Momentum** tag that explains the score.

It runs as a single Next.js app: a thin backend does the Reddit OAuth token exchange and proxies the API, while the client owns polling, roster state, and rendering.

## How it works

- **Demo mode (default).** Unauthenticated visitors get a curated office of iconic subreddits from a shared server-side cache. No secrets required - it falls back to mock data when Reddit credentials aren't configured.
- **Authenticated mode.** Log in with Reddit to build the office from your own subscriptions. Read-only scopes for subscribed reddits and username; the user token stays in an httpOnly encrypted cookie and never reaches the browser.
- **Two-speed polling.** Reddit has no push, so Events come from diffing polls: a slower _discovery poll_ (`/new`, `/rising`) finds new/trending posts, and a fast batched _tracking poll_ (`/api/info`) refreshes live scores and comment counts.
- **Office Policy.** Client-persisted config: worker sourcing (New / Momentum / Blend), per-event animation toggles, theme, and ambient life.

Pan/zoom camera over an SVG office. Click a worker to view the post which outlinks directly to Reddit.

Full design and decision records live in `docs/PRD.md`, `docs/glossary.md`, and `docs/adr/`.

## Momentum & post selection

Not every post gets a desk.
Each cubicle shows only a handful of workers, selected based on momentum.

### What Momentum measures

Momentum is a single number that answers "how fast is this post moving _for its subreddit_, right now?"

It is built from a post's **velocity** - its rate of change between two polls, expressed per minute - across two signals:

- **upvote pace** - how fast the score is climbing
- **comment pace** - how fast comments are arriving

Those two rates are combined with fixed weights (`DEFAULT_WEIGHTS` in `src/lib/momentum/momentum.ts`), currently **70% upvote pace + 30% comment pace**.

The key move is **per-subreddit normalization**.

Each subreddit keeps a rolling **baseline** of its own "normal" pace where a post's momentum is its velocity _divided by that baseline_.

The result is a comparable multiplier, regardless of subreddit size:

| Momentum | Reading | Meaning                                                             |
| -------- | ------- | ------------------------------------------------------------------- |
| `~1.0×`  | Steady  | Moving at the subreddit's normal pace                               |
| `< 0.7×` | Cooling | Losing traction (eligible for pruning)                              |
| `≥ 2.2×` | Surging | A genuine upvote surge (`SURGE_MOMENTUM`) - triggers the glow event |

These same thresholds power the interactive Momentum tag in the post modal, which shows the post's standing on a `0..3×` gauge and explains the weighting.

### How the Roster picks who to seat

Every tick, each cubicle re-selects its workers via `selectRoster` (`src/lib/roster/roster.ts`) from the subreddit's candidate posts.
The bounded roster (`ROSTER_MAX`, currently 6) is filled in two passes:

1. **Grace period first.** Any post newer than `GRACE_MS` (20s) is guaranteed a slot, newest first, so a fresh post gets a chance to prove traction before momentum has any history on it.
2. **Then by sourcing rule.** The remaining slots go to candidates that clear a minimum momentum floor (`MIN_MOMENTUM`, 0.35), ranked according to the current **Office Policy** sourcing rule:
   - **New** - strictly by recency.
   - **Momentum** - strictly by the normalized score above.
   - **Blend** (default) - alternates between momentum and recency picks, deduped, so a cubicle mixes what's hot with what's fresh.

## Tech stack

- **[Next.js](https://nextjs.org) 16** (App Router) + **React 19** + **TypeScript** (`strict`, `@/*` alias)
- **[framer-motion](https://www.framer.com/motion/)** - worker actions and modal transitions
- **[@tanstack/react-query](https://tanstack.com/query)** - fetching and caching
- **CSS Modules** + **SVG** for styling and the pixel-art rendering (no Tailwind, no CSS-in-JS)
- **[Vitest](https://vitest.dev)** + **React Testing Library** + jsdom for tests
- **ESLint** (`eslint-config-next`) + **Prettier**

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
It works out of the box in demo mode with mock data - no configuration required.

### Enabling live Reddit data and login

Create a Reddit "web app" credential and set these in `.env.local`:

```bash
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
SESSION_SECRET=...            # required to enable user login
REDDIT_REDIRECT_URI=...       # optional; defaults to <origin>/api/auth/callback
REDDIT_USER_AGENT=...         # optional; a descriptive UA is set by default
```

The redirect URI must exactly match one registered on your Reddit app.

## Scripts

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `npm run dev`        | Start the development server   |
| `npm run build`      | Production build               |
| `npm run start`      | Serve the production build     |
| `npm run lint`       | Run ESLint                     |
| `npm run typecheck`  | Type-check with `tsc --noEmit` |
| `npm run test`       | Run the test suite (Vitest)    |
| `npm run test:watch` | Run tests in watch mode        |
| `npm run format`     | Format with Prettier           |

## Project structure

```
src/
  app/            App Router pages + API routes (auth, reddit proxy, demo)
  components/     Office stage, workers, cubicles, HUD, auth, modals
  lib/
    domain/       Core types and constants (the ubiquitous language)
    data/         DataSource interface, mock + Reddit-backed sources
    reddit/       OAuth, session, token, and API-mapping helpers
    office/       Office state hook, layout, decor
    momentum/     Per-subreddit momentum scoring
    roster/       Roster selection and pruning
    camera/       Pan/zoom camera
docs/             PRD, glossary, and ADRs
```
