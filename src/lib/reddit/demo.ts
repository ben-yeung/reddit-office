/**
 * Demo-mode office data (ADR-0009): the curated subreddits' current hot posts,
 * fetched once per interval and shared across every visitor.
 *
 * The result is wrapped in `unstable_cache` so it is stored in Next's
 * platform-backed Data Cache (shared across serverless invocations), NOT a
 * module-level Map (which would be per-instance and defeat the purpose). Reddit
 * call volume is therefore constant regardless of concurrent demo visitors.
 */
import { unstable_cache } from "next/cache";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { getCredentials } from "./config";
import { getAppToken } from "./tokens";
import { redditGet } from "./client";
import { mapListing } from "./map";
import type { DemoOfficePayload, RedditPostDTO } from "./dto";

/** Shared-cache lifetime. Demo data may be up to this stale - fine, it is a showcase. */
const DEMO_REVALIDATE = 45; // seconds
/** Posts fetched per sub: a little headroom above ROSTER_MAX for roster selection. */
const POSTS_PER_SUB = 12;

async function fetchCuratedOffice(): Promise<DemoOfficePayload> {
  const token = await getAppToken();

  const entries = await Promise.all(
    CURATED_SUBREDDITS.map(async (sub) => {
      try {
        const json = await redditGet<unknown>(`/r/${sub.name}/hot?limit=${POSTS_PER_SUB + 4}`, {
          token,
          revalidate: DEMO_REVALIDATE,
        });
        return [sub.id, mapListing(json, sub.id, POSTS_PER_SUB)] as const;
      } catch {
        // One failing sub should not blank the whole office.
        return [sub.id, [] as RedditPostDTO[]] as const;
      }
    }),
  );

  return {
    configured: true,
    subreddits: CURATED_SUBREDDITS,
    postsBySub: Object.fromEntries(entries),
  };
}

const getCachedCuratedOffice = unstable_cache(fetchCuratedOffice, ["demo-office"], {
  revalidate: DEMO_REVALIDATE,
  tags: ["demo-office"],
});

/**
 * The demo office payload. Returns an `unconfigured` payload (no Reddit calls)
 * when credentials are absent, so the client can fall back to the mock office.
 */
export async function getDemoOffice(): Promise<DemoOfficePayload> {
  if (!getCredentials()) {
    return {
      configured: false,
      subreddits: CURATED_SUBREDDITS,
      postsBySub: {},
      reason: "Reddit credentials are not configured; showing the mock office.",
    };
  }
  try {
    return await getCachedCuratedOffice();
  } catch (err) {
    return {
      configured: false,
      subreddits: CURATED_SUBREDDITS,
      postsBySub: {},
      reason: err instanceof Error ? err.message : "Failed to load live Reddit data.",
    };
  }
}
