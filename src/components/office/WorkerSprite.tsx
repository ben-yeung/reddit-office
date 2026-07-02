import type { ReactNode } from "react";
import { shade, type DeskProp as DeskPropType, type WorkerAppearance } from "@/lib/worker/appearance";

const HEAD_Y = -5;
const HEAD_R = 7;

/**
 * The static, procedurally-varied pixel character (bird's-eye): chair, desk,
 * monitor, keyboard, desk prop, torso, and a head whose hair/hat/accessory come
 * from the seeded appearance. Behavior (motion, events, trending, score) lives
 * in Worker.tsx.
 */
export function WorkerSprite({
  appearance,
  shirtColor,
}: {
  appearance: WorkerAppearance;
  shirtColor: string;
}) {
  const a = appearance;
  const shirt = shade(shirtColor, a.shirtPct);
  const chairSeat = shade(shirtColor, -0.5);

  return (
    <g className="pixelated">
      <ellipse cx={0} cy={15} rx={20} ry={6} fill="rgba(0,0,0,0.28)" />
      {/* office chair */}
      <rect x={-13} y={-2} width={26} height={22} rx={9} fill="var(--chair)" />
      <rect x={-10} y={2} width={20} height={15} rx={7} fill={chairSeat} />
      {/* desk */}
      <rect x={-25} y={6} width={50} height={18} rx={2} fill="var(--desk)" />
      <rect x={-25} y={6} width={50} height={3} fill="var(--desk-hi)" />
      {/* monitor + subreddit-tinted glow */}
      <rect x={-13} y={8} width={26} height={11} fill="var(--monitor)" />
      <rect x={-11} y={10} width={22} height={7} fill={shirtColor} opacity={0.6} />
      {/* keyboard */}
      <rect x={-11} y={20} width={22} height={3} rx={1} fill="var(--wall-dark)" />
      <DeskProp prop={a.prop} shirtColor={shirtColor} />
      {/* torso */}
      <rect x={-11} y={-8} width={22} height={20} rx={7} fill={shirt} />
      <Head a={a} />
    </g>
  );
}

/**
 * A deskless person: shadow + torso + procedural head. Used for the ambient
 * office NPCs that populate the commons (decorative, not data-driven).
 */
export function PersonSprite({
  appearance,
  color,
}: {
  appearance: WorkerAppearance;
  color: string;
}) {
  return (
    <g className="pixelated">
      <ellipse cx={0} cy={11} rx={13} ry={4.5} fill="rgba(0,0,0,0.24)" />
      <rect x={-10} y={-6} width={20} height={18} rx={7} fill={color} />
      <Head a={appearance} />
    </g>
  );
}

function DeskProp({ prop, shirtColor }: { prop: DeskPropType; shirtColor: string }) {
  switch (prop) {
    case "mug":
      return (
        <>
          <circle cx={18} cy={13} r={3.2} fill="#e7e2d8" />
          <rect x={20.5} y={11.5} width={2.2} height={3} rx={1} fill="none" stroke="#e7e2d8" strokeWidth={1} />
        </>
      );
    case "plant":
      return (
        <>
          <rect x={15.5} y={12} width={5} height={4} fill="#8a5a34" />
          <circle cx={18} cy={11} r={3.4} fill="var(--plant)" />
        </>
      );
    case "papers":
      return (
        <>
          <rect x={14.5} y={11} width={7} height={6} fill="#e7e2d8" />
          <rect x={15.5} y={12.5} width={5} height={1} fill="#b9b2a4" />
        </>
      );
    case "dual":
      return (
        <>
          <rect x={15} y={9} width={9} height={8} fill="var(--monitor)" />
          <rect x={16} y={10} width={7} height={5} fill={shirtColor} opacity={0.5} />
        </>
      );
  }
}

function Head({ a }: { a: WorkerAppearance }) {
  const hy = HEAD_Y;
  const r = HEAD_R;
  const hatted = a.style === "beanie" || a.style === "noogler";
  const els: ReactNode[] = [];

  // base hair frames the top + sides but leaves the face open (never a hood);
  // skipped entirely under hats to avoid clipping.
  if (a.style !== "bald" && !hatted) {
    if (a.style === "long")
      els.push(<ellipse key="lh" cx={0} cy={hy - 1} rx={r + 2.5} ry={r + 1} fill={a.hair} />);
    els.push(<circle key="h" cx={0} cy={hy - r * 0.35} r={r + 1.5} fill={a.hair} />);
  }

  els.push(<circle key="skin" cx={0} cy={hy} r={r} fill={a.skin} />);

  if (a.style === "bald") {
    els.push(<circle key="e1" cx={-r} cy={hy} r={1.6} fill={a.skin} />);
    els.push(<circle key="e2" cx={r} cy={hy} r={1.6} fill={a.skin} />);
  }
  if (a.style === "bun") els.push(<circle key="bun" cx={0} cy={hy - r - 3} r={3} fill={a.hair} />);
  if (a.style === "spiky")
    els.push(
      <path
        key="spiky"
        d={`M${-r * 0.55},${hy - r} l1.6,-3.6 l1.6,3.6 M-0.7,${hy - r - 1} l1.5,-3.6 l1.5,3.6 M${r * 0.3},${hy - r} l1.6,-3.6 l1.6,3.6`}
        fill={a.hair}
      />,
    );
  if (a.style === "beanie") {
    const bc = a.cap;
    const by = hy - r * 0.06;
    const br = r + 0.6;
    els.push(<path key="bd" d={`M ${-br} ${by} A ${br} ${br} 0 0 1 ${br} ${by} Z`} fill={bc} />);
    els.push(<rect key="bb" x={-br} y={by - 1.6} width={2 * br} height={3.2} rx={1.6} fill={shade(bc, -0.28)} />);
    els.push(<circle key="bp" cx={0} cy={by - br - 1.4} r={1.7} fill={shade(bc, 0.35)} />);
  }
  if (a.style === "noogler") {
    const g = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
    const cr = r + 0.8;
    for (let k = 0; k < 4; k++) {
      const a0 = Math.PI + (k * Math.PI) / 4;
      const a1 = a0 + Math.PI / 4;
      const x0 = (cr * Math.cos(a0)).toFixed(2);
      const y0 = (hy + cr * Math.sin(a0)).toFixed(2);
      const x1 = (cr * Math.cos(a1)).toFixed(2);
      const y1 = (hy + cr * Math.sin(a1)).toFixed(2);
      els.push(<path key={`ng${k}`} d={`M 0 ${hy} L ${x0} ${y0} A ${cr} ${cr} 0 0 1 ${x1} ${y1} Z`} fill={g[k]} />);
    }
    const py = hy - cr * 0.86;
    els.push(
      <rect key="npr" x={-cr - 1} y={py - 0.8} width={2 * (cr + 1)} height={1.6} rx={0.8} fill="#e7e2d8" transform={`rotate(24 0 ${py})`} />,
    );
    els.push(<circle key="nph" cx={0} cy={py} r={1.5} fill="#20242c" />);
  }

  if (a.accessory === "glasses")
    els.push(
      <g key="gl" stroke="#20242c" strokeWidth={1} fill="none">
        <rect x={-5.5} y={-4.5} width={4.5} height={3.5} rx={1} />
        <rect x={1} y={-4.5} width={4.5} height={3.5} rx={1} />
        <line x1={-1} y1={-3} x2={1} y2={-3} />
      </g>,
    );
  else if (a.accessory === "headphones")
    els.push(
      <g key="hp">
        <path d="M-9,-6 A9,9 0 0 1 9,-6" stroke="#20242c" strokeWidth={2} fill="none" />
        <rect x={-11} y={-7} width={3.5} height={6} rx={1.5} fill="#20242c" />
        <rect x={7.5} y={-7} width={3.5} height={6} rx={1.5} fill="#20242c" />
      </g>,
    );
  else if (a.accessory === "earbuds")
    els.push(
      <g key="eb">
        <circle cx={-6.9} cy={-4.2} r={1.2} fill="#f6f8fc" />
        <circle cx={-5.9} cy={-4.2} r={1} fill={a.skin} />
        <circle cx={6.9} cy={-4.2} r={1.2} fill="#f6f8fc" />
        <circle cx={5.9} cy={-4.2} r={1} fill={a.skin} />
      </g>,
    );

  return <>{els}</>;
}
