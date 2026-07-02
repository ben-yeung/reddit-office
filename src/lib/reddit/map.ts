/**
 * Map Reddit's listing JSON into our normalized DTOs. Isolating the API shape
 * here keeps the rest of the code decoupled from Reddit's field names.
 */
import type { RedditPostDTO } from "./dto";

/** The subset of a Reddit `t3` (link) object we consume. */
interface RedditLink {
  id: string;
  name: string;
  title: string;
  author: string;
  selftext: string;
  url: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
  over_18: boolean;
  stickied: boolean;
  is_self: boolean;
}

interface Listing {
  data?: { children?: Array<{ kind: string; data: RedditLink }> };
}

/** Identity payload from `/api/v1/me`. */
export interface RedditMe {
  name: string;
  icon_img?: string;
  snoovatar_img?: string;
}

const MAX_BODY = 280;

function bodyOf(link: RedditLink): string {
  if (link.is_self && link.selftext) {
    const text = link.selftext.trim();
    return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…` : text;
  }
  return link.url;
}

/**
 * Normalize a hot/new listing into posts for one subreddit. Filters out
 * stickied announcements and NSFW posts so the curated demo stays SFW (ADR-0009).
 */
export function mapListing(json: unknown, subredditId: string, limit: number): RedditPostDTO[] {
  const children = (json as Listing).data?.children ?? [];
  const posts: RedditPostDTO[] = [];
  for (const child of children) {
    if (child.kind !== "t3") continue;
    const d = child.data;
    if (d.stickied || d.over_18) continue;
    posts.push({
      id: d.name,
      subredditId,
      title: d.title,
      author: `u/${d.author}`,
      body: bodyOf(d),
      permalink: `https://www.reddit.com${d.permalink}`,
      createdAt: d.created_utc * 1000,
      score: d.score,
      comments: d.num_comments,
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

/** Extract a usable avatar URL from `/api/v1/me` (icons are HTML-escaped). */
export function meIconUrl(me: RedditMe): string | null {
  const raw = me.snoovatar_img || me.icon_img || "";
  const clean = raw.split("?")[0];
  return clean || null;
}
