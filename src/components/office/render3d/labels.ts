import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import styles from "./labels.module.css";

/** Compact score, matching the 2D worker readout (e.g. 1234 -> "1.2k"). */
export function formatScore(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function labelObject(text: string, className: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

/** A worker's score readout (floats above the head; text updated in place on churn). */
export function makeScoreLabel(text: string): CSS2DObject {
  return labelObject(text, styles.score);
}
