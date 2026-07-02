"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { AmenityPlacement, Layout } from "@/lib/domain/types";
import { appearanceFor } from "@/lib/worker/appearance";
import { hashString } from "@/lib/util/rng";
import { decorWalkers } from "@/lib/office/decor";
import { PersonSprite } from "./WorkerSprite";

/**
 * The office's decorative layer: modern-office amenities (glass meeting room,
 * ping-pong, lounge, coffee bar) distributed around the cubicle grid, plants
 * scattered through the aisle gaps, and ambient office-worker NPCs.
 *
 * Furniture always renders; the NPCs and their animations are gated by `ambient`
 * (the Office Policy "Ambient life" toggle). NPCs live only in the aisles and at
 * the amenities, so they never overlap subreddit cubicles.
 */
export function Decor({ layout, ambient }: { layout: Layout; ambient: boolean }) {
  const walkers = useMemo(() => (ambient ? decorWalkers(layout) : []), [layout, ambient]);

  return (
    <g className="pixelated">
      {layout.amenities.map((am, i) => (
        <Amenity key={i} placement={am} ambient={ambient} />
      ))}
      {walkers.map((w) => (
        <Walker key={w.seed} x0={w.x0} y0={w.y0} x1={w.x1} y1={w.y1} dur={w.dur} seed={w.seed} />
      ))}
    </g>
  );
}

function Amenity({ placement, ambient }: { placement: AmenityPlacement; ambient: boolean }) {
  const { kind, position, size } = placement;
  const cx = position.x + size.w / 2;
  const cy = position.y + size.h / 2;
  switch (kind) {
    case "meeting":
      return <GlassRoom x={position.x} y={position.y} w={size.w} h={size.h} ambient={ambient} />;
    case "pingpong":
      return <PingPong cx={cx} cy={cy} ambient={ambient} />;
    case "lounge":
      return <Lounge cx={cx} cy={cy} ambient={ambient} />;
    case "coffee":
      return <CoffeeBar x={position.x} y={position.y + 46} w={size.w} ambient={ambient} />;
  }
}

const NEUT = ["#8a90a0", "#9a8f86", "#7f9a8f", "#a0929c", "#8f96a6"];
function neut(seed: string): string {
  return NEUT[hashString(seed) % NEUT.length];
}

function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-6} y={0} width={12} height={15} fill="#8a5a34" />
      <circle cx={0} cy={-4} r={12} fill="var(--plant)" />
      <circle cx={-7} cy={2} r={7} fill="var(--plant-dark)" />
      <circle cx={7} cy={0} r={6} fill="var(--plant-light)" />
    </g>
  );
}

function Laptop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-6} y={-1} width={12} height={6} rx={1} fill="#2a2e38" />
      <rect x={-6} y={-6} width={12} height={6} rx={1} fill="#14161c" />
      <rect x={-5} y={-5} width={10} height={4} fill="#5aa9e6" opacity={0.5} />
    </g>
  );
}

function Idler({ x, y, seed }: { x: number; y: number; seed: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <motion.g
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <PersonSprite appearance={appearanceFor(seed)} color={neut(seed)} />
      </motion.g>
    </g>
  );
}

/**
 * A hallway commuter: fades in at one end of the aisle, walks to the other, and
 * fades out as if leaving. After a random pause a fresh seeded worker enters
 * (sometimes from the opposite end), so the aisles feel alive rather than looped.
 */
function Walker({
  x0,
  y0,
  x1,
  y1,
  dur,
  seed,
}: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dur: number;
  seed: string;
}) {
  const [trip, setTrip] = useState(0);
  const [rev, setRev] = useState(false);
  const [s, setS] = useState(seed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const from = rev ? { x: x1, y: y1 } : { x: x0, y: y0 };
  const to = rev ? { x: x0, y: y0 } : { x: x1, y: y1 };

  return (
    <motion.g
      key={trip}
      initial={{ x: from.x, y: from.y, opacity: 0 }}
      animate={{ x: to.x, y: to.y, opacity: [0, 1, 1, 0] }}
      transition={{
        x: { duration: dur, ease: "linear" },
        y: { duration: dur, ease: "linear" },
        opacity: { duration: dur, times: [0, 0.12, 0.85, 1], ease: "linear" },
      }}
      onAnimationComplete={() => {
        const delay = 400 + Math.random() * 2600;
        timer.current = setTimeout(() => {
          setS(`${seed}-${Math.floor(Math.random() * 1e9)}`);
          setRev((r) => (Math.random() < 0.5 ? !r : r));
          setTrip((t) => t + 1);
        }, delay);
      }}
    >
      <PersonSprite appearance={appearanceFor(s)} color={neut(s)} />
    </motion.g>
  );
}

function GlassRoom({
  x,
  y,
  w,
  h,
  ambient,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ambient: boolean;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2 + 10;
  const mullions: number[] = [];
  for (let mx = x + 60; mx < x + w - 20; mx += 60) mullions.push(mx);
  const chairs: Array<[number, number]> = [
    [-64, -4], [-32, -20], [0, -22], [32, -20], [64, -4], [-32, 22], [0, 24], [32, 22],
  ];
  const laptops: Array<[number, number]> = [
    [-34, -6], [34, -6], [-34, 8], [34, 8],
  ];
  const seats: Array<[number, number]> = [
    [-46, -24], [46, -24], [-46, 26], [46, 26],
  ];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--floor-1)" />
      <rect x={x} y={y} width={w} height={h} fill="var(--glass-fill)" opacity={0.12} />
      <rect x={x} y={y} width={w} height={4} fill="var(--glass-frame)" />
      <rect x={x} y={y + h - 4} width={w} height={4} fill="var(--glass-frame)" />
      <rect x={x} y={y} width={4} height={h} fill="var(--glass-frame)" />
      <rect x={x + w - 4} y={y} width={4} height={h} fill="var(--glass-frame)" />
      {mullions.map((mx) => (
        <rect key={mx} x={mx} y={y} width={2} height={h} fill="var(--glass-frame)" opacity={0.5} />
      ))}
      {/* door gap */}
      <rect x={cx - 16} y={y + h - 4} width={32} height={4} fill="var(--floor-1)" />
      {/* wall-mounted screen */}
      <rect x={cx - 26} y={y + 6} width={52} height={14} rx={2} fill="#14161c" />
      <rect x={cx - 23} y={y + 9} width={46} height={8} fill="#2b6cb0" opacity={0.7} />
      {/* conference table + chairs */}
      <rect x={cx - 52} y={cy - 17} width={104} height={34} rx={15} fill="var(--desk)" />
      <rect x={cx - 52} y={cy - 17} width={104} height={5} fill="var(--desk-hi)" />
      {chairs.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx} cy={cy + dy} r={8} fill="var(--chair)" />
      ))}
      {laptops.map(([dx, dy], i) => (
        <Laptop key={i} x={cx + dx} y={cy + dy} />
      ))}
      <Plant x={x + w - 16} y={y + 20} s={0.66} />
      {ambient &&
        seats.map(([dx, dy], i) => <Idler key={i} x={cx + dx} y={cy + dy} seed={`gm${i}`} />)}
    </g>
  );
}

function PingPong({ cx, cy, ambient }: { cx: number; cy: number; ambient: boolean }) {
  return (
    <g>
      <rect x={cx - 66} y={cy - 34} width={132} height={68} rx={6} fill="#2f8f4f" stroke="#eef1f6" strokeWidth={2} />
      <line x1={cx - 66} y1={cy} x2={cx + 66} y2={cy} stroke="#eef1f6" strokeWidth={1} opacity={0.7} />
      <line x1={cx} y1={cy - 36} x2={cx} y2={cy + 36} stroke="#eef1f6" strokeWidth={2} />
      {ambient && (
        <>
          <Player x={cx - 84} y={cy} up seed="pp1" paddleDx={18} paddleRot={-30} paddleColor="#d23a3a" />
          <Player x={cx + 84} y={cy} up={false} seed="pp2" paddleDx={-18} paddleRot={30} paddleColor="#2b5fa8" />
          <motion.circle
            r={3}
            fill="#fff"
            initial={{ cx: cx - 56, cy: cy - 7 }}
            animate={{
              cx: [cx - 56, cx + 56, cx - 56],
              cy: [cy - 7, cy + 2, cy - 7, cy + 2, cy - 7],
            }}
            transition={{
              cx: { duration: 1.4, times: [0, 0.5, 1], repeat: Infinity, ease: "easeInOut" },
              cy: {
                duration: 1.4,
                times: [0, 0.25, 0.5, 0.75, 1],
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
          />
        </>
      )}
    </g>
  );
}

function Player({
  x,
  y,
  up,
  seed,
  paddleDx,
  paddleRot,
  paddleColor,
}: {
  x: number;
  y: number;
  up: boolean;
  seed: string;
  paddleDx: number;
  paddleRot: number;
  paddleColor: string;
}) {
  // staggered: one player up while the other is down, swapping each half-loop
  const yv = up ? [-7, 7, -7] : [7, -7, 7];
  return (
    <g transform={`translate(${x},${y})`}>
      <motion.g
        initial={{ y: yv[0] }}
        animate={{ y: yv }}
        transition={{ duration: 1.4, times: [0, 0.5, 1], repeat: Infinity, ease: "easeInOut" }}
      >
        <PersonSprite appearance={appearanceFor(seed)} color={neut(seed)} />
        <g transform={`translate(${paddleDx},-3) rotate(${paddleRot})`}>
          <ellipse rx={5} ry={6.3} fill={paddleColor} />
          <rect x={-1.6} y={5.5} width={3.2} height={7} rx={1.4} fill="#8a5a34" />
        </g>
      </motion.g>
    </g>
  );
}

function Lounge({ cx, cy, ambient }: { cx: number; cy: number; ambient: boolean }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={92} ry={56} fill="var(--rug)" opacity={0.7} />
      <rect x={cx - 60} y={cy - 40} width={100} height={28} rx={12} fill="#55617a" />
      <rect x={cx - 60} y={cy - 39} width={100} height={9} rx={5} fill="#66739a" />
      <rect x={cx - 76} y={cy - 14} width={30} height={46} rx={12} fill="#55617a" />
      <ellipse cx={cx + 6} cy={cy + 20} rx={28} ry={15} fill="var(--desk)" />
      <ellipse cx={cx + 6} cy={cy + 16} rx={28} ry={12} fill="var(--desk-hi)" />
      <Plant x={cx + 62} y={cy + 18} s={0.74} />
      {ambient && <Idler x={cx - 16} y={cy - 24} seed="lounge1" />}
    </g>
  );
}

function CoffeeBar({ x, y, w, ambient }: { x: number; y: number; w: number; ambient: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={24} rx={4} fill="var(--desk)" />
      <rect x={x} y={y} width={w} height={5} fill="var(--desk-hi)" />
      <rect x={x + 14} y={y - 20} width={26} height={22} rx={3} fill="#3a3f4b" />
      <rect x={x + 18} y={y - 16} width={18} height={6} fill="#8fd3ff" opacity={0.6} />
      <circle cx={x + 27} cy={y - 4} r={2} fill="#d23a3a" />
      <circle cx={x + 62} cy={y + 11} r={4} fill="#e7e2d8" />
      <circle cx={x + 76} cy={y + 11} r={4} fill="#e7e2d8" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={x + 34 + i * 44} cy={y + 40} r={9} fill="var(--chair)" />
      ))}
      {ambient && <Idler x={x + 40} y={y - 16} seed="coffee1" />}
    </g>
  );
}
