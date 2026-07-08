import * as THREE from "three";
import type { AmenityKind, AmenityPlacement } from "@/lib/domain/types";
import { WORLD_SCALE, mergeBoxes, type BoxSpec, type Palette } from "./kit";

/**
 * The office's floor amenities as static voxel structures (P5b): a glass meeting
 * room, a ping-pong table, a lounge, and a coffee bar. Furniture only - the
 * animated actors (attendees, players, barista, customers) are P5c. Each is built
 * on a rug within its footprint and positioned at its world corner.
 */

/** Rug tint per amenity (a low platform that grounds the structure). */
const TINT: Record<AmenityKind, number> = {
  meeting: 0x2a3a44,
  lounge: 0x3a2f44,
  pingpong: 0x2f4436,
  coffee: 0x443a2a,
};

/** Fixed accent colours where the themed palette doesn't fit the prop. */
const C = {
  green: 0x2f8f4f,
  net: 0xdfe3ea,
  sofa: 0x55617a,
  sofaHi: 0x66739a,
  pot: 0x8a5a34,
  plant: 0x4a9d5f,
  steel: 0xc9ccd4,
  steelHi: 0xe6e8ee,
  dark: 0x2c2f36,
  menu: 0x20281f,
  screen: 0x2f6fa0,
  cup: 0xe7e2d8,
  knobR: 0xd23a3a,
  knobG: 0x2d7d46,
} as const;

interface Built {
  opaque: BoxSpec[];
  frost: BoxSpec[];
}

/**
 * Meeting-room seats around the conference table - left + right sides and the far
 * (bottom) end, mirroring the 2D layout. The head (near the TV) is left clear for
 * the presenter. `rot` orients a seated worker to face the table. Shared by the
 * static chair geometry and the seated attendees (amenityLife) so they line up.
 */
export function meetingChairs(W: number, D: number): { x: number; z: number; rot: number }[] {
  const hx = W * 0.25 + 0.42; // half table width + gap
  const hz = D * 0.21 + 0.42; // half table depth + gap
  return [
    { x: W / 2 - hx, z: D / 2 - D * 0.12, rot: -Math.PI / 2 }, // left-front (face +x)
    { x: W / 2 - hx, z: D / 2 + D * 0.12, rot: -Math.PI / 2 }, // left-back
    { x: W / 2 + hx, z: D / 2 - D * 0.12, rot: Math.PI / 2 }, // right-front (face -x)
    { x: W / 2 + hx, z: D / 2 + D * 0.12, rot: Math.PI / 2 }, // right-back
    { x: W / 2 - W * 0.13, z: D / 2 + hz, rot: 0 }, // bottom-left (face -z)
    { x: W / 2 + W * 0.13, z: D / 2 + hz, rot: 0 }, // bottom-right
  ];
}

/**
 * The meeting-room TV screen metrics: a 16:9 panel hung from just under the wall
 * top (WH = 1.15) and growing downward, so it never rises above the wall. Shared by
 * the static bezel/slide and the animated bar chart + live dot (amenityLife).
 */
export function meetingTvScreen(W: number): { cx: number; cy: number; w: number; h: number; z: number } {
  const h = 0.72;
  const w = (h * 16) / 9; // 16:9
  const cy = 0.84 + h / 2; // sit the bottom just above the table, growing upward
  return { cx: W / 2, cy, w, h, z: 0.14 };
}

function meetingRoom(W: number, D: number, pal: Palette): Built {
  const opaque: BoxSpec[] = [];
  const frost: BoxSpec[] = [];
  const WH = 1.15;
  const BH = 1.7; // taller back wall, to mount the TV above the table
  const T = 0.1;
  // glass walls (enclosed room, frosted see-through); the back wall is raised so the
  // raised TV mounts on a wall rather than floating above open air.
  frost.push(
    { color: pal.wallFrost, w: W, h: BH, d: T, x: W / 2, y: BH / 2, z: 0 },
    { color: pal.wallFrost, w: W, h: WH, d: T, x: W / 2, y: WH / 2, z: D },
    { color: pal.wallFrost, w: T, h: WH, d: D, x: 0, y: WH / 2, z: D / 2 },
    { color: pal.wallFrost, w: T, h: WH, d: D, x: W, y: WH / 2, z: D / 2 },
  );
  // conference table
  opaque.push(
    { color: pal.desk, w: W * 0.5, h: 0.1, d: D * 0.42, x: W / 2, y: 0.72, z: D / 2 },
    { color: pal.deskHi, w: W * 0.5, h: 0.04, d: D * 0.42, x: W / 2, y: 0.78, z: D / 2 },
  );
  // wall-mounted 16:9 TV: dark bezel + lit screen, hung from just under the wall
  // top and growing downward. A slide (title + bullet lines) fills the left; the
  // bar chart + "live" dot are animated actors added in amenityLife.
  const tv = meetingTvScreen(W);
  const sz = tv.z + 0.015; // slide content, just in front of the screen
  const slideW = tv.w * 0.44;
  const slideX = tv.cx - tv.w * 0.18;
  opaque.push(
    { color: 0x0f1116, w: tv.w + 0.06, h: tv.h + 0.06, d: 0.06, x: tv.cx, y: tv.cy, z: 0.1 }, // bezel
    { color: C.screen, w: tv.w, h: tv.h, d: 0.02, x: tv.cx, y: tv.cy, z: tv.z }, // screen
    { color: 0xe9f0f7, w: slideW, h: tv.h * 0.6, d: 0.008, x: slideX, y: tv.cy - tv.h * 0.04, z: sz },
    { color: 0x3b82c4, w: slideW * 0.92, h: tv.h * 0.12, d: 0.006, x: slideX, y: tv.cy + tv.h * 0.16, z: sz + 0.005 },
    { color: 0x9fb0c0, w: slideW * 0.6, h: 0.02, d: 0.006, x: slideX - slideW * 0.12, y: tv.cy, z: sz + 0.005 },
    { color: 0x9fb0c0, w: slideW * 0.42, h: 0.02, d: 0.006, x: slideX - slideW * 0.2, y: tv.cy - tv.h * 0.14, z: sz + 0.005 },
  );
  // chairs around the table (head kept clear for the presenter)
  for (const c of meetingChairs(W, D)) {
    opaque.push({ color: pal.chair, w: 0.36, h: 0.36, d: 0.36, x: c.x, y: 0.5, z: c.z });
  }
  return { opaque, frost };
}

function pingPong(W: number, D: number): Built {
  const tW = W * 0.72;
  const tD = D * 0.44; // keep a ~2:1 table proportion; the rest is walk-around space
  const opaque: BoxSpec[] = [
    { color: C.green, w: tW, h: 0.1, d: tD, x: W / 2, y: 0.55, z: D / 2 },
    { color: C.net, w: 0.04, h: 0.16, d: tD, x: W / 2, y: 0.63, z: D / 2 },
  ];
  const lx = tW / 2 - 0.12;
  const lz = tD / 2 - 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      opaque.push({ color: C.dark, w: 0.08, h: 0.5, d: 0.08, x: W / 2 + sx * lx, y: 0.25, z: D / 2 + sz * lz });
    }
  }
  return { opaque, frost: [] };
}

function lounge(W: number, D: number, pal: Palette): Built {
  // L-shaped sectional in the back-left corner, opening toward the centre.
  const longW = W * 0.62;
  const longX = W * 0.06 + longW / 2; // hugs the left
  const backZ = D * 0.24;
  const retD = D * 0.5;
  const retZ = backZ + retD / 2 - 0.4;
  const opaque: BoxSpec[] = [
    // long section (along x, at the back)
    { color: C.sofa, w: longW, h: 0.32, d: 0.8, x: longX, y: 0.26, z: backZ },
    { color: C.sofaHi, w: longW, h: 0.12, d: 0.8, x: longX, y: 0.48, z: backZ },
    { color: C.sofa, w: longW, h: 0.5, d: 0.2, x: longX, y: 0.5, z: backZ - 0.3 }, // backrest
    // return section (along z, on the left) forming the L
    { color: C.sofa, w: 0.8, h: 0.32, d: retD, x: W * 0.1, y: 0.26, z: retZ },
    { color: C.sofaHi, w: 0.8, h: 0.12, d: retD, x: W * 0.1, y: 0.48, z: retZ },
    { color: C.sofa, w: 0.2, h: 0.5, d: retD, x: W * 0.1 - 0.3, y: 0.5, z: retZ }, // backrest
    // coffee table + plant
    { color: pal.desk, w: 1.0, h: 0.1, d: 0.6, x: W * 0.55, y: 0.26, z: D * 0.62 },
    { color: pal.deskHi, w: 1.0, h: 0.04, d: 0.6, x: W * 0.55, y: 0.31, z: D * 0.62 },
    { color: C.pot, w: 0.32, h: 0.4, d: 0.32, x: W * 0.88, y: 0.2, z: D * 0.82 },
    { color: C.plant, w: 0.52, h: 0.5, d: 0.52, x: W * 0.88, y: 0.62, z: D * 0.82 },
  ];
  return { opaque, frost: [] };
}

function coffeeBar(W: number, D: number, pal: Palette): Built {
  const opaque: BoxSpec[] = [
    // back bar + front counter (two tiers)
    { color: pal.desk, w: W * 0.9, h: 0.55, d: 0.4, x: W / 2, y: 0.28, z: 0.35 },
    { color: pal.deskHi, w: W * 0.9, h: 0.08, d: 0.4, x: W / 2, y: 0.57, z: 0.35 },
    { color: pal.desk, w: W * 0.9, h: 0.6, d: 0.4, x: W / 2, y: 0.3, z: D * 0.62 },
    { color: pal.deskHi, w: W * 0.9, h: 0.08, d: 0.4, x: W / 2, y: 0.62, z: D * 0.62 },
    // chalk menu on the back wall
    { color: C.menu, w: 1.2, h: 0.5, d: 0.06, x: W * 0.34, y: 1.05, z: 0.14 },
    // stools out front
    { color: pal.chair, w: 0.3, h: 0.45, d: 0.3, x: W * 0.32, y: 0.22, z: D * 0.86 },
    { color: pal.chair, w: 0.3, h: 0.45, d: 0.3, x: W * 0.62, y: 0.22, z: D * 0.86 },
  ];

  // Espresso machine (on the back bar, top ~0.61): steel body + warming top, two
  // group heads with portafilters, a steam wand, control knobs, cups warming.
  const ex = W * 0.26;
  opaque.push(
    { color: C.steel, w: 0.56, h: 0.3, d: 0.32, x: ex, y: 0.76, z: 0.35 },
    { color: C.steelHi, w: 0.56, h: 0.05, d: 0.32, x: ex, y: 0.93, z: 0.35 },
    { color: C.dark, w: 0.09, h: 0.1, d: 0.06, x: ex - 0.14, y: 0.6, z: 0.5 }, // group head L
    { color: C.dark, w: 0.09, h: 0.1, d: 0.06, x: ex + 0.14, y: 0.6, z: 0.5 }, // group head R
    { color: 0x20242c, w: 0.05, h: 0.05, d: 0.05, x: ex - 0.14, y: 0.53, z: 0.52 }, // portafilters
    { color: 0x20242c, w: 0.05, h: 0.05, d: 0.05, x: ex + 0.14, y: 0.53, z: 0.52 },
    { color: 0x8b9099, w: 0.04, h: 0.14, d: 0.04, x: ex - 0.26, y: 0.68, z: 0.46 }, // steam wand
    { color: C.knobR, w: 0.04, h: 0.04, d: 0.04, x: ex - 0.05, y: 0.94, z: 0.5 }, // knobs
    { color: C.knobG, w: 0.04, h: 0.04, d: 0.04, x: ex + 0.05, y: 0.94, z: 0.5 },
    { color: C.cup, w: 0.06, h: 0.06, d: 0.06, x: ex - 0.12, y: 0.97, z: 0.3 }, // cups on top
    { color: C.cup, w: 0.06, h: 0.06, d: 0.06, x: ex, y: 0.97, z: 0.3 },
    { color: C.cup, w: 0.06, h: 0.06, d: 0.06, x: ex + 0.12, y: 0.97, z: 0.3 },
  );
  // Burr grinder: body + bean hopper on top.
  const gx = W * 0.5;
  opaque.push(
    { color: C.dark, w: 0.24, h: 0.34, d: 0.26, x: gx, y: 0.78, z: 0.35 },
    { color: 0x3a2f26, w: 0.16, h: 0.18, d: 0.16, x: gx, y: 1.02, z: 0.35 }, // hopper
  );
  // Drip brewer: body, warmer, and a carafe out front.
  const dx = W * 0.72;
  opaque.push(
    { color: 0x3a3f4b, w: 0.42, h: 0.32, d: 0.3, x: dx, y: 0.77, z: 0.35 },
    { color: 0x4b515f, w: 0.42, h: 0.06, d: 0.3, x: dx, y: 0.9, z: 0.35 },
    { color: 0x5a3a24, w: 0.16, h: 0.16, d: 0.12, x: dx - 0.02, y: 0.62, z: 0.5 }, // carafe
    { color: C.knobR, w: 0.04, h: 0.04, d: 0.04, x: dx + 0.15, y: 0.82, z: 0.5 },
  );
  // Hot-water / tea urn (left end) with a tap.
  const hx = W * 0.13;
  opaque.push(
    { color: C.steel, w: 0.22, h: 0.44, d: 0.24, x: hx, y: 0.83, z: 0.35 },
    { color: C.steelHi, w: 0.22, h: 0.05, d: 0.24, x: hx, y: 1.05, z: 0.35 },
    { color: 0x20242c, w: 0.05, h: 0.08, d: 0.04, x: hx, y: 0.68, z: 0.5 },
  );
  // Cup stack + syrup bottles (between espresso and grinder).
  const cx = W * 0.38;
  opaque.push(
    { color: C.cup, w: 0.14, h: 0.16, d: 0.14, x: cx - 0.06, y: 0.69, z: 0.3 },
    { color: 0xc98a3a, w: 0.05, h: 0.16, d: 0.05, x: cx + 0.1, y: 0.69, z: 0.33 },
    { color: C.knobR, w: 0.05, h: 0.16, d: 0.05, x: cx + 0.18, y: 0.69, z: 0.33 },
    { color: 0x8f5327, w: 0.05, h: 0.16, d: 0.05, x: cx + 0.26, y: 0.69, z: 0.33 },
  );
  // Blender / clear jug (between grinder and drip).
  const bx = W * 0.6;
  opaque.push(
    { color: 0x2a2e38, w: 0.16, h: 0.28, d: 0.18, x: bx, y: 0.75, z: 0.35 },
    { color: 0xbcc6cf, w: 0.12, h: 0.16, d: 0.12, x: bx, y: 0.95, z: 0.35 },
  );
  // Pastry case (right) with a few pastries.
  const px = W * 0.88;
  opaque.push(
    { color: 0xbcc6cf, w: 0.5, h: 0.24, d: 0.32, x: px, y: 0.73, z: 0.35 },
    { color: 0xd8b06a, w: 0.09, h: 0.06, d: 0.09, x: px - 0.14, y: 0.66, z: 0.35 },
    { color: 0xb5772f, w: 0.09, h: 0.06, d: 0.09, x: px, y: 0.66, z: 0.35 },
    { color: 0xc98a3a, w: 0.09, h: 0.06, d: 0.09, x: px + 0.14, y: 0.66, z: 0.35 },
  );
  // A couple of mugs left out along the counter front.
  opaque.push(
    { color: C.cup, w: 0.06, h: 0.07, d: 0.06, x: W * 0.45, y: 0.65, z: 0.5 },
    { color: 0x7a5230, w: 0.06, h: 0.07, d: 0.06, x: W * 0.66, y: 0.65, z: 0.5 },
  );

  return { opaque, frost: [] };
}

export function buildAmenity(
  placement: AmenityPlacement,
  materials: { opaque: THREE.Material; frost: THREE.Material },
  pal: Palette,
): THREE.Group {
  const S = WORLD_SCALE;
  const W = placement.size.w * S;
  const D = placement.size.h * S;

  // Rug/platform under every amenity.
  const opaque: BoxSpec[] = [
    { color: TINT[placement.kind], w: W, h: 0.08, d: D, x: W / 2, y: 0.04, z: D / 2 },
  ];
  const frost: BoxSpec[] = [];

  let built: Built;
  switch (placement.kind) {
    case "meeting":
      built = meetingRoom(W, D, pal);
      break;
    case "pingpong":
      built = pingPong(W, D);
      break;
    case "lounge":
      built = lounge(W, D, pal);
      break;
    case "coffee":
      built = coffeeBar(W, D, pal);
      break;
  }
  opaque.push(...built.opaque);
  frost.push(...built.frost);

  const group = new THREE.Group();
  group.position.set(placement.position.x * S, 0, placement.position.y * S);
  group.add(new THREE.Mesh(mergeBoxes(opaque), materials.opaque));
  if (frost.length > 0) group.add(new THREE.Mesh(mergeBoxes(frost), materials.frost));
  return group;
}
