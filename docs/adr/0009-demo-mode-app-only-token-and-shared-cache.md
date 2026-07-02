# ADR-0009: Demo mode - app-only token, shared cache, curated office

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
The app must be usable **without** a Reddit login, so a first-time visitor immediately sees
a living office (ADR-0008, ADR-0001).
Two facts shaped this:

1. **"Without logging in" is not token-less.** Reddit no longer serves the old anonymous
   `.json` endpoints reliably from server IPs (datacenter IPs are throttled/blocked since the
   2023 API changes). Any server-side fetch needs an OAuth token.
2. **The demo office is identical for every visitor** - it is a fixed showcase, not
   personalised.

## Decision

### App-only OAuth token
Demo mode authenticates as the **application**, not a user, via the
**`client_credentials`** grant on the same registered "web app" credential (ADR-0008).
"No login" therefore means **no *user* token** - the server still authenticates as the app.
All demo visitors share the app's single rate-limit bucket.

### Curated office, not dynamic
The demo office is a **curated fixed list of ~8-12 iconic, SFW subreddits**
(e.g. r/pics, r/askreddit, r/gaming, r/science, ...), each rendered as a Cubicle and filled
with that sub's current **hot** posts as Workers.
Curation is ours: this guarantees a stable, always-striking, SFW-predictable first
impression, versus `/subreddits/popular` which is unpredictable and can surface odd or
NSFW-adjacent subs. The curated list lives in a single config module.

### Shared server-side cache
Because the demo office is the same for everyone, the server **polls Reddit once per interval**
for the curated subs and **caches the snapshot** (in-memory TTL / Next `unstable_cache` -
**no database**, consistent with ADR-0003). Every demo client reads that shared snapshot
rather than triggering its own Reddit calls.

Consequences of this shape:
- Reddit call volume is **constant regardless of concurrent visitor count** - the demo
  scales free and cannot throttle the shared bucket under a traffic spike (the exact moment
  a portfolio link matters most).
- Demo data is at most **one interval stale** and identical for all viewers - acceptable, it
  is a showcase.
- Demo is still **alive**: Events (new post, trending, surge) are derived from diffs of the
  cached snapshots, so the real-time craft (ADR-0001, ADR-0002) is demonstrated without login.

### Authenticated mode is unchanged
Logged-in users use their **own** user token and the per-user polling model of ADR-0002 /
ADR-0003; they do **not** read the shared demo cache. The shared cache is a demo-only concern.

## Consequences
- The demo is a real server-side auth path, not a bypass: it needs the app credential and an
  app-only token fetch/refresh on the server.
- First bit of server-side state enters the system (a short-TTL cache), but still **no DB**.
- Clean separation: demo = app token + shared cache + curated subs; authenticated = user
  token + per-user state + user's real subs (Onboarding, ADR-0004).
- Reddit **User-Agent** must be set on all server requests (both grants) to avoid throttling.
