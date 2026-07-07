import * as THREE from "three";
import type { Cubicle } from "@/lib/domain/types";
import { seatPosition } from "@/lib/data/layout";
import { ROSTER_MAX } from "@/lib/domain/constants";
import { WORLD_SCALE, mergeBoxes, type BoxSpec, type Palette } from "./kit";

/** Waist-height frosted partitions so seated workers stay visible over them (P0). */
const WALL_H = 1.35;
const WALL_T = 0.12;

/** Name-rug canvas size; the rug plane keeps this aspect so text isn't stretched. */
const RUG_CANVAS_W = 512;
const RUG_CANVAS_H = 104;

export interface BuiltCubicle {
  group: THREE.Group;
  /** Local (cubicle-relative) seat centres, indexed by seatIndex, for placing workers. */
  seatLocal: THREE.Vector3[];
}

/** What the cubicle needs to render its name rug. */
export interface CubicleLabel {
  name: string;
  accent: string;
}

/**
 * A procedurally drawn floor mat carrying a nameplate in the 2D cubicle's style:
 * a dark `--name-bg` plate with an accent colour chip on the left, then the
 * subreddit name in `--ink`. Canvas texture (no external asset). Oriented to read
 * facing into the cubicle, so it sits upright when laid flat under the iso camera.
 */
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function makeRugTexture(label: CubicleLabel, pal: Palette): THREE.CanvasTexture {
  const W = RUG_CANVAS_W;
  const H = RUG_CANVAS_H;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  // mat base (opaque, so no transparency sorting on the floor)
  g.fillStyle = hex(pal.rugMat);
  g.fillRect(0, 0, W, H);

  // nameplate plate (--name-bg), inset with rounded corners
  const px = 14;
  const py = 16;
  const pw = W - px * 2;
  const ph = H - py * 2;
  g.fillStyle = hex(pal.nameBg);
  g.beginPath();
  g.roundRect(px, py, pw, ph, 11);
  g.fill();

  // accent colour chip on the left
  const chipW = 26;
  const chipH = ph * 0.56;
  g.fillStyle = label.accent;
  g.beginPath();
  g.roundRect(px + 16, py + (ph - chipH) / 2, chipW, chipH, 4);
  g.fill();

  // subreddit name, left-aligned after the chip
  const textX = px + 16 + chipW + 16;
  g.fillStyle = hex(pal.ink);
  g.font = "600 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(label.name, textX, py + ph / 2 + 1, W - textX - 22);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Build one cubicle: a floor tile + per-seat desk fixtures (opaque, merged into a
 * single mesh), three frosted walls (back + two sides, front open toward the
 * camera), and a name rug laid flat on the floor at the open front entrance.
 * Positioned at the cubicle's world corner mapped to the ground: (x, y) -> (x, 0, y).
 *
 * The rug replaces the old floating name plate: it lies on the floor (angled with
 * the ground under the iso camera), so it never crowds or occludes the workers and
 * is excluded from the click raycast.
 */
export function buildCubicle(
  cubicle: Cubicle,
  materials: { opaque: THREE.Material; frost: THREE.Material },
  label: CubicleLabel,
  pal: Palette,
): BuiltCubicle {
  const S = WORLD_SCALE;
  const W = cubicle.size.w * S;
  const D = cubicle.size.h * S;

  const opaque: BoxSpec[] = [
    // floor tile (slightly proud of the ground so the cell reads)
    { color: pal.floorTile, w: W, h: 0.06, d: D, x: W / 2, y: 0.03, z: D / 2 },
  ];

  const seatLocal: THREE.Vector3[] = [];
  for (let i = 0; i < ROSTER_MAX; i++) {
    const sp = seatPosition(cubicle, i);
    const lx = (sp.x - cubicle.position.x) * S;
    const lz = (sp.y - cubicle.position.y) * S;
    seatLocal.push(new THREE.Vector3(lx, 0, lz));
    // desk + monitor toward the back (-z)
    opaque.push(
      { color: pal.desk, w: 1.5, h: 0.1, d: 0.55, x: lx, y: 0.85, z: lz - 0.8 },
      { color: pal.deskHi, w: 1.5, h: 0.04, d: 0.55, x: lx, y: 0.91, z: lz - 0.8 },
      { color: pal.monitor, w: 0.8, h: 0.5, d: 0.08, x: lx, y: 1.2, z: lz - 1.02 },
    );
    // office chair, centred just behind the worker (+z): cushioned seat + backrest,
    // a gas-lift column, a metal cross base and four caster feet on the floor.
    const cz = lz + 0.05;
    opaque.push(
      { color: pal.chair, w: 0.6, h: 0.12, d: 0.58, x: lx, y: 0.56, z: cz }, // seat
      { color: pal.chair, w: 0.6, h: 0.52, d: 0.12, x: lx, y: 0.82, z: cz + 0.27 }, // backrest
      { color: pal.metal, w: 0.1, h: 0.34, d: 0.1, x: lx, y: 0.36, z: cz }, // column
      { color: pal.metal, w: 0.72, h: 0.05, d: 0.12, x: lx, y: 0.12, z: cz }, // base leg (x)
      { color: pal.metal, w: 0.12, h: 0.05, d: 0.72, x: lx, y: 0.12, z: cz }, // base leg (z)
      { color: pal.chair, w: 0.12, h: 0.1, d: 0.12, x: lx - 0.34, y: 0.06, z: cz }, // caster
      { color: pal.chair, w: 0.12, h: 0.1, d: 0.12, x: lx + 0.34, y: 0.06, z: cz }, // caster
      { color: pal.chair, w: 0.12, h: 0.1, d: 0.12, x: lx, y: 0.06, z: cz - 0.34 }, // caster
      { color: pal.chair, w: 0.12, h: 0.1, d: 0.12, x: lx, y: 0.06, z: cz + 0.34 }, // caster
    );
  }

  const frost: BoxSpec[] = [
    { color: pal.wallFrost, w: W, h: WALL_H, d: WALL_T, x: W / 2, y: WALL_H / 2, z: 0 }, // back
    { color: pal.wallFrost, w: WALL_T, h: WALL_H, d: D, x: 0, y: WALL_H / 2, z: D / 2 }, // left
    { color: pal.wallFrost, w: WALL_T, h: WALL_H, d: D, x: W, y: WALL_H / 2, z: D / 2 }, // right
  ];

  const group = new THREE.Group();
  group.position.set(cubicle.position.x * S, 0, cubicle.position.y * S);
  group.add(new THREE.Mesh(mergeBoxes(opaque), materials.opaque));
  group.add(new THREE.Mesh(mergeBoxes(frost), materials.frost));

  // Name rug: a flat textured mat at the open front (+z) entrance, lying on the
  // floor. Its material+texture are cubicle-owned (flagged for disposal on teardown).
  const rugW = W * 0.72;
  const rugD = rugW * (RUG_CANVAS_H / RUG_CANVAS_W); // keep the canvas aspect (no stretch)
  const rugTex = makeRugTexture(label, pal);
  const rugMat = new THREE.MeshBasicMaterial({ map: rugTex });
  rugMat.userData.owned = true;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(rugW, rugD), rugMat);
  rug.rotation.x = -Math.PI / 2; // lay it flat on the floor
  rug.position.set(W / 2, 0.07, D - rugD / 2 - 0.15);
  group.add(rug);

  return { group, seatLocal };
}
