"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Worker as WorkerModel } from "@/lib/domain/types";
import { worldBounds, type Bounds } from "@/lib/data/layout";
import { officeExtent } from "@/lib/office/decor";
import type { OfficeRendererProps } from "@/lib/office/renderer";
import { Hud } from "@/components/ui/Hud";
import { hoverCardHtml } from "../hoverCard";
import {
  DARK_PALETTE,
  WORLD_SCALE,
  themeConfig,
  makeOpaqueMaterial,
  makeFrostMaterial,
  disposeGroup,
  type Palette,
} from "./scene/kit";
import { buildCubicle } from "./scene/cubicle";
import { buildAmenity } from "./scene/amenity";
import { buildWalkers, advanceWalkers, type WalkerSystem } from "./ambient/walkers";
import { buildAmenityLife, type AmenityLife } from "./ambient/amenityLife";
import { makeIsoCamera, frameOffice, resizeCamera } from "./camera";
import {
  reconcileWorkers,
  advanceWorkers,
  startMigrate,
  applyPulses,
  type CubicleModel,
} from "./reconcile";
import styles from "./OfficeStage3D.module.css";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;

/** Everything three.js - lives outside React (a per-frame re-render of 72 workers
    would be nonsense) and is torn down on unmount. */
interface Engine {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  materials: { opaque: THREE.MeshLambertMaterial; frost: THREE.MeshLambertMaterial };
  /** A subtle accent ring on the floor under the hovered worker (selection cue). */
  hoverRing: THREE.Mesh;
  /** Screen-space preview card (P6): a DOM overlay in its own high-z container,
      manually projected above the hovered worker so it sits atop other labels and
      is bottom-anchored (grows upward, never covering the worker). */
  hoverCardHost: HTMLDivElement;
  hoverCardEl: HTMLDivElement;
  hoverCardShown: boolean;
  /** Pending "show card" timer (a short delay avoids flicker while sweeping). */
  hoverTimer: number | null;
  /** The worker group currently hovered (so the ring can track a walking worker). */
  hoveredGroup: THREE.Object3D | null;
  worldGroup: THREE.Group;
  cubicles: Map<string, CubicleModel>;
  amenities: THREE.Group[];
  /** Ambient hallway commuters (P5a); null until first built. */
  walkers: WalkerSystem | null;
  /** Animated amenity actors (P5c); null until first built. */
  amenityLife: AmenityLife | null;
  /** Ambient-life policy toggle - gates walker visibility + advancement. */
  ambient: boolean;
  /** Cubicle-grid extent, for routing walk-in/out aisle paths. */
  bounds: Bounds;
  /** Active themed palette for the floor-level scenery (set from the theme prop). */
  palette: Palette;
  groundMat: THREE.MeshLambertMaterial;
  lights: {
    ambient: THREE.AmbientLight;
    hemi: THREE.HemisphereLight;
    fixtureL: THREE.DirectionalLight;
    fixtureR: THREE.DirectionalLight;
    front: THREE.DirectionalLight;
  };
  clock: THREE.Clock;
  raf: number;
  paused: boolean;
  frameSeed: number | null;
}

/**
 * The experimental 3D voxel office renderer. Builds a procedural voxel scene from
 * the same shared `OfficeRendererProps` the 2D stage consumes, viewed through a
 * fixed-iso orthographic camera. OrbitControls provides pan/zoom with rotation
 * disabled (the angle is fixed; free orbit is parked). Workers are diffed into the
 * scene by the reconciler; clicks are resolved by raycast to open the post modal.
 *
 * Enter/exit choreography and event FX are P3+; here workers appear/disappear at
 * their seats with a subtle idle bob.
 */
export function OfficeStage3D({
  subredditsById,
  layout,
  workersByCubicle,
  pulses,
  ambient,
  paused,
  interactionLocked,
  arriving,
  migration,
  theme,
  onSelectWorker,
}: OfficeRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  // Latest props, mirrored into refs so effects keyed on [layout]/[workersByCubicle]
  // can read the freshest subreddit accents / roster / arrival flag without adding
  // them as deps. Written in an effect (never during render); declared before the
  // build/reconcile effects, so on any commit the refs are fresh before they run.
  const subsRef = useRef(subredditsById);
  const workersRef = useRef(workersByCubicle);
  const arrivingRef = useRef(arriving);
  const migrationRef = useRef(migration);
  useEffect(() => {
    subsRef.current = subredditsById;
    workersRef.current = workersByCubicle;
    arrivingRef.current = arriving;
    migrationRef.current = migration;
  });

  // ---- one-time three.js setup + render loop ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171d); // --page-bg

    const camera = makeIsoCamera(w / h);

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(w, h);
    const ld = labelRenderer.domElement;
    ld.style.position = "absolute";
    ld.style.top = "0";
    ld.style.left = "0";
    ld.style.pointerEvents = "none";
    // A low positive z-index makes this container its own stacking context, so the
    // per-label z-indices CSS2DRenderer assigns stay clamped beneath it - above the
    // canvas, but below the shell overlays (Policy panel z20, HUD z20, brand z25).
    ld.style.zIndex = "1";
    host.appendChild(ld);

    const controls = new OrbitControls(camera, renderer.domElement);
    // Left-drag pans, right-drag orbits, scroll zooms. Polar limits keep the camera
    // above the floor (never under it) and off a full top-down. The frosted
    // see-through walls + the floor name rug keep each cubicle readable from any
    // angle, so no camera-relative wall logic is needed.
    controls.enableRotate = true;
    controls.rotateSpeed = 0.6;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = 1.45;
    controls.screenSpacePanning = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minZoom = MIN_ZOOM;
    controls.maxZoom = MAX_ZOOM;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    // office lighting: bright, even, overhead fill (intensities/colours themed
    // per Midnight/Daylight in the build effect via applyTheme).
    const ambient = new THREE.AmbientLight(0xf4f7ff, 0.8);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x40454f, 0.95);
    scene.add(hemi);
    const fixtureL = new THREE.DirectionalLight(0xeaf0ff, 0.4);
    fixtureL.position.set(-4, 10, 3);
    scene.add(fixtureL);
    const fixtureR = new THREE.DirectionalLight(0xeaf0ff, 0.4);
    fixtureR.position.set(4, 10, -2);
    scene.add(fixtureR);
    const front = new THREE.DirectionalLight(0xffffff, 0.25);
    front.position.set(0, 3, 8);
    scene.add(front);

    const groundMat = new THREE.MeshLambertMaterial({ color: DARK_PALETTE.floor });
    const groundGeo = new THREE.BoxGeometry(6000, 2, 6000);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -1;
    scene.add(ground);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const materials = { opaque: makeOpaqueMaterial(), frost: makeFrostMaterial() };

    // Hover selection ring: a thin accent ring laid flat on the floor, moved under
    // the hovered worker. Unlit + depthWrite off so it reads as a subtle overlay,
    // not a recolour of the worker.
    const hoverRingGeo = new THREE.RingGeometry(0.62, 0.82, 40);
    const hoverRingMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1f,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hoverRing = new THREE.Mesh(hoverRingGeo, hoverRingMat);
    hoverRing.rotation.x = -Math.PI / 2;
    hoverRing.visible = false;
    scene.add(hoverRing);

    // Preview card (P6): a DOM overlay in its own container above the CSS2D label
    // layer (z-index 1) so the card sits atop all labels, but below the shell
    // panel/HUD (z 20+). The loop projects the worker's head to screen space.
    const hoverCardHost = document.createElement("div");
    Object.assign(hoverCardHost.style, {
      position: "absolute",
      inset: "0",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2",
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(hoverCardHost);
    const hoverCardEl = document.createElement("div");
    Object.assign(hoverCardEl.style, {
      position: "absolute",
      transformOrigin: "bottom center",
      transform: "translate(-50%, -100%) scale(0.85)",
      opacity: "0",
      transition: "opacity 120ms ease, transform 120ms ease",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    hoverCardHost.appendChild(hoverCardEl);

    const engine: Engine = {
      scene,
      camera,
      renderer,
      labelRenderer,
      controls,
      raycaster: new THREE.Raycaster(),
      materials,
      hoverRing,
      hoverCardHost,
      hoverCardEl,
      hoverCardShown: false,
      hoverTimer: null,
      hoveredGroup: null,
      worldGroup,
      cubicles: new Map(),
      amenities: [],
      walkers: null,
      amenityLife: null,
      ambient: false,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      palette: DARK_PALETTE,
      groundMat,
      lights: { ambient, hemi, fixtureL, fixtureR, front },
      clock: new THREE.Clock(),
      raf: 0,
      paused: false,
      frameSeed: null,
    };
    engineRef.current = engine;

    const hoverPos = new THREE.Vector3();
    const animate = () => {
      const t = engine.clock.getElapsedTime();
      // Progress arrivals/departures and apply the idle bob to seated workers.
      advanceWorkers(engine.cubicles, t, engine.paused);
      // Ambient hallway commuters, gated by the ambient policy (frozen while paused).
      if (engine.walkers) {
        engine.walkers.group.visible = engine.ambient;
        if (engine.ambient && !engine.paused) advanceWalkers(engine.walkers, t);
      }
      if (engine.amenityLife) {
        engine.amenityLife.group.visible = engine.ambient;
        if (engine.ambient && !engine.paused) engine.amenityLife.update(t);
      }
      // Keep the hover ring under the hovered worker (tracks a walking one); hide it
      // if that worker has since been disposed (walked out).
      const hg = engine.hoveredGroup;
      if (hg && hg.parent) {
        hg.getWorldPosition(hoverPos);
        // Sit clear of the cubicle floor tile (top 0.06) and rug (0.07) to avoid
        // z-fighting; still below the seated worker so it reads as an under-ring.
        engine.hoverRing.position.set(hoverPos.x, 0.14, hoverPos.z);
        if (engine.hoverCardShown) {
          // Project a point just above the head to screen; the card is bottom-anchored
          // there (transform translate(-50%,-100%)) so it grows upward.
          hoverPos.y += 2.2;
          hoverPos.project(engine.camera);
          const w = host.clientWidth;
          const h2 = host.clientHeight;
          engine.hoverCardEl.style.left = `${(hoverPos.x * 0.5 + 0.5) * w}px`;
          engine.hoverCardEl.style.top = `${(-hoverPos.y * 0.5 + 0.5) * h2 - 8}px`;
        }
      } else if (hg) {
        // hovered worker was disposed (walked out): clear everything.
        engine.hoveredGroup = null;
        engine.hoverRing.visible = false;
        engine.hoverCardShown = false;
        engine.hoverCardEl.style.opacity = "0";
        host.style.cursor = "";
      }
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      engine.raf = requestAnimationFrame(animate);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const nw = host.clientWidth || 1;
      const nh = host.clientHeight || 1;
      renderer.setSize(nw, nh);
      labelRenderer.setSize(nw, nh);
      resizeCamera(camera, nw / nh);
    });
    ro.observe(host);

    return () => {
      cancelAnimationFrame(engine.raf);
      if (engine.hoverTimer != null) clearTimeout(engine.hoverTimer);
      ro.disconnect();
      controls.dispose();
      for (const cub of engine.cubicles.values()) disposeGroup(cub.built.group);
      for (const a of engine.amenities) disposeGroup(a);
      if (engine.walkers) engine.walkers.dispose();
      if (engine.amenityLife) engine.amenityLife.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      materials.opaque.dispose();
      materials.frost.dispose();
      hoverRingGeo.dispose();
      hoverRingMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      if (ld.parentNode === host) host.removeChild(ld);
      if (hoverCardHost.parentNode === host) host.removeChild(hoverCardHost);
      engineRef.current = null;
    };
  }, []);

  // ---- (re)build the world on layout OR theme change (initial + shuffle + theme) ----
  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;

    // Apply the theme first: palette (baked into the rebuilt geometry below) plus
    // the scene-level colours/lights (updated in place, no rebuild needed for those).
    const cfg = themeConfig(theme);
    engine.palette = cfg.palette;
    if (engine.scene.background instanceof THREE.Color) engine.scene.background.set(cfg.background);
    engine.groundMat.color.set(cfg.palette.floor);
    engine.materials.frost.color.set(cfg.palette.wallFrost);
    const L = engine.lights;
    L.ambient.intensity = cfg.lights.ambient;
    L.hemi.intensity = cfg.lights.hemi;
    L.hemi.color.set(cfg.lights.hemiSky);
    L.hemi.groundColor.set(cfg.lights.hemiGround);
    L.fixtureL.intensity = cfg.lights.fixture;
    L.fixtureR.intensity = cfg.lights.fixture;
    L.front.intensity = cfg.lights.front;

    // MIGRATION (shuffle): same subreddits + sizes, only grid positions changed.
    // Rather than rebuild, reposition each cubicle group and walk its workers from
    // their old desk to the new one (walkBetween). Only runs when a migration is in
    // flight and the cubicle set matches what's already built.
    const mig = migrationRef.current;
    const canMigrate =
      !!mig &&
      engine.cubicles.size === layout.cubicles.length &&
      layout.cubicles.every((c) => engine.cubicles.has(c.subredditId));
    if (mig && canMigrate) {
      engine.bounds = worldBounds(layout, 0);
      const now = engine.clock.getElapsedTime();
      for (const cubicle of layout.cubicles) {
        const prev = engine.cubicles.get(cubicle.subredditId)!;
        prev.built.group.position.set(
          cubicle.position.x * WORLD_SCALE,
          0,
          cubicle.position.y * WORLD_SCALE,
        );
        // Replace the model entry (fresh object) so it carries the new cubicle -
        // needed so later walk-outs route from the new grid cell.
        const model: CubicleModel = { cubicle, built: prev.built, workers: prev.workers };
        engine.cubicles.set(cubicle.subredditId, model);
        const fromPos = mig.from[cubicle.subredditId];
        for (const [wid, h] of model.workers) {
          if (h.anim?.kind === "out") continue; // let departing workers keep leaving
          startMigrate(h, wid, cubicle, fromPos, now);
        }
      }
      engine.frameSeed = layout.seed; // extent unchanged; don't reframe mid-walk
      return;
    }

    // Tear down the previous world. Workers are children of their cubicle group,
    // so disposing the cubicle group tears down their geometry + labels too.
    for (const cub of engine.cubicles.values()) {
      engine.worldGroup.remove(cub.built.group);
      disposeGroup(cub.built.group);
    }
    engine.cubicles.clear();
    for (const a of engine.amenities) {
      engine.worldGroup.remove(a);
      disposeGroup(a);
    }
    engine.amenities = [];
    engine.bounds = worldBounds(layout, 0);

    // Build cubicles (each carries a floor name rug at its front entrance).
    for (const cubicle of layout.cubicles) {
      const sub = subsRef.current[cubicle.subredditId];
      if (!sub) continue;
      const built = buildCubicle(
        cubicle,
        engine.materials,
        { name: sub.displayName, accent: sub.color },
        engine.palette,
      );
      engine.worldGroup.add(built.group);
      const model: CubicleModel = { cubicle, built, workers: new Map() };
      engine.cubicles.set(cubicle.subredditId, model);
      // Populate immediately from the latest roster so a shuffle doesn't blank out.
      // (A freshly built office is not "arriving" here - the arrival walk-in is
      // driven by the first populated snapshot in the worker-reconcile effect.)
      reconcileWorkers(
        model,
        workersRef.current[cubicle.subredditId] ?? [],
        engine.materials.opaque,
        sub.color,
        engine.bounds,
        engine.clock.getElapsedTime(),
        false,
      );
    }

    // Build amenities.
    for (const placement of layout.amenities) {
      const a = buildAmenity(placement, engine.materials, engine.palette);
      engine.worldGroup.add(a);
      engine.amenities.push(a);
    }

    // Ambient hallway commuters (rebuilt with the office; visibility + advancement
    // are gated by the `ambient` policy in the render loop).
    if (engine.walkers) {
      engine.worldGroup.remove(engine.walkers.group);
      engine.walkers.dispose();
    }
    engine.walkers = buildWalkers(layout);
    engine.worldGroup.add(engine.walkers.group);

    // Animated amenity actors (rebuilt with the office; gated in the loop).
    if (engine.amenityLife) {
      engine.worldGroup.remove(engine.amenityLife.group);
      engine.amenityLife.dispose();
    }
    engine.amenityLife = buildAmenityLife(layout, engine.materials.opaque);
    engine.worldGroup.add(engine.amenityLife.group);

    // Frame the office on first build and on each shuffle (layout seed change).
    if (engine.frameSeed !== layout.seed) {
      const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
      frameOffice(engine.camera, engine.controls, officeExtent(layout), aspect);
      engine.frameSeed = layout.seed;
    }
  }, [layout, theme]);

  // ---- reconcile worker rosters into the scene each snapshot ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = engine.clock.getElapsedTime();
    for (const [id, model] of engine.cubicles) {
      const color = subsRef.current[id]?.color ?? "#888888";
      reconcileWorkers(
        model,
        workersByCubicle[id] ?? [],
        engine.materials.opaque,
        color,
        engine.bounds,
        now,
        arrivingRef.current,
      );
    }
  }, [workersByCubicle]);

  // ---- one-shot event reactions (surge/new-post/trending) from pulses ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    applyPulses(engine.cubicles, pulses, engine.clock.getElapsedTime());
  }, [pulses]);

  // Note: subreddit name + accent are read from `subsRef` at build/reconcile time.
  // They're present from first paint (the office's sub set is known up front); later
  // enrichment only adds community icons, which the 3D labels don't use - so there's
  // no separate "update labels on enrich" effect.

  // ---- freeze idle motion / camera interaction while a modal is open ----
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.paused = paused;
  }, [paused]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.controls.enabled = !interactionLocked;
  }, [interactionLocked]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.ambient = ambient;
  }, [ambient]);

  // ---- picking + hover: raycast worker groups ----
  const down = useRef({ x: 0, y: 0 });

  /** Raycast the pointer against worker groups; returns the worker group or null. */
  function pickGroup(clientX: number, clientY: number): THREE.Object3D | null {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return null;
    const rect = host.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    engine.raycaster.setFromCamera(ndc, engine.camera);
    const groups: THREE.Object3D[] = [];
    for (const cub of engine.cubicles.values()) {
      for (const handle of cub.workers.values()) groups.push(handle.group);
    }
    const hits = engine.raycaster.intersectObjects(groups, true);
    if (hits.length === 0) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.worker) o = o.parent;
    return o;
  }

  /** Highlight the hovered worker: floor ring + pointer cursor, and (after a short
      delay) a preview card that expands from the score chip. The render loop tracks
      both to the worker and clears them if it's disposed. `null` clears. */
  function setHover(group: THREE.Object3D | null) {
    const engine = engineRef.current;
    if (!engine || engine.hoveredGroup === group) return;
    const prev = engine.hoveredGroup;
    engine.hoveredGroup = group;
    engine.hoverRing.visible = !!group;
    const host = hostRef.current;

    // Restore the previously-hovered worker's small score chip.
    if (prev) {
      const obj = prev.userData.scoreObj as { visible: boolean } | undefined;
      if (obj) obj.visible = true;
    }
    if (engine.hoverTimer != null) {
      clearTimeout(engine.hoverTimer);
      engine.hoverTimer = null;
    }

    if (group) {
      const w = group.userData.worker as WorkerModel | undefined;
      if (w) engine.hoverCardEl.innerHTML = hoverCardHtml(w);
      const show = () => {
        if (engineRef.current?.hoveredGroup !== group) return;
        const obj = group.userData.scoreObj as { visible: boolean } | undefined;
        if (obj) obj.visible = false; // hide the chip; the card takes over
        engine.hoverCardShown = true;
        engine.hoverCardEl.style.opacity = "1";
        engine.hoverCardEl.style.transform = "translate(-50%, -100%) scale(1)";
      };
      // Already showing (sweeping worker to worker): swap instantly; else brief delay.
      if (engine.hoverCardShown) show();
      else engine.hoverTimer = window.setTimeout(show, 120);
      if (host) host.style.cursor = "pointer";
    } else {
      engine.hoverCardShown = false;
      engine.hoverCardEl.style.opacity = "0";
      engine.hoverCardEl.style.transform = "translate(-50%, -100%) scale(0.85)";
      if (host) host.style.cursor = "";
    }
  }

  function pick(clientX: number, clientY: number) {
    const group = pickGroup(clientX, clientY);
    if (group?.userData.worker) onSelectWorker(group.userData.worker as WorkerModel);
  }

  function zoomBy(factor: number) {
    const engine = engineRef.current;
    if (!engine) return;
    engine.camera.zoom = clamp(engine.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    engine.camera.updateProjectionMatrix();
  }

  function fit() {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;
    const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
    frameOffice(engine.camera, engine.controls, officeExtent(layout), aspect);
  }

  return (
    <div
      ref={hostRef}
      className={styles.stage}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        setHover(null); // starting a drag: revert to the grab cursor (CSS)
      }}
      onPointerMove={(e) => {
        // Hover only when idle: not while a modal is open, and not mid-drag (pan).
        if (interactionLocked || e.buttons !== 0) {
          if (interactionLocked) setHover(null);
          return;
        }
        setHover(pickGroup(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (interactionLocked) return;
        const moved = Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y);
        if (moved < 6) pick(e.clientX, e.clientY);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <Hud
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onFit={fit}
      />
      <div className={styles.hint}>
        drag to pan · right-drag to orbit · scroll to zoom · click a worker
      </div>
    </div>
  );
}
