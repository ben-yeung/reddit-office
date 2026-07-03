"use client";

import { useMemo } from "react";
import type {
  Camera,
  Layout,
  Subreddit,
  Worker as WorkerModel,
  WorkersByCubicle,
} from "@/lib/domain/types";
import { officeExtent } from "@/lib/office/decor";
import { CubicleGroup } from "./CubicleGroup";
import { Decor } from "./Decor";
import type { Pulse } from "@/lib/office/useOffice";

interface Props {
  subredditsById: Record<string, Subreddit>;
  layout: Layout;
  workersByCubicle: WorkersByCubicle;
  pulses: Record<string, Pulse>;
  camera: Camera;
  viewport: { width: number; height: number };
  ambient: boolean;
  onSelectWorker: (worker: WorkerModel) => void;
}

const CULL_MARGIN = 120;

/** Below this zoom a worker's idle bob is sub-pixel, so we cull the motion. */
const MOTION_MIN_ZOOM = 0.25;

/** Stable empty roster so an unpopulated cubicle keeps a constant `workers` ref
    (a fresh `[]` each render would defeat CubicleGroup's memo). */
const NO_WORKERS: WorkerModel[] = [];

/**
 * Presentational SVG office world. Applies the camera transform, culls cubicles
 * outside the viewport (ADR-0007), and renders each cubicle with its animated
 * worker roster plus the shared commons (Decor). Pointer/zoom handling lives in
 * OfficeApp.
 */
export function OfficeStage({
  subredditsById,
  layout,
  workersByCubicle,
  pulses,
  camera,
  viewport,
  ambient,
  onSelectWorker,
}: Props) {
  const animate = camera.zoom >= MOTION_MIN_ZOOM;

  // Full office extent - departing workers walk out to a random point on this
  // perimeter before fading. Stable per layout so it doesn't defeat the memos.
  const bounds = useMemo(() => officeExtent(layout), [layout]);

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
        {/* amenities (always) and ambient NPCs (gated) */}
        <Decor layout={layout} ambient={ambient} />

        {layout.cubicles.map((cubicle) => {
          if (!isVisible(cubicle.position.x, cubicle.position.y, cubicle.size.w, cubicle.size.h)) {
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
              onSelect={onSelectWorker}
            />
          );
        })}
      </g>
    </svg>
  );
}
