import React from "react";
import { useCurrentFrame, staticFile, interpolate } from "remotion";
import { Lottie } from "@remotion/lottie";
import { Gif } from "@remotion/gif";
import { COLORS, FONT_FAMILY, TITLE_STYLE, PLAYER_LABEL_STYLE, colorForCharacter, FPS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, drawIn, pulse, settleFrom, type EasingName } from "../motion";
import { CANVAS_ICON_COMPONENTS } from "../canvasIcons";
import { LOTTIE_ASSETS } from "../lottieAssets";
import { resolveObjectPosition } from "../canvasLayout";
import { resolveEasing } from "../keyframes";
import type { SharedVisualProps, CanvasData } from "../sharedVisualProps";

// Exported so Canvas3D.tsx reuses the exact same on-screen footprint instead
// of duplicating these two numbers.
export const CANVAS_SIZE = { landscape: { width: 1400, height: 820 }, portrait: { width: 900, height: 1200 } };
const DOT_RADIUS = 16;
// Canvas's own dot-label size — deliberately NOT just PLAYER_LABEL_STYLE
// (that constant is shared with TacticalBoard/Formation, whose pitch discs
// sit much closer together and need a compact tag). Canvas dots have more
// breathing room, and at native 1920x1080 rendering PLAYER_LABEL_STYLE's
// 16px reads as a handful of pixels once a viewer's player scales the video
// down (a phone-width YouTube embed, for one) — same weight/family/
// letter-spacing as PLAYER_LABEL_STYLE, just legible at that scale.
const CANVAS_DOT_LABEL_STYLE = { ...PLAYER_LABEL_STYLE, fontWeight: 700, fontSize: 27 };
// Continuous idle-motion periods/ranges (see canvasObjectSchema's `idle`
// field) — deliberately calm, matching motion.ts's whole "broadcast-style,
// no bounce" philosophy: a slow, steady spin/breathe reads as "this is
// live/active," a fast one reads as glitchy.
const SPIN_PERIOD_FRAMES = 120; // one full rotation per 4s at 30fps
const IDLE_PULSE_PERIOD_FRAMES = 90;
const IDLE_PULSE_RANGE: [number, number] = [0.94, 1.06];
const GLOW_PERIOD_FRAMES = 75;
const GLOW_RANGE: [number, number] = [0.55, 1];
// "drift" (see canvasObjectSchema's `idle` field) is the one idle mode that's
// genuine MOVEMENT rather than an in-place effect — a small, slow Lissajous
// wander (independent sine periods on x/y, not a mechanical circle) so a
// long hold still has something real happening, not just decoration on a
// frozen object. Percent-of-canvas units, same space x/y are already
// authored in. Small amplitude and slow, DIFFERENT x/y periods on purpose —
// same "calm, restrained" lesson as everything else idle in this file (and
// the camera work): this should read as quietly alive, not as wandering.
// 1.4 (this constant's original value) turned out to undershoot "alive" all
// the way into "imperceptible" — confirmed directly against real feedback on
// a real render, not a guess: a viewer watching at normal speed genuinely
// couldn't tell the hero shape was animated at all. Restraint that reads as
// "frozen" isn't restraint, it's a bug. 3.2 is still a wander, not a
// bounce — nowhere near motion.ts's "no bounce" line — just actually visible.
const DRIFT_AMPLITUDE_PERCENT = 3.2;
const DRIFT_PERIOD_FRAMES_X = 260;
const DRIFT_PERIOD_FRAMES_Y = 340;
// Whole-frame camera drift — see its own call site below for why this is
// smaller than the object-level drift constants above. Bumped alongside
// DRIFT_AMPLITUDE_PERCENT for the same reason (the original was, in
// practice, too subtle to register), kept smaller than the object-level
// constant since this moves every object on screen at once, including text.
const CAMERA_DRIFT_AMPLITUDE_PERCENT = 1.1;
const CAMERA_DRIFT_PERIOD_FRAMES_X = 300;
const CAMERA_DRIFT_PERIOD_FRAMES_Y = 380;
// How fast a `flow` arrow's dash pattern travels (px of dash-offset per
// frame) — 18 is the "dashed" style's own pattern length (see `dashArray`
// below), so this cycles the pattern roughly once per second, a clearly
// visible "current flowing" read without looking frantic.
const FLOW_SPEED_PX_PER_FRAME = 0.6;
// Seeds each idle object's pulse/glow phase from its own id (a stable hash,
// not random) so several idle objects in the same scene don't all breathe
// in lockstep — same purpose as GHOST_TRAIL's staggering, just for a
// continuous cycle instead of a one-shot trail.
function idlePhaseOffset(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return ((sum % 100) / 100) * Math.PI * 2;
}
// Objects are authored on a 0-100 logical grid, but a shape near an edge can
// still clip against the hard clip-container boundary once it scales up or
// the camera zooms in — inset the logical grid into the middle
// (100 - 2*EDGE_MARGIN_PERCENT)% of the canvas so there's always real room
// to grow into, the same problem TacticalBoard already solved for pitch
// markers (see its own EDGE_MARGIN) but bigger here since Canvas objects can
// scale/zoom far more dramatically than a fixed-size player disc.
const EDGE_MARGIN_PERCENT = 8;
function insetPercent(value: number): number {
  return EDGE_MARGIN_PERCENT + (value / 100) * (100 - 2 * EDGE_MARGIN_PERCENT);
}

// Canvas text is plain SVG <text> — unlike an HTML div, it never wraps or
// shrinks on its own, so a long sentence authored at a landscape-safe font
// size can run straight off the edges of the much narrower portrait canvas
// (900px vs 1400px). Every text-rendering site below shrinks its own font
// size toward fitting `maxWidthPx`, using a fixed average-glyph-width ratio
// — but that ratio is only a rough estimate (measured against this bold
// Montserrat it still under-shot real widths enough to let long captions
// clip off-frame), so `textLength` + `lengthAdjust="spacingAndGlyphs"` is
// the actual guarantee: the SVG renderer compresses glyph spacing until the
// text is EXACTLY `maxWidthPx` wide, independent of whether the estimate was
// right. `fontSize` alone still shrinks first so a very long string doesn't
// rely entirely on squishing (that reads as distorted past a point) — the
// two together mean "never overflows" is a hard property, not a hope.
// Never grows past `maxFontSize` — a short label still renders at full size
// with no `textLength` applied at all (natural width, unmodified).
const AVG_CHAR_WIDTH_RATIO = 0.72;
interface FitText {
  fontSize: number;
  textLength?: number;
  lengthAdjust?: "spacingAndGlyphs";
}
function fitText(text: string, maxFontSize: number, maxWidthPx: number): FitText {
  if (!text) return { fontSize: maxFontSize };
  const naturalWidth = text.length * maxFontSize * AVG_CHAR_WIDTH_RATIO;
  if (naturalWidth <= maxWidthPx) return { fontSize: maxFontSize };
  const fontSize = Math.max(14, Math.floor(maxWidthPx / (text.length * AVG_CHAR_WIDTH_RATIO)));
  return { fontSize, textLength: maxWidthPx, lengthAdjust: "spacingAndGlyphs" };
}

// Frosted-glass look (`object.glass`) — a soft white wash, a bright
// light-catching border, and a blurred backdrop, instead of the shape's
// normal flat opaque fill. `backdrop-filter` needs both the standard and
// -webkit- prefixed property to render in the Chromium headless renderer
// Remotion uses for actual video export, not just live preview.
//
// This is deliberately aiming at "frosted glassmorphism panel" (the iOS
// control-center look), NOT a true refractive glass orb — a real glass-
// with-visible-refraction look (light actually bending through the object,
// like a raytraced 3D render) isn't achievable with flat SVG/CSS at all,
// confirmed against a real reference image; that needs an actual 3D
// renderer (this project's Canvas3D/Three.js layer could do it via a real
// physical glass material, but that's a materially bigger, separate build
// from this). A white wash (not the object's own color) reads as glass far
// more convincingly than a tinted one — real frosted glass is closer to
// colorless than to "glass dyed the icon's brand color."
const GLASS_BORDER = "rgba(255,255,255,0.55)";
function withGlassBackdrop(style: React.CSSProperties): React.CSSProperties {
  return { ...style, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" } as React.CSSProperties;
}

interface WrappedText {
  lines: string[];
  fontSize: number;
  textLength?: number;
  lengthAdjust?: "spacingAndGlyphs";
}

// A same-row set of short labels (e.g. "PROTOCOL"/"DOMAIN"/"PORT", or a
// GET/POST/PUT/DELETE chip list) used to each get squeezed to whatever font
// size let them individually fit their own gap — one long neighbor meant
// every OTHER label in the row shrank too, so the row read as uneven and the
// squeezed ones as barely legible. Wrapping onto a second line at the SAME
// font size (confirmed via real renders as the actual fix, not a smaller
// uniform size) keeps every label in a row visually consistent; only a
// label that still doesn't fit in `maxLines` falls back to fitText's old
// shrink-to-fit-on-one-line behavior, so nothing regresses to overflowing.
function wrapLabel(text: string, maxFontSize: number, maxWidthPx: number, maxLines = 2): WrappedText {
  if (!text) return { lines: [""], fontSize: maxFontSize };
  if (text.length * maxFontSize * AVG_CHAR_WIDTH_RATIO <= maxWidthPx) return { lines: [text], fontSize: maxFontSize };

  const words = text.split(" ");
  if (words.length > 1) {
    const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / (maxFontSize * AVG_CHAR_WIDTH_RATIO)));
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return { lines, fontSize: maxFontSize };
  }

  const fontSize = Math.max(14, Math.floor(maxWidthPx / (text.length * AVG_CHAR_WIDTH_RATIO)));
  return { lines: [text], fontSize, textLength: maxWidthPx, lengthAdjust: "spacingAndGlyphs" };
}

/** Renders `wrapLabel`'s result as the `<tspan>` children of a `<text>` that
 * already carries x/y/textAnchor/etc. — `x` must be repeated on every tspan
 * (SVG doesn't inherit it from the parent for line positioning) and the
 * whole block is vertically re-centered around the parent's own y via `dy`
 * offsets, so a 2-line wrap doesn't shift the label's anchor point down. */
function WrappedTspans({ wrapped, x }: { wrapped: WrappedText; x: number }): React.ReactElement {
  const lineHeight = wrapped.fontSize * 1.15;
  const startDy = -((wrapped.lines.length - 1) * lineHeight) / 2;
  return (
    <>
      {wrapped.lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : lineHeight} textLength={wrapped.textLength} lengthAdjust={wrapped.lengthAdjust}>
          {line}
        </tspan>
      ))}
    </>
  );
}

// How long each phase of a multi-phase diagram holds the screen — exported so
// parseSceneScript.ts's computeVisualMinDurationSeconds can reserve a real
// floor for a multi-phase Canvas scene, same convention as TacticalBoard's
// own PHASE_DURATION_FRAMES. Shorter than TacticalBoard's (135 frames) since
// Canvas has no arrow-follow second stage to fit inside a phase's slot — a
// glide plus a beat to read the result is enough.
export const CANVAS_PHASE_DURATION_FRAMES = 90;
const CANVAS_GLIDE_DURATION_FRAMES = 20;
// How long an enter/exit lifecycle animation (fade/scale/slide) takes —
// separate constant from the glide duration even though it's the same
// number today, since these represent conceptually different motions.
const LIFECYCLE_DURATION_FRAMES = 12;
// Starting values the new enter/exit variants settle FROM (toward the
// object's normal 0/1 state) — sized to read clearly at a glance without
// tipping into anything spring-like; same calm-settle spirit as the
// original three variants, just more directions to settle from.
const SLIDE_HORIZONTAL_DISTANCE_PX = 50;
const ROTATE_ENTRANCE_DEG = 16;
const BLUR_ENTRANCE_PX = 12;
const ZOOM_OUT_START_SCALE = 1.35;
// Ghost trail behind a gliding object with `trail: true` — same technique as
// TacticalBoard's GHOST_TRAIL (src/video/compositions/TacticalBoard.tsx),
// simplified to a plain faint dot regardless of the object's own shape.
const GHOST_TRAIL = [
  { lag: 0.6, opacity: 0.12 },
  { lag: 0.35, opacity: 0.22 },
  { lag: 0.15, opacity: 0.34 },
];

type CanvasObjectT = CanvasData["objects"][number];
type CanvasCameraT = NonNullable<CanvasData["camera"]>;

const ANIMATABLE_KEYS = ["x", "y", "radius", "width", "height", "rotation", "scale", "opacity"] as const;
type AnimatableKey = (typeof ANIMATABLE_KEYS)[number];
const ANIMATABLE_DEFAULTS: Record<AnimatableKey, number> = {
  x: 0,
  y: 0,
  radius: 0,
  width: 0,
  height: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

const DEFAULT_CAMERA: CanvasCameraT = { x: 50, y: 50, zoom: 1 };

interface ResolvedPhase {
  objects: CanvasData["objects"];
  arrows: CanvasData["arrows"];
  camera: CanvasCameraT | undefined;
  // Anchors this phase to an absolute frame instead of the default fixed-
  // cadence spacing — see resolvePhaseStartFrames below. Only ever set on a
  // folded-in scene's boundary phase (mergeCanvasContinuity.ts); every
  // script-authored phase leaves this undefined, reproducing today's exact
  // fixed-cadence behavior.
  startSeconds?: number;
}

/** Each phase's effective start frame: an explicit `startSeconds` (converted
 * to frames) pins that phase directly; any phase without one holds for
 * exactly CANVAS_PHASE_DURATION_FRAMES after the PREVIOUS phase's own
 * (possibly anchored) start — so an anchor on phase i doesn't just move phase
 * i, it re-bases the fixed cadence for every unanchored phase after it too.
 * No phase anywhere specifying `startSeconds` (every script authored
 * directly today) reproduces `i * CANVAS_PHASE_DURATION_FRAMES` exactly,
 * byte-for-byte the same selection `Math.floor(frame /
 * CANVAS_PHASE_DURATION_FRAMES)` already produced. Mirrors
 * PhaseCaptionOverlay.tsx's own `resolvePhaseStartFrames`, just with a fixed-
 * cadence fallback instead of an even split (Canvas phases hold for a fixed
 * beat, not "spread evenly across the segment's total duration"). */
function resolvePhaseStartFrames(phases: ResolvedPhase[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < phases.length; i++) {
    const explicit = phases[i].startSeconds;
    if (explicit !== undefined) starts.push(Math.round(explicit * FPS));
    else if (i === 0) starts.push(0);
    else starts.push(starts[i - 1] + CANVAS_PHASE_DURATION_FRAMES);
  }
  return starts;
}

/** Every animatable property (x/y/radius/width/height/rotation/scale/
 * opacity) glides from `previous`'s value to `object`'s own value over
 * `localFrame` — the direct generalization of TacticalBoard's `positionAt`,
 * just looped over a fixed key set instead of duplicated per field. Absent
 * `previous` (phase 0, or an object new to this phase) means no glide: the
 * object simply IS its own target values (t is irrelevant since entry===
 * target), which is what makes phase 0 render with zero movement. */
function resolveAnimatedProps(
  object: CanvasObjectT,
  previous: CanvasObjectT | undefined,
  localFrame: number,
  easing: EasingName,
): Record<AnimatableKey, number> {
  const t = previous ? drawIn(localFrame, 0, CANVAS_GLIDE_DURATION_FRAMES, easing) : 1;
  // x/y need resolveObjectPosition (anchor-or-explicit), not the generic
  // ANIMATABLE_DEFAULTS fallback below — an anchor-authored object has no
  // `object.x` at all, so the generic path would silently glide it toward
  // 0,0 instead of its actual anchored position.
  const targetPos = resolveObjectPosition(object);
  const entryPos = previous ? resolveObjectPosition(previous) : targetPos;
  const props = {} as Record<AnimatableKey, number>;
  for (const key of ANIMATABLE_KEYS) {
    if (key === "x" || key === "y") {
      const targetVal = targetPos[key];
      const entryVal = entryPos[key];
      props[key] = entryVal + (targetVal - entryVal) * t;
      continue;
    }
    const targetVal = (object[key] as number | undefined) ?? ANIMATABLE_DEFAULTS[key];
    const entryVal = previous ? ((previous[key] as number | undefined) ?? ANIMATABLE_DEFAULTS[key]) : targetVal;
    props[key] = entryVal + (targetVal - entryVal) * t;
  }
  return props;
}

// object.easing now legally includes cinematicEasing.ts's curves (see
// visualDefinitions.ts), but phase-to-phase glide/idle motion deliberately
// keeps using only motion.ts's original calm four — those are the only
// values drawIn()/pulse() etc accept. Anything outside that set (an
// entrance-only choice) falls back to "easeOut" here rather than widening
// glide's own type — exact same fix Canvas3D.tsx already needed for the
// identical reason.
const GLIDE_EASING_NAMES = new Set<string>(["linear", "easeIn", "easeOut", "easeInOut"]);
function glideEasing(easing: CanvasObjectT["easing"]): EasingName {
  return GLIDE_EASING_NAMES.has(easing) ? (easing as EasingName) : "easeOut";
}

// Entrance-only counterparts of motion.ts's fadeIn/drawIn/slideIn — same
// clamp/interpolate shape, but resolved through keyframes.ts's resolveEasing
// so an entrance can actually use easeOutBack/anticipate, which motion.ts's
// own strictly-typed helpers can't accept. This is the SAME cinematic-easing
// machinery already built and wired into Canvas3D.tsx's entrances — it just
// never made it into this (2D) file until now.
function fadeInAny(frame: number, start: number, duration: number, easing: CanvasObjectT["easing"]): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: resolveEasing(easing),
  });
}
function drawInAny(frame: number, start: number, duration: number, easing: CanvasObjectT["easing"]): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: resolveEasing(easing),
  });
}
function slideInAny(frame: number, start: number, duration: number, distance: number, easing: CanvasObjectT["easing"]): number {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: resolveEasing(easing),
  });
}

function resolveCamera(phase: ResolvedPhase | undefined): CanvasCameraT {
  return phase?.camera ?? DEFAULT_CAMERA;
}

/** Real shape morphing: a polygon's `points` glide per-vertex from
 * `previous`'s array to `object`'s own, the same drawIn-eased glide every
 * other animatable property already gets — `points` was never in
 * ANIMATABLE_KEYS (it's an array, not a single number, so it can't just
 * join that generic loop), which meant a polygon's shape hard-snapped
 * between phases instead of animating at all. A vertex-COUNT mismatch
 * between phases (a genuinely different shape, e.g. a triangle becoming a
 * pentagon) holds the shorter array's last point steady for the extra
 * vertices rather than throwing — a script can freely change point count
 * phase to phase. No-op (returns `object`'s own points untouched) for
 * anything but a polygon with no `previous`, matching every other
 * animatable property's phase-0 behavior. */
function resolveAnimatedPoints(
  object: CanvasObjectT,
  previous: CanvasObjectT | undefined,
  localFrame: number,
  easing: EasingName,
): { x: number; y: number }[] | undefined {
  if (object.type !== "polygon") return undefined;
  const target = object.points ?? [];
  if (!previous || previous.type !== "polygon") return target;
  const entry = previous.points ?? [];
  if (entry.length === 0) return target;
  const t = drawIn(localFrame, 0, CANVAS_GLIDE_DURATION_FRAMES, easing);
  const count = Math.max(entry.length, target.length);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const entryPoint = entry[i] ?? entry[entry.length - 1];
    const targetPoint = target[i] ?? target[target.length - 1];
    points.push({ x: entryPoint.x + (targetPoint.x - entryPoint.x) * t, y: entryPoint.y + (targetPoint.y - entryPoint.y) * t });
  }
  return points;
}

/** A generic 2D diagram: freely positioned objects (dot/circle/label/
 * rectangle/roundedRectangle/ellipse/line/polygon) connected by arrows or
 * object-tracking connectors, for spatial/systems explanations a pitch or
 * chart visual can't express (two planes converging, a radar bubble growing
 * until it touches another, a supply chain, a network). Not football-
 * specific and not a pitch projection — a flat percent-of-canvas coordinate
 * plane with an optional pan/zoom camera.
 *
 * When `phases` is given, every animatable property glides (id-matched,
 * like TacticalBoard's players) from its previous phase's value to this
 * phase's; an object with no match in the previous phase plays its `enter`
 * animation instead (fade/scale/slide/none), and one absent from THIS phase
 * but present in the previous one plays its `exit` animation (default
 * "none" — it simply disappears, exactly like v1). Phase 0 is always the
 * top-level `objects`/`arrows`/`camera`. On-screen captions are NOT part of
 * this schema — pair a Canvas scene's `Data.phases` (choreography) with the
 * shared script-level `Phases:` field (works across every visual kind) for
 * narration captions; since Canvas's phases are fixed-length slots
 * independent of the scene's real duration, give a caption an explicit
 * `startSeconds` to align it to a specific phase. */
export const Canvas: React.FC<{ data: CanvasData } & SharedVisualProps> = ({
  data: { title, objects, arrows = [], phases: dataPhases, camera: topCamera, snap },
  backgroundColor,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const { width: canvasWidth, height: canvasHeight } = isPortrait ? CANVAS_SIZE.portrait : CANVAS_SIZE.landscape;

  const allPhases: ResolvedPhase[] = [
    { objects, arrows, camera: topCamera },
    ...(dataPhases ?? []).map((phase) => ({
      objects: phase.objects,
      arrows: phase.arrows ?? [],
      camera: phase.camera,
      startSeconds: phase.startSeconds,
    })),
  ];
  const phaseStartFrames = resolvePhaseStartFrames(allPhases);
  let phaseIndex = 0;
  for (let i = 0; i < phaseStartFrames.length; i++) {
    if (frame >= phaseStartFrames[i]) phaseIndex = i;
  }
  const phaseLocalFrame = frame - phaseStartFrames[phaseIndex];
  const currentPhase = allPhases[phaseIndex];
  const previousPhase = phaseIndex > 0 ? allPhases[phaseIndex - 1] : undefined;

  const titleOpacity = fadeIn(frame, 0, 10);

  // Camera: glides the same generalized way as any object's properties.
  // Absent everywhere (today's only case) resolves to {50,50,1} at every
  // phase, so camX/camY/camZoom below are exactly 50/50/1 PLUS the small
  // continuous drift below — no longer a hard identity transform, on
  // purpose (see CAMERA_DRIFT_* below): a scene that never touches `camera`
  // at all still shouldn't sit perfectly frozen for its whole duration.
  const targetCamera = resolveCamera(currentPhase);
  const entryCamera = phaseIndex === 0 ? targetCamera : resolveCamera(previousPhase);
  const cameraT = phaseIndex === 0 ? 1 : drawIn(phaseLocalFrame, 0, CANVAS_GLIDE_DURATION_FRAMES, "easeInOut");
  // A small always-on drift on top of the resolved (authored/glided) camera
  // — the single highest-leverage "this doesn't feel frozen" fix: once a
  // phase's own glide finishes (CANVAS_GLIDE_DURATION_FRAMES, well under a
  // second), the camera used to sit dead still for however long the rest of
  // the phase holds (often several seconds). Deliberately smaller amplitude
  // than object-level `idle: "drift"` — this moves the ENTIRE frame, so it
  // needs to be more restrained, the same "sparingly, subtle" lesson the
  // 3D cinematic-drift camera work already learned the hard way. Different
  // periods than the object drift constants (not fighting for attention
  // with anything using `idle: "drift"` in the same scene).
  const cameraDriftX = Math.sin(frame / CAMERA_DRIFT_PERIOD_FRAMES_X) * CAMERA_DRIFT_AMPLITUDE_PERCENT;
  const cameraDriftY = Math.sin(frame / CAMERA_DRIFT_PERIOD_FRAMES_Y + 1.7) * CAMERA_DRIFT_AMPLITUDE_PERCENT;
  const camX = entryCamera.x + (targetCamera.x - entryCamera.x) * cameraT + cameraDriftX;
  const camY = entryCamera.y + (targetCamera.y - entryCamera.y) * cameraT + cameraDriftY;
  const camZoom = entryCamera.zoom + (targetCamera.zoom - entryCamera.zoom) * cameraT;
  const cameraTransform = `translate(${canvasWidth / 2 - (insetPercent(camX) / 100) * canvasWidth * camZoom}px, ${
    canvasHeight / 2 - (insetPercent(camY) / 100) * canvasHeight * camZoom
  }px) scale(${camZoom})`;

  const project = (x: number, y: number): [number, number] => {
    const snappedX = snap ? Math.round(x / snap) * snap : x;
    const snappedY = snap ? Math.round(y / snap) * snap : y;
    return [(insetPercent(snappedX) / 100) * canvasWidth, (insetPercent(snappedY) / 100) * canvasHeight];
  };
  // Sizes are scaled by the same inset factor as positions, so a radius/
  // width/height percentage stays consistent with what "percent of canvas"
  // means for x/y — otherwise a radius of e.g. 50 would read as literally
  // half the FULL canvas width while positions only ever range across the
  // inset 84%, two different scales for the same unit.
  const SIZE_SCALE = (100 - 2 * EDGE_MARGIN_PERCENT) / 100;
  // A circle is equally wide and tall, so its radius must be relative to
  // whichever canvas dimension is SHORTER — basing it on canvasWidth alone
  // (much bigger than canvasHeight in landscape) let a large-but-reasonable-
  // looking radius overflow top/bottom even when perfectly centered.
  const projectRadius = (radius: number) => (radius / 100) * Math.min(canvasWidth, canvasHeight) * SIZE_SCALE;

  const resolvedObjects = currentPhase.objects.map((object, index) => {
    const previous = previousPhase?.objects.find((o) => o.id === object.id);
    const isNew = phaseIndex > 0 && !previous;
    const props = resolveAnimatedProps(object, previous, phaseLocalFrame, glideEasing(object.easing));
    const resolvedPoints = resolveAnimatedPoints(object, previous, phaseLocalFrame, glideEasing(object.easing));

    // Entrance: phase 0 fades every object in fresh, staggered by index —
    // widened from the original 4 frames/object (imperceptible, everything
    // read as arriving at once) to 10, so a scene's opening beat visibly
    // builds piece by piece instead of flashing in as a group. A later
    // phase only plays an entrance for a genuinely new object — one
    // continuing from the previous phase is already fully visible and just
    // glides via `props` above — but when a phase introduces MORE than one
    // new object at once, they get the same per-object stagger (previously
    // 0: every new-in-this-phase object popped in at the exact same
    // instant) rather than all landing together.
    const entranceActive = phaseIndex === 0 || isNew;
    const entranceStart = phaseIndex === 0 ? 10 + index * 10 : index * 8;
    const entranceFrame = phaseIndex === 0 ? frame : phaseLocalFrame;
    let entranceOpacity = 1;
    let entranceScale = 1;
    let entranceSlideY = 0;
    let entranceSlideX = 0;
    let entranceRotationOffset = 0;
    let entranceBlur = 0;
    if (entranceActive && object.enter !== "none") {
      // fade/scale/slide — the three most-used entrances, and the ones a
      // cinematic easeOutBack/anticipate choice actually reads on — go
      // through the broadened "Any" resolver. rotate/blur/zoomOut stay on
      // motion.ts's strict settleFrom (glideEasing-coerced), same scope
      // boundary Canvas3D.tsx already drew for the identical reason.
      entranceOpacity = fadeInAny(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, object.easing);
      if (object.enter === "scale") entranceScale = drawInAny(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, object.easing);
      if (object.enter === "slide") entranceSlideY = slideInAny(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, 30, object.easing);
      if (object.enter === "slideLeft") entranceSlideX = slideInAny(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, -SLIDE_HORIZONTAL_DISTANCE_PX, object.easing);
      if (object.enter === "slideRight") entranceSlideX = slideInAny(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, SLIDE_HORIZONTAL_DISTANCE_PX, object.easing);
      if (object.enter === "rotate") entranceRotationOffset = settleFrom(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, ROTATE_ENTRANCE_DEG, 0, glideEasing(object.easing));
      if (object.enter === "blur") entranceBlur = settleFrom(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, BLUR_ENTRANCE_PX, 0, glideEasing(object.easing));
      if (object.enter === "zoomOut") entranceScale = settleFrom(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, ZOOM_OUT_START_SCALE, 1, glideEasing(object.easing));
    } else if (entranceActive) {
      entranceOpacity = 1; // enter: "none" — appears immediately, no animation
    }

    // A real count-up tween (not a phase-to-phase text swap) — deliberately
    // computed from the scene's own ABSOLUTE frame, not gated behind
    // entranceActive/isNew the way fade/slide/etc. are: those are one-shot
    // ENTRANCE animations that only matter the instant an object first
    // appears, but a counter has to keep advancing smoothly through later
    // phase transitions too (e.g. a phase that adds a "hit the ceiling" X
    // icon alongside it) — gating this the same way would freeze the number
    // dead the moment any later phase re-lists the object, which is exactly
    // the "counter never visibly counts" bug this replaces. `settleFrom`
    // clamps past its own end, so the value holds at `countTo` for the rest
    // of the scene once the tween finishes, without needing special-casing.
    let displayLabel: string | undefined;
    if (object.countTo !== undefined) {
      const countDurationFrames = (object.countDurationSeconds ?? 2) * FPS;
      const countValue = settleFrom(frame, 0, countDurationFrames, object.countFrom ?? 0, object.countTo, glideEasing(object.easing));
      displayLabel = Math.round(countValue).toLocaleString("en-US");
    }

    return {
      object,
      displayLabel,
      x: props.x,
      y: props.y,
      radius: props.radius,
      width: props.width,
      height: props.height,
      rotation: props.rotation + entranceRotationOffset,
      scale: props.scale * entranceScale,
      opacity: props.opacity * entranceOpacity,
      slideYOffset: entranceSlideY,
      slideXOffset: entranceSlideX,
      blurPx: entranceBlur,
      resolvedPoints,
      isExiting: false,
    };
  });

  // Objects present in the previous phase but absent from this one — v1
  // simply stopped rendering these the instant the phase changed. `exit:
  // "none"` (the default) reproduces that exactly; any other exit style
  // keeps rendering them, animating out, for the first LIFECYCLE_DURATION_
  // FRAMES of the new phase.
  const exitingObjects =
    phaseIndex > 0 && previousPhase
      ? previousPhase.objects
          .filter((o) => o.exit !== "none" && !currentPhase.objects.some((c) => c.id === o.id))
          .filter(() => phaseLocalFrame < LIFECYCLE_DURATION_FRAMES)
          .map((object) => {
            const exitPosition = resolveObjectPosition(object);
            const exitProgress = fadeIn(phaseLocalFrame, 0, LIFECYCLE_DURATION_FRAMES, glideEasing(object.easing));
            const baseOpacity = object.opacity ?? 1;
            let opacity = baseOpacity;
            let scale = object.scale ?? 1;
            let slideYOffset = 0;
            let slideXOffset = 0;
            let rotationOffset = 0;
            let blurPx = 0;
            if (object.exit === "fade") opacity = baseOpacity * (1 - exitProgress);
            if (object.exit === "scale") {
              scale = (object.scale ?? 1) * (1 - exitProgress);
              opacity = baseOpacity * (1 - exitProgress * 0.5);
            }
            if (object.exit === "slide") {
              opacity = baseOpacity * (1 - exitProgress);
              slideYOffset = -exitProgress * 30;
            }
            if (object.exit === "slideLeft") {
              opacity = baseOpacity * (1 - exitProgress);
              slideXOffset = -exitProgress * SLIDE_HORIZONTAL_DISTANCE_PX;
            }
            if (object.exit === "slideRight") {
              opacity = baseOpacity * (1 - exitProgress);
              slideXOffset = exitProgress * SLIDE_HORIZONTAL_DISTANCE_PX;
            }
            if (object.exit === "rotate") {
              opacity = baseOpacity * (1 - exitProgress);
              rotationOffset = exitProgress * ROTATE_ENTRANCE_DEG;
            }
            if (object.exit === "blur") {
              opacity = baseOpacity * (1 - exitProgress);
              blurPx = exitProgress * BLUR_ENTRANCE_PX;
            }
            return {
              object,
              displayLabel: undefined as string | undefined,
              x: exitPosition.x,
              y: exitPosition.y,
              radius: object.radius ?? 0,
              width: object.width ?? 0,
              height: object.height ?? 0,
              rotation: object.rotation + rotationOffset,
              scale,
              opacity,
              slideYOffset,
              slideXOffset,
              blurPx,
              resolvedPoints: object.points,
              isExiting: true,
            };
          })
      : [];

  const renderObjects = [...resolvedObjects, ...exitingObjects].sort((a, b) => a.object.layer - b.object.layer);
  // `label`-type objects are almost always authored as a stable caption/
  // banner (a fixed narration line, not a diagram element) — every script
  // this project has written positions them at a constant y and expects
  // them to stay put and stay legible regardless of what the diagram itself
  // is doing. But `cameraTransform` below (pan/zoom for the REST of the
  // scene) is a single CSS transform on the whole inner <svg>, so a label
  // rendered inside it would zoom/shift right along with the diagram —
  // confirmed as a real bug, not a hypothetical: a caption sized to fit
  // the *logical* canvas width still overflowed the frame once a scene's
  // camera zoomed past 1x, because the zoom multiplies the caption's
  // on-screen size too. Splitting labels into their own un-transformed
  // overlay `<svg>` (below) is what actually fixes that, not a smaller
  // font — the earlier `fitText`-against-canvasWidth math was correct, it
  // was just being fed a canvas that could still get magnified afterward.
  const cameraObjects = renderObjects.filter((r) => r.object.type !== "label");
  const fixedLabelObjects = renderObjects.filter((r) => r.object.type === "label");
  // Below, each fixed label's own fitText call only ever clamped its width
  // against the FULL canvas — so three labels placed side by side (e.g. a
  // signal-path diagram: mic -> chip -> speaker, each with its own caption
  // underneath) could each legally fit on their own and still collide with
  // their neighbors, confirmed via a real render where three such captions
  // overlapped into unreadable mush. Precomputing every fixed label's
  // projected position here lets each one's max width be capped at the gap
  // to its nearest SAME-ROW neighbor (labels more than ~100px apart in y
  // don't constrain each other at all) instead of always assuming it has
  // the whole canvas to itself.
  // Carries each label's own current entrance opacity too — a phase
  // transition swaps the WHOLE objects array in one frame, so a label that
  // isn't new (still fully visible from the previous phase) would otherwise
  // suddenly gain brand-new neighbors at full strength the instant the new
  // phase starts, snapping its own width constraint (and so its font size)
  // from "alone, full width" to "crowded, small" in a single frame — the
  // "big text that instantly glitches smaller" confirmed via a real render.
  // Dividing the raw gap by the neighbor's own opacity below fixes that: a
  // neighbor still at opacity 0 counts as effectively infinitely far away
  // (no constraint yet), and as it fades in over its own entrance the
  // constraint tightens smoothly toward the true gap, so fitText's own
  // (otherwise-instant) size change now plays out gradually across the same
  // frames as the neighbor's fade-in instead of popping in one frame.
  const fixedLabelPositions = fixedLabelObjects.map(({ object, x, y, opacity }) => {
    const [px, py] = project(x, y);
    return { id: object.id, px, py, opacity };
  });
  function maxLabelWidthPx(id: string, px: number, py: number): number {
    const fullWidth = canvasWidth * 0.85;
    // The label is centered on px (textAnchor="middle"), so half of
    // whatever width it's given extends to each side — a label placed near
    // an edge (e.g. under an icon at x:18%) can legally fit its neighbor
    // gap and STILL run off the left or right of the frame, confirmed via
    // a real render ("Your Voice + Background Noise" losing its leading
    // "Yo" at x:18%). 2*px / 2*(canvasWidth-px) is the actual room to each
    // edge; a small margin keeps text from touching the frame border.
    const edgeWidth = 2 * Math.min(px, canvasWidth - px) - 24;
    let nearestGap = Infinity;
    for (const other of fixedLabelPositions) {
      if (other.id === id) continue;
      if (Math.abs(other.py - py) > 100) continue;
      // A label stacked directly above/below this one (near-identical px,
      // different py — a vertical chip list like a GET/POST/PUT/DELETE
      // legend) doesn't compete for HORIZONTAL space at all; the old code
      // still measured their near-zero px gap and starved every label in
      // the stack down toward the 14px floor, confirmed via a real render
      // (a 5-item vertical legend rendering unreadably tiny). Only labels
      // that are actually offset sideways are real horizontal neighbors.
      if (Math.abs(other.px - px) < 20) continue;
      const gap = Math.abs(other.px - px) / Math.max(other.opacity, 0.05);
      nearestGap = Math.min(nearestGap, gap);
    }
    const neighborWidth = Number.isFinite(nearestGap) ? nearestGap * 0.88 : fullWidth;
    return Math.max(60, Math.min(fullWidth, neighborWidth, edgeWidth));
  }
  // Every fitText(...) call still inside the camera-transformed svg below
  // (arrow labels, shape captions, the dot caption) divides its target
  // width by `camZoom` for the same reason — these captions are attached
  // to a specific diagram element and SHOULD zoom/pan with it (unlike the
  // fixed labels above), but that means their on-screen size is `fontSize *
  // camZoom`, not just `fontSize` — a caption sized to fit at zoom 1 still
  // overflows once the camera zooms to e.g. 1.7. Only the fixed overlay's
  // fitText call (unzoomed) targets the plain canvasWidth.

  const objectPosition = (id: string): [number, number] | null => {
    const resolved = renderObjects.find((r) => r.object.id === id && !r.isExiting);
    return resolved ? project(resolved.x, resolved.y) : null;
  };

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title && <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>}
        <div style={{ width: canvasWidth, height: canvasHeight, overflow: "hidden", position: "relative" }}>
          <svg
            width={canvasWidth}
            height={canvasHeight}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            style={{ overflow: "visible", transform: cameraTransform, transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}
          >
            {currentPhase.arrows?.map((arrow, index) => {
              const from = objectPosition(arrow.from);
              if (!from) return null;
              const to = typeof arrow.to === "string" ? objectPosition(arrow.to) : project(arrow.to.x, arrow.to.y);
              if (!to) return null;
              const [toX, toY] = to;
              const progress = drawIn(phaseLocalFrame, 10 + index * 6, 18);
              const [fromX, fromY] = from;
              const currentX = fromX + (toX - fromX) * progress;
              const currentY = fromY + (toY - fromY) * progress;
              const angle = Math.atan2(toY - fromY, toX - fromX);
              const headLength = 14;
              const headAngle = Math.PI / 7;
              const color = arrow.color ?? COLORS.movement;
              const strokeWidth = arrow.strokeWidth ?? 3;
              const dashArray =
                arrow.style === "dashed" ? "10 8" : arrow.style === "dotted" ? "2 6" : undefined;
              // Only kicks in once the arrow has fully drawn in (progress
              // >= 1) — animating dash-offset WHILE the line is still
              // growing would fight visually with the draw-in itself. A
              // no-op (undefined) on "solid"/"double", which have no dash
              // pattern to animate.
              const flowOffset = arrow.flow && dashArray && progress >= 1 ? -(frame * FLOW_SPEED_PX_PER_FRAME) : undefined;
              const perpAngle = angle + Math.PI / 2;
              const doubleOffset = 3;
              const midX = (fromX + currentX) / 2;
              const midY = (fromY + currentY) / 2;
              return (
                <g key={index} opacity={progress}>
                  {arrow.style === "double" ? (
                    <>
                      <line
                        x1={fromX + Math.cos(perpAngle) * doubleOffset}
                        y1={fromY + Math.sin(perpAngle) * doubleOffset}
                        x2={currentX + Math.cos(perpAngle) * doubleOffset}
                        y2={currentY + Math.sin(perpAngle) * doubleOffset}
                        stroke={color}
                        strokeWidth={strokeWidth}
                      />
                      <line
                        x1={fromX - Math.cos(perpAngle) * doubleOffset}
                        y1={fromY - Math.sin(perpAngle) * doubleOffset}
                        x2={currentX - Math.cos(perpAngle) * doubleOffset}
                        y2={currentY - Math.sin(perpAngle) * doubleOffset}
                        stroke={color}
                        strokeWidth={strokeWidth}
                      />
                    </>
                  ) : (
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={currentX}
                      y2={currentY}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      strokeDashoffset={flowOffset}
                    />
                  )}
                  <polygon
                    points={`${currentX},${currentY} ${currentX - headLength * Math.cos(angle - headAngle)},${currentY - headLength * Math.sin(angle - headAngle)} ${currentX - headLength * Math.cos(angle + headAngle)},${currentY - headLength * Math.sin(angle + headAngle)}`}
                    fill={color}
                  />
                  {arrow.label && (
                    <text
                      x={midX}
                      y={midY - 12}
                      textAnchor="middle"
                      fontFamily={FONT_FAMILY}
                      fontWeight={600}
                      {...fitText(arrow.label, 28, (canvasWidth * 0.85) / camZoom)}
                      fill={COLORS.text}
                      style={{ filter: `drop-shadow(0 0 6px ${COLORS.background})` }}
                    >
                      {arrow.label}
                    </text>
                  )}
                </g>
              );
            })}

            {cameraObjects.map(({ object, x, y, radius, width, height, rotation: baseRotation, scale: baseScale, opacity: baseOpacity, slideYOffset, slideXOffset, blurPx, resolvedPoints }) => {
              // Continuous ambient motion (see canvasObjectSchema's `idle`
              // field) — layered on top of the authored/glided base values,
              // not a replacement for them, so idle motion composes cleanly
              // with everything else an object is already doing. Computed
              // before project() specifically for "drift": it nudges the
              // logical x/y themselves (in the same percent space project()
              // expects), not just a post-projection pixel offset, so it
              // correctly follows the same inset/size scaling every other
              // position does.
              const idlePhase = idlePhaseOffset(object.id);
              const driftX = object.idle === "drift" ? Math.sin(frame / DRIFT_PERIOD_FRAMES_X + idlePhase) * DRIFT_AMPLITUDE_PERCENT : 0;
              const driftY = object.idle === "drift" ? Math.sin(frame / DRIFT_PERIOD_FRAMES_Y + idlePhase * 1.3) * DRIFT_AMPLITUDE_PERCENT : 0;
              const [rawPx, rawPy] = project(x + driftX, y + driftY);
              const px = rawPx + slideXOffset;
              const py = rawPy + slideYOffset;
              const color = object.color ?? colorForCharacter(object.label ?? object.id);
              const rotation = object.idle === "spin" ? baseRotation + ((frame * (360 / SPIN_PERIOD_FRAMES)) % 360) : baseRotation;
              const scale = object.idle === "pulse" ? baseScale * pulse(frame, IDLE_PULSE_PERIOD_FRAMES, ...IDLE_PULSE_RANGE, idlePhase) : baseScale;
              const opacity = object.idle === "glow" ? baseOpacity * pulse(frame, GLOW_PERIOD_FRAMES, ...GLOW_RANGE, idlePhase) : baseOpacity;
              const transformStyle: React.CSSProperties =
                rotation !== 0 || scale !== 1 || blurPx > 0.5
                  ? {
                      transform: `rotate(${rotation}deg) scale(${scale})`,
                      transformOrigin: `${px}px ${py}px`,
                      filter: blurPx > 0.5 ? `blur(${blurPx}px)` : undefined,
                    }
                  : {};

              // Faint trail of earlier positions while this object is
              // mid-glide (skipped for phase 0 / exiting objects — there's
              // no "previous" position to trail from). Rendered as plain
              // dots regardless of the object's own shape, same convention
              // as TacticalBoard's ghost trail.
              const previous = previousPhase?.objects.find((o) => o.id === object.id);
              const trailNodes =
                object.trail && previous && phaseIndex > 0
                  ? GHOST_TRAIL.map(({ lag, opacity: trailOpacity }, trailIndex) => {
                      const ghostLocalFrame = phaseLocalFrame - Math.round(lag * CANVAS_GLIDE_DURATION_FRAMES);
                      if (ghostLocalFrame <= 0) return null;
                      const ghostProps = resolveAnimatedProps(object, previous, ghostLocalFrame, glideEasing(object.easing));
                      const [gx, gy] = project(ghostProps.x, ghostProps.y);
                      return <circle key={trailIndex} cx={gx} cy={gy} r={DOT_RADIUS * 0.6} fill={color} opacity={trailOpacity * opacity} />;
                    })
                  : null;

              // Labels below a round/point-anchored shape sit in the dark
              // scene background, not on top of the shape's own fill — so
              // plain white text (matching dot/label's own convention)
              // always has enough contrast regardless of the shape's color.
              const belowLabel = (offsetPx: number) =>
                object.label && (
                  <text
                    x={px}
                    y={py + offsetPx}
                    textAnchor="middle"
                    fontFamily={FONT_FAMILY}
                    fontWeight={700}
                    {...fitText(object.label ?? "", 36, (canvasWidth * 0.85) / camZoom)}
                    fill={COLORS.text}
                    opacity={opacity}
                    style={{ filter: `drop-shadow(0 0 6px ${COLORS.background})` }}
                  >
                    {object.label}
                  </text>
                );

              if (object.type === "circle") {
                const r = projectRadius(radius);
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <circle
                      cx={px}
                      cy={py}
                      r={r}
                      fill={object.glass ? "#ffffff" : color}
                      fillOpacity={object.glass ? 0.22 * opacity : (object.fillOpacity ?? 0.18) * opacity}
                      stroke={object.glass ? GLASS_BORDER : color}
                      strokeWidth={object.glass ? 2 : (object.strokeWidth ?? 2.5)}
                      opacity={opacity}
                      style={object.glass ? withGlassBackdrop(transformStyle) : transformStyle}
                    />
                    {object.glass && (
                      <ellipse
                        cx={px - r * 0.32}
                        cy={py - r * 0.4}
                        rx={r * 0.24}
                        ry={r * 0.15}
                        fill="rgba(255,255,255,0.5)"
                        opacity={opacity * 0.85}
                        style={transformStyle}
                      />
                    )}
                    {belowLabel(r + 24)}
                  </React.Fragment>
                );
              }

              if (object.type === "ellipse") {
                const rx = ((width / 100) * canvasWidth * SIZE_SCALE) / 2;
                const ry = ((height / 100) * canvasHeight * SIZE_SCALE) / 2;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <ellipse
                      cx={px}
                      cy={py}
                      rx={rx}
                      ry={ry}
                      fill={object.glass ? "#ffffff" : object.filled ? color : "none"}
                      fillOpacity={object.glass ? 0.22 * opacity : (object.fillOpacity ?? 1) * opacity}
                      stroke={object.glass ? GLASS_BORDER : color}
                      strokeWidth={object.glass ? 1.5 : (object.strokeWidth ?? 2.5)}
                      opacity={opacity}
                      style={object.glass ? withGlassBackdrop(transformStyle) : transformStyle}
                    />
                    {belowLabel(ry + 24)}
                  </React.Fragment>
                );
              }

              if (object.type === "rectangle" || object.type === "roundedRectangle") {
                const w = (width / 100) * canvasWidth * SIZE_SCALE;
                const h = (height / 100) * canvasHeight * SIZE_SCALE;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <rect
                      x={px - w / 2}
                      y={py - h / 2}
                      width={w}
                      height={h}
                      rx={object.type === "roundedRectangle" ? projectRadius(radius) : 0}
                      fill={object.glass ? "#ffffff" : object.filled ? color : "none"}
                      fillOpacity={object.glass ? 0.22 * opacity : (object.fillOpacity ?? 1) * opacity}
                      stroke={object.glass ? GLASS_BORDER : color}
                      strokeWidth={object.glass ? 1.5 : (object.strokeWidth ?? 2.5)}
                      opacity={opacity}
                      style={object.glass ? withGlassBackdrop(transformStyle) : transformStyle}
                    />
                    {object.label &&
                      (() => {
                        const wrapped = wrapLabel(object.label ?? "", 36, (w * 0.9) / camZoom);
                        return (
                          // Rectangles default to a fully opaque, bright
                          // fill — dark text centered inside reads far
                          // better there than white-on-bright, matching the
                          // same convention TreemapCard/PackedCirclesCard
                          // already use for labels sitting directly on a
                          // solid color fill.
                          <text
                            y={py}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontFamily={FONT_FAMILY}
                            fontWeight={700}
                            fontSize={wrapped.fontSize}
                            fill={object.filled && !object.glass ? "#111315" : COLORS.text}
                            opacity={opacity}
                            style={transformStyle}
                          >
                            <WrappedTspans wrapped={wrapped} x={px} />
                          </text>
                        );
                      })()}
                  </React.Fragment>
                );
              }

              if (object.type === "line") {
                const lengthPx = (width / 100) * canvasWidth * SIZE_SCALE;
                const rad = (rotation * Math.PI) / 180;
                const x2 = px + lengthPx * Math.cos(rad);
                const y2 = py + lengthPx * Math.sin(rad);
                return (
                  <React.Fragment key={object.id}>
                    <line
                      x1={px}
                      y1={py}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={object.strokeWidth ?? 2.5}
                      opacity={opacity}
                      style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: `${px}px ${py}px` }}
                    />
                    {object.label && (
                      <text
                        x={(px + x2) / 2}
                        y={(py + y2) / 2 - 14}
                        textAnchor="middle"
                        fontFamily={FONT_FAMILY}
                        fontWeight={700}
                        {...fitText(object.label ?? "", 30, (canvasWidth * 0.85) / camZoom)}
                        fill={COLORS.text}
                        opacity={opacity}
                        style={{ filter: `drop-shadow(0 0 6px ${COLORS.background})` }}
                      >
                        {object.label}
                      </text>
                    )}
                  </React.Fragment>
                );
              }

              if (object.type === "polygon") {
                // resolvedPoints (not object.points directly) is what
                // actually glides per-vertex between phases — see
                // resolveAnimatedPoints above. Falls back to the object's
                // own authored points if something upstream ever left it
                // unset (defensive only; every code path above sets it).
                const offsets = resolvedPoints ?? object.points ?? [];
                const points = offsets
                  .map((p) => {
                    const [ox, oy] = project(x + p.x, y + p.y);
                    return `${ox},${oy}`;
                  })
                  .join(" ");
                const maxPointY = offsets.length > 0 ? Math.max(0, ...offsets.map((p) => p.y)) : 0;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <polygon
                      points={points}
                      fill={object.filled ? color : "none"}
                      fillOpacity={(object.fillOpacity ?? 1) * opacity}
                      stroke={color}
                      strokeWidth={object.strokeWidth ?? 2.5}
                      opacity={opacity}
                      style={transformStyle}
                    />
                    {belowLabel((maxPointY / 100) * canvasHeight * SIZE_SCALE + 24)}
                  </React.Fragment>
                );
              }

              if (object.type === "icon") {
                const IconComponent = object.icon ? CANVAS_ICON_COMPONENTS[object.icon] : null;
                if (!IconComponent) return null;
                const size = projectRadius(radius) * 2;
                // Glass mode adds a frosted tile PANEL behind the glyph
                // rather than making the icon itself translucent — a
                // blurred/see-through icon reads as illegible, not stylish.
                const tileSize = size * 1.7;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    {object.glass && (
                      <>
                        {/* White, not the icon's own color — real frosted
                            glass is closer to colorless than to "glass dyed
                            the brand color," and a colored tint at low
                            opacity against a dark scene just read as "a
                            slightly darker circle," not glass, confirmed
                            against a real render. This is aiming at a
                            frosted-panel glassmorphism read, not a true
                            refractive orb — that needs real 3D rendering. */}
                        <circle
                          cx={px}
                          cy={py}
                          r={tileSize / 2}
                          fill="#ffffff"
                          fillOpacity={0.22 * opacity}
                          stroke={GLASS_BORDER}
                          strokeWidth={2}
                          opacity={opacity}
                          style={withGlassBackdrop(transformStyle)}
                        />
                        <ellipse
                          cx={px - tileSize * 0.16}
                          cy={py - tileSize * 0.2}
                          rx={tileSize * 0.24}
                          ry={tileSize * 0.15}
                          fill="rgba(255,255,255,0.5)"
                          opacity={opacity * 0.85}
                          style={transformStyle}
                        />
                      </>
                    )}
                    <IconComponent
                      x={px - size / 2}
                      y={py - size / 2}
                      width={size}
                      height={size}
                      fill={color}
                      opacity={opacity}
                      style={transformStyle}
                    />
                    {belowLabel((object.glass ? tileSize : size) / 2 + 24)}
                  </React.Fragment>
                );
              }

              if (object.type === "lottie") {
                const asset = object.lottie ? LOTTIE_ASSETS[object.lottie] : null;
                if (!asset) return null;
                // `radius` authors a bounding box, not a forced square — most
                // Lottie files (a person illustration, an icon-style motif)
                // aren't natively 1:1, and stretching a non-square asset to
                // fill a square box would visibly distort it. Fit the
                // asset's own w/h (contain-style) inside a `size`-square box
                // instead, centered, same as object-fit: contain.
                const box = projectRadius(radius) * 2;
                const nativeW = asset.data.w || 1;
                const nativeH = asset.data.h || 1;
                const nativeAspect = nativeW / nativeH;
                const dispW = nativeAspect >= 1 ? box : box * nativeAspect;
                const dispH = nativeAspect >= 1 ? box / nativeAspect : box;
                // @remotion/lottie maps Remotion's own per-frame counter
                // straight onto the asset's raw frame count with NO fps
                // conversion (see its getLottieFrame: `remotionFrame %
                // lottieTotalFrames`, nothing else) — so a sourced file
                // authored at a different native fr than this project's 30fps
                // (very common; LottieFiles exports are often 24/25/60fps)
                // plays back at the wrong real-world speed here: a lower
                // native fr means fewer total frames for the same intended
                // duration, so its loop cycles far faster than the designer
                // meant — confirmed as the actual cause of a "plays for half
                // a second" report, not a sizing issue. `playbackRate` is
                // exactly the correction lever @remotion/lottie exposes for
                // this (it scales Remotion's frame count before the modulo);
                // 1 when the file already matches this project's 30fps, so
                // every existing asset (`fr: 30` already) is a no-op change.
                const lottiePlaybackRate = (asset.data.fr || FPS) / FPS;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <foreignObject x={px - dispW / 2} y={py - dispH / 2} width={dispW} height={dispH} opacity={opacity} style={transformStyle}>
                      <Lottie animationData={asset.data} loop={asset.loop} playbackRate={lottiePlaybackRate} style={{ width: dispW, height: dispH }} />
                    </foreignObject>
                    {belowLabel(box / 2 + 24)}
                  </React.Fragment>
                );
              }

              if (object.type === "gif") {
                if (!object.gifFile) return null;
                // Unlike Lottie, a GIF's real dimensions aren't known ahead
                // of time (no JSON metadata to read at build time) — fit:
                // "contain" inside a fixed square box does the same
                // no-distortion job Lottie's w/h-aspect math does, just
                // without needing the source dimensions up front.
                const box = projectRadius(radius) * 2;
                return (
                  <React.Fragment key={object.id}>
                    {trailNodes}
                    <foreignObject x={px - box / 2} y={py - box / 2} width={box} height={box} opacity={opacity} style={transformStyle}>
                      <Gif
                        src={staticFile(`assets/gifs/${object.gifFile}`)}
                        fit="contain"
                        loopBehavior="loop"
                        // Free-sourced GIFs are overwhelmingly exported on a
                        // solid white background (real GIF transparency is
                        // rare in practice, and hard to filter for) — a
                        // white box floating on this project's dark panels
                        // reads as a visible bug, confirmed in a real render.
                        // `multiply` is the standard fix for exactly this:
                        // white * any color = that color (so a white
                        // background optically vanishes into whatever's
                        // behind it), while the illustration's own darker
                        // linework stays visible. Not a substitute for a
                        // genuinely transparent GIF if one's ever sourced —
                        // just the right default for what's realistically
                        // available for free today.
                        style={{ width: box, height: box, mixBlendMode: "multiply" }}
                      />
                    </foreignObject>
                    {belowLabel(box / 2 + 24)}
                  </React.Fragment>
                );
              }

              // "label" is handled entirely by the un-transformed overlay
              // svg below (see fixedLabelObjects) — filtered out of
              // cameraObjects, so this branch is intentionally unreachable
              // here.

              // "dot" — the default/generic marker.
              return (
                <React.Fragment key={object.id}>
                  {trailNodes}
                  <g opacity={opacity} style={transformStyle}>
                    <circle cx={px} cy={py} r={DOT_RADIUS} fill={color} />
                    {object.label &&
                      (() => {
                        const fit = fitText(object.label, CANVAS_DOT_LABEL_STYLE.fontSize, (canvasWidth * 0.85) / camZoom);
                        return (
                          <text
                            x={px}
                            y={py + DOT_RADIUS + 18}
                            textAnchor="middle"
                            fill={COLORS.text}
                            textLength={fit.textLength}
                            lengthAdjust={fit.lengthAdjust}
                            style={{ ...CANVAS_DOT_LABEL_STYLE, fontSize: fit.fontSize }}
                          >
                            {object.label}
                          </text>
                        );
                      })()}
                  </g>
                </React.Fragment>
              );
            })}
          </svg>

          {fixedLabelObjects.length > 0 && (
            <svg
              width={canvasWidth}
              height={canvasHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              style={{ overflow: "visible", position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            >
              {fixedLabelObjects.map(({ object, displayLabel, x, y, rotation, scale, opacity, slideYOffset, slideXOffset, blurPx }) => {
                const text = displayLabel ?? object.label;
                if (!text) return null;
                const [rawPx, rawPy] = project(x, y);
                const px = rawPx + slideXOffset;
                const py = rawPy + slideYOffset;
                const transformStyle: React.CSSProperties =
                  rotation !== 0 || scale !== 1 || blurPx > 0.5
                    ? {
                        transform: `rotate(${rotation}deg) scale(${scale})`,
                        transformOrigin: `${px}px ${py}px`,
                        filter: blurPx > 0.5 ? `blur(${blurPx}px)` : undefined,
                      }
                    : {};
                const wrapped = wrapLabel(text, 46, maxLabelWidthPx(object.id, px, py));
                return (
                  <text
                    key={object.id}
                    y={py}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={FONT_FAMILY}
                    fontWeight={700}
                    fontSize={wrapped.fontSize}
                    fill={COLORS.text}
                    opacity={opacity}
                    style={{ filter: `drop-shadow(0 0 8px ${COLORS.background})`, ...transformStyle }}
                  >
                    <WrappedTspans wrapped={wrapped} x={px} />
                  </text>
                );
              })}
            </svg>
          )}
        </div>

      </div>
    </SceneFrame>
  );
};
