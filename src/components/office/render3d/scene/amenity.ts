import * as THREE from "three";
import type { AmenityKind, AmenityPlacement } from "@/lib/domain/types";
import { WORLD_SCALE, mergeBoxes, type BoxSpec, type Palette } from "./kit";

/**
 * Decorative floor amenities (meeting rooms, lounge, ping-pong, coffee) as simple
 * low voxel platforms with a hint of furniture, so the commons ring reads at a
 * glance. Detailed amenity modelling is parked; this just gives the office context.
 */
const TINT: Record<AmenityKind, number> = {
  meeting: 0x2a3a44,
  lounge: 0x3a2f44,
  pingpong: 0x2f4436,
  coffee: 0x443a2a,
};

export function buildAmenity(
  placement: AmenityPlacement,
  material: THREE.Material,
  pal: Palette,
): THREE.Group {
  const S = WORLD_SCALE;
  const W = placement.size.w * S;
  const D = placement.size.h * S;
  const tint = TINT[placement.kind];

  const boxes: BoxSpec[] = [
    // rug/platform
    { color: tint, w: W, h: 0.08, d: D, x: W / 2, y: 0.04, z: D / 2 },
    // a low central fixture (table / counter) to hint the amenity
    {
      color: pal.deskHi,
      w: Math.min(W * 0.5, 2.4),
      h: 0.5,
      d: Math.min(D * 0.5, 1.4),
      x: W / 2,
      y: 0.3,
      z: D / 2,
    },
  ];

  const group = new THREE.Group();
  group.position.set(placement.position.x * S, 0, placement.position.y * S);
  group.add(new THREE.Mesh(mergeBoxes(boxes), material));
  return group;
}
