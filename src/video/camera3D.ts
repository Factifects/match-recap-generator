import { Easing, interpolate } from "remotion";

export interface CameraPose3D {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

// Selectable per scene (see `cameraStyle` on the tactical-board-3d/
// formation-3d/shot-map-3d Data schemas) — "sway" is the original v1 behavior
// (a narrow behind-goal arc), the other three were added directly off
// real feedback that a single fixed move wasn't enough variety.
export type CameraStyle3D = "sway" | "orbit" | "sideline-pan" | "dolly-in";

export interface CameraOptions3D {
  /** sway/orbit: orbit radius. dolly-in: starting radius. */
  radius?: number;
  height?: number;
  target?: [number, number, number];
  fov?: number;
  /** sway/orbit only. */
  sweepDegrees?: number;
  /** sway/orbit/dolly-in: the angle (behind-goal = 180°) the move is centered/fixed on. */
  baseAngleDegrees?: number;
  /** sideline-pan only: how far along the length axis the camera pans, total. */
  panRange?: number;
  /** sideline-pan only: how far outside the touchline the camera sits. */
  sidelineOffset?: number;
  /** dolly-in only: ending (tight) radius. */
  endRadius?: number;
}

function progressFor(frame: number, durationInFrames: number): number {
  return interpolate(frame, [0, Math.max(durationInFrames, 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}

/** A slow, one-way arc around a fixed target — every value here is a pure
 * function of `frame`/`durationInFrames`, matching this codebase's existing
 * camera.ts convention (getCameraTransformPerspective etc.), just producing a
 * 3D position/lookAt pair instead of a CSS transform string. Deliberately
 * NOT driven by @react-three/fiber's `useFrame` (real-time, wrong tool inside
 * Remotion's per-frame render model) — every card computes this once via
 * `useCurrentFrame()` the same way it computes every other frame-driven
 * value, then hands the result to CameraRig3D.tsx to apply.
 *
 * `baseAngleDegrees=180` sits the camera behind the "near" (low-x) goal
 * looking up the +X length axis, matching PerspectivePitch's own "camera
 * behind the near goal" framing. With the default (narrow) `sweepDegrees`
 * this is the "sway" style; "orbit" reuses this same function with a wider
 * sweep passed in by resolveCameraPose3D below. */
export function getOrbitCameraPose(frame: number, durationInFrames: number, options: CameraOptions3D = {}): CameraPose3D {
  const { radius = 30, height = 16, sweepDegrees = 36, baseAngleDegrees = 180, target = [0, 1.2, 0], fov = 48 } = options;
  const progress = progressFor(frame, durationInFrames);
  const angleDegrees = baseAngleDegrees - sweepDegrees / 2 + progress * sweepDegrees;
  const angle = (angleDegrees * Math.PI) / 180;
  // Orbit around the TARGET's own x/z, not world origin — a target far from
  // pitch center (a box-crowded scene) previously still circled the origin
  // and merely pointed at the target from however far away that left the
  // camera, so `radius` never actually meant "distance to subject."
  const position: [number, number, number] = [target[0] + Math.cos(angle) * radius, height, target[2] + Math.sin(angle) * radius];
  return { position, target, fov };
}

/** The classic broadcast tactics-cam angle: parked outside one touchline at
 * a modest height, panning along the length axis while always looking back
 * at the pitch center — a cameraman tracking play end to end, rather than
 * an orbit around a fixed point. */
export function getSidelinePanPose(frame: number, durationInFrames: number, options: CameraOptions3D = {}): CameraPose3D {
  const { panRange = 16, sidelineOffset = 20, height = 8, target = [0, 1, 0], fov = 42 } = options;
  const progress = progressFor(frame, durationInFrames);
  const x = -panRange / 2 + progress * panRange;
  // Pan range/sideline offset are relative to the target, same reasoning as
  // getOrbitCameraPose's fix above.
  const position: [number, number, number] = [target[0] + x, height, target[2] + sidelineOffset];
  return { position, target, fov };
}

/** Fixed viewing angle (no sway), radius closing from a wide establishing
 * distance down to a tight one over the scene's duration — a push-in rather
 * than a pan/orbit. */
export function getDollyInPose(frame: number, durationInFrames: number, options: CameraOptions3D = {}): CameraPose3D {
  const { radius = 42, endRadius = 18, height = 14, baseAngleDegrees = 180, target = [0, 1.2, 0], fov = 46 } = options;
  const progress = progressFor(frame, durationInFrames);
  const currentRadius = radius + (endRadius - radius) * progress;
  const angle = (baseAngleDegrees * Math.PI) / 180;
  const position: [number, number, number] = [target[0] + Math.cos(angle) * currentRadius, height, target[2] + Math.sin(angle) * currentRadius];
  return { position, target, fov };
}

/** Single entry point every 3D card calls instead of picking a pose function
 * directly — keeps `cameraStyle` -> implementation a one-place mapping, same
 * role resolveVisual plays for Scene Type -> visual kind. "orbit" is
 * deliberately just `getOrbitCameraPose` with a wider sweep, not a separate
 * function — the two styles are the same motion, different amplitude. */
export function resolveCameraPose3D(
  style: CameraStyle3D,
  frame: number,
  durationInFrames: number,
  options: CameraOptions3D = {},
): CameraPose3D {
  switch (style) {
    case "orbit":
      return getOrbitCameraPose(frame, durationInFrames, { sweepDegrees: 110, ...options });
    case "sideline-pan":
      return getSidelinePanPose(frame, durationInFrames, options);
    case "dolly-in":
      return getDollyInPose(frame, durationInFrames, options);
    case "sway":
    default:
      return getOrbitCameraPose(frame, durationInFrames, options);
  }
}
