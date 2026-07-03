/**
 * Wire types shared between the server (demo/proxy routes) and the client
 * (auth context, demo data source). Pure types + no server-only imports, so
 * this module is safe to import from client components.
 */
import type { PostKind, Subreddit } from "@/lib/domain/types";

/** Identifies the `postMessage` the OAuth popup sends back to the opener. */
export const AUTH_MESSAGE_SOURCE = "reddit-office-auth";

/** Shape of that `postMessage`. */
export interface AuthMessage {
  source: typeof AUTH_MESSAGE_SOURCE;
  ok: boolean;
  reason?: string;
}

/** A single Reddit post, normalized to the fields the office needs. */
export interface RedditPostDTO {
  /** Fullname, e.g. "t3_abc123". */
  id: string;
  subredditId: string;
  title: string;
  author: string;
  body: string;
  /** How the post presents its content (mirrors Reddit's `post_hint`). */
  kind: PostKind;
  /** Preview/content image URL for image and link posts, when Reddit provides one. */
  image?: string;
  /** External domain for link posts, e.g. "themirror.com". */
  linkDomain?: string;
  /** Post flair text, when set. */
  flair?: string;
  permalink: string;
  /** ms epoch. */
  createdAt: number;
  score: number;
  comments: number;
}

/** Payload of `GET /api/demo/office`. */
export interface DemoOfficePayload {
  /**
   * `false` when Reddit credentials are not configured. The client then falls
   * back to the mock simulation (ADR-0009 graceful degradation).
   */
  configured: boolean;
  subreddits: Subreddit[];
  /** Curated posts keyed by subreddit id (each sub's current hot listing). */
  postsBySub: Record<string, RedditPostDTO[]>;
  /** When `configured` is false, why (for a subtle UI hint). */
  reason?: string;
}

/** A single top-level comment, normalized for the modal's comments column. */
export interface RedditCommentDTO {
  /** Fullname, e.g. "t1_abc123". */
  id: string;
  author: string;
  body: string;
  score: number;
  /** ms epoch. */
  createdAt: number;
  /** Absolute reddit.com URL to this specific comment. */
  permalink: string;
}

/** Payload of `GET /api/demo/comments`. */
export interface DemoCommentsPayload {
  /** `false` when credentials are absent or the fetch failed (client falls back). */
  configured: boolean;
  /** Top-upvoted top-level comments, capped server-side. */
  comments: RedditCommentDTO[];
  /** When `configured` is false, why. */
  reason?: string;
}

/** Payload of `GET /api/auth/me`. */
export interface AuthMePayload {
  /** Whether login is even possible (credentials + session secret present). */
  authConfigured: boolean;
  /** The logged-in user, or null in demo mode. */
  user: { name: string; iconUrl: string | null } | null;
}
