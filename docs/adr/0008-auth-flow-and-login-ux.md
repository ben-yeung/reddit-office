# ADR-0008: Authentication flow and login UX

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
ADR-0003 committed to a thin Next.js backend that performs the Reddit OAuth2 token
exchange directly and proxies Reddit for the browser.
ADR-0006 pinned the minimal read-only scopes (`identity`, `mysubreddits`, `read`).
What was still unspecified was the *user-facing* login flow: how login is presented, how
the Reddit consent step completes, and where the resulting user token lives.
The request also referenced "Auth0 conventions," which needed disambiguating.

## Decision

### No third-party identity broker
"Auth0 conventions" describes only the **visual language** of the login affordance - a
Lock-style centred modal with a provider button and a skip link.
There is **no Auth0 tenant** and no brokered identity.
The app talks to Reddit directly, exactly as ADR-0003 specified.
The Reddit token is never brokered by, or stored with, a third party.

### Demo-first entry, login on demand
The app does **not** gate behind a login screen.
On landing, the office renders immediately in **Demo mode** (see ADR-0009) for an instant,
zero-friction first impression (this is a portfolio piece - ADR-0001).
A persistent **"Log in with Reddit"** affordance lives in the header; clicking it opens the
Lock-style **Login modal**. The modal itself still offers an explicit
**"Continue without logging in"** option for symmetry, but entry is never blocked.

### Consent completes in a popup, with a redirect fallback
Clicking **"Log in with Reddit"** opens the Reddit `authorize` page in a
`window.open` **popup**. Our `/api/auth/callback` route completes the token exchange, then
the callback page **`postMessage`s** the result to the opener and closes.
The demo office stays mounted underneath and **upgrades in place** into the authenticated
experience (which then enters Onboarding, per ADR-0004).

Because popups are blocked without a user gesture and behave poorly on mobile, the flow
**automatically falls back to a full-page redirect** when `window.open` returns `null`
(blocked) or when the viewport is small/touch. The redirect variant returns to a
`/callback` route that establishes the session and navigates back to the office.

### Session & token handling
- The Reddit **access/refresh token never reaches the browser.** The backend sets an
  **httpOnly, Secure, SameSite=Lax, encrypted session cookie**. The client only ever calls
  our proxy, which reads the cookie server-side. (localStorage is rejected: XSS-exfiltratable.)
- The authorize request uses **`duration=temporary`**: a 1-hour access token and **no
  refresh token**. This deliberately keeps the consent screen from asking to "maintain
  access indefinitely" - a friendlier, more privacy-forward prompt for a portfolio piece.
  The trade-off is that the session ends when the token expires and the user logs in again
  (accepted over storing a long-lived refresh token). The code still supports a refresh
  token if this is ever revisited (`getValidUserToken`), so reverting to `permanent` for the
  always-open dashboard (ADR-0001) needs only the one-line `duration` change.
- A **`state`** parameter is generated per attempt and verified on callback (CSRF defence).
- **One registered "web app" credential** (confidential client, secret held server-side per
  ADR-0003) serves both this `authorization_code` flow and the app-only Demo flow (ADR-0009).

## Consequences
- No new vendor, no second redirect hop, no tokens living outside our own backend.
- The slick "browse demo → log in → office upgrades in place" path exists, but never at the
  cost of reliability: blocked/mobile users get the bulletproof redirect flow automatically.
- Login transitions the user from Demo into **Onboarding** (ADR-0004); the curated demo
  office is ephemeral and discarded on login.
- The session lasts about an hour (the access-token lifetime); after that the user cleanly
  drops back to demo mode and can log in again.
- Client-side XSS cannot exfiltrate the Reddit token; the blast radius of a compromised
  client is limited to what the proxy already exposes.
