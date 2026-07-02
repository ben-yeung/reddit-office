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

/** User configuration - the two axes plus the whitelist (ADR-0005). */
export interface OfficePolicy {
  sourcing: SourcingRule;
  events: Record<WorkerEventType, boolean>;
}

/** Persisted office map: which subreddits are cubicles and where they sit. */
export interface Layout {
  version: number;
  seed: number;
  cubicles: Cubicle[];
}

/** Pan/zoom viewport state. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
