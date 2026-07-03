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
import { mapAboutIcon, mapComments, mapListing } from "./map";
import type { DemoCommentsPayload, DemoOfficePayload, RedditPostDTO } from "./dto";

/** Shared-cache lifetime. Demo data may be up to this stale - fine, it is a showcase. */
const DEMO_REVALIDATE = 45; // seconds
/**
 * Community icons practically never change, so they're cached far longer than
 * the hot listing: Reddit's `/about` is hit ~once a day per sub even though the
 * office payload itself refreshes every {@link DEMO_REVALIDATE}s.
 */
const ICON_REVALIDATE = 86_400; // seconds (24h)
/** Posts fetched per sub: a little headroom above ROSTER_MAX for roster selection. */
const POSTS_PER_SUB = 12;
/** Comment-thread cache lifetime (comments move slower than the hot listing). */
const COMMENTS_REVALIDATE = 120; // seconds
/** Top-level comments shown per post - threads can run to thousands, so cap hard. */
const COMMENTS_LIMIT = 20;

/** Fetch one sub's community icon, or undefined if it has none / the call fails. */
async function fetchSubredditIcon(name: string, token: string): Promise<string | undefined> {
  try {
    const json = await redditGet<unknown>(`/r/${name}/about`, { token, revalidate: ICON_REVALIDATE });
    return mapAboutIcon(json);
  } catch {
    // A missing icon just falls back to the letter tile; never blank the office.
    return undefined;
  }
}

async function fetchCuratedOffice(): Promise<DemoOfficePayload> {
  const token = await getAppToken();

  const results = await Promise.all(
    CURATED_SUBREDDITS.map(async (sub) => {
      // Hot listing and icon are independent: fetch together, and let either
      // fail on its own without dropping the other.
      const [posts, iconUrl] = await Promise.all([
        redditGet<unknown>(`/r/${sub.name}/hot?limit=${POSTS_PER_SUB + 4}`, {
          token,
          revalidate: DEMO_REVALIDATE,
        })
          .then((json) => mapListing(json, sub.id, POSTS_PER_SUB))
          // One failing sub should not blank the whole office.
          .catch(() => [] as RedditPostDTO[]),
        fetchSubredditIcon(sub.name, token),
      ]);
      return { sub: iconUrl ? { ...sub, iconUrl } : sub, posts };
    }),
  );

  return {
    configured: true,
    subreddits: results.map((r) => r.sub),
    postsBySub: Object.fromEntries(results.map((r) => [r.sub.id, r.posts])),
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

/**
 * The top-upvoted top-level comments for one post (demo mode, app token). Reddit's
 * comment thread is `[post, comments]`; we request `sort=top&depth=1` and cap at
 * {@link COMMENTS_LIMIT}. The fetch is shared-cached per post via the Data Cache.
 *
 * Returns an `unconfigured` payload (no Reddit call) when credentials are absent,
 * so the client can fall back to a mock comments preview.
 */
export async function getDemoComments(postId: string): Promise<DemoCommentsPayload> {
  if (!getCredentials()) {
    return { configured: false, comments: [], reason: "Reddit credentials are not configured." };
  }
  // Accept a fullname ("t3_abc") or a bare id; Reddit's endpoint wants the bare id.
  const article = postId.replace(/^t3_/, "");
  if (!/^[a-z0-9]+$/i.test(article)) {
    return { configured: false, comments: [], reason: "Invalid post id." };
  }
  try {
    const token = await getAppToken();
    const json = await redditGet<unknown>(
      `/comments/${article}?sort=top&depth=1&limit=${COMMENTS_LIMIT}`,
      { token, revalidate: COMMENTS_REVALIDATE },
    );
    return { configured: true, comments: mapComments(json, COMMENTS_LIMIT) };
  } catch (err) {
    return {
      configured: false,
      comments: [],
      reason: err instanceof Error ? err.message : "Failed to load comments.",
    };
  }
}
