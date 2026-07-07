import type {
  Subreddit,
  Worker as WorkerModel,
  WorkersByCubicle,
  Layout,
  OfficeTheme,
} from "@/lib/domain/types";
import type { LayoutMigration, Pulse } from "@/lib/office/useOffice";

/**
 * The contract every office renderer implements. `OfficeApp` (the shell) runs the
 * shared `useOffice` engine and passes exactly this to whichever renderer is
 * mounted - the 2D SVG `OfficeStage2D` or the experimental 3D voxel stage. Both
 * consume the same world data; each owns its own camera, pointer handling, and
 * picking internally (so the shell never knows which renderer is active).
 *
 * This is renderer-agnostic on purpose: no SVG/DOM or three.js types leak in.
 */
export interface OfficeRendererProps {
  /** Subreddit lookup for cubicle accent + labels. */
  subredditsById: Record<string, Subreddit>;
  /** The office floor plan (cubicle + amenity positions in world units). */
  layout: Layout;
  /** Current roster per cubicle (the workers to draw). */
  workersByCubicle: WorkersByCubicle;
  /** One-shot event triggers keyed by worker id (surge/trending/new-post). */
  pulses: Record<string, Pulse>;
  /** Ambient office life (decorative NPCs) enabled. */
  ambient: boolean;
  /** Active office theme (the 3D renderer themes its palette/lighting from this;
      the 2D renderer themes via CSS variables and ignores it). */
  theme: OfficeTheme;
  /** Freeze all background motion (a modal is open with pause-on-modal enabled). */
  paused: boolean;
  /**
   * Freeze camera interaction (pan/zoom/orbit). Set while a modal is open so a
   * text-selection drag can't move the office behind the backdrop.
   */
  interactionLocked: boolean;
  /** True while the office first fills: the roster walks in from the hallway edges. */
  arriving: boolean;
  /** Set for one shuffle relayout: previous cubicle positions so workers walk desk-to-desk. */
  migration: LayoutMigration | null;
  /** Open the post modal for a clicked worker. */
  onSelectWorker: (worker: WorkerModel) => void;
}
