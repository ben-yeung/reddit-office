# PRD: Reddit 8-bit Overview Application

## 1. Product Description

A gamified Reddit client that visualizes a user's subscription ecosystem as an 8-bit, bird’s-eye view pixel-art office. The application transforms passive feed-scrolling into an interactive "management simulation" experience where users act as overseers of their subreddit data.

## 2. Technical Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **State Management:** TanStack Query (for data fetching/caching)
- **Animation:** Framer Motion (for smooth entity movement and UI transitions)
- **Styling:** CSS Modules
- **Graphics/Assets:** Procedural generation via SVG and geometric/mathematical rendering (avoiding external image assets where possible to maintain the 8-bit aesthetic).

## 3. Core Functional Requirements

### A. Authentication & Integration

- OAuth2 flow with Reddit.
- Fetch user-subscribed subreddits.
- Efficient polling/caching of subreddit listings (New/Hot/Rising/Trending).

### B. Visual Logic (The "8-bit Office")

- **Visuals:** All office assets (cubicles, desk layouts, workers) are rendered using SVG or CSS/Mathematical primitives to achieve the pixel-art look.
- **Cubicles:** Each subscribed subreddit is rendered as a distinct 2D "cubicle" layout.
- **Workers:** Posts are rendered as persistent "workers" within cubicles.
  - Visual distinction based on score/engagement (e.g., workers moving faster or changing color for trending posts).
- **Interaction Engine:**
  - Clicking a worker triggers a Framer Motion-based modal overlay.
  - Modal displays post metadata, content, and integrated comment preview.

### C. Configuration & Management

- **Persistence:** Local/database-backed settings for user preferences.
- **Filtering/Whitelisting:** A sidebar control panel to:
  - Whitelist/Blacklist subreddits to control visual density.
  - Toggle visibility based on post category (Hot, New, Top, etc.).
  - Set "worker" spawn rules.

## 4. User Journey

1. User authenticates via Reddit.
2. App generates a randomized but persistent office layout for the user's specific subreddits.
3. User monitors "worker" activity by clicking workers to read content.
4. User adjusts the "Office Policy" (filters/whitelists) in the settings menu to prune the noise.

## 5. Implementation Roadmap

1. [x] **Setup:** Project initialization with Next.js/TypeScript/CSS Modules.
2. [x] **Auth:** Reddit OAuth flow (direct OAuth2, no broker). See ADR-0008.
3. [x] **Layer 1:** Grid/cubicle layout via SVG/math-based rendering, with a procedural floor plan (aisles, amenities, meeting rooms).
4. [x] **Layer 2:** Mock data source driving the Framer Motion interaction logic (`MockDataSource`).
5. [~] **Layer 3:** Reddit API integration (raw REST via a thin server proxy).
   Demo mode is live (app-only token + shared cache), and the authenticated office renders the user's picked subreddits via on-demand polling; the real-time two-speed polling engine (surge/removed) is still pending (ADR-0002).
6. [~] **Configuration:** Office Policy panel exists (sourcing rule, event toggles, theme, ambient).
   The post-login onboarding sub-picker is live (choose up to a floor's worth of your subscriptions, re-pick from the policy panel); a persistent in-office whitelist/blacklist is still pending.

Legend: `[x]` done, `[~]` in progress, `[ ]` not started.

## 6. Auth & data architecture (as built)

The app runs in one of two modes, both served by the same thin Next.js backend that proxies Reddit and keeps secrets server-side.

### Demo mode (unauthenticated, default)

This is the default, demo-first experience: the office renders immediately with no login required.
It is built from a curated fixed list of iconic SFW subreddits, filled with their live hot posts.
"Without logging in" is not token-less: Reddit no longer serves anonymous JSON reliably from server IPs, so demo authenticates as the *application* via the `client_credentials` grant (an app-only token).
Because the demo office is identical for every visitor, its data is fetched once per interval and held in a shared server-side cache (`unstable_cache`), so Reddit call volume stays constant regardless of concurrent visitors.
See ADR-0009.

### Authenticated mode (after Reddit login)

Login uses direct Reddit OAuth2 in our own API routes, with no third-party identity broker.
The login UI is a Lock-style modal ("Auth0 conventions" refers to the look only); consent completes in a popup with `postMessage`, falling back to a full-page redirect when popups are blocked or on mobile.
The requested scopes are minimal: `identity`, `mysubreddits`, `read` (read-only monitor, ADR-0006).
The flow uses `duration=temporary`, so Reddit issues a 1-hour access token and no refresh token, and the consent screen does not ask to "maintain access indefinitely"; the session ends at token expiry and the user logs in again.
Reddit tokens never reach the browser: they live in an httpOnly, Secure, SameSite=Lax, AES-256-GCM-encrypted session cookie, and the client only ever calls our proxy.
See ADR-0008.

After login, onboarding drives the authenticated experience: a picker lists the user's subscriptions (`/api/reddit/my-subreddits`, mapped server-side and ordered by subscriber count) and they choose which become cubicles, capped at the tuned demo grid size so the floor stays readable.
The pick is persisted per user in `localStorage`, so return visits land straight in the office; the Office Policy panel's "Reselect subreddits" button reopens the picker (uncheck one to swap when at the cap).
The office itself is built from the picked subs via `PollingOfficeDataSource` against `/api/reddit/office`, which fetches each sub's hot posts with the user's token (sharing the same `fetchOfficeForSubs` primitive as demo mode).

### The DataSource seam

The office UI depends only on the domain types and a single `DataSource` interface, so the mock simulation and the real Reddit layer are interchangeable with no UI changes.
`MockDataSource` drives development and is also the graceful-degradation fallback; `PollingOfficeDataSource` renders real posts by polling a server office endpoint, and one instance serves both modes - the injected `fetchPayload` points at the shared-cached `/api/demo/office` for demo, or POSTs the user's picks to `/api/reddit/office` for the authenticated office.

### Graceful degradation

The app runs with zero secrets: when Reddit credentials are absent, demo mode falls back to the mock simulation and login is disabled.
It switches to live data and enables login the moment `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `SESSION_SECRET` are set.

## 7. Local development & OAuth testing

Configuration is via environment variables; see `.env.example`.
`.env.local` (git-ignored) holds real credentials.

**OAuth testing must run the dev server on port 3210.**
The Reddit app's registered redirect URI is `http://localhost:3210/api/auth/callback`, and Reddit requires the `redirect_uri` to match exactly.
Run `npm run dev -- --port 3210` for any login/callback testing; the default port 3000 will fail the callback with a redirect_uri mismatch.
Demo mode (app-only token) does not depend on a specific port, but user login does.

## 8. Design records

Architecture decisions live in `docs/adr/` (ADR-0001 through ADR-0009).
The shared vocabulary (Office, Cubicle, Worker, Roster, Momentum, Demo mode, etc.) lives in `docs/glossary.md` and should be used consistently in code, UI copy, and docs.
