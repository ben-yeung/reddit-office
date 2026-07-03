/**
 * Shared office-fetching primitive: given a set of subreddits and a Bearer token,
 * fetch each sub's current hot posts plus its community icon and assemble the
 * office payload the client renders. Both modes build on this - demo (app token,
 * fixed curated list, wrapped in `unstable_cache`) and authenticated (user token,
 * the subs picked during onboarding).
 *
 * The listing and the icon are fetched independently per sub, and either may fail
 * on its own without dropping the other or blanking the whole office (ADR-0009).
 */
import { redditGet } from "./client";
import { mapAboutIcon, mapListing } from "./map";
import type { DemoOfficePayload, RedditPostDTO } from "./dto";
import type { Subreddit } from "@/lib/domain/types";

/**
 * Community icons practically never change, so they are cached far longer than
 * the hot listing: Reddit's `/about` is hit ~once a day per sub regardless of how
 * often the office payload itself refreshes.
 */
export const ICON_REVALIDATE = 86_400; // seconds (24h)
/** Posts fetched per sub: a little headroom above ROSTER_MAX for roster selection. */
export const POSTS_PER_SUB = 12;

export interface OfficeFetchOptions {
  /**
   * Seconds to cache each sub's hot listing via Next's Data Cache. A public sub's
   * hot listing is identical for everyone, so even the authenticated office shares
   * it across viewers. Omit for `no-store`.
   */
  postsRevalidate?: number;
  /** How many posts to keep per sub after mapping. Defaults to {@link POSTS_PER_SUB}. */
  postsPerSub?: number;
}

/** Fetch one sub's community icon, or undefined if it has none / the call fails. */
async function fetchSubredditIcon(name: string, token: string): Promise<string | undefined> {
  try {
    const json = await redditGet<unknown>(`/r/${name}/about`, {
      token,
      revalidate: ICON_REVALIDATE,
    });
    return mapAboutIcon(json);
  } catch {
    // A missing icon just falls back to the letter tile; never blank the office.
    return undefined;
  }
}

/**
 * Build an office payload for the given subreddits using the supplied token. Ids
 * and colors are taken from the caller's `Subreddit` objects verbatim, so the
 * returned `postsBySub` keys line up with the layout's cubicle ids.
 */
export async function fetchOfficeForSubs(
  subreddits: Subreddit[],
  token: string,
  opts: OfficeFetchOptions = {},
): Promise<DemoOfficePayload> {
  const postsPerSub = opts.postsPerSub ?? POSTS_PER_SUB;

  const results = await Promise.all(
    subreddits.map(async (sub) => {
      const [posts, iconUrl] = await Promise.all([
        redditGet<unknown>(`/r/${sub.name}/hot?limit=${postsPerSub + 4}`, {
          token,
          revalidate: opts.postsRevalidate,
        })
          .then((json) => mapListing(json, sub.id, postsPerSub))
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
