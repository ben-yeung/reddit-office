"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { Vec2, Worker as WorkerModel } from "@/lib/domain/types";
import type { Pulse } from "@/lib/office/useOffice";
import { appearanceFor } from "@/lib/worker/appearance";
import { WorkerSprite } from "./WorkerSprite";
import styles from "./Worker.module.css";

interface Props {
  worker: WorkerModel;
  seat: Vec2; // cubicle-local seat center
  color: string;
  pulse?: Pulse;
  /** Whether idle motion runs. Gated off when zoomed too far out to perceive it. */
  animate: boolean;
  onSelect: (worker: WorkerModel) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function formatScore(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * A post rendered as a procedurally-varied top-down office worker. Appearance is
 * seeded from the post id (WorkerSprite); this layer adds behavior: trending glow,
 * momentum-driven bob speed, one-shot Actions (surge pop, trending wobble) from
 * event pulses, and enter/exit animations for new-post arrival and removal.
 */
export function Worker({ worker, seat, color, pulse, animate, onSelect }: Props) {
  const sprite = useAnimationControls();
  const fx = useAnimationControls();
  const appearance = useMemo(() => appearanceFor(worker.id), [worker.id]);

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
      initial={{ opacity: 0, scale: 0.4, x: seat.x, y: seat.y - 34 }}
      animate={{ opacity: 1, scale: 1, x: seat.x, y: seat.y }}
      exit={{
        opacity: 0,
        scale: worker.removed ? 0.2 : 0.5,
        y: seat.y + 22,
        rotate: worker.removed ? 18 : 0,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onSelect(worker)}
    >
      {/* Idle bob: CSS-driven (compositor) instead of a per-worker JS loop, and
          skipped entirely when zoomed too far out to see it. */}
      <g
        className={animate ? styles.bob : undefined}
        style={animate ? ({ "--bob-dur": `${bobDuration}s` } as CSSProperties) : undefined}
      >
        <motion.g animate={sprite}>
          {/* trending glow (behind the sprite) */}
          {worker.trending && (
            <>
              <circle cx={0} cy={-2} r={26} fill={color} opacity={0.16} />
              <circle cx={0} cy={-2} r={19} fill={color} opacity={0.12} />
            </>
          )}

          <WorkerSprite appearance={appearance} shirtColor={color} />

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
