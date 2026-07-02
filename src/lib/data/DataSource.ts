import type {
  Layout,
  OfficePolicy,
  OfficeSnapshot,
  Subreddit,
  WorkerEvent,
} from "@/lib/domain/types";

export interface DataSourceHandlers {
  /** Full roster state for every cubicle; emitted on every tick. */
  onSnapshot: (snapshot: OfficeSnapshot) => void;
  /** A discrete event to animate (new-post, trending, surge, removed). */
  onEvent: (event: WorkerEvent) => void;
}

/**
 * The seam between the office UI and its data.
 *
 * `MockDataSource` implements this now; a `RedditDataSource` backed by the
 * two-speed polling of ADR-0002 implements the exact same contract in
 * iteration 2, with no UI changes.
 */
export interface DataSource {
  listSubreddits(): Subreddit[];
  getLayout(): Layout;
  /** Update the active Office Policy (sourcing rule + event toggles). */
  setPolicy(policy: OfficePolicy): void;
  /** Begin emitting snapshots + events. Emits an initial snapshot synchronously. */
  start(handlers: DataSourceHandlers): void;
  /** Stop all timers/subscriptions. */
  stop(): void;
}
