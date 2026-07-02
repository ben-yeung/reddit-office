# ADR-0003: Thin backend + client-side diffing

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Two-speed polling (ADR-0002) needs somewhere to run, hold sliding-window state, and keep
OAuth secrets. Options ranged from pure client-only (CORS/secret risk) to a full stateful
backend poller (most infra). This is a portfolio piece the author also uses (ADR-0001).

## Decision
Single **Next.js (App Router)** app split as:
- **Thin backend (API routes):** performs the OAuth2 **token exchange** (keeps the client
  secret server-side, uses a "web app" credential) and acts as a **Reddit proxy** for the
  browser (sidesteps browser CORS to Reddit's OAuth API).
- **Client:** owns the **polling cadence** (TanStack Query), holds the **Roster / sliding-
  window state**, and **computes Events by diffing** snapshots. Framer Motion renders the
  resulting Actions.

Tracking runs only while a tab is open - acceptable for an at-a-glance dashboard.

## Consequences
- One deployable (Vercel-friendly), full-stack story for the portfolio, minimal infra.
- No server DB required for v1; layout + Office Policy persist client-side (localStorage),
  with a clean upgrade path to a per-user store if multi-device sync is wanted later.
- Rate limiting is effectively per user token; the backend should pass through / respect
  Reddit's headers and avoid amplifying calls.
- Away-from-tab background tracking is explicitly **out of scope** for v1 (would require the
  full backend poller variant).
