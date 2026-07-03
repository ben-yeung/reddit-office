"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { Cubicle as CubicleModel, Vec2, Worker as WorkerModel } from "@/lib/domain/types";
import type { Bounds } from "@/lib/data/layout";
import type { WorkerAppearance } from "@/lib/worker/appearance";
import type { Pulse } from "@/lib/office/useOffice";
import { walkOut } from "@/lib/office/walkout";
import { WorkerDesk, WorkerBody } from "./WorkerSprite";
import styles from "./Worker.module.css";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function formatScore(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * The desk fixture for one seat. Rendered in a layer behind all worker bodies
 * (see CubicleGroup), so a newly-seated worker's body is never occluded by this
 * desk or by a departing neighbour's. Keyed by post id: on a swap the incoming
 * occupant's desk fades in over the outgoing one at the same seat, and the desk
 * never translates - it stays in the cubicle when its occupant walks out.
 */
export function WorkerDeskSlot({
  seat,
  appearance,
  color,
  worker,
  onSelect,
}: {
  seat: Vec2;
  appearance: WorkerAppearance;
  color: string;
  worker: WorkerModel;
  onSelect: (worker: WorkerModel) => void;
}) {
  return (
    <motion.g
      style={{ cursor: "pointer" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Hold through the occupant's walk-out, then fade (masked on a swap by the
      // replacement's desk already sitting at the same seat).
      exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.7 } }}
      transition={{ duration: 0.4 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onSelect(worker)}
    >
      <g transform={`translate(${seat.x} ${seat.y})`}>
        <WorkerDesk appearance={appearance} shirtColor={color} />
      </g>
    </motion.g>
  );
}

interface Props {
  worker: WorkerModel;
  seat: Vec2; // cubicle-local seat center
  cubicle: CubicleModel;
  /** Cubicle-grid perimeter a departing worker walks out to before fading. */
  bounds: Bounds;
  appearance: WorkerAppearance;
  color: string;
  pulse?: Pulse;
  /** Whether idle motion runs. Gated off when zoomed too far out to perceive it. */
  animate: boolean;
  onSelect: (worker: WorkerModel) => void;
}

/**
 * The person half of a post-as-worker: fades in on the seat (sitting down at the
 * desk fixture behind it) and, on replacement, walks the aisles out to the grid
 * edge before fading. This layer also adds behavior - trending glow, momentum-
 * driven bob speed, and one-shot Actions (surge pop, trending wobble) from event
 * pulses. The desk is a separate layer (WorkerDeskSlot) and stays put.
 */
export function Worker({
  worker,
  seat,
  cubicle,
  bounds,
  appearance,
  color,
  pulse,
  animate,
  onSelect,
}: Props) {
  const sprite = useAnimationControls();
  const fx = useAnimationControls();

  // On removal/replacement the body gets up, steps out through the cubicle's open
  // bottom, and strolls the aisles to the grid edge before fading. Deterministic
  // per id so it's stable across the exit's re-renders. When motion is culled
  // (zoomed out) it just fades in place.
  const exit = useMemo(() => {
    if (!animate) return { opacity: 0, transition: { duration: 0.3 } };
    const walk = walkOut(worker.id, seat, cubicle, bounds);
    return {
      opacity: walk.opacity,
      x: walk.x,
      y: walk.y,
      transition: { duration: walk.duration, times: walk.times, ease: "easeInOut" as const },
    };
  }, [animate, worker.id, seat, cubicle, bounds]);

  useEffect(() => {
    if (!pulse) return;
    if (pulse.type === "surge") {
      sprite.start({ scale: [1, 1.5, 1], transition: { duration: 0.5, ease: "easeOut" } });
      fx.start({
        opacity: [0, 1, 0],
        y: [-6, -22, -30],
        transition: { duration: 0.7, ease: "easeOut" },
      });
    } else if (pulse.type === "trending") {
      sprite.start({ rotate: [0, -9, 9, 0], transition: { duration: 0.5 } });
    } else if (pulse.type === "new-post") {
      sprite.start({ scale: [0.6, 1.15, 1], transition: { duration: 0.45 } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.seq]);

  // Higher momentum -> faster idle bob (the worker is "busier").
  const bobDuration = clamp(1.5 - worker.momentum * 0.14, 0.4, 1.5);

  return (
    <motion.g
      style={{ cursor: "pointer" }}
      initial={{ opacity: 0, x: seat.x, y: seat.y }}
      animate={{ opacity: 1, x: seat.x, y: seat.y }}
      exit={exit}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onSelect(worker)}
    >
      {/* Idle bob: CSS-driven (compositor) instead of a per-worker JS loop, and
          skipped when zoomed too far out to see it. Only the person bobs. */}
      <g
        className={animate ? styles.bob : undefined}
        style={animate ? ({ "--bob-dur": `${bobDuration}s` } as CSSProperties) : undefined}
      >
        <motion.g animate={sprite}>
          {/* trending glow (behind the body) */}
          {worker.trending && (
            <>
              <circle cx={0} cy={-2} r={26} fill={color} opacity={0.16} />
              <circle cx={0} cy={-2} r={19} fill={color} opacity={0.12} />
            </>
          )}

          <WorkerBody appearance={appearance} shirtColor={color} />

          {/* trending star */}
          {worker.trending && (
            <path
              d="M0,-24 L2.2,-19 L7.5,-18.5 L3.5,-15 L4.8,-9.8 L0,-12.7 L-4.8,-9.8 L-3.5,-15 L-7.5,-18.5 L-2.2,-19 Z"
              fill="var(--accent)"
              stroke="#1d2028"
              strokeWidth={0.6}
            />
          )}

          {/* removed marker */}
          {worker.removed && (
            <>
              <rect x={-26} y={-20} width={52} height={44} fill="rgba(210,58,58,0.28)" />
              <path
                d="M -8 -14 L 8 2 M 8 -14 L -8 2"
                stroke="var(--removed)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </>
          )}

          {/* score readout */}
          <text
            className="pixel-font"
            x={0}
            y={30}
            fontSize={7}
            fill="var(--ink-dim)"
            textAnchor="middle"
          >
            {formatScore(worker.score)}
          </text>

          {/* surge FX (arrows) */}
          <motion.g initial={{ opacity: 0, y: -6 }} animate={fx}>
            <path d="M -6 0 L 0 -8 L 6 0 Z" fill="var(--accent)" />
            <path d="M -6 6 L 0 -2 L 6 6 Z" fill="var(--accent-soft)" opacity={0.8} />
          </motion.g>
        </motion.g>
      </g>
    </motion.g>
  );
}
