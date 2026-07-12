import { interpolate } from "remotion";
import { PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./compositions/Pitch";
import { VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./compositions/VerticalPitch";
import { PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./compositions/PerspectivePitch";
import type { CameraStage } from "../model/Segment";

type CameraFocus = CameraStage["focus"];

function resolveFocusPoint(focus: CameraFocus): { x: number; y: number } {
  if (typeof focus === "object") return { x: pitchX(focus.x), y: pitchY(focus.y) };
  switch (focus) {
    case "full":
      return { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };
    // "Left/right half" in match commentary means the wing/flank the action is
    // happening on (y-axis, near one touchline), not the attacking-vs-defensive
    // half of the pitch length (x-axis) — confirmed against the scene script's
    // own wing-play scenes, where "Zoom Left Half" frames patterns placed at
    // low y (near one touchline), not low x.
    case "left-half":
      return { x: PITCH_WIDTH / 2, y: pitchY(25) };
    case "right-half":
      return { x: PITCH_WIDTH / 2, y: pitchY(75) };
    case "box-left":
      return { x: pitchX(8), y: PITCH_HEIGHT / 2 };
    case "box-right":
      return { x: pitchX(92), y: PITCH_HEIGHT / 2 };
  }
}

/** Portrait counterpart to resolveFocusPoint — same CameraFocus values, but
 * remapped onto VerticalPitch's axes, where the goal-to-goal length runs
 * along y (not x) and the touchlines are the x-axis (not y). Two real
 * decisions this makes explicit rather than a mechanical rename:
 * - "left-half"/"right-half" stay wing/flank-relative — since touchlines are
 *   now the x-axis, they map onto x instead of y.
 * - "box-left"/"box-right" are frame-relative ends of the pitch *length*
 *   (not "which team's box") in the landscape system — pitchX(8) is always
 *   the low end regardless of which way either team is attacking. Portrait's
 *   length axis is y, so "box-left" (the low end, x=8 in landscape) maps to
 *   the low end of y (near the bottom of the frame) and "box-right" maps to
 *   the high end (near the top) — preserving "which end of the pitch",
 *   translated onto the new axis, rather than trying to preserve "left" as a
 *   literal screen direction that doesn't exist for a top/bottom pitch. */
function resolveFocusPointVertical(focus: CameraFocus): { x: number; y: number } {
  if (typeof focus === "object") return { x: vpitchX(focus.x), y: vpitchY(focus.y) };
  switch (focus) {
    case "full":
      return { x: VERTICAL_PITCH_WIDTH / 2, y: VERTICAL_PITCH_HEIGHT / 2 };
    case "left-half":
      return { x: vpitchX(25), y: VERTICAL_PITCH_HEIGHT / 2 };
    case "right-half":
      return { x: vpitchX(75), y: VERTICAL_PITCH_HEIGHT / 2 };
    case "box-left":
      return { x: VERTICAL_PITCH_WIDTH / 2, y: vpitchY(8) };
    case "box-right":
      return { x: VERTICAL_PITCH_WIDTH / 2, y: vpitchY(92) };
  }
}

/** Perspective counterpart to resolveFocusPointVertical — same CameraFocus
 * values and the same axis semantics (box-left/box-right are the near/far
 * ends of the pitch length, not literal screen sides), but resolved through
 * perspectiveProject so a zoom actually centers on where a focus point
 * visually ends up after the perspective warp, not where it would sit on
 * the flat board. */
function resolveFocusPointPerspective(focus: CameraFocus): { x: number; y: number } {
  if (typeof focus === "object") {
    const [x, y] = perspectiveProject(focus.x, focus.y);
    return { x, y };
  }
  switch (focus) {
    case "full": {
      const [x, y] = perspectiveProject(50, 50);
      return { x, y };
    }
    case "left-half": {
      const [x, y] = perspectiveProject(50, 25);
      return { x, y };
    }
    case "right-half": {
      const [x, y] = perspectiveProject(50, 75);
      return { x, y };
    }
    case "box-left": {
      const [x, y] = perspectiveProject(8, 50);
      return { x, y };
    }
    case "box-right": {
      const [x, y] = perspectiveProject(92, 50);
      return { x, y };
    }
  }
}

function transformFor(cx: number, cy: number, z: number, frameWidth: number, frameHeight: number): string {
  const tx = frameWidth / 2 / z - cx;
  const ty = frameHeight / 2 / z - cy;
  return `scale(${z}) translate(${tx}px, ${ty}px)`;
}

function cameraTransform(
  stages: CameraStage[],
  frame: number,
  durationInFrames: number,
  resolve: (focus: CameraFocus) => { x: number; y: number },
  frameWidth: number,
  frameHeight: number,
): string {
  if (stages.length === 0) return "none";

  if (stages.length === 1) {
    const { x, y } = resolve(stages[0].focus);
    return transformFor(x, y, stages[0].zoom, frameWidth, frameHeight);
  }

  const [first, second] = stages;
  const p1 = resolve(first.focus);
  const p2 = resolve(second.focus);
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cx = interpolate(progress, [0, 1], [p1.x, p2.x]);
  const cy = interpolate(progress, [0, 1], [p1.y, p2.y]);
  const z = interpolate(progress, [0, 1], [first.zoom, second.zoom]);
  return transformFor(cx, cy, z, frameWidth, frameHeight);
}

/** Computes a scale+translate CSS transform centering the pitch view on a
 * camera stage's focus point. One stage holds a static framing for the whole
 * scene; two stages pan/zoom from the first to the second across the scene's
 * duration (covers directives like "Zoom Right Half -> Follow Hakimi"). Takes
 * frame explicitly rather than calling useCurrentFrame, matching the
 * plain-function style of src/video/motion.ts. */
export function getCameraTransform(stages: CameraStage[], frame: number, durationInFrames: number): string {
  return cameraTransform(stages, frame, durationInFrames, resolveFocusPoint, PITCH_WIDTH, PITCH_HEIGHT);
}

/** Portrait counterpart to getCameraTransform, for cards rendering on
 * VerticalPitch instead of Pitch. Same stage/timing semantics — only the
 * focus-point resolution and frame dimensions differ. */
export function getCameraTransformVertical(stages: CameraStage[], frame: number, durationInFrames: number): string {
  return cameraTransform(stages, frame, durationInFrames, resolveFocusPointVertical, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT);
}

/** Perspective-board counterpart to getCameraTransformVertical, for
 * PerspectivePitch instead of VerticalPitch. */
export function getCameraTransformPerspective(stages: CameraStage[], frame: number, durationInFrames: number): string {
  return cameraTransform(stages, frame, durationInFrames, resolveFocusPointPerspective, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT);
}
