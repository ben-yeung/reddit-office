import * as THREE from "three";
import { shade, type WorkerAppearance } from "@/lib/worker/appearance";
import { PALETTE, mergeBoxes, type BoxSpec } from "./kit";

/**
 * Voxel workers come in two poses that swap as a unit (an 8-bit "frame change",
 * not smooth IK): a SEATED pose for resting at the desk, and a STANDING pose for
 * walking the aisles. Both face -z (toward the desk).
 *
 * Appearance (hair style + colour, skin, shirt shade, accessory) is seeded per
 * post id via the shared `appearanceFor`, so a given post looks identical in the
 * 2D and 3D offices. Each pose is one merged, vertex-coloured mesh (one draw call);
 * desk props stay 2D-only (3D desks are shared seat furniture, not per-worker).
 */
const SEAT_Y = 0.72;
const GLASSES = "#20242c";
const EARBUD = "#f6f8fc";

/** Head + styled hair + accessory, centred at (0, hy, hz). Shared by both poses. */
function headBoxes(a: WorkerAppearance, hy: number, hz: number): BoxSpec[] {
  const boxes: BoxSpec[] = [{ color: a.skin, w: 0.42, h: 0.42, d: 0.42, x: 0, y: hy, z: hz }];
  const hairTop = hy + 0.23;
  const cap: BoxSpec = { color: a.hair, w: 0.46, h: 0.16, d: 0.46, x: 0, y: hairTop, z: hz };

  switch (a.style) {
    case "bald":
      break;
    case "short":
      boxes.push(cap);
      break;
    case "long":
      boxes.push(cap);
      // hair down the back (the face is -z, so the fall is on the +z side)
      boxes.push({ color: a.hair, w: 0.46, h: 0.42, d: 0.14, x: 0, y: hy - 0.02, z: hz + 0.2 });
      break;
    case "bun":
      boxes.push(cap);
      boxes.push({ color: a.hair, w: 0.18, h: 0.18, d: 0.18, x: 0, y: hairTop + 0.12, z: hz + 0.12 });
      break;
    case "spiky":
      boxes.push(cap);
      boxes.push({ color: a.hair, w: 0.1, h: 0.14, d: 0.1, x: -0.12, y: hairTop + 0.12, z: hz });
      boxes.push({ color: a.hair, w: 0.1, h: 0.16, d: 0.1, x: 0, y: hairTop + 0.13, z: hz });
      boxes.push({ color: a.hair, w: 0.1, h: 0.14, d: 0.1, x: 0.12, y: hairTop + 0.12, z: hz });
      break;
    case "beanie":
      boxes.push({ color: a.cap, w: 0.48, h: 0.24, d: 0.48, x: 0, y: hairTop - 0.02, z: hz });
      boxes.push({ color: shade(a.cap, -0.3), w: 0.5, h: 0.07, d: 0.5, x: 0, y: hairTop - 0.12, z: hz });
      break;
    case "noogler": {
      // The Google "Noogler" propeller beanie: a light cap crowned with four
      // colour panels (blue/red/yellow/green) and a little propeller on top.
      boxes.push({ color: "#f4f6fb", w: 0.48, h: 0.16, d: 0.48, x: 0, y: hairTop - 0.02, z: hz });
      const py = hairTop + 0.06;
      boxes.push({ color: 0x4285f4, w: 0.22, h: 0.12, d: 0.22, x: -0.12, y: py, z: hz - 0.12 });
      boxes.push({ color: 0xea4335, w: 0.22, h: 0.12, d: 0.22, x: 0.12, y: py, z: hz - 0.12 });
      boxes.push({ color: 0xfbbc05, w: 0.22, h: 0.12, d: 0.22, x: -0.12, y: py, z: hz + 0.12 });
      boxes.push({ color: 0x34a853, w: 0.22, h: 0.12, d: 0.22, x: 0.12, y: py, z: hz + 0.12 });
      // propeller: hub + two crossed blades
      boxes.push({ color: GLASSES, w: 0.06, h: 0.1, d: 0.06, x: 0, y: hairTop + 0.16, z: hz });
      boxes.push({ color: "#e7e2d8", w: 0.32, h: 0.035, d: 0.07, x: 0, y: hairTop + 0.22, z: hz });
      boxes.push({ color: "#e7e2d8", w: 0.07, h: 0.035, d: 0.32, x: 0, y: hairTop + 0.22, z: hz });
      break;
    }
  }

  switch (a.accessory) {
    case "glasses":
      boxes.push({ color: GLASSES, w: 0.44, h: 0.06, d: 0.06, x: 0, y: hy + 0.02, z: hz - 0.21 });
      break;
    case "headphones":
      boxes.push({ color: GLASSES, w: 0.5, h: 0.07, d: 0.14, x: 0, y: hy + 0.25, z: hz }); // band
      boxes.push({ color: GLASSES, w: 0.08, h: 0.18, d: 0.18, x: -0.24, y: hy, z: hz }); // cups
      boxes.push({ color: GLASSES, w: 0.08, h: 0.18, d: 0.18, x: 0.24, y: hy, z: hz });
      break;
    case "earbuds":
      boxes.push({ color: EARBUD, w: 0.06, h: 0.06, d: 0.06, x: -0.23, y: hy, z: hz });
      boxes.push({ color: EARBUD, w: 0.06, h: 0.06, d: 0.06, x: 0.23, y: hy, z: hz });
      break;
    case "none":
      break;
  }
  return boxes;
}

/** Seated: pelvis on the chair, thighs forward (-z), shins down, torso upright. */
export function seatedBoxes(shirtColor: string, a: WorkerAppearance): BoxSpec[] {
  const s = shade(shirtColor, a.shirtPct);
  const p = PALETTE.pants;
  return [
    { color: s, w: 0.56, h: 0.24, d: 0.36, x: 0, y: SEAT_Y, z: 0.02 },
    { color: s, w: 0.6, h: 0.6, d: 0.36, x: 0, y: SEAT_Y + 0.42, z: 0.04 },
    { color: p, w: 0.22, h: 0.2, d: 0.56, x: -0.15, y: SEAT_Y - 0.04, z: -0.28 },
    { color: p, w: 0.22, h: 0.2, d: 0.56, x: 0.15, y: SEAT_Y - 0.04, z: -0.28 },
    { color: p, w: 0.2, h: 0.56, d: 0.2, x: -0.15, y: 0.3, z: -0.5 },
    { color: p, w: 0.2, h: 0.56, d: 0.2, x: 0.15, y: 0.3, z: -0.5 },
    { color: PALETTE.chair, w: 0.22, h: 0.1, d: 0.28, x: -0.15, y: 0.05, z: -0.66 },
    { color: PALETTE.chair, w: 0.22, h: 0.1, d: 0.28, x: 0.15, y: 0.05, z: -0.66 },
    { color: s, w: 0.17, h: 0.46, d: 0.24, x: -0.39, y: SEAT_Y + 0.4, z: -0.06 },
    { color: s, w: 0.17, h: 0.46, d: 0.24, x: 0.39, y: SEAT_Y + 0.4, z: -0.06 },
    ...headBoxes(a, SEAT_Y + 0.94, 0.04),
  ];
}

/** Standing torso/arms/head only - legs are separate hip-pivoted meshes (walk cycle). */
function standingBodyBoxes(shirtColor: string, a: WorkerAppearance): BoxSpec[] {
  const s = shade(shirtColor, a.shirtPct);
  return [
    { color: s, w: 0.56, h: 0.22, d: 0.34, x: 0, y: 1.02, z: 0 },
    { color: s, w: 0.6, h: 0.62, d: 0.36, x: 0, y: 1.42, z: 0 },
    { color: s, w: 0.17, h: 0.62, d: 0.22, x: -0.4, y: 1.36, z: 0 },
    { color: s, w: 0.17, h: 0.62, d: 0.22, x: 0.4, y: 1.36, z: 0 },
    ...headBoxes(a, 1.97, 0),
  ];
}

/** One leg + foot, in leg-local space: pivot at the hip (origin), hanging down. */
function legBoxes(): BoxSpec[] {
  return [
    { color: PALETTE.pants, w: 0.24, h: 0.86, d: 0.26, x: 0, y: -0.43, z: 0 },
    { color: PALETTE.chair, w: 0.26, h: 0.12, d: 0.34, x: 0, y: -0.86, z: 0.04 },
  ];
}

export interface WorkerPoses {
  group: THREE.Group;
  seated: THREE.Mesh;
  /** The whole standing rig (body + two leg pivots); shown only while walking. */
  standing: THREE.Group;
  /** Hip-pivoted leg groups, swung by the walk cycle. */
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}

/**
 * Build a worker holding both poses, with seeded appearance. Seated is one merged
 * mesh; standing is a rig (merged body + two hip-pivoted leg groups) so the legs
 * can swing while walking. Only one pose is visible at a time (seated by default).
 */
export function buildWorkerPoses(
  shirtColor: string,
  material: THREE.Material,
  appearance: WorkerAppearance,
): WorkerPoses {
  const group = new THREE.Group();
  const seated = new THREE.Mesh(mergeBoxes(seatedBoxes(shirtColor, appearance)), material);

  const standing = new THREE.Group();
  standing.visible = false;
  standing.add(new THREE.Mesh(mergeBoxes(standingBodyBoxes(shirtColor, appearance)), material));

  const legL = new THREE.Group();
  legL.position.set(-0.16, 0.92, 0);
  legL.add(new THREE.Mesh(mergeBoxes(legBoxes()), material));
  const legR = new THREE.Group();
  legR.position.set(0.16, 0.92, 0);
  legR.add(new THREE.Mesh(mergeBoxes(legBoxes()), material));
  standing.add(legL, legR);

  group.add(seated, standing);
  return { group, seated, standing, legL, legR };
}
