"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValueEvent, useTime, useTransform } from "framer-motion";
import type { AmenityPlacement, Layout } from "@/lib/domain/types";
import { appearanceFor } from "@/lib/worker/appearance";
import { hashString } from "@/lib/util/rng";
import { decorWalkers } from "@/lib/office/decor";
import { Head, PersonSprite } from "./WorkerSprite";

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
        <Amenity key={i} placement={am} ambient={ambient} seed={`${layout.seed}:${i}`} />
      ))}
      {walkers.map((w) => (
        <Walker key={w.seed} x0={w.x0} y0={w.y0} x1={w.x1} y1={w.y1} dur={w.dur} seed={w.seed} />
      ))}
    </g>
  );
}

function Amenity({
  placement,
  ambient,
  seed,
}: {
  placement: AmenityPlacement;
  ambient: boolean;
  seed: string;
}) {
  const { kind, position, size } = placement;
  const cx = position.x + size.w / 2;
  const cy = position.y + size.h / 2;
  switch (kind) {
    case "meeting":
      return (
        <GlassRoom x={position.x} y={position.y} w={size.w} h={size.h} ambient={ambient} seed={seed} />
      );
    case "pingpong":
      return <PingPong cx={cx} cy={cy} ambient={ambient} seed={seed} />;
    case "lounge":
      return <Lounge cx={cx} cy={cy} ambient={ambient} seed={seed} />;
    case "coffee":
      return <CoffeeBar x={position.x} y={position.y} w={size.w} ambient={ambient} seed={seed} />;
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
  seed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  ambient: boolean;
  seed: string;
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
        seats.map(([dx, dy], i) => (
          <Idler key={i} x={cx + dx} y={cy + dy} seed={`${seed}-gm${i}`} />
        ))}
    </g>
  );
}

function PingPong({
  cx,
  cy,
  ambient,
  seed,
}: {
  cx: number;
  cy: number;
  ambient: boolean;
  seed: string;
}) {
  return (
    <g>
      <rect x={cx - 66} y={cy - 34} width={132} height={68} rx={6} fill="#2f8f4f" stroke="#eef1f6" strokeWidth={2} />
      <line x1={cx - 66} y1={cy} x2={cx + 66} y2={cy} stroke="#eef1f6" strokeWidth={1} opacity={0.7} />
      <line x1={cx} y1={cy - 36} x2={cx} y2={cy + 36} stroke="#eef1f6" strokeWidth={2} />
      {ambient && (
        <>
          <Player x={cx - 84} y={cy} up seed={`${seed}-pp1`} paddleDx={18} paddleRot={-30} paddleColor="#d23a3a" />
          <Player x={cx + 84} y={cy} up={false} seed={`${seed}-pp2`} paddleDx={-18} paddleRot={30} paddleColor="#2b5fa8" />
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

function Lounge({
  cx,
  cy,
  ambient,
  seed,
}: {
  cx: number;
  cy: number;
  ambient: boolean;
  seed: string;
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={92} ry={56} fill="var(--rug)" opacity={0.7} />
      <rect x={cx - 60} y={cy - 40} width={100} height={28} rx={12} fill="#55617a" />
      <rect x={cx - 60} y={cy - 39} width={100} height={9} rx={5} fill="#66739a" />
      <rect x={cx - 76} y={cy - 14} width={30} height={46} rx={12} fill="#55617a" />
      <ellipse cx={cx + 6} cy={cy + 20} rx={28} ry={15} fill="var(--desk)" />
      <ellipse cx={cx + 6} cy={cy + 16} rx={28} ry={12} fill="var(--desk-hi)" />
      <Plant x={cx + 62} y={cy + 18} s={0.74} />
      {ambient && <Idler x={cx - 16} y={cy - 24} seed={`${seed}-lounge`} />}
    </g>
  );
}

// Coffee-station palette (concrete hex where CSS vars don't fit the props).
const STEEL = "#c9ccd4";
const STEEL_DK = "#9aa0ab";
const WOOD = "#4a3528";
const WOOD_HI = "#5e4535";
const DARK = "#2c2f36";
const APRON = "#efe9dc";
const APRON_DK = "#d8d0bf";
const BARISTA_SHIRT = "#3f5c48";

/*
 * The whole café is one looping choreography driven by a single shared clock
 * (`useTime`), so every actor is a pure function of time and they stay in
 * lockstep by construction - no cross-component messaging. There are SLOTS spots
 * along the counter; a customer waits at each. Over one LOOP the barista makes a
 * drink at the machines, carries it DOWN to a slot, hands it over (that customer
 * leaves with it), and heads back UP to the machines - serving each slot once
 * per loop. Each customer is the same LOOP-long visit phase-offset by SERVE, and
 * the barista's delivery to slot k is authored to land exactly on that
 * customer's take, so the handoff aligns without any coordination.
 */
const SLOTS = 3;
const SERVE = 6; // seconds between deliveries
const LOOP = SLOTS * SERVE; // full choreography period

// Local-space geometry (relative to the footprint's top-left).
const SLOT_X = [70, 118, 166]; // the counter spots customers wait at
const WAIT_Y = 88; // a customer waiting at the counter
const TAKE_Y = 84; // stepping in to take the drink
const MACHINE_Y = 36; // barista up at the machine deck
const DELIVER_Y = 52; // barista down at the counter edge, handing over

// Barista path over one LOOP: machine deck (up) -> down to a slot to deliver ->
// back up, three times, visiting slots in clock order 1, 0, 2. The delivery
// frames (y = DELIVER_Y) land at 1.2s, 7.2s and 13.2s, which are exactly where
// customers 1, 0 and 2 (offset k*SERVE) reach their take - so handoffs align.
const B_T = [0, 0.04, 0.0667, 0.09, 0.14, 0.22, 0.33, 0.4, 0.44, 0.5, 0.6, 0.7, 0.7333, 0.77, 0.85, 0.95, 1];
const B_X = [40, 118, 118, 118, 86, 60, 70, 70, 70, 100, 118, 166, 166, 166, 90, 40, 40];
const B_Y = [
  MACHINE_Y, 44, DELIVER_Y, 44, MACHINE_Y, MACHINE_Y, 44, DELIVER_Y, 44, MACHINE_Y, MACHINE_Y, 44,
  DELIVER_Y, 44, MACHINE_Y, MACHINE_Y, MACHINE_Y,
];
// Drink visible in the barista's hand on each approach (ends at the handoff).
const B_CARRY: ReadonlyArray<readonly [number, number]> = [
  [0.0167, 0.0667],
  [0.35, 0.4],
  [0.6833, 0.7333],
];

// One customer's LOOP-long visit (fractions): arrive at the slot, wait, lean in
// to the counter (0.40), pick the drink up off it (0.48), leave with it, then
// stay off-screen until the next loop.
const C_T = [0, 0.05, 0.36, 0.4, 0.48, 0.56, 0.62, 0.64, 1];
const C_DX = [0, 0, 0, 0, 0, 7, 7, 0, 0]; // sideways drift while leaving
const C_Y = [130, WAIT_Y, WAIT_Y, TAKE_Y, TAKE_Y, 120, 132, 130, 130];
const C_O = [0, 1, 1, 1, 1, 1, 0, 0, 0];
const SLOT_CUP_Y = 64; // the drink resting on the counter at a spot
const C_PLACED = [0.4, 0.48] as const; // barista sets it down -> customer takes it
const C_CUP = [0.48, 0.6] as const; // drink in the customer's hand as they leave

/** Piecewise-linear sample of `vals` at fraction `f` over knots `ts` (both 0..1). */
function pw(f: number, ts: number[], vals: number[]): number {
  for (let i = 1; i < ts.length; i++) {
    if (f <= ts[i]) {
      const span = ts[i] - ts[i - 1];
      const u = span === 0 ? 0 : (f - ts[i - 1]) / span;
      return vals[i - 1] + (vals[i] - vals[i - 1]) * u;
    }
  }
  return vals[vals.length - 1];
}

/** True when `f` falls in any of the [start, end] windows. */
function inWindow(f: number, windows: ReadonlyArray<readonly [number, number]>): boolean {
  return windows.some(([a, b]) => f >= a && f <= b);
}

/**
 * The office café, viewed bird's-eye like the rest of the floor. A two-tier
 * structure: a back bar carrying the machines (espresso rig, grinder, drip
 * brewer, pastry case) under a chalk menu, and a front serving counter that
 * occludes the barista's legs so they read as standing behind it. When `ambient`
 * is on, a barista shuttles between the machines "making drinks" and a rotating
 * cast of customers queues up and leaves.
 */
function CoffeeBar({
  x,
  y,
  w,
  ambient,
  seed,
}: {
  x: number;
  y: number;
  w: number;
  ambient: boolean;
  seed: string;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* floor mat that grounds the whole station */}
      <rect x={-6} y={44} width={w + 12} height={66} rx={12} fill="var(--rug)" opacity={0.5} />

      {/* back bar cabinet: the machine deck */}
      <rect x={10} y={6} width={w - 20} height={22} rx={3} fill={WOOD} />
      <rect x={10} y={6} width={w - 20} height={5} rx={3} fill={WOOD_HI} />

      {/* chalk menu board mounted above the bar */}
      <rect x={14} y={-12} width={56} height={16} rx={2} fill="#20281f" stroke="#3a4a33" strokeWidth={1} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={18} y={-9 + i * 4.4} width={30 - i * 6} height={1.6} rx={0.8} fill="#7fae6a" opacity={0.85} />
      ))}
      <circle cx={62} cy={-4} r={2} fill="#d9a441" />

      <EspressoMachine x={40} />
      <Grinder x={86} />
      <DripBrewer x={118} />
      <PastryCase x={146} />

      {/* the barista behind the counter, and a customer stepping up to be served
          (drawn before the counter so the counter hides their lower halves) */}
      {ambient && <Barista seed={`${seed}-barista`} />}

      {/* front serving counter, drawn over the barista to hide the legs */}
      <rect x={8} y={52} width={w - 16} height={20} rx={3} fill="var(--desk)" />
      <rect x={8} y={52} width={w - 16} height={4} rx={3} fill="var(--desk-hi)" />
      <rect x={8} y={70} width={w - 16} height={3} fill="rgba(0,0,0,0.18)" />

      {/* a spare cup on the deck + a tip jar */}
      <Cup x={22} y={62} />
      <rect x={182} y={57} width={7} height={11} rx={2} fill="#bfe0f0" opacity={0.7} />
      <rect x={182} y={57} width={7} height={2.5} rx={2} fill="#a9c9db" />

      {/* stools between the counter spots */}
      <Stool x={94} />
      <Stool x={142} />

      {/* one customer per counter spot: arrive, wait, get served, leave */}
      {ambient &&
        Array.from({ length: SLOTS }, (_, i) => (
          <Customer key={i} slot={i} seed={`${seed}-c${i}`} />
        ))}
    </g>
  );
}

/** Stainless espresso machine: twin group heads, portafilters, steam wand, and
    a row of cups warming on top. `x` is the local station center. */
function EspressoMachine({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect x={-22} y={20} width={44} height={7} rx={1.5} fill={STEEL_DK} />
      <rect x={-22} y={4} width={44} height={18} rx={2} fill={STEEL} />
      <rect x={-22} y={4} width={44} height={4} rx={2} fill="#e6e8ee" />
      {/* group heads + portafilter handles */}
      <rect x={-14} y={22} width={7} height={5} rx={1} fill="#3a3f4b" />
      <rect x={7} y={22} width={7} height={5} rx={1} fill="#3a3f4b" />
      <rect x={-13} y={26} width={5} height={2.5} rx={1} fill="#20242c" />
      <rect x={8} y={26} width={5} height={2.5} rx={1} fill="#20242c" />
      {/* steam wand */}
      <rect x={-21} y={12} width={3} height={10} rx={1} fill="#8b9099" />
      {/* control knobs */}
      <circle cx={-4} cy={9} r={1.6} fill="#d23a3a" />
      <circle cx={0} cy={9} r={1.6} fill="#2d7d46" />
      <circle cx={4} cy={9} r={1.6} fill="#e6e8ee" />
      {/* cups warming on top */}
      <circle cx={-10} cy={2.5} r={2} fill="#e7e2d8" />
      <circle cx={-4} cy={2.5} r={2} fill="#e7e2d8" />
      <circle cx={2} cy={2.5} r={2} fill="#e7e2d8" />
    </g>
  );
}

/** Burr grinder with a bean hopper. */
function Grinder({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <path d="M-6,2 L6,2 L4,10 L-4,10 Z" fill="#3a2f26" opacity={0.85} />
      <path d="M-6,2 L6,2 L4,10 L-4,10 Z" fill="none" stroke="#5a4636" strokeWidth={0.8} />
      <rect x={-6} y={10} width={12} height={16} rx={1.5} fill={DARK} />
      <rect x={-6} y={10} width={12} height={3} fill="#464b55" />
      <rect x={-3} y={22} width={6} height={4} fill="#5a5f6b" />
    </g>
  );
}

/** Batch-brew drip station with twin warmer plates and carafes. */
function DripBrewer({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect x={-11} y={6} width={22} height={20} rx={2} fill="#3a3f4b" />
      <rect x={-11} y={6} width={22} height={4} rx={2} fill="#4b515f" />
      <rect x={-9} y={22} width={9} height={4} rx={1} fill="#20242c" />
      <rect x={1} y={22} width={9} height={4} rx={1} fill="#20242c" />
      <path d="M-7,17 L-2,17 L-2.6,22 L-6.4,22 Z" fill="#5a3a24" opacity={0.85} />
      <path d="M3,17 L8,17 L7.4,22 L3.6,22 Z" fill="#3a2a1a" opacity={0.85} />
      <circle cx={7} cy={10} r={1.4} fill="#d23a3a" />
    </g>
  );
}

/** Glass pastry case; `x` is its left edge. */
function PastryCase({ x }: { x: number }) {
  const top = ["#c98a3a", "#d8b06a", "#a8632f", "#e0c98a"];
  const bot = ["#b5772f", "#caa25c", "#8f5327", "#d3bd7e"];
  return (
    <g transform={`translate(${x},0)`}>
      <rect x={0} y={8} width={40} height={18} rx={2} fill="#dfe6ee" opacity={0.35} stroke="#aeb6c2" strokeWidth={1} />
      <rect x={0} y={8} width={40} height={2} fill="#c3cad4" />
      {[6, 16, 26, 34].map((px, i) => (
        <g key={i}>
          <ellipse cx={px} cy={15} rx={3} ry={2.2} fill={top[i]} />
          <ellipse cx={px} cy={21} rx={3} ry={2.2} fill={bot[i]} />
        </g>
      ))}
    </g>
  );
}

/** A to-go cup with a lid and a wisp handle. */
function Cup({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-3} y={-3} width={6} height={7} rx={1.5} fill="#f2ede3" />
      <rect x={-3} y={-3} width={6} height={2} fill="#ffffff" />
    </g>
  );
}

/** A round bar stool (bird's-eye). */
function Stool({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <circle cx={0} cy={88} r={7} fill="var(--chair)" />
      <circle cx={0} cy={88} r={3.5} fill="rgba(0,0,0,0.15)" />
    </g>
  );
}

/** Three wisps of steam rising and fading, staggered. */
function Steam({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx={(i - 1) * 2.2}
          r={1.5}
          fill="#ffffff"
          initial={{ cy: 0, opacity: 0 }}
          animate={{ cy: [0, -9], opacity: [0, 0.5, 0] }}
          transition={{ duration: 1.9, delay: i * 0.45, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </g>
  );
}

/** Aproned barista: a green-shirted body with a cream apron, head drawn last so
    it sits cleanly on top of the apron. */
function BaristaSprite({ seed }: { seed: string }) {
  return (
    <g className="pixelated">
      <ellipse cx={0} cy={11} rx={13} ry={4.5} fill="rgba(0,0,0,0.24)" />
      <rect x={-10} y={-6} width={20} height={18} rx={7} fill={BARISTA_SHIRT} />
      <rect x={-8} y={0} width={16} height={11} rx={2} fill={APRON} />
      <rect x={-8} y={0} width={16} height={2.4} fill={APRON_DK} />
      <path d="M-5,-4 L-4.5,0 M5,-4 L4.5,0" stroke={APRON_DK} strokeWidth={1.3} fill="none" />
      <Head a={appearanceFor(seed)} />
    </g>
  );
}

/**
 * The barista, driven by the shared clock over one LOOP: works the machine deck
 * (up), carries a drink DOWN to a counter slot, hands it over, and heads back up,
 * serving each slot once per loop. A small bob keeps them busy at the machines.
 */
function Barista({ seed }: { seed: string }) {
  const time = useTime();
  const frac = (t: number) => ((t / 1000) % LOOP) / LOOP;
  const x = useTransform(time, (t) => pw(frac(t), B_T, B_X));
  const y = useTransform(time, (t) => {
    const bob = ((t / 1000) % 0.85) / 0.85;
    return pw(frac(t), B_T, B_Y) - 0.8 * (0.5 - 0.5 * Math.cos(2 * Math.PI * bob));
  });
  const carrying = useTransform(time, (t) => (inWindow(frac(t), B_CARRY) ? 1 : 0));
  return (
    <motion.g style={{ x, y }}>
      <BaristaSprite seed={seed} />
      <motion.g style={{ opacity: carrying }}>
        <Cup x={9} y={2} />
        <Steam x={9} y={-2} />
      </motion.g>
    </motion.g>
  );
}

/**
 * One customer at counter spot `slot`, driven by the shared clock. The same
 * LOOP-long visit is phase-offset by `slot * SERVE`, so the barista's delivery to
 * this slot lands exactly on the customer's take: they walk up, wait, take the
 * drink, and leave with it. A fresh face takes the spot each loop.
 */
function Customer({ slot, seed }: { slot: number; seed: string }) {
  const time = useTime();
  const off = slot * SERVE;
  const sx = SLOT_X[slot];
  const frac = (t: number) => ((t / 1000 + off) % LOOP) / LOOP;
  const x = useTransform(time, (t) => sx + pw(frac(t), C_T, C_DX));
  const y = useTransform(time, (t) => pw(frac(t), C_T, C_Y));
  const o = useTransform(time, (t) => pw(frac(t), C_T, C_O));
  // Drink resting on the counter (set down by the barista, then taken).
  const resting = useTransform(time, (t) => (inWindow(frac(t), [C_PLACED]) ? 1 : 0));
  // Drink in the customer's hand once they've picked it up.
  const inHand = useTransform(time, (t) => (inWindow(frac(t), [C_CUP]) ? 1 : 0));

  // Bump a per-loop nonce (while off-screen) so each visit is a different person.
  const [loop, setLoop] = useState(0);
  const loopRef = useRef(0);
  useMotionValueEvent(time, "change", (t) => {
    const n = Math.floor((t / 1000 + off) / LOOP);
    if (n !== loopRef.current) {
      loopRef.current = n;
      setLoop(n);
    }
  });
  const s = `${seed}:${loop}`;

  return (
    <>
      {/* the drink the barista set down on the counter at this spot */}
      <motion.g style={{ opacity: resting }} transform={`translate(${sx},${SLOT_CUP_Y})`}>
        <Cup x={0} y={0} />
        <Steam x={0} y={-4} />
      </motion.g>
      <motion.g style={{ x, y, opacity: o }}>
        <PersonSprite appearance={appearanceFor(s)} color={neut(s)} />
        <motion.g style={{ opacity: inHand }}>
          <Cup x={9} y={-1} />
        </motion.g>
      </motion.g>
    </>
  );
}
