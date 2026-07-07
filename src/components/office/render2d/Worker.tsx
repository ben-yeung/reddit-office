"use client";

import { useEffect, useLayoutEffect, useMemo, type CSSProperties } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { Cubicle as CubicleModel, Vec2, Worker as WorkerModel } from "@/lib/domain/types";
import type { Bounds } from "@/lib/data/layout";
import type { WorkerAppearance } from "@/lib/worker/appearance";
import type { Pulse } from "@/lib/office/useOffice";
import { walkBetween, walkIn, walkOut } from "@/lib/office/walkout";
import { WorkerDesk, WorkerBody } from "./WorkerSprite";
import styles from "./Worker.module.css";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The migration walk must position the worker at its old desk before the browser
// paints the reshuffled layout, so it runs in a layout effect. Fall back to a
// passive effect on the server, where layout effects don't run (and there's no
// migration anyway).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** A worker's old cubicle position + a monotonic id, set for one shuffle relayout
    so each worker walks from its previous desk to its new one. */
export interface Migration {
  fromPos: Vec2;
  seq: number;
}

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
  /** True for a worker mounting as the office first fills (initial data load): it
      walks in from a hallway edge to its seat instead of appearing at the desk. */
  enter: boolean;
  /** Set for one shuffle relayout: the worker walks from its old desk to this new
      one. Same worker, same subreddit - only the cubicle's grid cell changed. */
  migration: Migration | null;
  onSelect: (worker: WorkerModel) => void;
}

/**
 * The person half of a post-as-worker. It fades in on the seat, and on removal
 * walks the aisles out to the grid edge before fading. Two variations use an inner
 * offset group so the outer group's enter/exit/opacity stay untouched: when the
 * office first loads it walks IN from a hallway edge to its seat (`enter`), and on
 * a shuffle relayout it walks from its old desk to its new one (`migration`, the
 * cubicle having jumped to its new cell). This layer also adds behavior - trending
 * glow, momentum-driven bob speed, and one-shot Actions (surge pop, trending
 * wobble) from event pulses. The desk is a separate layer (WorkerDeskSlot).
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
  enter,
  migration,
  onSelect,
}: Props) {
  const sprite = useAnimationControls();
  const fx = useAnimationControls();
  // One inner group drives both aisle travels (they never overlap in time): the
  // walk-in on mount, and the desk-to-desk migration on a shuffle. At rest it sits
  // at (0,0) - dead on the seat.
  const offsetCtl = useAnimationControls();

  // Walk-in (initial load): come in from a hallway edge to the seat. Frozen at
  // mount via a deterministic memo, so a later re-render (or the arrival window
  // closing) can't restart it. `enterInitial` places the inner group at the edge
  // pre-paint (framer applies `initial` on mount), then the effect walks it to the
  // seat. A no-op for anyone not arriving.
  const enterWalk = useMemo(
    () => (enter && animate ? walkIn(worker.id, seat, cubicle, bounds) : null),
    [enter, animate, worker.id, seat, cubicle, bounds],
  );
  const enterInitial = enterWalk ? { x: enterWalk.x[0], y: enterWalk.y[0] } : { x: 0, y: 0 };

  useEffect(() => {
    if (!enterWalk) return;
    offsetCtl.start({
      x: enterWalk.x,
      y: enterWalk.y,
      transition: {
        x: { duration: enterWalk.duration, times: enterWalk.times, ease: "linear" },
        y: { duration: enterWalk.duration, times: enterWalk.times, ease: "linear" },
      },
    });
    // Runs once on mount so the walk-in plays a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Migration (shuffle relayout): the cubicle jumps to its new cell, so this worker
  // would otherwise pop straight to the new desk. Instead we walk the inner group
  // from the old desk to the new one: snap to the old-desk offset before paint,
  // then animate back to (0,0). Keyed on the migration seq so it fires exactly once
  // per shuffle, never on a plain re-render (pulse/snapshot).
  useIsomorphicLayoutEffect(() => {
    if (!migration || !animate) return;
    const move = walkBetween(worker.id, seat, migration.fromPos, cubicle.position);
    if (!move) return;
    offsetCtl.set({ x: move.x[0], y: move.y[0] });
    offsetCtl.start({
      x: move.x,
      y: move.y,
      transition: {
        x: { duration: move.duration, times: move.times, ease: "linear" },
        y: { duration: move.duration, times: move.times, ease: "linear" },
      },
    });
    // Fires only when the shuffle seq changes - not on the seat/cubicle refs that
    // churn on every snapshot - so a walk can't be restarted mid-stride.
  }, [migration?.seq]);

  // On removal/replacement the body gets up, steps out through the cubicle's open
  // bottom, and strolls the aisles to the grid edge before fading. Deterministic
  // per id so it's stable across the exit's re-renders. When motion is culled
  // (zoomed out) it just fades in place.
  const exit = useMemo(() => {
    if (!animate) return { opacity: 0, transition: { duration: 0.3 } };
    const walk = walkOut(worker.id, seat, cubicle, bounds);
    // Per-track transitions: a linear, even pace along the path (no easing pause
    // at each corner) with a continuous fade over the final stretch - matching
    // the ambient hallway NPCs' enter/exit feel.
    return {
      x: walk.x,
      y: walk.y,
      opacity: walk.opacity,
      transition: {
        x: { duration: walk.duration, times: walk.times, ease: "linear" as const },
        y: { duration: walk.duration, times: walk.times, ease: "linear" as const },
        opacity: {
          duration: walk.duration,
          times: walk.opacityTimes,
          ease: "linear" as const,
        },
      },
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

  // Score readout: monospaced (pixel font), so the chip width tracks glyph count.
  const scoreText = formatScore(worker.score);
  const scoreW = scoreText.length * 7 + 8;

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
      {/* Aisle-travel offset group. At rest at (0,0) - dead on the seat. Starts at
          a hallway edge on the initial-load walk-in (enterInitial), and is snapped
          to the old-desk offset on a shuffle migration; either way it animates back
          to (0,0). Kept separate so the outer group's enter/exit (incl. the
          walk-out) is undisturbed. */}
      <motion.g initial={enterInitial} animate={offsetCtl}>
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

            {/* score readout: themed chip so it reads on any floor / theme */}
            <g transform="translate(0 28)">
              <rect
                x={-scoreW / 2}
                y={-6.5}
                width={scoreW}
                height={13}
                rx={3}
                fill="var(--panel)"
                stroke="var(--panel-border)"
                strokeWidth={0.75}
              />
              <text
                className="pixel-font"
                x={0}
                y={0.5}
                fontSize={7}
                fill="var(--ink)"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {scoreText}
              </text>
            </g>

            {/* surge FX (arrows) */}
            <motion.g initial={{ opacity: 0, y: -6 }} animate={fx}>
              <path d="M -6 0 L 0 -8 L 6 0 Z" fill="var(--accent)" />
              <path d="M -6 6 L 0 -2 L 6 6 Z" fill="var(--accent-soft)" opacity={0.8} />
            </motion.g>
          </motion.g>
        </g>
      </motion.g>
    </motion.g>
  );
}
