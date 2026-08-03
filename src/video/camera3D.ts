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
// "cinematic-drift" is a different geometry family from the rest (a forward-
// looking dolly/truck, not an orbit around a fixed target) — added for
// non-pitch cinematic scenes (see InfiniteRoadBenchmark.tsx) where the
// camera is following/leading motion down an axis rather than circling a
// subject.
export type CameraStyle3D = "sway" | "orbit" | "sideline-pan" | "dolly-in" | "two-team-reveal" | "cinematic-drift";

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
  /** two-team-reveal only: the second target to hold on (see `target` above
   * for the first) — typically one team's cluster center, then the other's. */
  targetB?: [number, number, number];
  /** cinematic-drift only: the camera's starting world position (before
   * drift/push-in are applied). */
  basePosition?: [number, number, number];
  /** cinematic-drift only: lateral truck sway amplitude, world units. */
  driftAmplitude?: number;
  /** cinematic-drift only: frames per full lateral sway cycle — kept longer
   * than the scene's own duration by convention so a short clip only ever
   * shows one slow sweep, never a visible back-and-forth repeat. */
  driftPeriodFrames?: number;
  /** cinematic-drift only: fraction (0-1) of the CURRENT distance to
   * `target` the camera closes over the full duration — the "push-in".
   * Deliberately relative, not a raw world-unit distance: a fixed-unit push
   * (this option's original shape) overshoots badly on any scene whose
   * scale/zoom it wasn't hand-tuned against — confirmed against a real
   * render where it pushed the camera far enough that authored content fell
   * out of frame entirely. A fraction of current distance scales correctly
   * regardless of world size, and internally clamps well short of 1 so the
   * camera can never push through/past its own subject. */
  pushInFraction?: number;
  /** cinematic-drift only: progress fraction (0-1) at which the camera
   * subtly reframes toward `reframeTarget` instead of `target` — e.g. the
   * moment a scene's own focal action (an overtake) happens. Omitted means
   * no reframe, camera holds on `target` throughout. */
  reframeAtProgress?: number;
  /** cinematic-drift only: the target to reframe toward (see
   * `reframeAtProgress`). */
  reframeTarget?: [number, number, number];
  /** cinematic-drift only: fraction of the total duration the reframe
   * transition itself takes, centered on `reframeAtProgress`. */
  reframeWindow?: number;
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

/** A close, legible hold on `target` (e.g. one team's cluster center),
 * gliding across to hold equally close on `targetB` (the other team's) —
 * built specifically for Formation 3D, where a single wide shot trying to
 * fit two full XIs at once (the original "sway"/"orbit" behavior, radius
 * ~30) left every player marker and name label too small and far away to
 * read (confirmed via a real render, not just reasoned about — see
 * feedback_formation3d_camera_too_wide memory). Spends the first 40% of the
 * scene held on `target`, the middle 20% gliding, the last 40% held on
 * `targetB` — a "look at this side, now look at that side" reveal rather
 * than a single shot compromising on both. Falls back to a plain hold on
 * `target` alone if `targetB` isn't supplied (e.g. a single-side Formation
 * scene, which has nothing to reveal a second half of). */
export function getTwoTeamRevealPose(frame: number, durationInFrames: number, options: CameraOptions3D = {}): CameraPose3D {
  const { radius = 13, height = 9, baseAngleDegrees = 180, target = [0, 1.2, 0], targetB, fov = 42 } = options;
  const duration = Math.max(durationInFrames, 1);
  const t = targetB
    ? interpolate(frame, [0, duration * 0.4, duration * 0.6, duration], [0, 0, 1, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 0;
  const end = targetB ?? target;
  const currentTarget: [number, number, number] = [
    target[0] + (end[0] - target[0]) * t,
    target[1] + (end[1] - target[1]) * t,
    target[2] + (end[2] - target[2]) * t,
  ];
  const angle = (baseAngleDegrees * Math.PI) / 180;
  const position: [number, number, number] = [
    currentTarget[0] + Math.cos(angle) * radius,
    height,
    currentTarget[2] + Math.sin(angle) * radius,
  ];
  return { position, target: currentTarget, fov };
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A forward-looking dolly/truck, not an orbit — the camera drifts laterally
 * and creeps toward its subject continuously, the way a real handheld/dolly
 * shot never sits perfectly still even on an otherwise "held" beat. Every
 * value is still a pure function of `frame`, same convention as every other
 * pose function in this file. Lateral drift is computed from raw `frame`
 * (not the 0-1 `progress` the push-in uses) specifically so its period can
 * be tuned independently and stay slow/non-repeating within a short clip,
 * while the push-in eases smoothly across the whole duration via
 * `progressFor`. An optional `reframeAtProgress`/`reframeTarget` lets a
 * scene's own focal beat (e.g. an overtake) pull the camera's attention
 * without breaking the continuous drift — the reframe blends the TARGET
 * only, position keeps drifting/pushing in underneath it. */
export function getCinematicDriftPose(frame: number, durationInFrames: number, options: CameraOptions3D = {}): CameraPose3D {
  // Defaults deliberately restrained, not "alive" in the sense of visibly
  // swaying — a camera that continuously drifts left-right on every single
  // scene reads as nervous/gimmicky, not directed, confirmed against a real
  // render (this was the actual complaint: constant lateral sway with no
  // relationship to content). Real cinematography holds a shot far more
  // than it moves it, and moves ONLY when a beat earns it — for a
  // multi-phase scene, that deliberate move is already the phase-to-phase
  // camera target/zoom glide Canvas3D already does at a reframe, not this
  // function's own continuous drift. So the drift/push-in here default to
  // barely perceptible (just enough that a long static hold doesn't read as
  // a frozen still), and a scene that wants a real, noticeable move should
  // get it from a phase reframe, not from cranking these back up.
  const {
    basePosition = [0, 6, 14],
    target = [0, 1, -20],
    driftAmplitude = 0.18,
    driftPeriodFrames = 340,
    pushInFraction = 0.05,
    fov = 42,
    reframeAtProgress,
    reframeTarget,
    reframeWindow = 0.12,
  } = options;
  // Hard ceiling regardless of what a caller passes — the camera can never
  // close more than a third of its own starting distance to the subject, so
  // it's structurally impossible for push-in alone to reach (let alone pass
  // through) authored content, at any scene scale.
  const safePushInFraction = Math.min(Math.max(pushInFraction, 0), 0.35);

  const progress = progressFor(frame, durationInFrames);
  const driftX = Math.sin((frame / driftPeriodFrames) * Math.PI * 2) * driftAmplitude;

  let currentTarget = target;
  if (reframeTarget && reframeAtProgress !== undefined) {
    const reframeT = interpolate(
      progress,
      [reframeAtProgress - reframeWindow / 2, reframeAtProgress + reframeWindow / 2],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) },
    );
    currentTarget = lerp3(target, reframeTarget, reframeT);
  }

  const viewLength = Math.hypot(target[0] - basePosition[0], target[1] - basePosition[1], target[2] - basePosition[2]) || 1;
  const dir: [number, number, number] = [
    (target[0] - basePosition[0]) / viewLength,
    (target[1] - basePosition[1]) / viewLength,
    (target[2] - basePosition[2]) / viewLength,
  ];
  const pushed = viewLength * safePushInFraction * progress;
  const position: [number, number, number] = [
    basePosition[0] + dir[0] * pushed + driftX,
    basePosition[1] + dir[1] * pushed,
    basePosition[2] + dir[2] * pushed,
  ];

  return { position, target: currentTarget, fov };
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
    case "two-team-reveal":
      return getTwoTeamRevealPose(frame, durationInFrames, options);
    case "cinematic-drift":
      return getCinematicDriftPose(frame, durationInFrames, options);
    case "sway":
    default:
      return getOrbitCameraPose(frame, durationInFrames, options);
  }
}
