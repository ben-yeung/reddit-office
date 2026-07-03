"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateLayout, LAYOUT_VERSION } from "@/lib/data/layout";
import {
  PollingOfficeDataSource,
  type OfficePayloadFetcher,
} from "@/lib/data/PollingOfficeDataSource";
import { DEFAULT_POLICY } from "@/lib/domain/constants";
import { MIGRATE_MAX_S, WALKOUT_MAX_S } from "@/lib/office/walkout";
import { loadPersisted, savePersisted } from "@/lib/persistence/localStore";
import type {
  Layout,
  OfficePolicy,
  Subreddit,
  Vec2,
  WorkerEventType,
  WorkersByCubicle,
} from "@/lib/domain/types";

const DEFAULT_SEED = 20240702;

/**
 * True when a persisted layout's cubicles cover exactly the current subreddit
 * set (one cubicle per subreddit, no stale or missing ids). A mismatch means the
 * curated list changed since the layout was saved, so it must be regenerated.
 */
export function layoutMatchesSubreddits(layout: Layout, subreddits: Subreddit[]): boolean {
  if (layout.cubicles.length !== subreddits.length) return false;
  const ids = new Set(subreddits.map((s) => s.id));
  return layout.cubicles.every((c) => ids.has(c.subredditId));
}

/** Keep only pulses from roughly the last N events (older ones have long since
    fired their one-shot animation) so the pulse map stays bounded. */
const PULSE_RETENTION = 256;

/** Once a worker drops off the roster it starts walking out; hold its id out of
    the view for at least a full walk (plus a beat) so a jittery re-selection
    can't snap the in-flight walker back to its seat and cancel the exit. */
const DEPART_COMMIT_MS = Math.ceil(WALKOUT_MAX_S * 1000) + 400;

/**
 * "Shuffle office layout" is an animated migration, not an instant swap. The
 * cubicles jump to their reshuffled cells while the (unchanged) roster stays put,
 * and every worker walks the aisles from its old desk to its new one. This is how
 * long to hold that migration: the longest walk plus a beat, during which roster
 * snapshots are parked so churn can't disrupt a walk in flight.
 */
const MIGRATE_WINDOW_MS = Math.ceil(MIGRATE_MAX_S * 1000) + 300;

/** When the office first loads there's a fetch delay, then the roster arrives all
    at once. Rather than popping in at the desks, that first batch walks in from the
    hallway edges (like a reverse walk-out). This window stays open just long enough
    for the batch to mount with the walk-in flagged; later churn fades in as usual. */
const ARRIVE_WINDOW_MS = 1500;

/** True if any cubicle has at least one worker (the office is populated). */
function anyWorkers(byCubicle: WorkersByCubicle): boolean {
  for (const list of Object.values(byCubicle)) if (list.length > 0) return true;
  return false;
}

/** A shuffle relayout in flight: the cubicle positions before the shuffle, keyed
    by subreddit, plus a monotonic seq that triggers each worker's migration walk
    exactly once. */
export interface LayoutMigration {
  seq: number;
  from: Record<string, Vec2>;
}

/**
 * Commit roster departures so an in-flight walk-out can't be interrupted.
 *
 * A worker leaves the roster in two ways: removed (then deleted) or simply
 * bumped out of the top-N by momentum. A bumped worker is still a live post, so
 * a later snapshot can re-select the same id - and re-adding a key that is still
 * exiting makes AnimatePresence cancel the walk and snap it back to the seat.
 * Under rapid churn that happens constantly, so departing workers never reach an
 * edge. Here we detect any id that was on screen and is now gone (it has begun
 * walking out), lock it for `lockMs`, and filter it from any snapshot that tries
 * to re-add it before the walk finishes. After the lock it may re-enter as a
 * fresh arrival. Mutates `departing` (id -> unlock time) and `prevShown`.
 */
export function commitDepartures(
  incoming: WorkersByCubicle,
  departing: Map<string, number>,
  prevShown: Set<string>,
  now: number,
  lockMs: number,
): WorkersByCubicle {
  for (const [id, until] of departing) if (now >= until) departing.delete(id);

  const incomingIds = new Set<string>();
  for (const list of Object.values(incoming)) for (const w of list) incomingIds.add(w.id);

  // Anything shown last time but absent now has started its walk-out: lock it.
  for (const id of prevShown) {
    if (!incomingIds.has(id)) departing.set(id, now + lockMs);
  }

  const filtered: WorkersByCubicle = {};
  const shown = new Set<string>();
  for (const [cubId, list] of Object.entries(incoming)) {
    const kept = list.filter((w) => !departing.has(w.id));
    filtered[cubId] = kept;
    for (const w of kept) shown.add(w.id);
  }

  prevShown.clear();
  for (const id of shown) prevShown.add(id);

  return filtered;
}

/** A transient, one-shot animation trigger for a worker (bumped per event). */
export interface Pulse {
  type: WorkerEventType;
  seq: number;
}

export interface OfficeApi {
  subreddits: Subreddit[];
  layout: Layout;
  workersByCubicle: WorkersByCubicle;
  pulses: Record<string, Pulse>;
  policy: OfficePolicy;
  setPolicy: (next: OfficePolicy) => void;
  resetLayout: () => void;
  /** True while the office first fills (initial data load): the roster walks in
      from the hallway edges to their cubicles rather than popping in at the desks. */
  arriving: boolean;
  /** Set for one shuffle relayout: the pre-shuffle cubicle positions, so each
      worker can walk from its old desk to its new one. Null when not migrating. */
  migration: LayoutMigration | null;
  /** A shuffle migration is animating. Used to disable the shuffle control until
      the walks finish. */
  shuffling: boolean;
}

/**
 * What office to run. The demo office and each authenticated user's office differ
 * only in these three inputs; everything downstream is identical. Treated as fixed
 * for the lifetime of the hook - the office is remounted (fresh key) when its
 * identity changes, so the values are stable per mount.
 */
export interface OfficeConfig {
  /** The subreddit set (drives the layout + first paint; source may enrich with icons). */
  subreddits: Subreddit[];
  /** Fetches the office payload each poll (demo endpoint vs authenticated endpoint). */
  fetchPayload: OfficePayloadFetcher;
  /** localStorage namespace so distinct offices don't clobber each other's layout/policy. */
  storageKey: string;
}

/**
 * Owns the office data lifecycle: resolves the persisted layout/policy, runs the
 * (mock) DataSource, and surfaces snapshots + per-worker event pulses to React.
 * The DataSource is created only on the client (timers, Date.now, localStorage).
 *
 * When a modal is open AND the `pauseOnModal` policy is on, this freezes what
 * reaches React: the newest snapshot is held and applied on resume, and transient
 * event pulses are dropped. The source keeps ticking underneath, so there's no
 * clock jump / surge burst on resume - the office simply catches up to its latest
 * state. This keeps the background perfectly still behind a modal's blurred
 * backdrop, so the modal's own animation stays smooth even without GPU compositing.
 * `pauseOnModal` is off by default, so normally data flows through uninterrupted.
 */
export function useOffice(modalOpen: boolean, config: OfficeConfig): OfficeApi {
  const { subreddits: initialSubs, fetchPayload, storageKey } = config;

  const [layout, setLayout] = useState<Layout>(() => generateLayout(initialSubs, DEFAULT_SEED));
  const [policy, setPolicyState] = useState<OfficePolicy>(DEFAULT_POLICY);
  // Starts as the given subreddit set (drives layout + first paint); the source
  // later emits the same subs enriched with community icons.
  const [subreddits, setSubreddits] = useState<Subreddit[]>(initialSubs);
  const [workersByCubicle, setWorkersByCubicle] = useState<WorkersByCubicle>({});
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});
  // `arriving` is true while the office first fills: that batch walks in from the
  // hallway edges (see the first-populate handling in startSource).
  const [arriving, setArriving] = useState(false);
  // Shuffle-migration state: `migration` carries the pre-shuffle cubicle positions
  // (bumped each shuffle) that drive every worker's old-desk -> new-desk walk;
  // `shuffling` gates the control while those walks play (see resetLayout).
  const [migration, setMigration] = useState<LayoutMigration | null>(null);
  const [shuffling, setShuffling] = useState(false);

  const sourceRef = useRef<PollingOfficeDataSource | null>(null);
  const seqRef = useRef(0);
  // Departure-commit bookkeeping (see commitDepartures): ids currently walking
  // out (id -> unlock time) and the ids shown in the last snapshot.
  const departingRef = useRef<Map<string, number>>(new Map());
  const prevShownRef = useRef<Set<string>>(new Set());
  // While paused (modal open) OR mid-migration, the newest snapshot is parked here
  // and flushed on resume / when the migration settles.
  const pausedRef = useRef(false);
  const pendingSnapshotRef = useRef<WorkersByCubicle | null>(null);
  // Armed when the source (re)starts; the first populated snapshot then opens the
  // walk-in window so the office fills from the hallways instead of popping in.
  const arriveArmedRef = useRef(false);
  const arriveTimerRef = useRef<number | null>(null);
  // Shuffle bookkeeping: a synchronous re-entry guard, the seq that triggers each
  // worker's migration walk, a flag that parks snapshots while the walks play, and
  // the settle timer (cleared on unmount).
  const shufflingRef = useRef(false);
  const migrationSeqRef = useRef(0);
  const migratingRef = useRef(false);
  const migrateTimerRef = useRef<number | null>(null);

  const startSource = useCallback(
    (l: Layout, p: OfficePolicy) => {
      sourceRef.current?.stop();
      setWorkersByCubicle({});
      setPulses({});
      departingRef.current.clear();
      prevShownRef.current.clear();
      pendingSnapshotRef.current = null;
      arriveArmedRef.current = true; // the first populated snapshot walks the roster in
      const src = new PollingOfficeDataSource(initialSubs, l, p, fetchPayload);
      sourceRef.current = src;
      src.start({
        onSnapshot: (s) => {
          // Paused (modal open) or mid-migration: park the raw snapshot; committed on
          // resume / when the migration settles. Freezing the roster during a shuffle
          // keeps each worker's old-desk -> new-desk walk from being disrupted by
          // churn (a worker vanishing mid-walk, or a new one popping in).
          if (pausedRef.current || migratingRef.current) {
            pendingSnapshotRef.current = s.workersByCubicle;
            return;
          }
          // First populated snapshot after the source started (initial load, once the
          // fetch resolves): open the walk-in window so this batch files in from the
          // hallways. Flag and workers are set together (auto-batched), so these
          // workers mount with `enter` true; the window then closes and later churn
          // fades in at the seats as before.
          if (arriveArmedRef.current && anyWorkers(s.workersByCubicle)) {
            arriveArmedRef.current = false;
            setArriving(true);
            arriveTimerRef.current = window.setTimeout(() => setArriving(false), ARRIVE_WINDOW_MS);
          }
          // Commit roster departures so an in-flight walk-out isn't cancelled by a
          // jittery re-selection (see commitDepartures).
          setWorkersByCubicle(
            commitDepartures(
              s.workersByCubicle,
              departingRef.current,
              prevShownRef.current,
              Date.now(),
              DEPART_COMMIT_MS,
            ),
          );
        },
        onSubreddits: (subs) => setSubreddits(subs),
        onEvent: (e) => {
          // Pulses are one-shot cosmetics; drop any that fire behind a modal.
          if (pausedRef.current) return;
          seqRef.current += 1;
          const seq = seqRef.current;
          // Pulses are transient, one-shot triggers keyed by worker. Retain only
          // recent entries so this map can't grow unbounded over a long session.
          setPulses((prev) => {
            const next: Record<string, Pulse> = {};
            for (const [id, p] of Object.entries(prev)) {
              if (id !== e.workerId && seq - p.seq < PULSE_RETENTION) next[id] = p;
            }
            next[e.workerId] = { type: e.type, seq };
            return next;
          });
        },
      });
    },
    [initialSubs, fetchPayload],
  );

  // Resolve persisted state and start the source once, on mount.
  useEffect(() => {
    const persisted = loadPersisted(storageKey);
    // Merge a persisted policy over the defaults so older saves gain new fields
    // (theme, ambient, any new event toggles).
    const persistedPolicy = persisted?.policy
      ? {
          ...DEFAULT_POLICY,
          ...persisted.policy,
          events: { ...DEFAULT_POLICY.events, ...persisted.policy.events },
        }
      : null;
    // Only reuse a persisted layout if it matches both the current layout scheme
    // *and* the current subreddit set. The latter matters because cubicles are
    // keyed by subreddit id: if the curated list changed, a stale layout is
    // missing cubicles for the new subs (and carries dead ones for removed subs),
    // so it must be regenerated. Checking the id set here makes that self-healing
    // - no manual version/storage-key bump needed on every subreddit change.
    const persistedLayout =
      persisted?.layout &&
      persisted.layout.version === LAYOUT_VERSION &&
      layoutMatchesSubreddits(persisted.layout, initialSubs)
        ? persisted.layout
        : null;
    const finalLayout = persistedLayout ?? layout;
    const finalPolicy = persistedPolicy ?? policy;
    // One-time hydration of React state from localStorage. This must happen in
    // an effect (not a lazy initializer) to keep SSR and the first client render
    // identical and avoid a hydration mismatch on cubicle positions.
    if (persistedLayout) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLayout(persistedLayout);
    }
    if (persistedPolicy) {
      setPolicyState(persistedPolicy);
    }
    savePersisted(storageKey, { layout: finalLayout, policy: finalPolicy });
    startSource(finalLayout, finalPolicy);
    return () => sourceRef.current?.stop();
    // Intentionally run once; startSource is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Freeze data delivery only when a modal is open and the policy opts in. Track
  // the flag for the source callbacks, and on resume apply whatever snapshot
  // arrived while paused so the office catches up in one step - committed through
  // commitDepartures so the departure bookkeeping stays consistent with the
  // live path.
  const paused = modalOpen && policy.pauseOnModal;
  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pendingSnapshotRef.current) {
      setWorkersByCubicle(
        commitDepartures(
          pendingSnapshotRef.current,
          departingRef.current,
          prevShownRef.current,
          Date.now(),
          DEPART_COMMIT_MS,
        ),
      );
      pendingSnapshotRef.current = null;
    }
  }, [paused]);

  const setPolicy = useCallback(
    (next: OfficePolicy) => {
      setPolicyState(next);
      sourceRef.current?.setPolicy(next);
      setLayout((currentLayout) => {
        savePersisted(storageKey, { layout: currentLayout, policy: next });
        return currentLayout;
      });
    },
    [storageKey],
  );

  // Shuffle as a migration. The old behaviour swapped the layout and rebuilt the
  // roster in one synchronous burst, so cubicles teleported and a fresh roster
  // faded in on top of a half-played walk-out - the "flash". Because the data
  // source is independent of cubicle positions, we instead keep the exact same
  // roster and only move the cubicles: each subreddit's cubicle jumps to its new
  // grid cell (showing the destination) while its workers - the same people - walk
  // the aisles from their old desks to the new ones. `migration` carries the old
  // positions, keyed by seq so each worker's walk fires exactly once; snapshots
  // are parked for the duration so churn can't disrupt a walk in flight.
  const resetLayout = useCallback(() => {
    if (shufflingRef.current) return; // ignore re-clicks mid-migration
    shufflingRef.current = true;
    setShuffling(true);
    migratingRef.current = true; // park roster snapshots until the walks settle

    // Snapshot the current cubicle positions - each worker's walk starts here.
    const from: Record<string, Vec2> = {};
    for (const c of layout.cubicles) from[c.subredditId] = c.position;

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const next = generateLayout(initialSubs, seed);

    // Bump the migration and swap the layout together: the cubicles jump to their
    // new cells and every worker begins walking old desk -> new desk. The roster
    // itself is untouched (same source, same workers).
    migrationSeqRef.current += 1;
    setMigration({ seq: migrationSeqRef.current, from });
    setLayout(next);
    setPolicyState((currentPolicy) => {
      savePersisted(storageKey, { layout: next, policy: currentPolicy });
      return currentPolicy;
    });

    // When the walks finish: stop parking snapshots, re-enable the control, flush
    // whatever roster update arrived during the walk, and clear the migration.
    migrateTimerRef.current = window.setTimeout(() => {
      migratingRef.current = false;
      shufflingRef.current = false;
      setShuffling(false);
      setMigration(null);
      if (pendingSnapshotRef.current) {
        setWorkersByCubicle(
          commitDepartures(
            pendingSnapshotRef.current,
            departingRef.current,
            prevShownRef.current,
            Date.now(),
            DEPART_COMMIT_MS,
          ),
        );
        pendingSnapshotRef.current = null;
      }
    }, MIGRATE_WINDOW_MS);
  }, [layout, storageKey, initialSubs]);

  // Clear pending shuffle/arrival timers on unmount so they can't fire against a
  // torn-down tree.
  useEffect(
    () => () => {
      if (migrateTimerRef.current != null) clearTimeout(migrateTimerRef.current);
      if (arriveTimerRef.current != null) clearTimeout(arriveTimerRef.current);
    },
    [],
  );

  return {
    subreddits,
    layout,
    workersByCubicle,
    pulses,
    policy,
    setPolicy,
    resetLayout,
    arriving,
    migration,
    shuffling,
  };
}
