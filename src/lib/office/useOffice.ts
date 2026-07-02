"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CURATED_SUBREDDITS } from "@/lib/data/curatedSubreddits";
import { generateLayout, LAYOUT_VERSION } from "@/lib/data/layout";
import { RedditDemoDataSource } from "@/lib/data/RedditDemoDataSource";
import { DEFAULT_POLICY } from "@/lib/domain/constants";
import {
  loadPersisted,
  savePersisted,
  clearPersisted,
} from "@/lib/persistence/localStore";
import type {
  Layout,
  OfficePolicy,
  Subreddit,
  WorkerEventType,
  WorkersByCubicle,
} from "@/lib/domain/types";

const DEFAULT_SEED = 20240702;

/** Keep only pulses from roughly the last N events (older ones have long since
    fired their one-shot animation) so the pulse map stays bounded. */
const PULSE_RETENTION = 256;

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
 */
export function useOffice(): OfficeApi {
  const [layout, setLayout] = useState<Layout>(() =>
    generateLayout(CURATED_SUBREDDITS, DEFAULT_SEED),
  );
  const [policy, setPolicyState] = useState<OfficePolicy>(DEFAULT_POLICY);
  const [workersByCubicle, setWorkersByCubicle] = useState<WorkersByCubicle>({});
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});

  const sourceRef = useRef<RedditDemoDataSource | null>(null);
  const seqRef = useRef(0);

  const startSource = useCallback((l: Layout, p: OfficePolicy) => {
    sourceRef.current?.stop();
    setWorkersByCubicle({});
    setPulses({});
    const src = new RedditDemoDataSource(CURATED_SUBREDDITS, l, p);
    sourceRef.current = src;
    src.start({
      onSnapshot: (s) => setWorkersByCubicle(s.workersByCubicle),
      onEvent: (e) => {
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
    // Only reuse a persisted layout if it matches the current layout scheme.
    const persistedLayout =
      persisted?.layout && persisted.layout.version === LAYOUT_VERSION ? persisted.layout : null;
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

  const setPolicy = useCallback(
    (next: OfficePolicy) => {
      setPolicyState(next);
      sourceRef.current?.setPolicy(next);
      setLayout((currentLayout) => {
        savePersisted({ layout: currentLayout, policy: next });
        return currentLayout;
      });
    },
    [],
  );

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
    subreddits: CURATED_SUBREDDITS,
    layout,
    workersByCubicle,
    pulses,
    policy,
    setPolicy,
    resetLayout,
  };
}
