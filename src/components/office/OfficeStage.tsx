"use client";

import { AnimatePresence } from "framer-motion";
import type {
  Camera,
  Layout,
  Subreddit,
  Worker as WorkerModel,
  WorkersByCubicle,
} from "@/lib/domain/types";
import { seatPosition, worldBounds } from "@/lib/data/layout";
import { Cubicle } from "./Cubicle";
import { Worker } from "./Worker";
import type { Pulse } from "@/lib/office/useOffice";

interface Props {
  subredditsById: Record<string, Subreddit>;
  layout: Layout;
  workersByCubicle: WorkersByCubicle;
  pulses: Record<string, Pulse>;
  camera: Camera;
  viewport: { width: number; height: number };
  onSelectWorker: (worker: WorkerModel) => void;
}

const CULL_MARGIN = 120;

/**
 * Presentational SVG office world. Applies the camera transform, culls cubicles
 * outside the viewport (ADR-0007), and renders each cubicle with its animated
 * worker roster. Pointer/zoom handling lives in OfficeApp.
 */
export function OfficeStage({
  subredditsById,
  layout,
  workersByCubicle,
  pulses,
  camera,
  viewport,
  onSelectWorker,
}: Props) {
  const bounds = worldBounds(layout);

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
        <pattern id="floorTiles" width={48} height={48} patternUnits="userSpaceOnUse">
          <rect width={48} height={48} fill="var(--floor-b)" />
          <rect width={24} height={24} fill="var(--floor-a)" />
          <rect x={24} y={24} width={24} height={24} fill="var(--floor-a)" />
        </pattern>
      </defs>

      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
        {/* office floor */}
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.width}
          height={bounds.height}
          fill="url(#floorTiles)"
          opacity={0.5}
        />

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
