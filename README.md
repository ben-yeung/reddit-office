# Reddit Office

An ambient, real-time dashboard that renders a set of subreddits as a bird's-eye, 8-bit pixel-art office.

Each subreddit is a **Cubicle**; notable posts are **Workers** inside it.
Workers animate real Reddit **Events** - a new post walks in, a worker glows as it surges in upvotes, a worker is escorted out when its post is removed.
The point is to see "what's happening across my subreddits right now" at a glance.

It runs as a single Next.js app: a thin backend does the Reddit OAuth token exchange and proxies the API, while the client owns polling, roster state, and rendering.

## How it works

- **Demo mode (default).** Unauthenticated visitors get a curated office of iconic subreddits from a shared server-side cache. No secrets required - it falls back to mock data when Reddit credentials aren't configured.
- **Authenticated mode.** Log in with Reddit to build the office from your own subscriptions. Read-only scopes only; the user token stays in an httpOnly encrypted cookie and never reaches the browser.
- **Two-speed polling.** Reddit has no push, so Events come from diffing polls: a slower *discovery poll* (`/new`, `/rising`) finds new/trending posts, and a fast batched *tracking poll* (`/api/info`) refreshes live scores and comment counts.
- **Momentum + Roster.** Each cubicle keeps a bounded roster of workers, ranked by a per-subreddit-normalized momentum score so small and large subs stay comparable.
- **Office Policy.** Client-persisted config: worker sourcing (New / Momentum / Blend), per-event animation toggles, theme, and ambient life.

Pan/zoom camera over an SVG office. Click a worker for a modal with the post and an "Open in Reddit" link - the app performs no writes.

Full design and decision records live in `docs/PRD.md`, `docs/glossary.md`, and `docs/adr/`.

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
