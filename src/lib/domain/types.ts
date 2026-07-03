/**
 * Core domain types for Reddit Office.
 *
 * These are the ubiquitous language from docs/glossary.md, in code form.
 * The UI depends only on these + the DataSource interface, so the mock
 * simulation now and the real Reddit layer later are interchangeable.
 */

export type Vec2 = { x: number; y: number };

/** Which population fills a cubicle's Roster (Office Policy axis 1). */
export type SourcingRule = "new" | "momentum" | "blend";

/** The four v1 events a Worker can animate (Office Policy axis 2 toggles these). */
export type WorkerEventType = "new-post" | "trending" | "surge" | "removed";

/** Office visual theme. */
export type OfficeTheme = "dark" | "light";

/**
 * How a post presents its content (mirrors Reddit's `post_hint`, simplified).
 * - "text": a self-text post; {@link Worker.body} carries the copy.
 * - "image": the image is the content; body is usually empty.
 * - "link": an outbound link with a preview image + domain.
 */
export type PostKind = "text" | "image" | "link" | "video";

/** A Reddit-hosted (v.redd.it) video's playable sources and intrinsic size. */
export interface PostVideo {
  /** HLS playlist (audio + adaptive quality); preferred source when present. */
  hls?: string;
  /** Progressive MP4 fallback (often video-only) for browsers without HLS. */
  fallback: string;
  /** Intrinsic pixel dimensions, used to reserve the correct aspect ratio. */
  width: number;
  height: number;
  /** Whether the source carries an audio track. */
  hasAudio: boolean;
}

export interface Subreddit {
  /** Reddit fullname-style id, e.g. "t5_2fwo". Mock generates stable ids. */
  id: string;
  /** Bare name, e.g. "programming". */
  name: string;
  /** Display form, e.g. "r/programming". */
  displayName: string;
  /** Accent color for the cubicle + its workers. */
  color: string;
}

/** The visual container for one subreddit, positioned in world space. */
export interface Cubicle {
  subredditId: string;
  /** Top-left corner in world units. */
  position: Vec2;
  /** Footprint in world units. */
  size: { w: number; h: number };
}

/** A single Reddit post, rendered as a persistent animated worker. */
export interface Worker {
  /** Post fullname, e.g. "t3_abc". */
  id: string;
  subredditId: string;
  title: string;
  author: string;
  /** Post content preview (self text or a link description). */
  body: string;
  /** How the post presents its content. */
  kind: PostKind;
  /** Preview/content image URL for "image" and "link" posts, when available. */
  image?: string;
  /** Playable sources for "video" posts (v.redd.it), when available. */
  video?: PostVideo;
  /** External domain for "link" posts, e.g. "themirror.com". */
  linkDomain?: string;
  /** Optional flair label rendered as a pill, e.g. "article", "OC". */
  flair?: string;
  /** Permalink path on reddit.com. */
  permalink: string;
  /** ms epoch of creation. */
  createdAt: number;

  /** Latest live stats. */
  score: number;
  comments: number;

  /** Per-subreddit-normalized Momentum (see momentum.ts). */
  momentum: number;
  /** Currently flagged as trending/rising in its subreddit. */
  trending: boolean;
  /** Post has been removed. */
  removed: boolean;

  /** Stable seat slot within the cubicle (0..rosterMax-1). */
  seatIndex: number;
}

/** A point-in-time stats reading, used to derive velocity. */
export interface StatSample {
  t: number;
  score: number;
  comments: number;
}

/** A detected change that triggers a Worker Action. */
export interface WorkerEvent {
  type: WorkerEventType;
  workerId: string;
  subredditId: string;
  at: number;
}

/** Per-cubicle roster keyed by subreddit id. */
export type WorkersByCubicle = Record<string, Worker[]>;

/** What the DataSource pushes on every update. */
export interface OfficeSnapshot {
  workersByCubicle: WorkersByCubicle;
}

/** User configuration - sourcing + event toggles (ADR-0005), theme, and ambient life. */
export interface OfficePolicy {
  sourcing: SourcingRule;
  events: Record<WorkerEventType, boolean>;
  /** Visual theme of the office. */
  theme: OfficeTheme;
  /** Ambient office life: decorative NPCs + their animations. Furniture stays either way. */
  ambient: boolean;
  /**
   * Freeze the office (sprite motion + data pipeline) while a modal is open. Keeps
   * modal open/close animations smooth when the browser has no GPU acceleration,
   * at the cost of the background pausing. Off by default.
   */
  pauseOnModal: boolean;
}

/** A decorative amenity kind placed on the office floor (not a subreddit). */
export type AmenityKind = "meeting" | "pingpong" | "lounge" | "coffee";

/** A placed amenity: where it sits and how big it is, in world units. */
export interface AmenityPlacement {
  kind: AmenityKind;
  position: Vec2;
  size: { w: number; h: number };
}

/** Persisted office map: cubicles and amenities, interspersed on a grid. */
export interface Layout {
  version: number;
  seed: number;
  cubicles: Cubicle[];
  amenities: AmenityPlacement[];
}

/** Pan/zoom viewport state. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
