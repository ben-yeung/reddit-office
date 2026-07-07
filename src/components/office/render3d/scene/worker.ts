import * as THREE from "three";
import { PALETTE, mergeBoxes, type BoxSpec } from "./kit";

/**
 * Voxel workers come in two poses that swap as a unit (an 8-bit "frame change",
 * not smooth IK): a SEATED pose for resting at the desk, and a STANDING pose for
 * walking the aisles (arrival / departure / migration). Both face -z (toward the
 * desk), so from the front iso camera we see the worker's back at rest.
 *
 * The shirt/torso/arms take the subreddit accent (`shirtColor`); everything else
 * is fixed palette. Each pose is one merged, vertex-coloured mesh (one draw call).
 * Trait variety (hair styles, accessories, props) is parked to a later phase.
 */
const SEAT_Y = 0.72;

/** Seated: pelvis on the chair, thighs forward (-z), shins down, torso upright. */
export function seatedBoxes(shirtColor: THREE.ColorRepresentation): BoxSpec[] {
  const s = shirtColor;
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
    { color: PALETTE.skin, w: 0.42, h: 0.42, d: 0.42, x: 0, y: SEAT_Y + 0.94, z: 0.04 },
    { color: PALETTE.hair, w: 0.46, h: 0.16, d: 0.46, x: 0, y: SEAT_Y + 1.17, z: 0.02 },
  ];
}

/** Height of the hip pivot the standing legs swing from. */
const HIP_Y = 0.92;

/** Standing torso/arms/head only - the legs are separate, hip-pivoted meshes so
    they can swing for the walk cycle (a merged body can't animate limbs). */
function standingBodyBoxes(shirtColor: THREE.ColorRepresentation): BoxSpec[] {
  const s = shirtColor;
  return [
    { color: s, w: 0.56, h: 0.22, d: 0.34, x: 0, y: 1.02, z: 0 },
    { color: s, w: 0.6, h: 0.62, d: 0.36, x: 0, y: 1.42, z: 0 },
    { color: s, w: 0.17, h: 0.62, d: 0.22, x: -0.4, y: 1.36, z: 0 },
    { color: s, w: 0.17, h: 0.62, d: 0.22, x: 0.4, y: 1.36, z: 0 },
    { color: PALETTE.skin, w: 0.42, h: 0.42, d: 0.42, x: 0, y: 1.97, z: 0 },
    { color: PALETTE.hair, w: 0.46, h: 0.16, d: 0.46, x: 0, y: 2.2, z: 0 },
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
 * Build a worker holding both poses. Seated is one merged mesh; standing is a rig
 * (merged body + two hip-pivoted leg groups) so the legs can swing while walking.
 * Only one pose is visible at a time (seated by default); the reconciler/loop
 * swaps them and drives the leg swing + facing at walk boundaries.
 */
export function buildWorkerPoses(
  shirtColor: THREE.ColorRepresentation,
  material: THREE.Material,
): WorkerPoses {
  const group = new THREE.Group();
  const seated = new THREE.Mesh(mergeBoxes(seatedBoxes(shirtColor)), material);

  const standing = new THREE.Group();
  standing.visible = false;
  standing.add(new THREE.Mesh(mergeBoxes(standingBodyBoxes(shirtColor)), material));

  const legL = new THREE.Group();
  legL.position.set(-0.16, HIP_Y, 0);
  legL.add(new THREE.Mesh(mergeBoxes(legBoxes()), material));
  const legR = new THREE.Group();
  legR.position.set(0.16, HIP_Y, 0);
  legR.add(new THREE.Mesh(mergeBoxes(legBoxes()), material));
  standing.add(legL, legR);

  group.add(seated, standing);
  return { group, seated, standing, legL, legR };
}
