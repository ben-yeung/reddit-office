"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { generateLayout, LAYOUT_VERSION } from "@/lib/data/layout";
import { RedditDemoDataSource } from "@/lib/data/RedditDemoDataSource";
import { DEFAULT_POLICY } from "@/lib/domain/constants";
import { WALKOUT_MAX_S } from "@/lib/office/walkout";
import { loadPersisted, savePersisted, clearPersisted } from "@/lib/persistence/localStore";
import type {
  Layout,
  OfficePolicy,
  Subreddit,
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
export function useOffice(modalOpen: boolean): OfficeApi {
  const [layout, setLayout] = useState<Layout>(() =>
    generateLayout(CURATED_SUBREDDITS, DEFAULT_SEED),
  );
  const [policy, setPolicyState] = useState<OfficePolicy>(DEFAULT_POLICY);
  // Starts as the static curated list (drives layout + first paint); the demo
  // source later emits the same subs enriched with community icons.
  const [subreddits, setSubreddits] = useState<Subreddit[]>(CURATED_SUBREDDITS);
  const [workersByCubicle, setWorkersByCubicle] = useState<WorkersByCubicle>({});
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});

  const sourceRef = useRef<RedditDemoDataSource | null>(null);
  const seqRef = useRef(0);
  // Departure-commit bookkeeping (see commitDepartures): ids currently walking
  // out (id -> unlock time) and the ids shown in the last snapshot.
  const departingRef = useRef<Map<string, number>>(new Map());
  const prevShownRef = useRef<Set<string>>(new Set());
  // While paused (modal open), the newest snapshot is parked here and flushed on resume.
  const pausedRef = useRef(false);
  const pendingSnapshotRef = useRef<WorkersByCubicle | null>(null);

  const startSource = useCallback((l: Layout, p: OfficePolicy) => {
    sourceRef.current?.stop();
    setWorkersByCubicle({});
    setPulses({});
    departingRef.current.clear();
    prevShownRef.current.clear();
    pendingSnapshotRef.current = null;
    const src = new RedditDemoDataSource(CURATED_SUBREDDITS, l, p);
    sourceRef.current = src;
    src.start({
      onSnapshot: (s) => {
        // Paused (modal open): park the raw snapshot; committed on resume.
        if (pausedRef.current) {
          pendingSnapshotRef.current = s.workersByCubicle;
          return;
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
  }, []);

  // Resolve persisted state and start the source once, on mount.
  useEffect(() => {
    const persisted = loadPersisted();
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
      layoutMatchesSubreddits(persisted.layout, CURATED_SUBREDDITS)
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
    savePersisted({ layout: finalLayout, policy: finalPolicy });
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

  const setPolicy = useCallback((next: OfficePolicy) => {
    setPolicyState(next);
    sourceRef.current?.setPolicy(next);
    setLayout((currentLayout) => {
      savePersisted({ layout: currentLayout, policy: next });
      return currentLayout;
    });
  }, []);

  const resetLayout = useCallback(() => {
    clearPersisted();
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const next = generateLayout(CURATED_SUBREDDITS, seed);
    setLayout(next);
    setPolicyState((currentPolicy) => {
      savePersisted({ layout: next, policy: currentPolicy });
      startSource(next, currentPolicy);
      return currentPolicy;
    });
  }, [startSource]);

  return {
    subreddits,
    layout,
    workersByCubicle,
    pulses,
    policy,
    setPolicy,
    resetLayout,
  };
}
