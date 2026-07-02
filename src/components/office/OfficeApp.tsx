"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useOffice } from "@/lib/office/useOffice";
import { useCamera } from "@/lib/camera/useCamera";
import { useElementSize } from "@/lib/util/useElementSize";
import { worldBounds } from "@/lib/data/layout";
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

  const subredditsById = useMemo(
    () => Object.fromEntries(office.subreddits.map((s) => [s.id, s] as const)),
    [office.subreddits],
  );

  // Fit the whole office in view on first paint and whenever the layout changes.
  const fittedSeed = useRef<number | null>(null);
  useEffect(() => {
    if (size.width && size.height && fittedSeed.current !== office.layout.seed) {
      fitTo(worldBounds(office.layout), size);
      fittedSeed.current = office.layout.seed;
    }
  }, [size, office.layout, fitTo]);

  // Non-passive wheel listener so we can zoom-to-cursor without page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const drag = useRef({ active: false, x: 0, y: 0 });

  return (
    <div
      ref={containerRef}
      className={styles.stage}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { active: true, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!drag.current.active) return;
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
        onSelectWorker={(w) => setSelected({ worker: w, at: Date.now() })}
      />

      <AuthControl />

      <div className={styles.brand}>
        <span className={`pixel-font ${styles.brandName}`}>REDDIT OFFICE</span>
        <span className={styles.brandSub}>demo · top subreddits</span>
      </div>

      <div className={styles.hint}>drag to pan · scroll to zoom · click a worker</div>

      <PolicyPanel policy={office.policy} onChange={office.setPolicy} onReset={office.resetLayout} />

      <Hud
        onZoomIn={() => zoomAt(size.width / 2, size.height / 2, 1.25)}
        onZoomOut={() => zoomAt(size.width / 2, size.height / 2, 0.8)}
        onFit={() => fitTo(worldBounds(office.layout), size)}
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
