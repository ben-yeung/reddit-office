"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Worker as WorkerModel } from "@/lib/domain/types";
import { worldBounds } from "@/lib/data/layout";
import { officeExtent } from "@/lib/office/decor";
import { useElementSize } from "@/lib/util/useElementSize";
import type { OfficeRendererProps } from "@/lib/office/renderer";
import { Hud } from "@/components/ui/Hud";
import { useCamera } from "./useCamera";
import { CubicleGroup } from "./CubicleGroup";
import { Decor } from "./Decor";
import type { Migration } from "./Worker";
import styles from "./OfficeStage2D.module.css";

const CULL_MARGIN = 120;

/** Below this zoom a worker's idle bob is sub-pixel, so we cull the motion. */
const MOTION_MIN_ZOOM = 0.25;

/** Stable empty roster so an unpopulated cubicle keeps a constant `workers` ref
    (a fresh `[]` each render would defeat CubicleGroup's memo). */
const NO_WORKERS: WorkerModel[] = [];

/**
 * The 2D SVG office renderer (ADR-0007). Owns its own camera, pointer/zoom
 * handling, and fit-to-office framing - the shell (`OfficeApp`) just hands it the
 * shared `OfficeRendererProps`. Applies the camera transform, culls cubicles
 * outside the viewport, and renders each cubicle with its animated worker roster
 * plus the shared commons (Decor). The camera is a screen-space
 * `translate(x, y) scale(zoom)`, so world->screen is `screen = world*zoom + {x,y}`.
 */
export function OfficeStage2D({
  subredditsById,
  layout,
  workersByCubicle,
  pulses,
  ambient,
  paused,
  interactionLocked,
  arriving,
  migration,
  onSelectWorker,
}: OfficeRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(containerRef);
  const { camera, panBy, zoomAt, fitTo } = useCamera();

  // Fit the whole office (grid + commons) in view on first paint and on layout change.
  const fittedSeed = useRef<number | null>(null);
  useEffect(() => {
    if (viewport.width && viewport.height && fittedSeed.current !== layout.seed) {
      fitTo(officeExtent(layout), viewport);
      fittedSeed.current = layout.seed;
    }
  }, [viewport, layout, fitTo]);

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

  // `paused` freezes all background motion while a modal is open (pause-on-modal
  // policy), so the CPU never re-blurs the viewport behind the backdrop.
  const animate = camera.zoom >= MOTION_MIN_ZOOM && !paused;

  // Per-cubicle migration objects (old position + seq) for the current shuffle.
  // Memoized on `migration` so the reference stays stable between shuffles and
  // doesn't defeat CubicleGroup's memo.
  const migrationBySub = useMemo<Record<string, Migration> | null>(() => {
    if (!migration) return null;
    const m: Record<string, Migration> = {};
    for (const [id, fromPos] of Object.entries(migration.from)) {
      m[id] = { fromPos, seq: migration.seq };
    }
    return m;
  }, [migration]);

  // Cubicle-grid edge - departing workers walk the aisles out to this perimeter
  // and fade there. Stable per layout so it doesn't defeat the memos.
  const bounds = useMemo(() => worldBounds(layout, 0), [layout]);

  function isVisible(x: number, y: number, w: number, h: number): boolean {
    const sx0 = camera.x + x * camera.zoom;
    const sy0 = camera.y + y * camera.zoom;
    const sx1 = camera.x + (x + w) * camera.zoom;
    const sy1 = camera.y + (y + h) * camera.zoom;
    return (
      sx1 >= -CULL_MARGIN &&
      sx0 <= viewport.width + CULL_MARGIN &&
      sy1 >= -CULL_MARGIN &&
      sy0 <= viewport.height + CULL_MARGIN
    );
  }

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
      <svg
        width={viewport.width}
        height={viewport.height}
        role="img"
        aria-label="Office floor"
        style={{ display: "block" }}
      >
        <defs>
          {/* solid neutral floor with faint tile seams. patternTransform tracks the
              camera so the grid pans/zooms with the world -> an infinite floor. */}
          <pattern
            id="floorSeams"
            width={46}
            height={46}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            <rect width={46} height={46} fill="var(--floor-1)" />
            <path
              d="M46 0 V46 M0 46 H46"
              stroke="var(--floor-2)"
              strokeWidth={1}
              opacity={0.5}
              fill="none"
            />
          </pattern>
        </defs>

        {/* infinite floor: full-viewport background painted with the camera-synced grid */}
        <rect x={0} y={0} width={viewport.width} height={viewport.height} fill="url(#floorSeams)" />

        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {/* amenities (always) and ambient NPCs (gated by policy, and frozen
              while a modal is open so their motion loops stop). */}
          <Decor layout={layout} ambient={ambient && !paused} />

          {layout.cubicles.map((cubicle) => {
            if (
              !isVisible(cubicle.position.x, cubicle.position.y, cubicle.size.w, cubicle.size.h)
            ) {
              return null;
            }
            const subreddit = subredditsById[cubicle.subredditId];
            if (!subreddit) return null;
            const workers = workersByCubicle[cubicle.subredditId] ?? NO_WORKERS;

            return (
              <CubicleGroup
                key={cubicle.subredditId}
                cubicle={cubicle}
                subreddit={subreddit}
                workers={workers}
                pulses={pulses}
                bounds={bounds}
                animate={animate}
                enter={arriving}
                migration={migrationBySub?.[cubicle.subredditId] ?? null}
                onSelect={onSelectWorker}
              />
            );
          })}
        </g>
      </svg>

      <Hud
        onZoomIn={() => zoomAt(viewport.width / 2, viewport.height / 2, 1.25)}
        onZoomOut={() => zoomAt(viewport.width / 2, viewport.height / 2, 0.8)}
        onFit={() => fitTo(officeExtent(layout), viewport)}
      />

      <div className={styles.hint}>drag to pan · scroll to zoom · click a worker</div>
    </div>
  );
}
