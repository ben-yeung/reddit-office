import { memo } from "react";
import { AnimatePresence } from "framer-motion";
import type {
  Cubicle as CubicleModel,
  Subreddit,
  Worker as WorkerModel,
} from "@/lib/domain/types";
import type { Pulse } from "@/lib/office/useOffice";
import { seatPosition, type Bounds } from "@/lib/data/layout";
import { Cubicle } from "./Cubicle";
import { Worker } from "./Worker";

interface Props {
  cubicle: CubicleModel;
  subreddit: Subreddit;
  workers: WorkerModel[];
  pulses: Record<string, Pulse>;
  /** Cubicle-grid perimeter a departing worker walks out to before fading. */
  bounds: Bounds;
  animate: boolean;
  onSelect: (worker: WorkerModel) => void;
}

/**
 * One subreddit's cubicle plus its animated worker roster, placed in world space.
 *
 * Memoized: a camera pan/zoom re-renders OfficeStage (to update the parent <g>
 * transform) but every prop here stays referentially stable between data
 * snapshots, so React skips this whole subtree - including the expensive worker
 * sprites and their AnimatePresence. Without the memo, a drag reconciles all ~70
 * worker trees on every frame. Props change (and this re-renders) only on a data
 * snapshot, an event pulse, or crossing the motion-cull zoom threshold.
 */
function CubicleGroupInner({
  cubicle,
  subreddit,
  workers,
  pulses,
  bounds,
  animate,
  onSelect,
}: Props) {
  return (
    <g transform={`translate(${cubicle.position.x} ${cubicle.position.y})`}>
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
              cubicle={cubicle}
              bounds={bounds}
              color={subreddit.color}
              pulse={pulses[worker.id]}
              animate={animate}
              onSelect={onSelect}
            />
          );
        })}
      </AnimatePresence>
    </g>
  );
}

export const CubicleGroup = memo(CubicleGroupInner);
