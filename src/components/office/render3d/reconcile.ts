import * as THREE from "three";
import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { Cubicle, Vec2, Worker as WorkerModel, WorkerEventType } from "@/lib/domain/types";
import type { Pulse } from "@/lib/office/useOffice";
import { seatPosition, type Bounds } from "@/lib/data/layout";
import { walkIn, walkOut, walkBetween } from "@/lib/office/walkout";
import { appearanceFor } from "@/lib/worker/appearance";
import { WORLD_SCALE, disposeGroup } from "./scene/kit";
import type { BuiltCubicle, MonitorStatus } from "./scene/cubicle";
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
  seated: THREE.Object3D;
  standing: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Shoulder-pivoted seated arms, raised for the vote/comment hands-up reaction. */
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  scoreEl: HTMLElement;
  /** Resting seat position (scene units, cubicle-local). */
  seat: THREE.Vector3;
  phase: number;
  anim: WorkerAnim | null;
  /** A per-worker transparent material, created for the walk-out opacity fade
      (matching the ambient commuters); disposed when the worker is removed. */
  fadeMat: THREE.MeshLambertMaterial | null;
  /** A one-shot event reaction (surge/new-post/trending pop), or null. */
  fx: { type: WorkerEventType; start: number } | null;
  /** Last pulse seq applied, so an event fires its reaction exactly once. */
  fxSeq: number;
  /** Last-seen score/comments, to diff per-poll deltas that flash on the monitor (P8). */
  score: number;
  comments: number;
  /** Active score-label flash (colour + arrow) from a per-poll change, or null. */
  scoreFlash: { dir: number; until: number } | null;
  /** Active hands-up reaction to a per-poll change, or null. */
  cheer: { start: number } | null;
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

/** One-shot event reaction duration (s). */
const FX_DUR = 0.6;

/** How long a per-poll vote/comment delta stays flashed on the monitor (s). */
const FLASH_DUR = 1.6;

/** Hands-up reaction to a per-poll change: duration (s) and peak arm angle (rad). */
const CHEER_DUR = 0.7;
const CHEER_MAX = 2.2;

/** Update a worker's score label in place, applying the per-poll flash (green/red +
    a direction arrow) while active, else the plain themed readout. */
function refreshScoreLabel(h: WorkerHandle, now: number): void {
  const flash = h.scoreFlash && h.scoreFlash.until > now ? h.scoreFlash : null;
  const txt = formatScore(h.score);
  const el = h.scoreEl;
  if (flash) {
    const up = flash.dir > 0;
    el.textContent = `${up ? "▲" : "▼"} ${txt}`;
    el.style.color = up ? "#43c47a" : "#ff5a5a";
    el.style.fontWeight = "700";
  } else {
    el.textContent = txt;
    el.style.color = "";
    el.style.fontWeight = "";
  }
}

/** How long the walk to a new desk takes on an intra-cubicle rerank (s), matching 2D. */
const SEAT_WALK_S = 0.55;

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
  // Swap to a per-worker transparent material so the exit fades out (matching the
  // ambient commuters) instead of shrinking. Disposed when the worker is removed.
  const fadeMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
  h.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = fadeMat;
  });
  h.fadeMat = fadeMat;
  h.group.scale.setScalar(1);
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
  shirtColor: string,
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
      const poses = buildWorkerPoses(shirtColor, material, appearanceFor(w.id));
      poses.group.userData.worker = w;
      poses.group.userData.seatIndex = w.seatIndex;
      const seat = model.built.seatLocal[w.seatIndex] ?? model.built.seatLocal[0];
      const score = makeScoreLabel(formatScore(w.score)) as CSS2DObject;
      score.position.set(0, SCORE_Y, 0);
      poses.group.add(score);
      // The score CSS2DObject itself (not just its element): hidden via `.visible`
      // while the hover card shows, since CSS2DRenderer resets element display each
      // frame from `.visible`.
      poses.group.userData.scoreObj = score;
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
        fx: null,
        fxSeq: 0,
        fadeMat: null,
        score: w.score,
        comments: w.comments,
        scoreFlash: null,
        cheer: null,
        armL: poses.armL,
        armR: poses.armR,
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
      // P8: diff the per-poll score/comment change and react - flash the score label
      // (colour + arrow), throw the worker's hands up, and flash the desk monitor.
      const dScore = w.score - h.score;
      const dComments = w.comments - h.comments;
      h.score = w.score;
      h.comments = w.comments;
      if (dScore !== 0) h.scoreFlash = { dir: Math.sign(dScore), until: now + FLASH_DUR };
      refreshScoreLabel(h, now);
      if (dScore !== 0 || dComments !== 0) {
        h.cheer = { start: now };
        const m = model.built.monitors[w.seatIndex];
        if (m) {
          (m.userData.redrawFlash as (a: number, b: number) => void)(dScore, dComments);
          m.userData.flashUntil = now + FLASH_DUR;
        }
      }
      // Rerank: the roster reassigned this worker a new seat (hysteresis is applied
      // in the engine, so any change is intended). Walk it to the new desk within
      // the cubicle - a short straight stride - when it's idle (not mid-walk).
      const shownSeat = (h.group.userData.seatIndex as number) ?? 0;
      if (w.seatIndex !== shownSeat && !h.anim) {
        const from = h.seat;
        const to = model.built.seatLocal[w.seatIndex] ?? from;
        h.anim = {
          kind: "move",
          start: now,
          duration: SEAT_WALK_S,
          px: [from.x, to.x],
          pz: [from.z, to.z],
          pt: [0, 1],
        };
        h.seat = to.clone();
        h.group.userData.seatIndex = w.seatIndex;
        toStanding(h);
        h.group.position.set(from.x, 0, from.z);
      }
    }
  }

  // P7: reflect each occupied seat's post status on its desk-monitor screen. Compute
  // the final status per seat, then repaint only the screens whose status changed.
  const monitors = model.built.monitors;
  const status: MonitorStatus[] = monitors.map(() => "idle");
  for (const w of workers) {
    if (w.seatIndex < status.length) {
      status[w.seatIndex] = w.removed ? "removed" : w.trending ? "trending" : "idle";
    }
  }
  monitors.forEach((m, i) => {
    const flashing = ((m.userData.flashUntil as number) ?? 0) > now;
    const changed = m.userData.status !== status[i];
    m.userData.status = status[i];
    // While a delta flash is showing, only update the target status; the render
    // loop repaints the icon when the flash expires.
    if (changed && !flashing) {
      (m.userData.redraw as (s: MonitorStatus) => void)(status[i]);
    }
  });
}

/**
 * Advance every worker one frame: progress in-flight walks (finishing a walk-in by
 * sitting, a walk-out by disposal), and apply the idle bob to seated workers.
 * Called from the render loop with the shared clock time.
 */
export function advanceWorkers(cubicles: Map<string, CubicleModel>, t: number, paused: boolean) {
  for (const model of cubicles.values()) {
    for (const [id, h] of model.workers) {
      // Expire the per-poll score-label flash back to the plain readout.
      if (h.scoreFlash && t >= h.scoreFlash.until) {
        h.scoreFlash = null;
        refreshScoreLabel(h, t);
      }
      if (!h.anim) {
        // idle: seated at the desk with a subtle bob (frozen while paused)
        let y = paused ? 0 : Math.sin(t * 2 + h.phase) * 0.03;
        let scale = 1;
        let roll = 0;
        // Hands-up reaction to a vote/comment change: raise both arms in a V, then
        // lower them (frozen while paused).
        let armAngle = 0;
        if (h.cheer) {
          const c = (t - h.cheer.start) / CHEER_DUR;
          if (c >= 1) h.cheer = null;
          else if (!paused) armAngle = Math.sin(Math.PI * c) * CHEER_MAX;
        }
        h.armL.rotation.z = -armAngle;
        h.armR.rotation.z = armAngle;
        // One-shot event reaction overlaid on the idle pose.
        if (h.fx) {
          const e = (t - h.fx.start) / FX_DUR;
          if (e >= 1) {
            h.fx = null;
          } else if (h.fx.type === "surge") {
            scale = 1 + 0.35 * Math.sin(Math.PI * e); // pop up + a little hop
            y += 0.15 * Math.sin(Math.PI * e);
          } else if (h.fx.type === "new-post") {
            scale = 1 + 0.22 * Math.sin(Math.PI * e);
          } else if (h.fx.type === "trending") {
            roll = 0.22 * Math.sin(e * Math.PI * 3) * (1 - e); // decaying wobble
          }
        }
        h.group.position.set(h.seat.x, y, h.seat.z);
        h.group.scale.setScalar(scale);
        h.group.rotation.z = roll;
        continue;
      }
      const u = (t - h.anim.start) / h.anim.duration;
      if (u >= 1) {
        if (h.anim.kind === "out") {
          model.built.group.remove(h.group);
          disposeGroup(h.group);
          if (h.fadeMat) h.fadeMat.dispose();
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
      if (h.anim.fade && h.fadeMat) {
        h.fadeMat.opacity = sampleScalar(h.anim.fade.v, h.anim.fade.t, u);
      }
    }
    // P8: revert any expired per-poll delta flash back to the status icon.
    for (const m of model.built.monitors) {
      const fu = (m.userData.flashUntil as number) ?? 0;
      if (fu && t >= fu) {
        m.userData.flashUntil = 0;
        (m.userData.redraw as (s: MonitorStatus) => void)(m.userData.status as MonitorStatus);
      }
    }
  }
}

/**
 * Trigger one-shot event reactions from the latest pulses (keyed by worker id):
 * arms each affected worker's `fx` once per pulse seq, which the render loop then
 * animates (surge/new-post pop, trending wobble). "removed" pulses are ignored -
 * the walk-out is that worker's exit.
 */
export function applyPulses(
  cubicles: Map<string, CubicleModel>,
  pulses: Record<string, Pulse>,
  now: number,
) {
  for (const model of cubicles.values()) {
    for (const [id, h] of model.workers) {
      const p = pulses[id];
      if (p && p.type !== "removed" && h.fxSeq !== p.seq) {
        h.fxSeq = p.seq;
        h.fx = { type: p.type, start: now };
      }
    }
  }
}
