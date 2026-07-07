import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Bounds } from "@/lib/data/layout";
import { WORLD_SCALE } from "./scene/kit";

/**
 * Fixed dimetric/iso view direction (offset from the target). Orthographic, so the
 * distance along this ray doesn't change scale - only the frustum size (zoom) does.
 * This is the "angled bird's-eye" that mimics the 2D overview but tilted. Free
 * orbit (letting the user change this direction) is parked to a later phase.
 */
export const ISO_DIR = new THREE.Vector3(5, 6.5, 7).normalize();

/** Extra framing margin so the office doesn't touch the viewport edges. */
const FRAME_FILL = 1.2;

export function makeIsoCamera(aspect: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 4000);
  return cam;
}

/**
 * Frame the whole office (grid + commons) within the ortho frustum at the iso
 * angle, and point the camera (and OrbitControls target) at its centre. World
 * bounds map to the ground plane: (x, y) -> (x, 0, y), scaled to scene units.
 * Over-fits slightly (ignores the iso vertical foreshortening) so nothing clips.
 */
export function frameOffice(
  cam: THREE.OrthographicCamera,
  controls: OrbitControls,
  extent: Bounds,
  aspect: number,
): void {
  const S = WORLD_SCALE;
  const center = new THREE.Vector3(
    (extent.minX + extent.width / 2) * S,
    0,
    (extent.minY + extent.height / 2) * S,
  );

  const halfW = 0.5 * extent.width * S * FRAME_FILL;
  const halfD = 0.5 * extent.height * S * FRAME_FILL;
  // Ensure both the width (2*right) and height (2*top) cover the office footprint.
  const top = Math.max(halfD, halfW / aspect);
  cam.top = top;
  cam.bottom = -top;
  cam.right = top * aspect;
  cam.left = -top * aspect;
  cam.zoom = 1;
  cam.updateProjectionMatrix();

  cam.position.copy(center).addScaledVector(ISO_DIR, 800);
  controls.target.copy(center);
  cam.lookAt(center);
  controls.update();
}

/** Resize the ortho frustum to a new aspect while preserving the vertical extent. */
export function resizeCamera(cam: THREE.OrthographicCamera, aspect: number): void {
  const top = cam.top;
  cam.right = top * aspect;
  cam.left = -top * aspect;
  cam.updateProjectionMatrix();
}
