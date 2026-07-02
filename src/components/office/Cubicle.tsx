import type { Cubicle as CubicleModel, Subreddit } from "@/lib/domain/types";
import styles from "./Cubicle.module.css";

const WALL = 12;
const HANDLE_M = 5;
const HANDLE_L = 16;

interface Props {
  cubicle: CubicleModel;
  subreddit: Subreddit;
  workerCount: number;
}

/**
 * A subreddit's cubicle, drawn top-down (bird's-eye): fabric partition walls, a
 * nameplate, a floor rug, sticky notes, and corner-resize brackets that reveal on
 * hover (the affordance for the planned drag-to-resize; ADR-0007). Workers bring
 * their own desks, so the cubicle stays clear inside.
 */
export function Cubicle({ cubicle, subreddit, workerCount }: Props) {
  const { w, h } = cubicle.size;

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
      <rect x={WALL} y={WALL} width={172} height={30} rx={4} fill="var(--name-bg)" />
      <rect x={WALL + 8} y={WALL + 6} width={9} height={18} fill={subreddit.color} />
      <text className="pixel-font" x={WALL + 26} y={WALL + 21} fontSize={10} fill="var(--ink)">
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

      {/* sticky notes on the wall */}
      <rect x={214} y={16} width={20} height={20} fill="#f5d442" transform="rotate(-6 224 26)" />
      <rect x={242} y={16} width={20} height={20} fill="#ff9ec4" transform="rotate(5 252 26)" />
      <rect x={270} y={16} width={20} height={20} fill="#69c9d0" transform="rotate(-3 280 26)" />

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
