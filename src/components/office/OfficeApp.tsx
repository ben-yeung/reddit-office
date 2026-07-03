"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useOffice } from "@/lib/office/useOffice";
import { useCamera } from "@/lib/camera/useCamera";
import { useElementSize } from "@/lib/util/useElementSize";
import { officeExtent } from "@/lib/office/decor";
import type { Worker } from "@/lib/domain/types";
import { OfficeStage } from "./OfficeStage";
import { WorkerModal } from "./WorkerModal";
import { Hud } from "@/components/ui/Hud";
import { PolicyPanel } from "@/components/ui/PolicyPanel";
import { AuthControl } from "@/components/auth/AuthControl";
import styles from "./OfficeApp.module.css";

interface Selection {
  worker: Worker;
  at: number;
}

/**
 * Office root: composes the data hook, the camera, pointer/zoom handling, and
 * the overlays. Presentational SVG lives in OfficeStage; this owns interaction.
 */
export function OfficeApp() {
  const office = useOffice();
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  const { camera, panBy, zoomAt, fitTo } = useCamera();
  const [selected, setSelected] = useState<Selection | null>(null);
  // While a modal is open, freeze office pan/zoom. The modal is portaled to
  // <body>, but React re-dispatches its events through the React tree to the
  // stage handlers below, so a text-selection drag would otherwise pan the office.
  const interactionLocked = selected !== null;

  const subredditsById = useMemo(
    () => Object.fromEntries(office.subreddits.map((s) => [s.id, s] as const)),
    [office.subreddits],
  );

  // Apply the office theme to <html> so the CSS variables switch.
  useEffect(() => {
    document.documentElement.dataset.theme = office.policy.theme;
  }, [office.policy.theme]);

  // Fit the whole office (grid + commons) in view on first paint and on layout change.
  const fittedSeed = useRef<number | null>(null);
  useEffect(() => {
    if (size.width && size.height && fittedSeed.current !== office.layout.seed) {
      fitTo(officeExtent(office.layout), size);
      fittedSeed.current = office.layout.seed;
    }
  }, [size, office.layout, fitTo]);

  // Non-passive wheel listener so we can zoom-to-cursor without page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (interactionLocked) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, interactionLocked]);

  const drag = useRef({ active: false, x: 0, y: 0 });

  return (
    <div
      ref={containerRef}
      className={styles.stage}
      onPointerDown={(e) => {
        if (interactionLocked || e.button !== 0) return;
        drag.current = { active: true, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (interactionLocked || !drag.current.active) return;
        panBy(e.clientX - drag.current.x, e.clientY - drag.current.y);
        drag.current.x = e.clientX;
        drag.current.y = e.clientY;
      }}
      onPointerUp={() => {
        drag.current.active = false;
      }}
      onPointerLeave={() => {
        drag.current.active = false;
      }}
    >
      <OfficeStage
        subredditsById={subredditsById}
        layout={office.layout}
        workersByCubicle={office.workersByCubicle}
        pulses={office.pulses}
        camera={camera}
        viewport={size}
        ambient={office.policy.ambient}
        onSelectWorker={(w) => setSelected({ worker: w, at: Date.now() })}
      />

      <div className={styles.topRight}>
        <div className={styles.brand}>
          <span className={`pixel-font ${styles.brandName}`}>REDDIT OFFICE</span>
          <span className={styles.brandSub}>demo · top subreddits</span>
        </div>
        <AuthControl />
      </div>

      <div className={styles.hint}>drag to pan · scroll to zoom · click a worker</div>

      <PolicyPanel policy={office.policy} onChange={office.setPolicy} onReset={office.resetLayout} />

      <Hud
        onZoomIn={() => zoomAt(size.width / 2, size.height / 2, 1.25)}
        onZoomOut={() => zoomAt(size.width / 2, size.height / 2, 0.8)}
        onFit={() => fitTo(officeExtent(office.layout), size)}
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
