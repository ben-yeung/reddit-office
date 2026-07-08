import * as THREE from "three";
import type { Layout } from "@/lib/domain/types";
import { appearanceFor } from "@/lib/worker/appearance";
import { hashString, mulberry32 } from "@/lib/util/rng";
import { WORLD_SCALE, disposeGroup } from "../scene/kit";
import { buildWorkerPoses } from "../scene/worker";
import { meetingChairs, meetingTvScreen } from "../scene/amenity";

/**
 * Animated amenity actors (P5c): the people that bring the floor's amenities to
 * life - ping-pong players + ball and a lounge idler for now (meeting room + coffee
 * bar to follow). Each amenity's actors sit in a sub-group at its world corner and
 * are stepped from the shared clock. Gated by the `ambient` policy (the caller
 * hides + skips the group when off / paused). Bodies use the shared opaque material;
 * small props (paddles, ball) own their material (flagged for disposal).
 */

const NEUT = [0x8a90a0, 0x9a8f86, 0x7f9a8f, 0xa0929c, 0x8f96a6];
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

interface Actor {
  update(t: number): void;
}

export interface AmenityLife {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

/** A small owned-material prop (disposed with its group). */
function prop(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color });
  mat.userData.owned = true;
  return new THREE.Mesh(geo, mat);
}

/** An espresso: saucer + cup body + dark coffee + handle. Transparent (owned)
    materials so it can fade in/out with the customer carrying it. */
function makeCup(): { group: THREE.Group; mats: THREE.MeshLambertMaterial[] } {
  const group = new THREE.Group();
  const mats: THREE.MeshLambertMaterial[] = [];
  const piece = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
    const m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });
    m.userData.owned = true;
    mats.push(m);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  piece(0.28, 0.03, 0.28, 0xdfe3ea, 0, -0.02, 0); // saucer
  piece(0.22, 0.2, 0.22, 0xf2efe8, 0, 0.11, 0); // cup body
  piece(0.16, 0.03, 0.16, 0x3a2418, 0, 0.22, 0); // coffee
  piece(0.05, 0.1, 0.05, 0xf2efe8, 0.15, 0.1, 0); // handle
  return { group, mats };
}

/** Sample a piecewise-linear (x, z) path at u in [0, 1] (keys sorted by `u`). */
function pw(u: number, keys: { u: number; x: number; z: number }[]): { x: number; z: number } {
  if (u <= keys[0].u) return { x: keys[0].x, z: keys[0].z };
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i].u) {
      const a = keys[i - 1];
      const b = keys[i];
      const s = (u - a.u) / (b.u - a.u);
      return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, z: last.z };
}

/**
 * A ping-pong player: a standing voxel worker built WITHOUT its baked arms, plus a
 * static left arm and a dynamic right arm - a continuous forearm -> wood handle ->
 * coloured blade on a shoulder pivot - so the paddle is attached to the hand and the
 * whole arm swings with the rally. Returns the group + the swing pivot.
 */
function buildPingPongPlayer(seed: string, paddleColor: number, material: THREE.Material) {
  const shirtN = NEUT[hashString(`amb-${seed}`) % NEUT.length];
  const poses = buildWorkerPoses(hex(shirtN), material, appearanceFor(`amb-${seed}`), false);
  poses.seated.visible = false;
  poses.standing.visible = true;

  const leftArm = prop(new THREE.BoxGeometry(0.17, 0.62, 0.22), shirtN);
  leftArm.position.set(-0.4, 1.36, 0);
  poses.standing.add(leftArm);

  const arm = new THREE.Group();
  arm.position.set(0.4, 1.55, 0); // right shoulder
  const forearm = prop(new THREE.BoxGeometry(0.16, 0.46, 0.18), shirtN);
  forearm.position.set(0, -0.22, 0);
  const handle = prop(new THREE.BoxGeometry(0.05, 0.14, 0.05), 0x8a5a34);
  handle.position.set(0, -0.5, 0);
  const blade = prop(new THREE.BoxGeometry(0.22, 0.26, 0.05), paddleColor);
  blade.position.set(0, -0.68, 0);
  arm.add(forearm, handle, blade);
  poses.standing.add(arm);

  return { group: poses.group, arm };
}

export function buildAmenityLife(layout: Layout, material: THREE.Material): AmenityLife {
  const S = WORLD_SCALE;
  const group = new THREE.Group();
  const actors: Actor[] = [];
  const owned: THREE.Object3D[] = [];

  const person = (key: string) => {
    const seed = `amb-${key}`;
    const shirt = NEUT[hashString(seed) % NEUT.length];
    return buildWorkerPoses(hex(shirt), material, appearanceFor(seed));
  };

  let n = 0;
  for (const a of layout.amenities) {
    const W = a.size.w * S;
    const D = a.size.h * S;
    const sub = new THREE.Group();
    sub.position.set(a.position.x * S, 0, a.position.y * S);
    group.add(sub);

    if (a.kind === "pingpong") {
      const tableW = W * 0.72;
      const cz = D / 2;

      const L = buildPingPongPlayer(`pp-l-${n}`, 0xd23a3a, material);
      L.group.position.set(W / 2 - tableW / 2 - 0.45, 0, cz);
      L.group.rotation.y = Math.PI / 2; // face +x (the table)

      const R = buildPingPongPlayer(`pp-r-${n}`, 0x2b5fa8, material);
      R.group.position.set(W / 2 + tableW / 2 + 0.45, 0, cz);
      R.group.rotation.y = -Math.PI / 2; // face -x

      const ball = prop(new THREE.BoxGeometry(0.09, 0.09, 0.09), 0xffffff);
      sub.add(L.group, R.group, ball);
      owned.push(L.group, R.group, ball);

      // Exact blade-contact point per player at the strike, derived from the arm
      // geometry (pivot at the shoulder, blade at the forearm end) so the ball
      // actually meets the paddle in x, y AND z - not just the centre axis.
      const ARM_X = 0.4;
      const ARM_Y = 1.55;
      const BLADE_Y = -0.68;
      const STRIKE = -1.35; // arm rotation.x at the forward strike (see below)
      const reach = BLADE_Y * Math.sin(STRIKE); // forward offset of the blade
      const hitY = ARM_Y + BLADE_Y * Math.cos(STRIKE); // contact height
      const pxL = W / 2 - tableW / 2 - 0.45;
      const pxR = W / 2 + tableW / 2 + 0.45;
      const hitLx = pxL + reach;
      const hitRx = pxR - reach;
      const hitLz = cz - ARM_X; // blade sits on the player's (right) shoulder side
      const hitRz = cz + ARM_X;
      const bounceY = 0.64;
      actors.push({
        update(t: number) {
          const p = (t % 1.4) / 1.4;
          // Arm winds back then strikes forward: L reaches STRIKE at p≈0/1, R at p≈0.5.
          L.arm.rotation.x = -0.8 - 0.55 * Math.cos(2 * Math.PI * p);
          R.arm.rotation.x = -0.8 + 0.55 * Math.cos(2 * Math.PI * p);
          // Ball rides between the two blade-contact points, dipping to a table bounce
          // in between - so it lands on the paddle exactly when the player strikes.
          const u = 0.5 - 0.5 * Math.cos(2 * Math.PI * p); // 0 at L (p=0), 1 at R (p=0.5)
          const strike = 0.5 + 0.5 * Math.cos(4 * Math.PI * p); // 1 at strikes, 0 at bounce
          ball.position.set(
            hitLx + (hitRx - hitLx) * u,
            bounceY + (hitY - bounceY) * strike,
            hitLz + (hitRz - hitLz) * u,
          );
        },
      });
    } else if (a.kind === "lounge") {
      const longX = W * 0.06 + (W * 0.62) / 2;
      const idler = person(`lng-${n}`);
      idler.standing.visible = false;
      idler.seated.visible = true;
      idler.group.position.set(longX + 0.3, -0.12, D * 0.24);
      idler.group.rotation.y = Math.PI; // face +z (into the room)
      // laptop on the lap (thighs are toward -z in the seated body's local space),
      // screen facing back up toward the worker - as if working.
      const base = prop(new THREE.BoxGeometry(0.6, 0.05, 0.48), 0x2a2e38);
      base.position.set(0, 0.8, -0.5);
      const screen = prop(new THREE.BoxGeometry(0.6, 0.42, 0.03), 0x14161c);
      screen.position.set(0, 1.07, -0.71);
      const litFace = prop(new THREE.BoxGeometry(0.52, 0.35, 0.01), 0x5aa9e6);
      litFace.position.set(0, 1.07, -0.694);
      idler.group.add(base, screen, litFace);
      sub.add(idler.group);
      owned.push(idler.group);
      actors.push({
        update(t: number) {
          idler.group.position.y = -0.12 + Math.sin(t * 1.6) * 0.02;
        },
      });
    } else if (a.kind === "meeting") {
      const LOOP = 13;
      const phase = hashString(`mtg-${n}`) % LOOP;
      const rng = mulberry32(hashString(`mtg-att-${n}`));

      // Chairs on the table's sides + far end (head reserved for the presenter).
      const chairs = meetingChairs(W, D);
      // Seeded attendance: a shuffled subset of >=3 chairs is occupied.
      const order = chairs.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const occupied = order.slice(0, 3 + Math.floor(rng() * 4));

      const attendees: { group: THREE.Group; ph: number }[] = [];
      const bubbles: { mesh: THREE.Mesh; win: [number, number] }[] = [];
      const chatWins: [number, number][] = [
        [0.28, 0.46],
        [0.52, 0.7],
        [0.76, 0.95],
      ];
      occupied.forEach((ci, k) => {
        const c = chairs[ci];
        const p = person(`mtg-${n}-${ci}`);
        p.standing.visible = false;
        p.seated.visible = true;
        p.group.position.set(c.x, -0.04, c.z);
        p.group.rotation.y = c.rot;
        sub.add(p.group);
        owned.push(p.group);
        attendees.push({ group: p.group, ph: (ci * 1.3) % (Math.PI * 2) });
        if (k < 3) {
          const bub = prop(new THREE.BoxGeometry(0.22, 0.14, 0.1), 0xf4f7fb);
          // Offset up and outward (away from the table) so it sits beside the head
          // rather than on it.
          const ox = c.x - W / 2;
          const oz = c.z - D / 2;
          const len = Math.hypot(ox, oz) || 1;
          bub.position.set(c.x + (ox / len) * 0.34, 2.12, c.z + (oz / len) * 0.34);
          bub.visible = false;
          sub.add(bub);
          owned.push(bub);
          bubbles.push({ mesh: bub, win: chatWins[k] });
        }
      });

      // Animated TV: three bar-chart bars (scaled from their base) + a blinking dot,
      // keyed to the shared 16:9 screen metrics (right half of the screen).
      const tv = meetingTvScreen(W);
      const sz = tv.z + 0.02;
      const chartX = tv.cx + tv.w * 0.24;
      const chartBase = tv.cy - tv.h * 0.28;
      const bars: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.BoxGeometry(0.035, 1, 0.006);
        g.translate(0, 0.5, 0); // grow upward from the base
        const bar = prop(g, 0x3b82c4);
        bar.position.set(chartX + (i - 1) * 0.06, chartBase, sz);
        bar.scale.y = 0.12;
        sub.add(bar);
        owned.push(bar);
        bars.push(bar);
      }
      const dot = prop(new THREE.BoxGeometry(0.03, 0.03, 0.006), 0xff5a5a);
      dot.position.set(tv.cx + tv.w * 0.42, tv.cy + tv.h * 0.34, sz);
      sub.add(dot);
      owned.push(dot);

      actors.push({
        update(t: number) {
          const f = ((t + phase) % LOOP) / LOOP;
          for (const at of attendees) {
            at.group.position.y = -0.04 + Math.sin(t * 1.8 + at.ph) * 0.015;
          }
          for (const b of bubbles) b.mesh.visible = f >= b.win[0] && f <= b.win[1];
          bars.forEach((bar, i) => {
            bar.scale.y = [0.1, 0.17, 0.13][i] + 0.07 * Math.sin(t * 1.4 + i * 0.8);
          });
          dot.visible = Math.sin(t * 4) > -0.3;
        },
      });
    } else if (a.kind === "coffee") {
      const LOOP = 18;
      const phase = hashString(`cof-${n}`) % LOOP;

      // Barista shuttles behind the counter: machine -> serve point -> machine, over
      // the loop (x as a fraction of W, z absolute - kept behind the front counter).
      // Fixed uniform: black shirt + green apron (head still seeded per barista).
      const bKey = `amb-cof-${n}-b`;
      const barista = buildWorkerPoses("#1c1c20", material, appearanceFor(bKey));
      barista.seated.visible = false;
      barista.standing.visible = true;
      // Green apron over the torso: a wider skirt + a narrower bib on the chest front.
      const apronSkirt = prop(new THREE.BoxGeometry(0.5, 0.5, 0.05), 0x2e8b57);
      apronSkirt.position.set(0, 1.0, 0.19);
      const apronBib = prop(new THREE.BoxGeometry(0.34, 0.36, 0.05), 0x2e8b57);
      apronBib.position.set(0, 1.45, 0.19);
      barista.standing.add(apronSkirt, apronBib);
      sub.add(barista.group);
      owned.push(barista.group);
      const BKEYS = [
        { u: 0.0, x: 0.28, z: 0.62 }, // espresso
        { u: 0.1, x: 0.28, z: 0.62 },
        { u: 0.18, x: 0.5, z: D * 0.5 }, // to serve
        { u: 0.26, x: 0.5, z: D * 0.5 },
        { u: 0.34, x: 0.7, z: 0.62 }, // to drip
        { u: 0.46, x: 0.7, z: 0.62 },
        { u: 0.54, x: 0.5, z: D * 0.5 }, // serve
        { u: 0.62, x: 0.5, z: D * 0.5 },
        { u: 0.72, x: 0.5, z: 0.62 }, // to grinder
        { u: 0.82, x: 0.28, z: 0.62 },
        { u: 1.0, x: 0.28, z: 0.62 },
      ];

      // Up to three customers at the counter front, phase-offset around the loop:
      // each walks in, waits, is handed a cup, then leaves.
      const zCounter = D * 0.82;
      const zOut = D + 0.7;
      const customers = [W * 0.3, W * 0.52, W * 0.72].map((cx, i) => {
        // Own transparent material so the customer can fade in/out (like the NPCs).
        const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
        bodyMat.userData.owned = true;
        const key = `amb-cof-${n}-c${i}`;
        const shirt = NEUT[hashString(key) % NEUT.length];
        const p = buildWorkerPoses(hex(shirt), bodyMat, appearanceFor(key));
        p.seated.visible = false;
        p.standing.visible = true;
        p.group.visible = false;
        const cup = makeCup();
        cup.group.position.set(0.24, 1.02, 0.28);
        cup.group.visible = false;
        p.group.add(cup.group);
        sub.add(p.group);
        owned.push(p.group);
        return { poses: p, bodyMat, cup, x: cx, off: i / 3 };
      });

      actors.push({
        update(t: number) {
          const f = ((t + phase) % LOOP) / LOOP;
          // Barista: position, face travel direction, legs when moving.
          const b = pw(f, BKEYS);
          const bn = pw((f + 0.006) % 1, BKEYS);
          barista.group.position.set(b.x * W, 0, b.z);
          const ddx = (bn.x - b.x) * W;
          const ddz = bn.z - b.z;
          const moving = Math.hypot(ddx, ddz) > 0.002;
          if (moving) barista.group.rotation.y = Math.atan2(ddx, ddz);
          const bsw = moving ? Math.sin(t * 9) * 0.3 : 0;
          barista.legL.rotation.x = bsw;
          barista.legR.rotation.x = -bsw;
          // Customers: fade in while arriving (0-0.12), wait (-0.6), fade out while
          // leaving (-0.72), gone otherwise - reusing the 3D opacity fade.
          for (const c of customers) {
            const cf = (((f - c.off) % 1) + 1) % 1;
            const g = c.poses.group;
            let walk = false;
            let op = 1;
            if (cf < 0.12) {
              g.visible = true;
              g.position.set(c.x, 0, zOut + (zCounter - zOut) * (cf / 0.12));
              g.rotation.y = Math.PI; // face the counter (-z)
              walk = true;
              op = cf / 0.12; // fade in
            } else if (cf < 0.6) {
              g.visible = true;
              g.position.set(c.x, 0, zCounter);
              g.rotation.y = Math.PI;
            } else if (cf < 0.72) {
              g.visible = true;
              g.position.set(c.x, 0, zCounter + (zOut - zCounter) * ((cf - 0.6) / 0.12));
              g.rotation.y = 0; // walk out (+z)
              walk = true;
              op = 1 - (cf - 0.6) / 0.12; // fade out
            } else {
              g.visible = false;
              op = 0;
            }
            c.bodyMat.opacity = op;
            c.cup.group.visible = g.visible && cf > 0.4; // handed a coffee, carried out
            for (const m of c.cup.mats) m.opacity = op;
            const sw = walk ? Math.sin(t * 9 + c.off * 6) * 0.3 : 0;
            c.poses.legL.rotation.x = sw;
            c.poses.legR.rotation.x = -sw;
          }
        },
      });
    }
    n++;
  }

  return {
    group,
    update(t: number) {
      for (const a of actors) a.update(t);
    },
    dispose() {
      for (const o of owned) disposeGroup(o);
    },
  };
}
