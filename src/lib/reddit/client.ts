/**
 * Thin server-side Reddit API client (ADR-0003 proxy). Every request carries a
 * Bearer token and the descriptive User-Agent Reddit requires.
 */
import { REDDIT, getUserAgent } from "./config";

export interface RedditGetOptions {
  /** Bearer token (user token or app-only token). */
  token: string;
  /** Seconds to cache via Next's Data Cache; omit for no caching. */
  revalidate?: number;
  /** Optional AbortSignal. */
  signal?: AbortSignal;
}

/**
 * GET a path under `oauth.reddit.com` and parse JSON. `raw_json=1` disables
 * Reddit's HTML-entity encoding so titles/bodies render cleanly.
 */
export async function redditGet<T>(path: string, opts: RedditGetOptions): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${REDDIT.api}${path}`);
  if (!url.searchParams.has("raw_json")) url.searchParams.set("raw_json", "1");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "User-Agent": getUserAgent(),
    },
    signal: opts.signal,
    ...(opts.revalidate === undefined
      ? { cache: "no-store" as const }
      : { next: { revalidate: opts.revalidate } }),
  });

  if (!res.ok) {
    throw new Error(`Reddit API ${res.status} for ${url.pathname}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}
