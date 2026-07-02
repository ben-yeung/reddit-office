# Reddit Office

Reddit Office is an ambient, real-time dashboard that renders a set of subreddits as a bird's-eye, 8-bit pixel-art office.
Each subreddit is a **Cubicle**; notable posts are **Workers** inside it.
Workers perform short animated **Actions** that encode real Reddit **Events** - a new post walking in, a worker glowing as it surges in upvotes, a worker being escorted out when its post is removed.
The goal is to turn "what's happening across my subreddits right now" into something you can take in at a glance, and enjoy looking at.

It runs as a single Next.js app: a thin backend handles Reddit OAuth token exchange and proxies the Reddit API, while the client owns polling, roster state, and the pixel-art rendering.

## How it works

- **Demo mode (default).** Unauthenticated visitors see a curated office built from a fixed set of iconic subreddits, served from a shared server-side cache. Runs with zero secrets - if no Reddit credentials are configured it falls back to mock data.
- **Authenticated mode.** After logging in with Reddit, the office is built from your own subscribed subreddits. Read-only scopes only (`identity`, `mysubreddits`, `read`); the user token lives in an httpOnly encrypted session cookie and never reaches the browser.
- **Two-speed polling.** Reddit offers no push, so Events are derived by diffing polled snapshots: a slower per-subreddit *discovery poll* (`/new`, `/rising`) finds new and trending posts, and a fast batched *tracking poll* (`/api/info`) refreshes live score/comment counts for all tracked workers at once.
- **Momentum + Roster.** Each cubicle keeps a bounded roster of notable workers, ranked by a per-subreddit-normalized momentum score so small and large subs stay comparable.
- **Office Policy.** User-configurable worker sourcing (New / Momentum / Blend), per-event animation toggles, theme, and ambient office life - persisted client-side.

The office world uses a pan/zoom camera over SVG-rendered cubicles and workers. Click a worker to open a modal with the post and an "Open in Reddit" link (the app performs no writes).

See `docs/PRD.md`, `docs/glossary.md`, and `docs/adr/` for the full design and decision records.

## Tech stack

- **[Next.js](https://nextjs.org) 16** (App Router) + **React 19** + **TypeScript** (`strict`, `@/*` path alias)
- **[framer-motion](https://www.framer.com/motion/)** - worker actions and modal transitions
- **[@tanstack/react-query](https://tanstack.com/query)** - fetching and caching
- **CSS Modules** for styling; SVG for the pixel-art rendering (no Tailwind, no CSS-in-JS)
- **[Vitest](https://vitest.dev)** + **React Testing Library** + jsdom for tests
- **ESLint** (`eslint-config-next`) + **Prettier** for lint/format

## Getting started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the office. It works out of the box in demo mode with mock data - no configuration required.

### Enabling live Reddit data and login

Create a Reddit "web app" credential and set the following environment variables (e.g. in `.env.local`):

```bash
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
SESSION_SECRET=...            # required to enable user login
REDDIT_REDIRECT_URI=...       # optional; defaults to <origin>/api/auth/callback
REDDIT_USER_AGENT=...         # optional; a descriptive UA is set by default
```

The OAuth redirect URI must exactly match one registered on your Reddit app.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run test` | Run the test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run format` | Format with Prettier |

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
