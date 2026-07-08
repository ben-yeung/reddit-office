import * as THREE from "three";
import type { Layout } from "@/lib/domain/types";
import { decorWalkers } from "@/lib/office/decor";
import { appearanceFor } from "@/lib/worker/appearance";
import { hashString } from "@/lib/util/rng";
import { WORLD_SCALE, disposeGroup } from "../scene/kit";
import { buildWorkerPoses } from "../scene/worker";

/**
 * Ambient hallway commuters (P5a): a voxel worker per interior aisle, driven along
 * the same `decorWalkers()` paths the 2D office uses. Each fades in at one end,
 * walks to the other (facing the direction of travel, legs swinging), fades out,
 * pauses, then walks again - sometimes reversed. Like the 2D office, a fresh face
 * (random seeded appearance + neutral shirt) is generated on each trip. Not tied to
 * any post; gated by the `ambient` policy, frozen while a modal is open.
 */

const STEP_SPEED = 9;
const STEP_AMP = 0.22;
const FADE = 0.12; // fraction of the trip spent fading in / out at each end

/** Neutral office shirt tones - ambient NPCs aren't tied to a subreddit accent. */
const NEUT = [0x8a90a0, 0x9a8f86, 0x7f9a8f, 0xa0929c, 0x8f96a6];

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

interface Body {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}

interface Walker extends Body {
  material: THREE.MeshLambertMaterial;
  /** Path endpoints in scene units (world * WORLD_SCALE). */
  from: THREE.Vector2;
  to: THREE.Vector2;
  dur: number;
  phase: number;
  /** Clock time this trip started; `pauseUntil` gates the between-trip idle. */
  startT: number;
  pauseUntil: number;
  rev: boolean;
}

export interface WalkerSystem {
  group: THREE.Group;
  walkers: Walker[];
  dispose(): void;
}

/** A fresh commuter body: standing rig with a random seeded appearance + neutral
    shirt, reusing the walker's (transparent) material so it can fade. */
function makeBody(material: THREE.MeshLambertMaterial): Body {
  const seed = `npc-${Math.floor(Math.random() * 1e9)}`;
  const shirt = NEUT[hashString(seed) % NEUT.length];
  const poses = buildWorkerPoses(hex(shirt), material, appearanceFor(seed));
  poses.seated.visible = false;
  poses.standing.visible = true;
  poses.group.visible = false;
  return { group: poses.group, legL: poses.legL, legR: poses.legR };
}

/** Replace a walker's body with a fresh face (called on each new trip). */
function respawnBody(parent: THREE.Group, w: Walker): void {
  parent.remove(w.group);
  disposeGroup(w.group); // old geometry; the shared per-walker material is reused
  const body = makeBody(w.material);
  parent.add(body.group);
  w.group = body.group;
  w.legL = body.legL;
  w.legR = body.legR;
}

export function buildWalkers(layout: Layout): WalkerSystem {
  const S = WORLD_SCALE;
  const group = new THREE.Group();
  const walkers: Walker[] = [];

  for (const path of decorWalkers(layout)) {
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
    });
    const body = makeBody(material);
    group.add(body.group);
    const ph = hashString(path.seed); // per-aisle stagger (path is deterministic)
    const start = ((ph >>> 8) % 300) / 100; // 0-3s staggered first trip
    walkers.push({
      ...body,
      material,
      from: new THREE.Vector2(path.x0 * S, path.y0 * S),
      to: new THREE.Vector2(path.x1 * S, path.y1 * S),
      dur: path.dur,
      phase: (ph % 100) / 15,
      startT: start,
      pauseUntil: start,
      rev: false,
    });
  }

  return {
    group,
    walkers,
    dispose() {
      for (const w of walkers) {
        disposeGroup(w.group);
        w.material.dispose();
      }
    },
  };
}

/** Advance every commuter one frame (call only while `ambient` and not paused). */
export function advanceWalkers(sys: WalkerSystem, t: number): void {
  for (const w of sys.walkers) {
    if (t < w.pauseUntil) {
      w.group.visible = false;
      continue;
    }
    const u = (t - w.startT) / w.dur;
    if (u >= 1) {
      // Trip finished: idle a random beat, spawn a fresh face, then set off again
      // (sometimes reversed) - matching the 2D hallway commuters.
      w.pauseUntil = t + 0.4 + Math.random() * 2.6;
      w.startT = w.pauseUntil;
      if (Math.random() < 0.5) w.rev = !w.rev;
      respawnBody(sys.group, w);
      continue;
    }
    w.group.visible = true;
    const from = w.rev ? w.to : w.from;
    const to = w.rev ? w.from : w.to;
    const dx = to.x - from.x;
    const dz = to.y - from.y;
    w.group.position.set(from.x + dx * u, 0, from.y + dz * u);
    if (dx !== 0 || dz !== 0) w.group.rotation.y = Math.atan2(dx, dz);
    const swing = Math.sin(t * STEP_SPEED + w.phase) * STEP_AMP;
    w.legL.rotation.x = swing;
    w.legR.rotation.x = -swing;
    // Fade in over the first stretch, out over the last, full in between.
    w.material.opacity = u < FADE ? u / FADE : u > 1 - FADE ? (1 - u) / FADE : 1;
  }
}
