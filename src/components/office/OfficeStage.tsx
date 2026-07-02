"use client";

import { AnimatePresence } from "framer-motion";
import type {
  Camera,
  Layout,
  Subreddit,
  Worker as WorkerModel,
  WorkersByCubicle,
} from "@/lib/domain/types";
import { seatPosition } from "@/lib/data/layout";
import { officeExtent } from "@/lib/office/decor";
import { Cubicle } from "./Cubicle";
import { Worker } from "./Worker";
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
  const extent = officeExtent(layout);

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
        {/* solid neutral floor with faint tile seams (no checkerboard) */}
        <pattern id="floorSeams" width={46} height={46} patternUnits="userSpaceOnUse">
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

      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
        {/* office floor */}
        <rect
          x={extent.minX}
          y={extent.minY}
          width={extent.width}
          height={extent.height}
          fill="url(#floorSeams)"
        />

        {/* amenities + plants (always) and ambient NPCs (gated) */}
        <Decor layout={layout} ambient={ambient} />

        {layout.cubicles.map((cubicle) => {
          if (!isVisible(cubicle.position.x, cubicle.position.y, cubicle.size.w, cubicle.size.h)) {
            return null;
          }
          const subreddit = subredditsById[cubicle.subredditId];
          if (!subreddit) return null;
          const workers = workersByCubicle[cubicle.subredditId] ?? [];

          return (
            <g
              key={cubicle.subredditId}
              transform={`translate(${cubicle.position.x} ${cubicle.position.y})`}
            >
              <Cubicle cubicle={cubicle} subreddit={subreddit} workerCount={workers.length} />
              <AnimatePresence>
                {workers.map((worker) => {
                  const seatWorld = seatPosition(cubicle, worker.seatIndex);
                  const seat = {
                    x: seatWorld.x - cubicle.position.x,
                    y: seatWorld.y - cubicle.position.y,
                  };
                  return (
                    <Worker
                      key={worker.id}
                      worker={worker}
                      seat={seat}
                      color={subreddit.color}
                      pulse={pulses[worker.id]}
                      onSelect={onSelectWorker}
                    />
                  );
                })}
              </AnimatePresence>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
