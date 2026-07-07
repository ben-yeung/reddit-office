import * as THREE from "three";
import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { Cubicle, Vec2, Worker as WorkerModel } from "@/lib/domain/types";
import { seatPosition, type Bounds } from "@/lib/data/layout";
import { walkIn, walkOut, walkBetween } from "@/lib/office/walkout";
import { WORLD_SCALE, disposeGroup } from "./scene/kit";
import type { BuiltCubicle } from "./scene/cubicle";
import { buildWorkerPoses } from "./scene/worker";
import { formatScore, makeScoreLabel } from "./labels";

/** An in-flight aisle walk. Positions are precomputed in cubicle-local scene units.
    "in" = arrival, "out" = departure (with fade), "move" = shuffle migration. */
interface WorkerAnim {
  kind: "in" | "out" | "move";
  start: number;
  duration: number;
  px: number[];
  pz: number[];
  pt: number[];
  /** Walk-out only: a 1->0 track (opacity in 2D) applied as a shrink-out here. */
  fade?: { v: number[]; t: number[] };
}

interface WorkerHandle {
  group: THREE.Group;
  seated: THREE.Mesh;
  standing: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  scoreEl: HTMLElement;
  /** Resting seat position (scene units, cubicle-local). */
  seat: THREE.Vector3;
  phase: number;
  anim: WorkerAnim | null;
}

/** Per-cubicle scene state: the built cubicle + its live worker roster. */
export interface CubicleModel {
  cubicle: Cubicle;
  built: BuiltCubicle;
  workers: Map<string, WorkerHandle>;
}

const S = WORLD_SCALE;
const SCORE_Y = 2.3;

/** Walk cycle: leg swing rate (rad/s) and amplitude (rad) - subtle, brisk steps. */
const STEP_SPEED = 9;
const STEP_AMP = 0.22;

/** Cubicle-local (unscaled) seat offset - the coordinate space walkout.ts expects. */
function seatOffset(cubicle: Cubicle, seatIndex: number): Vec2 {
  const sp = seatPosition(cubicle, seatIndex);
  return { x: sp.x - cubicle.position.x, y: sp.y - cubicle.position.y };
}

interface PathSample {
  x: number;
  z: number;
  /** Direction of the active segment (for facing), unnormalized. */
  dx: number;
  dz: number;
}

function samplePath(px: number[], pz: number[], pt: number[], u: number): PathSample {
  const last = px.length - 1;
  if (u <= 0) return { x: px[0], z: pz[0], dx: px[1] - px[0], dz: pz[1] - pz[0] };
  if (u >= 1) {
    return { x: px[last], z: pz[last], dx: px[last] - px[last - 1], dz: pz[last] - pz[last - 1] };
  }
  let i = 0;
  while (i < pt.length - 1 && pt[i + 1] < u) i++;
  const span = pt[i + 1] - pt[i] || 1;
  const f = (u - pt[i]) / span;
  return {
    x: px[i] + (px[i + 1] - px[i]) * f,
    z: pz[i] + (pz[i + 1] - pz[i]) * f,
    dx: px[i + 1] - px[i],
    dz: pz[i + 1] - pz[i],
  };
}

function sampleScalar(v: number[], t: number[], u: number): number {
  if (u <= 0) return v[0];
  const last = v.length - 1;
  if (u >= 1) return v[last];
  let i = 0;
  while (i < t.length - 1 && t[i + 1] < u) i++;
  const span = t[i + 1] - t[i] || 1;
  return v[i] + (v[i + 1] - v[i]) * ((u - t[i]) / span);
}

function toStanding(h: WorkerHandle) {
  h.seated.visible = false;
  h.standing.visible = true;
}

function toSeated(h: WorkerHandle) {
  h.standing.visible = false;
  h.seated.visible = true;
  h.group.scale.setScalar(1);
  h.group.rotation.y = 0; // face the desk again
  h.legL.rotation.x = 0;
  h.legR.rotation.x = 0;
}

function startWalkIn(h: WorkerHandle, id: string, cubicle: Cubicle, bounds: Bounds, now: number) {
  const seat = seatOffset(cubicle, workerSeatIndex(h));
  const wi = walkIn(id, seat, cubicle, bounds);
  h.anim = {
    kind: "in",
    start: now,
    duration: wi.duration,
    // offsets relative to the seat -> seat position + offset (scaled)
    px: wi.x.map((x) => h.seat.x + x * S),
    pz: wi.y.map((y) => h.seat.z + y * S),
    pt: wi.times,
  };
  toStanding(h);
  h.group.position.set(h.anim.px[0], 0, h.anim.pz[0]);
}

function startWalkOut(h: WorkerHandle, id: string, cubicle: Cubicle, bounds: Bounds, now: number) {
  const seat = seatOffset(cubicle, workerSeatIndex(h));
  const wo = walkOut(id, seat, cubicle, bounds);
  h.anim = {
    kind: "out",
    start: now,
    duration: wo.duration,
    // cubicle-local absolute coords (scaled)
    px: wo.x.map((x) => x * S),
    pz: wo.y.map((y) => y * S),
    pt: wo.times,
    fade: { v: wo.opacity, t: wo.opacityTimes },
  };
  toStanding(h);
}

/** Seat index recovered from the handle (stored on the group userData). */
function workerSeatIndex(h: WorkerHandle): number {
  return (h.group.userData.seatIndex as number) ?? 0;
}

/**
 * Start a shuffle migration walk: from the worker's old desk to its new one (the
 * cubicle has jumped to a new grid cell). Uses walkBetween, whose offsets are
 * relative to the NEW seat, so - like a walk-in - the worker starts at the old
 * location and walks to its (unchanged-local) seat. `fromPos` is the pre-shuffle
 * cubicle world position; `cubicle` is the new one.
 */
export function startMigrate(
  h: WorkerHandle,
  id: string,
  cubicle: Cubicle,
  fromPos: Vec2 | undefined,
  now: number,
) {
  const wm = fromPos ? walkBetween(id, seatOffset(cubicle, workerSeatIndex(h)), fromPos, cubicle.position) : null;
  if (!wm) {
    // Cubicle didn't actually move: just settle at the (repositioned) seat.
    h.anim = null;
    toSeated(h);
    h.group.position.set(h.seat.x, 0, h.seat.z);
    return;
  }
  h.anim = {
    kind: "move",
    start: now,
    duration: wm.duration,
    px: wm.x.map((x) => h.seat.x + x * S),
    pz: wm.y.map((y) => h.seat.z + y * S),
    pt: wm.times,
  };
  toStanding(h);
  h.group.position.set(h.anim.px[0], 0, h.anim.pz[0]);
}

/**
 * Diff a cubicle's roster into the scene:
 * - a worker that left starts a WALK-OUT (stand up, walk the aisles to the grid
 *   edge, shrink away) rather than vanishing; it stays in the map until the walk
 *   finishes (the loop disposes it). useOffice locks the id out for the walk, so
 *   it can't re-add mid-stride.
 * - a newcomer during the arrival window WALKS IN from a hallway edge; otherwise it
 *   simply takes its seat.
 * - everyone present has their score refreshed.
 */
export function reconcileWorkers(
  model: CubicleModel,
  workers: WorkerModel[],
  material: THREE.Material,
  shirtColor: THREE.ColorRepresentation,
  bounds: Bounds,
  now: number,
  arriving: boolean,
): void {
  const next = new Set(workers.map((w) => w.id));

  // Departures -> walk-out (skip if already walking out).
  for (const [id, h] of model.workers) {
    if (!next.has(id) && h.anim?.kind !== "out") {
      startWalkOut(h, id, model.cubicle, bounds, now);
    }
  }

  for (const w of workers) {
    let h = model.workers.get(w.id);
    if (!h) {
      const poses = buildWorkerPoses(shirtColor, material);
      poses.group.userData.worker = w;
      poses.group.userData.seatIndex = w.seatIndex;
      const seat = model.built.seatLocal[w.seatIndex] ?? model.built.seatLocal[0];
      const score = makeScoreLabel(formatScore(w.score)) as CSS2DObject;
      score.position.set(0, SCORE_Y, 0);
      poses.group.add(score);
      h = {
        group: poses.group,
        seated: poses.seated,
        standing: poses.standing,
        legL: poses.legL,
        legR: poses.legR,
        scoreEl: score.element,
        seat: seat.clone(),
        phase: (w.seatIndex * 1.7) % (Math.PI * 2),
        anim: null,
      };
      model.workers.set(w.id, h);
      model.built.group.add(poses.group);
      if (arriving) {
        startWalkIn(h, w.id, model.cubicle, bounds, now);
      } else {
        h.group.position.set(seat.x, 0, seat.z);
      }
    } else {
      h.group.userData.worker = w; // keep the latest model for picking
      h.scoreEl.textContent = formatScore(w.score);
    }
  }
}

/**
 * Advance every worker one frame: progress in-flight walks (finishing a walk-in by
 * sitting, a walk-out by disposal), and apply the idle bob to seated workers.
 * Called from the render loop with the shared clock time.
 */
export function advanceWorkers(cubicles: Map<string, CubicleModel>, t: number, paused: boolean) {
  for (const model of cubicles.values()) {
    for (const [id, h] of model.workers) {
      if (!h.anim) {
        // idle: seated at the desk with a subtle bob (frozen while paused)
        h.group.position.set(h.seat.x, paused ? 0 : Math.sin(t * 2 + h.phase) * 0.03, h.seat.z);
        continue;
      }
      const u = (t - h.anim.start) / h.anim.duration;
      if (u >= 1) {
        if (h.anim.kind === "out") {
          model.built.group.remove(h.group);
          disposeGroup(h.group);
          model.workers.delete(id);
        } else {
          // "in" / "move": arrive and sit down at the seat.
          h.anim = null;
          toSeated(h);
          h.group.position.set(h.seat.x, 0, h.seat.z);
        }
        continue;
      }
      const p = samplePath(h.anim.px, h.anim.pz, h.anim.pt, u);
      h.group.position.set(p.x, 0, p.z);
      // Face the direction of travel. The standing figure's toes lead (+z is its
      // visual front), so yaw = atan2(dx, dz).
      if (p.dx !== 0 || p.dz !== 0) h.group.rotation.y = Math.atan2(p.dx, p.dz);
      // Subtle leg walk cycle (opposite phase per leg).
      const swing = Math.sin(t * STEP_SPEED + h.phase) * STEP_AMP;
      h.legL.rotation.x = swing;
      h.legR.rotation.x = -swing;
      if (h.anim.fade) h.group.scale.setScalar(sampleScalar(h.anim.fade.v, h.anim.fade.t, u));
    }
  }
}
