import type { Cubicle as CubicleModel, Subreddit } from "@/lib/domain/types";

interface Props {
  cubicle: CubicleModel;
  subreddit: Subreddit;
  workerCount: number;
}

const WALL = 8;

/**
 * A single subreddit's cubicle, drawn top-down (bird's-eye) in pixel-art:
 * partition walls, a nameplate header, and an occupancy readout. Rendered in
 * cubicle-local coordinates (0..w, 0..h); the stage positions it in the world.
 */
export function Cubicle({ cubicle, subreddit, workerCount }: Props) {
  const { w, h } = cubicle.size;

  return (
    <g className="pixelated">
      {/* floor */}
      <rect x={0} y={0} width={w} height={h} fill="var(--floor-a)" stroke="var(--wall-dark)" strokeWidth={2} />

      {/* partition walls (top / left / right) */}
      <rect x={0} y={0} width={w} height={WALL} fill="var(--wall-light)" />
      <rect x={0} y={0} width={WALL} height={h} fill="var(--wall-light)" />
      <rect x={w - WALL} y={0} width={WALL} height={h} fill="var(--wall-light)" />
      {/* wall shading */}
      <rect x={0} y={WALL} width={w} height={2} fill="rgba(0,0,0,0.25)" />

      {/* nameplate header */}
      <rect x={WALL} y={WALL} width={w - WALL * 2} height={34} fill="var(--wall-dark)" />
      <rect x={WALL + 8} y={WALL + 7} width={9} height={20} fill={subreddit.color} />
      <text
        className="pixel-font"
        x={WALL + 26}
        y={WALL + 22}
        fontSize={11}
        fill="var(--ink)"
        dominantBaseline="middle"
      >
        {subreddit.displayName}
      </text>

      {/* occupancy dots */}
      <text
        className="pixel-font"
        x={w - WALL - 10}
        y={WALL + 22}
        fontSize={9}
        fill="var(--ink-dim)"
        textAnchor="end"
        dominantBaseline="middle"
      >
        {workerCount}
      </text>
    </g>
  );
}
