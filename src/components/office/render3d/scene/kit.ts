import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Shared voxel-building primitives. Everything the 3D office draws is procedural
 * box geometry (no imported models/assets, per the plan). Each worker/desk/cubicle
 * is a set of coloured boxes merged into ONE geometry drawn by a single
 * vertex-coloured mesh, so a worker is one draw call rather than a dozen.
 */

/** 2D layout world units (e.g. CUBICLE_W = 320) scaled down to three.js units. */
export const WORLD_SCALE = 1 / 40;

/**
 * Theme-neutral worker colours (skin/hair/pants/chair) - read fine on either
 * theme, so workers aren't rebuilt when the theme switches.
 */
export const PALETTE = {
  chair: 0x2b2f37,
  skin: 0xe0b48c,
  hair: 0x35281c,
  pants: 0x3a4150,
} as const;

/** A full themed palette for the floor-level scenery (cubicles, amenities, rug). */
export interface Palette {
  floor: number;
  floorTile: number;
  wallFrost: number;
  desk: number;
  deskHi: number;
  chair: number;
  metal: number;
  monitor: number;
  nameBg: number;
  ink: number;
  rugMat: number;
}

/** Midnight (dark), floor lifted a touch from globals.css to brighten the room. */
export const DARK_PALETTE: Palette = {
  floor: 0x444c58,
  floorTile: 0x4b5360,
  wallFrost: 0x9fd8ff,
  desk: 0x7a5230,
  deskHi: 0x96683f,
  chair: 0x2b2f37,
  metal: 0x8b93a3,
  monitor: 0x14161c,
  nameBg: 0x1e222b,
  ink: 0xeef1f6,
  rugMat: 0x12151b,
};

/** Daylight (light), from the globals.css `html[data-theme="light"]` values. */
export const LIGHT_PALETTE: Palette = {
  floor: 0xeef0ea,
  floorTile: 0xe4e7dd,
  wallFrost: 0x7fc5f0,
  desk: 0xb98a5a,
  deskHi: 0xcfa478,
  chair: 0x9aa08f,
  metal: 0x9aa2ac,
  monitor: 0x2a2e38,
  nameBg: 0xffffff,
  ink: 0x20242c,
  rugMat: 0xc7cabd,
};

/** Per-theme scene tuning: palette, background clear colour, and light intensities. */
export interface ThemeConfig {
  palette: Palette;
  background: number;
  lights: {
    ambient: number;
    hemiSky: number;
    hemiGround: number;
    hemi: number;
    fixture: number;
    front: number;
  };
}

export function themeConfig(theme: "dark" | "light"): ThemeConfig {
  if (theme === "light") {
    return {
      palette: LIGHT_PALETTE,
      background: 0xeef0ea,
      lights: {
        ambient: 0.95,
        hemiSky: 0xffffff,
        hemiGround: 0xc7cabd,
        hemi: 1.0,
        fixture: 0.5,
        front: 0.3,
      },
    };
  }
  return {
    palette: DARK_PALETTE,
    background: 0x181c24,
    lights: {
      ambient: 0.8,
      hemiSky: 0xf4f7ff,
      hemiGround: 0x40454f,
      hemi: 0.95,
      fixture: 0.4,
      front: 0.25,
    },
  };
}

/** A single box: colour + size (w,h,d) + centre (x,y,z), all in three.js units. */
export interface BoxSpec {
  color: THREE.ColorRepresentation;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
}

/** A BoxGeometry translated to its centre with a baked per-vertex colour. */
function coloredBox({ color, w, h, d, x, y, z }: BoxSpec): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Merge coloured boxes into one geometry (drawn with a single vertex-coloured
 * material). The per-box geometries are disposed after the merge; the caller owns
 * the returned geometry and must dispose it when the object is removed.
 */
export function mergeBoxes(specs: BoxSpec[]): THREE.BufferGeometry {
  const parts = specs.map(coloredBox);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("mergeBoxes: geometry merge failed");
  return merged;
}

/** The shared opaque material for all vertex-coloured voxel meshes. */
export function makeOpaqueMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * Frosted-glass cubicle wall material: low-opacity, and depthWrite off so
 * overlapping panes don't fight and workers behind stay visible (the plan's
 * transparency mitigation).
 */
export function makeFrostMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: DARK_PALETTE.wallFrost, // themed at runtime (set per active theme)
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
}

/**
 * Fully tear down a group's subtree: dispose every geometry (materials are shared,
 * disposed once at unmount) AND remove any CSS2DObject DOM elements from the overlay.
 *
 * The label cleanup is essential: a CSS2DObject only removes its own `element` when
 * IT is removed from its parent (via its `removed` listener). Removing an ancestor
 * (e.g. a worker group leaving its cubicle) does not fire that event on descendant
 * labels, so their DOM would be orphaned and stick on screen. We remove the elements
 * directly here, matching what CSS2DRenderer does on its own `removed` path.
 */
export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    // Dispose cubicle-owned materials + their textures (e.g. the name rug); the
    // shared opaque/frost materials are left alone (disposed once at unmount).
    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && mat.userData?.owned) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
    const el = (o as unknown as { element?: unknown }).element;
    if (el instanceof HTMLElement && el.parentNode) el.parentNode.removeChild(el);
  });
}
