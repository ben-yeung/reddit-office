"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * P0 GO/NO-GO SPIKE - throwaway.
 *
 * Proves: raw three.js mounts under this modified Next 16 / React 19, an
 * OrthographicCamera at a fixed iso tilt reads as an "angled bird's-eye", and a
 * procedural voxel worker + frosted 3-wall cubicle look right in the app's
 * Midnight Office palette. No engine wiring, no reconciler - one static scene
 * plus an idle bob. Delete after the gate.
 */

// Midnight Office palette (globals.css), the values the 3D renderer will theme from.
const COL = {
  floor: 0x39404a,
  floorSeam: 0x414954,
  wallFrost: 0x9fd8ff,
  desk: 0x7a5230,
  deskHi: 0x96683f,
  chair: 0x2b2f37,
  monitor: 0x14161c,
  shirt: 0xff5a1f, // subreddit accent stand-in
  skin: 0xe0b48c,
  hair: 0x35281c,
  pants: 0x3a4150,
};

/** Add a box mesh to `parent` at center (cx,cy,cz) with size (w,h,d). */
function box(
  parent: THREE.Object3D,
  color: number,
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  opts: { transparent?: boolean; opacity?: number } = {},
): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    // frosted walls: draw them but don't write depth, so overlapping panes don't
    // fight and workers behind stay visible (the P2 mitigation, previewed here).
    depthWrite: !(opts.transparent ?? false),
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(cx, cy, cz);
  parent.add(mesh);
  return mesh;
}

/**
 * A base voxel worker in a SEATED pose. The worker faces -z (toward its desk and
 * monitor), so it sits on the chair with thighs running forward (-z) at seat
 * height and shins dropping vertically to the floor - not legs stabbed straight
 * down into the seat. Group origin at floor level, pelvis resting on the chair.
 */
function buildVoxelWorker(): THREE.Group {
  const g = new THREE.Group();
  const SEAT_Y = 0.72; // pelvis center sits just above the chair seat top (~0.6)

  // pelvis + upright torso
  box(g, COL.shirt, 0.56, 0.24, 0.36, 0, SEAT_Y, 0.02);
  box(g, COL.shirt, 0.6, 0.6, 0.36, 0, SEAT_Y + 0.42, 0.04);

  // thighs: horizontal, running forward (-z) from the pelvis at seat height
  box(g, COL.pants, 0.22, 0.2, 0.56, -0.15, SEAT_Y - 0.04, -0.28);
  box(g, COL.pants, 0.22, 0.2, 0.56, 0.15, SEAT_Y - 0.04, -0.28);
  // shins: vertical, dropping from the knee (front of thigh, z ~ -0.53) to floor
  box(g, COL.pants, 0.2, 0.56, 0.2, -0.15, 0.3, -0.5);
  box(g, COL.pants, 0.2, 0.56, 0.2, 0.15, 0.3, -0.5);
  // feet
  box(g, COL.chair, 0.22, 0.1, 0.28, -0.15, 0.05, -0.66);
  box(g, COL.chair, 0.22, 0.1, 0.28, 0.15, 0.05, -0.66);

  // arms: upper arms at the shoulders, reaching slightly forward toward the desk
  box(g, COL.shirt, 0.17, 0.46, 0.24, -0.39, SEAT_Y + 0.4, -0.06);
  box(g, COL.shirt, 0.17, 0.46, 0.24, 0.39, SEAT_Y + 0.4, -0.06);

  // head + hair cap
  box(g, COL.skin, 0.42, 0.42, 0.42, 0, SEAT_Y + 0.94, 0.04);
  box(g, COL.hair, 0.46, 0.16, 0.46, 0, SEAT_Y + 1.17, 0.02);
  return g;
}

/** A cubicle enclosure: floor tile, desk + monitor + chair against the back wall,
    and 3 frosted walls (back + two sides) with the front open toward the camera. */
function buildCubicle(): THREE.Group {
  const g = new THREE.Group();
  const W = 4.2; // footprint
  const WALL_H = 1.35; // waist-height so seated workers stay visible over it
  const T = 0.12; // wall thickness

  // cubicle floor tile (slightly proud of the ground so it reads as a cell)
  box(g, COL.floorSeam, W, 0.06, W, 0, 0.03, 0);

  // frosted walls: back (-z), left (-x), right (+x); front (+z) OPEN toward camera.
  const frost = { transparent: true, opacity: 0.2 };
  box(g, COL.wallFrost, W, WALL_H, T, 0, WALL_H / 2, -W / 2, frost); // back
  box(g, COL.wallFrost, T, WALL_H, W, -W / 2, WALL_H / 2, 0, frost); // left
  box(g, COL.wallFrost, T, WALL_H, W, W / 2, WALL_H / 2, 0, frost); // right

  // desk against the back wall + monitor + chair; worker faces the monitor (its
  // back to the open front / camera), the same read as the top-down desk sprite.
  box(g, COL.desk, 2.0, 0.1, 0.7, 0, 0.85, -1.35);
  box(g, COL.deskHi, 2.0, 0.04, 0.7, 0, 0.91, -1.35);
  box(g, COL.monitor, 0.9, 0.55, 0.08, 0, 1.2, -1.6);
  box(g, COL.chair, 0.6, 0.1, 0.6, 0, 0.55, -0.6);
  box(g, COL.chair, 0.6, 0.5, 0.12, 0, 0.8, -0.35);

  const worker = buildVoxelWorker();
  worker.position.set(0, 0, -0.65); // seated at the desk
  worker.name = "worker";
  g.add(worker);

  return g;
}

export function VoxelSpike() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171d); // --page-bg

    // ---- Orthographic camera at a fixed iso/dimetric tilt (the P0 question) ----
    // Ortho keeps parallel lines parallel: the canonical voxel look, closest to
    // today's flat overview but tilted. Framed to the cubicle footprint.
    const aspect = host.clientWidth / host.clientHeight;
    const frustum = 7;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      100,
    );
    // corner-front + elevated: looks down INTO the open front of the cubicle.
    camera.position.set(5, 6.5, 7);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    // ---- office lighting: bright, even, slightly cool overhead fill (fluorescent
    // ceiling) with only gentle directionality, so faces of voxels are lit evenly
    // and nothing casts a hard "sun" shadow. Kept flat to hold the retro read. ----
    scene.add(new THREE.AmbientLight(0xf4f7ff, 0.65));
    scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x40454f, 0.85));
    // two soft overhead fixtures give faint left/right modelling without contrast
    const fixtureL = new THREE.DirectionalLight(0xeaf0ff, 0.35);
    fixtureL.position.set(-4, 10, 3);
    scene.add(fixtureL);
    const fixtureR = new THREE.DirectionalLight(0xeaf0ff, 0.35);
    fixtureR.position.set(4, 10, -2);
    scene.add(fixtureR);
    // a low front fill so the seated worker's front (facing away from camera) and
    // the open cubicle interior aren't muddy
    const front = new THREE.DirectionalLight(0xffffff, 0.2);
    front.position.set(0, 3, 8);
    scene.add(front);

    // ground
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.2, 40),
      new THREE.MeshLambertMaterial({ color: COL.floor }),
    );
    ground.position.y = -0.1;
    scene.add(ground);

    const cubicle = buildCubicle();
    scene.add(cubicle);
    const worker = cubicle.getObjectByName("worker") as THREE.Group;

    // ---- render loop: idle bob (sin of elapsed time), the P3 motion previewed ----
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      const t = clock.getElapsedTime();
      if (worker) worker.position.y = Math.sin(t * 2) * 0.04;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    // ---- resize ----
    const onResize = () => {
      const a = host.clientWidth / host.clientHeight;
      camera.left = (-frustum * a) / 2;
      camera.right = (frustum * a) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
