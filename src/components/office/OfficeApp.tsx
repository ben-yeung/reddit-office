"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useOffice } from "@/lib/office/useOffice";
import type { Subreddit, Worker } from "@/lib/domain/types";
import type { OfficePayloadFetcher } from "@/lib/data/PollingOfficeDataSource";
import type { OfficeRendererProps } from "@/lib/office/renderer";
import { OfficeStage2D } from "./render2d/OfficeStage2D";
import { OfficeStage3D } from "./render3d/OfficeStage3D";
import { WorkerModal } from "./overlays/WorkerModal";
import { useBackgroundMotionPaused } from "./overlays/BackgroundMotion";
import { PolicyPanel } from "@/components/ui/PolicyPanel";
import { AuthControl } from "@/components/auth/AuthControl";
import styles from "./OfficeApp.module.css";

interface Selection {
  worker: Worker;
  at: number;
}

export interface OfficeAppProps {
  /** The subreddit set this office renders (demo curated list, or the user's picks). */
  subreddits: Subreddit[];
  /** Fetches the office payload each poll. Must be stable across renders. */
  fetchPayload: OfficePayloadFetcher;
  /** localStorage namespace for this office's layout/policy. */
  storageKey: string;
  /** Brand subtitle under the REDDIT OFFICE wordmark, e.g. "demo · top subreddits". */
  brandSub: string;
  /**
   * When provided (authenticated mode), the Office Policy panel offers a
   * "Reselect subreddits" action that reopens the onboarding picker.
   */
  onEditSubreddits?: () => void;
}

/**
 * Office shell: runs the shared data engine (`useOffice`), holds the selected
 * worker, applies the theme, and mounts exactly one renderer - the 2D SVG
 * `OfficeStage2D` or the experimental 3D voxel `OfficeStage3D`, chosen by the
 * `renderer` policy and swapped live when it changes. Each renderer owns its own
 * camera + interaction; this shell only supplies the shared `OfficeRendererProps`
 * and renders the renderer-agnostic overlays (brand, auth, policy, post modal).
 */
export function OfficeApp({
  subreddits,
  fetchPayload,
  storageKey,
  brandSub,
  onEditSubreddits,
}: OfficeAppProps) {
  // With the `pauseOnModal` policy on, an open modal freezes the office - both
  // the sprite motion and the data pipeline (useOffice) - so no motion churns the
  // background behind the modal's blurred backdrop. Off by default.
  const modalOpen = useBackgroundMotionPaused();
  const officeConfig = useMemo(
    () => ({ subreddits, fetchPayload, storageKey }),
    [subreddits, fetchPayload, storageKey],
  );
  const office = useOffice(modalOpen, officeConfig);
  const freezeBackground = modalOpen && office.policy.pauseOnModal;
  const [selected, setSelected] = useState<Selection | null>(null);
  // While a modal is open, freeze renderer interaction (pan/zoom). The modal is
  // portaled to <body>, but React re-dispatches its events through the React tree
  // to the stage handlers, so a text-selection drag would otherwise pan the office.
  const interactionLocked = selected !== null;

  const subredditsById = useMemo(
    () => Object.fromEntries(office.subreddits.map((s) => [s.id, s] as const)),
    [office.subreddits],
  );

  // Stable identity so it doesn't defeat the renderer's memoized children.
  const onSelectWorker = useCallback((w: Worker) => {
    setSelected({ worker: w, at: Date.now() });
  }, []);

  // Apply the office theme to <html> so the CSS variables switch.
  useEffect(() => {
    document.documentElement.dataset.theme = office.policy.theme;
  }, [office.policy.theme]);

  const rendererProps: OfficeRendererProps = {
    subredditsById,
    layout: office.layout,
    workersByCubicle: office.workersByCubicle,
    pulses: office.pulses,
    ambient: office.policy.ambient,
    theme: office.policy.theme,
    paused: freezeBackground,
    interactionLocked,
    arriving: office.arriving,
    migration: office.migration,
    onSelectWorker,
  };

  return (
    <div className={styles.root}>
      {office.policy.renderer === "3d" ? (
        <OfficeStage3D {...rendererProps} />
      ) : (
        <OfficeStage2D {...rendererProps} />
      )}

      <div className={styles.topRight}>
        <div className={styles.brand}>
          <span className={`pixel-font ${styles.brandName}`}>REDDIT OFFICE</span>
          <span className={styles.brandSub}>{brandSub}</span>
        </div>
        <AuthControl />
      </div>

      <PolicyPanel
        policy={office.policy}
        onChange={office.setPolicy}
        onReset={office.resetLayout}
        shuffling={office.shuffling}
        onEditSubreddits={onEditSubreddits}
      />

      <AnimatePresence>
        {selected && subredditsById[selected.worker.subredditId] && (
          <WorkerModal
            key={selected.worker.id}
            worker={selected.worker}
            subreddit={subredditsById[selected.worker.subredditId]}
            now={selected.at}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
