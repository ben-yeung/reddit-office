import { useLayoutEffect, useRef, useState } from "react";
import type { Cubicle as CubicleModel, Subreddit } from "@/lib/domain/types";
import styles from "./Cubicle.module.css";

const WALL = 12;
const HANDLE_M = 5;
const HANDLE_L = 16;

/** Nameplate geometry: where the label text starts and how much room to leave. */
const NAME_TEXT_X = WALL + 26; // after the wall + color chip
const NAME_PAD_R = 10; // breathing room between the text and the plate's right edge
const NAME_FONT = 10;
/**
 * Fixed-width fallback per glyph (Press Start 2P is monospaced) used for the very
 * first paint, before the real `getComputedTextLength` measurement lands. Keeps
 * the plate from visibly resizing on hydration.
 */
const NAME_CHAR_W = 10.5;

interface Props {
  cubicle: CubicleModel;
  subreddit: Subreddit;
  workerCount: number;
}

/**
 * A subreddit's cubicle, drawn top-down (bird's-eye): fabric partition walls, a
 * nameplate, a floor rug, sticky notes, and corner-resize brackets that reveal on
 * hover (the affordance for the planned drag-to-resize; ADR-0007). The desks are
 * fixed seat furniture drawn by CubicleGroup, so the cubicle frame stays clear.
 */
export function Cubicle({ cubicle, subreddit, workerCount }: Props) {
  const { w, h } = cubicle.size;

  // Size the nameplate to the label so it hugs the text at any length (short
  // names don't leave dead space, long ones like r/NatureIsFuckingLit don't
  // overflow). Start from a monospaced estimate for SSR/first paint, then snap
  // to the exact rendered width once the text node is measurable.
  const labelRef = useRef<SVGTextElement>(null);
  const [textW, setTextW] = useState(() => subreddit.displayName.length * NAME_CHAR_W);
  useLayoutEffect(() => {
    const node = labelRef.current;
    if (node) setTextW(node.getComputedTextLength());
  }, [subreddit.displayName]);
  const plateW = NAME_TEXT_X - WALL + textW + NAME_PAD_R;

  return (
    <g className={`pixelated ${styles.cubicle}`}>
      {/* floor rug */}
      <rect x={40} y={70} width={w - 80} height={h - 92} rx={10} fill="var(--rug)" opacity={0.75} />
      <rect
        x={52}
        y={82}
        width={w - 104}
        height={h - 116}
        rx={8}
        fill="none"
        stroke="var(--rug-stroke)"
        strokeWidth={2}
      />

      {/* floor edge + partitions */}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="var(--floor-2)" strokeWidth={2} />
      <rect x={0} y={0} width={w} height={WALL} fill="var(--wall-light)" />
      <rect x={0} y={0} width={WALL} height={h} fill="var(--wall-light)" />
      <rect x={w - WALL} y={0} width={WALL} height={h} fill="var(--wall-light)" />
      <rect x={0} y={0} width={w} height={3} fill="var(--wall-hi)" />
      <rect x={0} y={WALL - 2} width={w} height={2} fill="var(--wall-dark)" />

      {/* nameplate */}
      <rect x={WALL} y={WALL} width={plateW} height={30} rx={4} fill="var(--name-bg)" />
      <rect x={WALL + 8} y={WALL + 6} width={9} height={18} fill={subreddit.color} />
      <text
        ref={labelRef}
        className="pixel-font"
        x={NAME_TEXT_X}
        y={WALL + 21}
        fontSize={NAME_FONT}
        fill="var(--ink)"
      >
        {subreddit.displayName}
      </text>

      {/* occupancy */}
      <text
        className="pixel-font"
        x={w - WALL - 10}
        y={WALL + 21}
        fontSize={9}
        fill="var(--ink-dim)"
        textAnchor="end"
      >
        {workerCount}
      </text>

      {/* corner plant, tucked in the corner */}
      <rect x={w - 28} y={h - 30} width={12} height={14} fill="#8a5a34" />
      <circle cx={w - 22} cy={h - 34} r={10} fill="var(--plant)" />
      <circle cx={w - 28} cy={h - 30} r={6} fill="var(--plant-dark)" />

      {/* corner-resize brackets (reveal on hover) */}
      <g className={styles.handles}>
        <CornerBrackets w={w} h={h} />
      </g>
    </g>
  );
}

function CornerBrackets({ w, h }: { w: number; h: number }) {
  const m = HANDLE_M;
  const L = HANDLE_L;
  const x0 = m;
  const y0 = m;
  const x1 = w - m;
  const y1 = h - m;
  const stroke = {
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <>
      <path d={`M ${x0} ${y0 + L} L ${x0} ${y0} L ${x0 + L} ${y0}`} {...stroke} />
      <path d={`M ${x1 - L} ${y0} L ${x1} ${y0} L ${x1} ${y0 + L}`} {...stroke} />
      <path d={`M ${x0} ${y1 - L} L ${x0} ${y1} L ${x0 + L} ${y1}`} {...stroke} />
      <path d={`M ${x1 - L} ${y1} L ${x1} ${y1} L ${x1} ${y1 - L}`} {...stroke} />
    </>
  );
}
