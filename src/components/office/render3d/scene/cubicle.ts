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
  /** Per-seat desk-monitor screen meshes (own material), recoloured to reflect the
      occupying post's status - trending/removed (P7). `userData.idleColor` holds the
      themed default so reconcile can reset it. */
  monitors: THREE.Mesh[];
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

/** Desk-monitor screen states (P7): idle content, or a post-status icon. */
export type MonitorStatus = "idle" | "trending" | "removed";

const MON_W = 128;
const MON_H = 76;

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Paint a monitor screen for the given status: an orange star (trending), a red X
    (removed), or a dark screen with faint content lines (idle). */
function drawMonitor(g: CanvasRenderingContext2D, status: MonitorStatus, idleHex: string) {
  const cx = MON_W / 2;
  const cy = MON_H / 2;
  g.clearRect(0, 0, MON_W, MON_H);
  if (status === "trending") {
    g.fillStyle = "#ff7a3c";
    g.fillRect(0, 0, MON_W, MON_H);
    starPath(g, cx, cy + 2, 24, 10);
    g.fillStyle = "#ffffff";
    g.fill();
  } else if (status === "removed") {
    g.fillStyle = "#d23a3a";
    g.fillRect(0, 0, MON_W, MON_H);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 10;
    g.lineCap = "round";
    const s = 18;
    g.beginPath();
    g.moveTo(cx - s, cy - s);
    g.lineTo(cx + s, cy + s);
    g.moveTo(cx + s, cy - s);
    g.lineTo(cx - s, cy + s);
    g.stroke();
  } else {
    g.fillStyle = idleHex;
    g.fillRect(0, 0, MON_W, MON_H);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(14, 20, MON_W * 0.5, 6);
    g.fillRect(14, 36, MON_W * 0.66, 6);
    g.fillRect(14, 52, MON_W * 0.4, 6);
  }
}

function fmtDelta(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${(a / 1000).toFixed(1)}k`;
  return `${a}`;
}

function caret(g: CanvasRenderingContext2D, x: number, y: number, up: boolean) {
  g.beginPath();
  if (up) {
    g.moveTo(x, y - 9);
    g.lineTo(x + 9, y + 6);
    g.lineTo(x - 9, y + 6);
  } else {
    g.moveTo(x, y + 9);
    g.lineTo(x + 9, y - 6);
    g.lineTo(x - 9, y - 6);
  }
  g.closePath();
  g.fill();
}

function bubble(g: CanvasRenderingContext2D, x: number, y: number) {
  g.beginPath();
  g.roundRect(x - 10, y - 9, 20, 13, 3);
  g.fill();
  g.beginPath();
  g.moveTo(x - 4, y + 4);
  g.lineTo(x - 9, y + 9);
  g.lineTo(x + 1, y + 4);
  g.closePath();
  g.fill();
}

/** Flash the per-poll score/comment deltas on the screen over a vivid directional
    background (green for a rise, red for a drop) so it stands out; white text with a
    caret for votes / a speech bubble for comments (per-line direction) (P8). */
function drawFlash(g: CanvasRenderingContext2D, dScore: number, dComments: number) {
  const lines: { d: number; kind: "vote" | "comment" }[] = [];
  if (dScore !== 0) lines.push({ d: dScore, kind: "vote" });
  if (dComments !== 0) lines.push({ d: dComments, kind: "comment" });
  const rising = (lines[0]?.d ?? 0) > 0;
  g.fillStyle = rising ? "#16a34a" : "#dc2626";
  g.fillRect(0, 0, MON_W, MON_H);
  g.fillStyle = "rgba(255,255,255,0.16)"; // top highlight so it reads as a lit screen
  g.fillRect(0, 0, MON_W, 7);
  const lh = 34;
  const startY = MON_H / 2 - ((lines.length - 1) * lh) / 2;
  g.font = "bold 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  lines.forEach((ln, i) => {
    const up = ln.d > 0;
    const y = startY + i * lh;
    g.fillStyle = "#ffffff";
    if (ln.kind === "vote") caret(g, 26, y, up);
    else bubble(g, 26, y);
    g.fillText(`${up ? "+" : "-"}${fmtDelta(ln.d)}`, 46, y + 1);
  });
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
  const screenAt: { x: number; z: number }[] = [];
  for (let i = 0; i < ROSTER_MAX; i++) {
    const sp = seatPosition(cubicle, i);
    const lx = (sp.x - cubicle.position.x) * S;
    const lz = (sp.y - cubicle.position.y) * S;
    seatLocal.push(new THREE.Vector3(lx, 0, lz));
    screenAt.push({ x: lx, z: lz });
    // desk toward the back (-z), a monitor neck + dark bezel (baked); the screen
    // itself is a separate recolorable mesh built after the loop (P7).
    opaque.push(
      { color: pal.desk, w: 1.5, h: 0.1, d: 0.55, x: lx, y: 0.85, z: lz - 0.8 },
      { color: pal.deskHi, w: 1.5, h: 0.04, d: 0.55, x: lx, y: 0.91, z: lz - 0.8 },
      { color: 0x0f1116, w: 0.08, h: 0.18, d: 0.06, x: lx, y: 1.0, z: lz - 1.0 }, // neck
      { color: 0x0f1116, w: 0.86, h: 0.56, d: 0.06, x: lx, y: 1.2, z: lz - 1.04 }, // bezel
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

  // Per-seat monitor screens: separate unlit meshes, each with its own canvas
  // texture, so reconcile can repaint one to the occupying post's status icon.
  // `userData.redraw(status)` repaints; `userData.status` tracks the current state.
  const monitors: THREE.Mesh[] = [];
  const idleHex = hex(pal.monitor);
  for (const s of screenAt) {
    const canvas = document.createElement("canvas");
    canvas.width = MON_W;
    canvas.height = MON_H;
    const g = canvas.getContext("2d")!;
    drawMonitor(g, "idle", idleHex);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex }); // unlit: a screen is self-lit
    mat.userData.owned = true;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.03), mat);
    screen.position.set(s.x, 1.2, s.z - 1.0);
    screen.userData.status = "idle" as MonitorStatus;
    screen.userData.flashUntil = 0;
    screen.userData.redraw = (status: MonitorStatus) => {
      drawMonitor(g, status, idleHex);
      tex.needsUpdate = true;
    };
    screen.userData.redrawFlash = (dScore: number, dComments: number) => {
      drawFlash(g, dScore, dComments);
      tex.needsUpdate = true;
    };
    group.add(screen);
    monitors.push(screen);
  }

  return { group, seatLocal, monitors };
}
