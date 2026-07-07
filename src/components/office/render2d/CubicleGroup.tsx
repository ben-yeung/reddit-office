import { memo } from "react";
import { AnimatePresence } from "framer-motion";
import type { Cubicle as CubicleModel, Subreddit, Worker as WorkerModel } from "@/lib/domain/types";
import type { Pulse } from "@/lib/office/useOffice";
import { ROSTER_MAX } from "@/lib/domain/constants";
import { seatPosition, type Bounds } from "@/lib/data/layout";
import { appearanceFor } from "@/lib/worker/appearance";
import { Cubicle } from "./Cubicle";
import { Worker, SeatDesk, type Migration } from "./Worker";

interface Props {
  cubicle: CubicleModel;
  subreddit: Subreddit;
  workers: WorkerModel[];
  pulses: Record<string, Pulse>;
  /** Cubicle-grid perimeter a departing worker walks out to before fading. */
  bounds: Bounds;
  animate: boolean;
  /** True while the office first fills: these workers walk in from the hallways. */
  enter: boolean;
  /** Set for one shuffle relayout: this cubicle's old position (+ seq), so its
      workers walk from their old desks to the new ones. Null when not migrating. */
  migration: Migration | null;
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
  enter,
  migration,
  onSelect,
}: Props) {
  // Fixed desks: one per seat slot, independent of who (if anyone) sits there, so
  // people walk between desks instead of the desk teleporting on a rank reshuffle.
  // Props are seat-fixed (stable per seat); an unoccupied seat shows an empty desk.
  const desks = Array.from({ length: ROSTER_MAX }, (_, i) => {
    const seatWorld = seatPosition(cubicle, i);
    return {
      i,
      seat: { x: seatWorld.x - cubicle.position.x, y: seatWorld.y - cubicle.position.y },
      appearance: appearanceFor(`${subreddit.id}#seat${i}`),
    };
  });

  // Precompute each worker's local seat + appearance once.
  const placed = workers.map((worker) => {
    const seatWorld = seatPosition(cubicle, worker.seatIndex);
    return {
      worker,
      seat: {
        x: seatWorld.x - cubicle.position.x,
        y: seatWorld.y - cubicle.position.y,
      },
      appearance: appearanceFor(worker.id),
    };
  });

  return (
    // The cubicle (walls, header, desks) is placed by a static transform: on a
    // shuffle it jumps straight to its new grid cell to "show the destination",
    // and each worker walks the aisles over to it (see Worker's migration).
    <g transform={`translate(${cubicle.position.x} ${cubicle.position.y})`}>
      <Cubicle cubicle={cubicle} subreddit={subreddit} workerCount={workers.length} />

      {/* Fixed desk furniture, drawn behind every body so a seated worker sits in
          front of the desk (in the chair). Furniture stays put; only people move. */}
      {desks.map(({ i, seat, appearance }) => (
        <SeatDesk key={i} seat={seat} appearance={appearance} color={subreddit.color} />
      ))}

      {/* Worker bodies, drawn in front of all desks; they walk between seats. */}
      <AnimatePresence>
        {placed.map(({ worker, seat, appearance }) => (
          <Worker
            key={worker.id}
            worker={worker}
            seat={seat}
            cubicle={cubicle}
            bounds={bounds}
            appearance={appearance}
            color={subreddit.color}
            pulse={pulses[worker.id]}
            animate={animate}
            enter={enter}
            migration={migration}
            onSelect={onSelect}
          />
        ))}
      </AnimatePresence>
    </g>
  );
}

export const CubicleGroup = memo(CubicleGroupInner);
