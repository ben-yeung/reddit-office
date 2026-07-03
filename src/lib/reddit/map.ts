/**
 * Map Reddit's listing JSON into our normalized DTOs. Isolating the API shape
 * here keeps the rest of the code decoupled from Reddit's field names.
 */
import type { PostKind } from "@/lib/domain/types";
import type { RedditCommentDTO, RedditPostDTO } from "./dto";

/** A single preview rendition Reddit offers for a link's media. */
interface RedditImageSource {
  url?: string;
  width?: number;
  height?: number;
}

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
  /** Reddit's own content classification, e.g. "image", "link", "rich:video". */
  post_hint?: string;
  /** Bare source domain, e.g. "themirror.com" or "i.redd.it". */
  domain?: string;
  /** Resolved outbound URL for crossposts/redirects. */
  url_overridden_by_dest?: string;
  /** "self" / "default" / "nsfw" / "spoiler" placeholders, or an https URL. */
  thumbnail?: string;
  /** Post flair text, when set. */
  link_flair_text?: string | null;
  is_gallery?: boolean;
  /** Generated previews; URLs are HTML-escaped (`&amp;`). */
  preview?: { enabled?: boolean; images?: Array<{ source?: RedditImageSource }> };
  /** Inline/gallery media, keyed by media id; URLs are HTML-escaped. */
  media_metadata?: MediaMetadata;
}

/** One inline-media entry (uploaded image, gallery item, or giphy/gif). */
interface MediaEntry {
  /** "Image" | "AnimatedImage" | ... */
  e?: string;
  /** Source renditions: `u` static image, `gif`/`mp4` animated. */
  s?: { u?: string; gif?: string; mp4?: string };
}
type MediaMetadata = Record<string, MediaEntry>;

/** Best displayable URL for an inline-media entry (prefer animated gif). */
function mediaEntryUrl(entry: MediaEntry | undefined): string | undefined {
  const url = entry?.s?.gif || entry?.s?.u || entry?.s?.mp4;
  return url ? unescapeHtml(url) : undefined;
}

/**
 * Reddit embeds inline images/gifs in body markdown as `![alt](KEY)` where KEY
 * (e.g. `giphy|abc|downsized` or an i.redd.it id) resolves via `media_metadata`.
 * Rewrite those refs to real image URLs so the markdown renderer draws them;
 * drop refs that can't be resolved so no broken syntax leaks through.
 */
function resolveInlineMedia(body: string, meta?: MediaMetadata): string {
  if (!body.includes("![")) return body;
  // `![alt](KEY)` or `![alt](KEY "title")` - KEY is the ref; keep the tail.
  return body.replace(
    /(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\s*\))/g,
    (full, pre, ref, tail) => {
      if (/^https?:\/\//i.test(ref)) return full; // already a URL
      // Giphy: the id lives in the ref (`giphy|<id>[|size]`) and media_metadata
      // carries no source URL for it, so build the CDN gif URL directly.
      if (ref.startsWith("giphy|")) {
        const gid = ref.split("|")[1];
        return gid ? `${pre}https://media.giphy.com/media/${gid}/giphy.gif${tail}` : "";
      }
      // Reddit-hosted inline media (images/gifs) resolves via media_metadata.
      const entry =
        meta?.[ref] ?? meta?.[ref.split("|").slice(0, 2).join("|")] ?? meta?.[ref.split("|")[0]];
      const url = mediaEntryUrl(entry);
      return url ? `${pre}${url}${tail}` : "";
    },
  );
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

const MAX_BODY = 2000;
const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp|bmp)(?:\?.*)?$/i;
/** Thumbnail sentinels Reddit uses in place of an actual image URL. */
const THUMB_PLACEHOLDERS = new Set(["self", "default", "nsfw", "spoiler", "image", ""]);

/** Reddit HTML-escapes media URLs in JSON; undo it for use in <img src>. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Best available preview/content image URL, or undefined if the post has none. */
function imageOf(link: RedditLink): string | undefined {
  const preview = link.preview?.images?.[0]?.source?.url;
  if (preview) return unescapeHtml(preview);

  if (link.media_metadata) {
    for (const m of Object.values(link.media_metadata)) {
      if (m.s?.u) return unescapeHtml(m.s.u);
    }
  }

  const thumb = link.thumbnail;
  if (thumb && /^https?:\/\//.test(thumb) && !THUMB_PLACEHOLDERS.has(thumb)) return thumb;

  const url = link.url_overridden_by_dest || link.url;
  if (url && IMAGE_EXT.test(url)) return url;

  return undefined;
}

/** Classify how the post should render (mirrors Reddit's `post_hint`). */
function kindOf(link: RedditLink): PostKind {
  if (link.is_self) return "text";
  if (link.is_gallery) return "image";
  if (link.post_hint === "image") return "image";
  const url = link.url_overridden_by_dest || link.url;
  if (url && IMAGE_EXT.test(url)) return "image";
  return "link";
}

/**
 * The post's selftext (raw Reddit markdown), preserved for every kind - image
 * and link posts can still carry a text body, and the UI renders it as markdown
 * above the media. Truncation breaks onto its own line so it can't split inline
 * markdown syntax.
 */
function bodyOf(link: RedditLink): string {
  const text = resolveInlineMedia((link.selftext || "").trim(), link.media_metadata);
  return clampBody(text, MAX_BODY);
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
    const kind = kindOf(d);
    const flair = d.link_flair_text?.trim();
    posts.push({
      id: d.name,
      subredditId,
      title: d.title,
      author: `u/${d.author}`,
      body: bodyOf(d),
      kind,
      image: imageOf(d),
      linkDomain: kind === "link" ? d.domain : undefined,
      flair: flair ? flair : undefined,
      permalink: `https://www.reddit.com${d.permalink}`,
      createdAt: d.created_utc * 1000,
      score: d.score,
      comments: d.num_comments,
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

/** The subset of a Reddit `t1` (comment) object we consume. */
interface RedditComment {
  name: string;
  author: string;
  body: string;
  score?: number;
  ups?: number;
  created_utc: number;
  stickied?: boolean;
  /** Path to this comment, e.g. "/r/sub/comments/<post>/<slug>/<id>/". */
  permalink?: string;
  /** Inline images/gifs embedded in the comment body. */
  media_metadata?: MediaMetadata;
}

const MAX_COMMENT_BODY = 1200;

/** Truncate on a new line so a cut can't split inline markdown (links, bold). */
function clampBody(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}\n\n…`;
}

/**
 * Map Reddit's comments response into normalized comment DTOs. The response is
 * a two-element array: [post listing, comments listing]. We take the top-level
 * `t1` children (already top-sorted by the request), skipping stickied,
 * removed, and deleted entries, and cap the count.
 */
export function mapComments(json: unknown, limit: number): RedditCommentDTO[] {
  const listing = Array.isArray(json) ? (json[1] as Listing | undefined) : undefined;
  const children = listing?.data?.children ?? [];
  const out: RedditCommentDTO[] = [];
  for (const child of children) {
    if (child.kind !== "t1") continue;
    const c = child.data as unknown as RedditComment;
    const body = (c.body ?? "").trim();
    if (!body || body === "[removed]" || body === "[deleted]") continue;
    if (c.author === "[deleted]" || c.stickied) continue;
    out.push({
      id: c.name,
      author: `u/${c.author}`,
      body: clampBody(resolveInlineMedia(body, c.media_metadata), MAX_COMMENT_BODY),
      score: c.score ?? c.ups ?? 0,
      createdAt: c.created_utc * 1000,
      permalink: c.permalink ? `https://www.reddit.com${c.permalink}` : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Extract a usable avatar URL from `/api/v1/me` (icons are HTML-escaped). */
export function meIconUrl(me: RedditMe): string | null {
  const raw = me.snoovatar_img || me.icon_img || "";
  const clean = raw.split("?")[0];
  return clean || null;
}
