import React from "react";
import * as THREE from "three";
import { useCurrentFrame } from "remotion";
import { Billboard, Html, Line } from "@react-three/drei";
import { ThreeCanvas } from "@remotion/three";
import { COLORS, FONT_FAMILY, TITLE_STYLE, colorForCharacter } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { CANVAS_SIZE } from "./Canvas";
import { CANVAS_ICON_COMPONENTS } from "../canvasIcons";
import { CameraRig3D } from "./CameraRig3D";
import { resolveCameraPose3D } from "../camera3D";
import {
  percentToCanvasWorld3D,
  percentToWorldRadius3D,
  percentToWorldWidth3D,
  percentToWorldHeight3D,
} from "../canvasCoords3D";
import { fadeIn, drawIn, slideIn, pulse, type EasingName } from "../motion";
import type { SharedVisualProps, Canvas3DData } from "../sharedVisualProps";

type CanvasObject3DT = Canvas3DData["objects"][number];
type CanvasArrow3DT = NonNullable<Canvas3DData["arrows"]>[number];
type CanvasCamera3DT = NonNullable<Canvas3DData["camera"]>;

// How long each phase of a multi-phase diagram holds the screen — exported so
// parseSceneScript.ts's computeVisualMinDurationSeconds can reserve a real
// floor for a multi-phase Canvas3D segment, same convention as
// Canvas.tsx's own CANVAS_PHASE_DURATION_FRAMES (same value, its own export
// so this 3D family stays decoupled from the 2D file's internals).
export const CANVAS3D_PHASE_DURATION_FRAMES = 90;
const CANVAS3D_GLIDE_DURATION_FRAMES = 20;
const LIFECYCLE_DURATION_FRAMES = 12;
// World-unit (not pixel) slide distance for enter:"slide"/exit:"slide" —
// small relative to the ~14-unit-tall world.
const SLIDE_DISTANCE_UNITS = 1.2;
const GHOST_TRAIL = [
  { lag: 0.6, opacity: 0.12 },
  { lag: 0.35, opacity: 0.22 },
  { lag: 0.15, opacity: 0.34 },
];
// Trail for continuous `idle:"orbit"` motion — separate from GHOST_TRAIL
// above because that one only fires on a phase-to-phase glide (a discrete
// jump), while orbit revolves every frame with no phase change at all. `lag`
// here is a fraction of the object's own orbitPeriodFrames (not the fixed
// glide duration) so the trail's length scales with how fast a given
// satellite is actually revolving.
const ORBIT_GHOST_TRAIL = [
  { lag: 0.05, opacity: 0.32 },
  { lag: 0.1, opacity: 0.2 },
  { lag: 0.16, opacity: 0.11 },
  { lag: 0.23, opacity: 0.05 },
];
const SPIN_PERIOD_FRAMES = 120;
const IDLE_PULSE_PERIOD_FRAMES = 90;
const IDLE_PULSE_RANGE: [number, number] = [0.94, 1.06];
const GLOW_PERIOD_FRAMES = 75;
const GLOW_RANGE: [number, number] = [0.55, 1];

const CANVAS3D_LABEL_STYLE = {
  fontFamily: FONT_FAMILY,
  fontWeight: 700 as const,
  fontSize: 30,
  color: COLORS.text,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
};

const DEFAULT_CAMERA: CanvasCamera3DT = { target: { x: 50, y: 50, z: 50 }, zoom: 1 };
const CAMERA_BASE_RADIUS = 16;
const CAMERA_BASE_HEIGHT = 3;
const ARROW_TIP_RADIUS = 0.16;
const ARROW_DOUBLE_OFFSET = 0.12;

// Seeds each idle object's pulse/glow phase from its own id (a stable hash,
// not random) so several idle objects in the same scene don't all breathe in
// lockstep — direct port of Canvas.tsx's own idlePhaseOffset.
function idlePhaseOffset(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return ((sum % 100) / 100) * Math.PI * 2;
}

const ANIMATABLE_KEYS = ["x", "y", "z", "radius", "width", "height", "rotation", "scale", "opacity"] as const;
type AnimatableKey = (typeof ANIMATABLE_KEYS)[number];
// z defaults to 50 (mid-depth), matching the schema default — every other
// key defaults the same way Canvas.tsx's own ANIMATABLE_DEFAULTS does.
const ANIMATABLE_DEFAULTS: Record<AnimatableKey, number> = {
  x: 0,
  y: 0,
  z: 50,
  radius: 0,
  width: 0,
  height: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

interface ResolvedPhase {
  objects: Canvas3DData["objects"];
  arrows: Canvas3DData["arrows"];
  camera: CanvasCamera3DT | undefined;
}

// Direct port of Canvas.tsx's resolveAnimatedProps, generalized to include
// `z` — every animatable property glides from `previous`'s value to
// `object`'s own value over `localFrame`. Absent `previous` (phase 0, or an
// object new to this phase) means no glide.
function resolveAnimatedProps(
  object: CanvasObject3DT,
  previous: CanvasObject3DT | undefined,
  localFrame: number,
  easing: EasingName,
): Record<AnimatableKey, number> {
  const t = previous ? drawIn(localFrame, 0, CANVAS3D_GLIDE_DURATION_FRAMES, easing) : 1;
  const props = {} as Record<AnimatableKey, number>;
  for (const key of ANIMATABLE_KEYS) {
    const targetVal = (object[key] as number | undefined) ?? ANIMATABLE_DEFAULTS[key];
    const entryVal = previous ? ((previous[key] as number | undefined) ?? ANIMATABLE_DEFAULTS[key]) : targetVal;
    props[key] = entryVal + (targetVal - entryVal) * t;
  }
  return props;
}

function resolveCamera(phase: ResolvedPhase | undefined): CanvasCamera3DT {
  return phase?.camera ?? DEFAULT_CAMERA;
}

// Rounded-rectangle outline, centered on its own local origin (billboard-
// local space, not world space) — shared by the fill mesh (via
// THREE.ShapeGeometry) and the stroke outline (via drei's <Line>) so both
// trace exactly the same path.
function roundedRectShape(width: number, height: number, cornerRadius: number): THREE.Shape {
  const r = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));
  const hw = width / 2;
  const hh = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function circleOutlinePoints(radius: number, segments = 32): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
  });
}

interface ResolvedObject {
  object: CanvasObject3DT;
  x: number;
  y: number;
  z: number;
  radius: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  slideYOffset: number;
  isExiting: boolean;
}

// One object's fully-resolved render — idle motion (spin/pulse/glow) and the
// ghost trail are computed here (both need `frame`/`previousPhase`, already
// in scope at the call site) rather than inside a separate component, same
// structure as Canvas.tsx's own inline per-object rendering.
function CanvasObjectMesh3D({
  resolved,
  frame,
  previousPhase,
  phaseIndex,
}: {
  resolved: ResolvedObject;
  frame: number;
  previousPhase: ResolvedPhase | undefined;
  phaseIndex: number;
}) {
  const { object, x, y, z, radius, width, height, slideYOffset } = resolved;
  const color = object.color ?? colorForCharacter(object.label ?? object.id);
  const idlePhase = idlePhaseOffset(object.id);
  const rotation = object.idle === "spin" ? resolved.rotation + ((frame * (360 / SPIN_PERIOD_FRAMES)) % 360) : resolved.rotation;
  const scale = object.idle === "pulse" ? resolved.scale * pulse(frame, IDLE_PULSE_PERIOD_FRAMES, ...IDLE_PULSE_RANGE, idlePhase) : resolved.scale;
  const opacity = object.idle === "glow" ? resolved.opacity * pulse(frame, GLOW_PERIOD_FRAMES, ...GLOW_RANGE, idlePhase) : resolved.opacity;

  const [baseWx, baseWy, pz] = percentToCanvasWorld3D(x, y, z);
  // "orbit" revolves the object around its own base position in the
  // camera-facing (world X/Y) plane — computed in world units directly
  // (not a percent-space offset) so the path is a true circle regardless of
  // the width/height world-scale mismatch (see canvasCoords3D.ts).
  let px = baseWx;
  let worldY = baseWy + slideYOffset;
  let orbitGhostNodes: React.ReactNode = null;
  if (object.idle === "orbit") {
    const period = object.orbitPeriodFrames ?? 150;
    const orbitRadiusWorld = percentToWorldRadius3D(object.orbitRadius ?? 20);
    const angle = (frame / period) * Math.PI * 2 + idlePhase;
    px = baseWx + Math.cos(angle) * orbitRadiusWorld;
    worldY = baseWy + slideYOffset + Math.sin(angle) * orbitRadiusWorld;
    if (object.trail) {
      const ghostRadius = percentToWorldRadius3D(radius || 6) * 0.55;
      orbitGhostNodes = ORBIT_GHOST_TRAIL.map(({ lag, opacity: trailOpacity }, trailIndex) => {
        const ghostAngle = ((frame - lag * period) / period) * Math.PI * 2 + idlePhase;
        const gx = baseWx + Math.cos(ghostAngle) * orbitRadiusWorld;
        const gy = baseWy + slideYOffset + Math.sin(ghostAngle) * orbitRadiusWorld;
        return (
          <mesh key={trailIndex} position={[gx, gy, pz]}>
            <circleGeometry args={[ghostRadius, 16]} />
            <meshBasicMaterial color={color} transparent opacity={trailOpacity * opacity} />
          </mesh>
        );
      });
    }
  }
  const rotationRad = (rotation * Math.PI) / 180;

  const previous = previousPhase?.objects.find((o) => o.id === object.id);
  const trailNodes =
    object.trail && previous && phaseIndex > 0
      ? GHOST_TRAIL.map(({ lag, opacity: trailOpacity }, trailIndex) => {
          const ghostLocalFrame = frame - Math.round(lag * CANVAS3D_GLIDE_DURATION_FRAMES);
          if (ghostLocalFrame <= 0) return null;
          const ghostProps = resolveAnimatedProps(object, previous, ghostLocalFrame, object.easing);
          const [gx, gy, gz] = percentToCanvasWorld3D(ghostProps.x, ghostProps.y, ghostProps.z);
          return (
            <mesh key={trailIndex} position={[gx, gy, gz]}>
              <circleGeometry args={[0.14, 16]} />
              <meshBasicMaterial color={color} transparent opacity={trailOpacity * opacity} />
            </mesh>
          );
        })
      : null;

  const belowLabel = (offsetUnits: number) =>
    object.label && (
      <Html center distanceFactor={9} position={[0, -offsetUnits, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ ...CANVAS3D_LABEL_STYLE, opacity, textShadow: `0 0 6px ${COLORS.background}` }}>{object.label}</div>
      </Html>
    );

  if (object.type === "dot") {
    const r = percentToWorldRadius3D(radius || 6);
    return (
      <group position={[px, worldY, pz]}>
        {trailNodes}
        {orbitGhostNodes}
        <Billboard>
          <group rotation={[0, 0, rotationRad]} scale={scale}>
            <mesh>
              <circleGeometry args={[r, 32]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} />
            </mesh>
          </group>
          {belowLabel(-(r + 0.5))}
        </Billboard>
      </group>
    );
  }

  if (object.type === "circle") {
    const r = percentToWorldRadius3D(radius);
    return (
      <group position={[px, worldY, pz]}>
        {trailNodes}
        {orbitGhostNodes}
        <Billboard>
          <group rotation={[0, 0, rotationRad]} scale={scale}>
            {object.filled && (
              <mesh>
                <circleGeometry args={[r, 32]} />
                <meshBasicMaterial color={color} transparent opacity={(object.fillOpacity ?? 0.18) * opacity} />
              </mesh>
            )}
            <Line points={circleOutlinePoints(r)} color={color} lineWidth={object.strokeWidth ?? 2.5} transparent opacity={opacity} />
          </group>
          {belowLabel(-(r + 0.6))}
        </Billboard>
      </group>
    );
  }

  if (object.type === "roundedRectangle") {
    const w = percentToWorldWidth3D(width);
    const h = percentToWorldHeight3D(height);
    const shape = roundedRectShape(w, h, percentToWorldRadius3D(radius));
    const outline = shape.getPoints(8).map((p): [number, number, number] => [p.x, p.y, 0]);
    return (
      <group position={[px, worldY, pz]}>
        {trailNodes}
        {orbitGhostNodes}
        <Billboard>
          <group rotation={[0, 0, rotationRad]} scale={scale}>
            {object.filled && (
              <mesh>
                <shapeGeometry args={[shape]} />
                <meshBasicMaterial color={color} transparent opacity={(object.fillOpacity ?? 1) * opacity} />
              </mesh>
            )}
            <Line points={outline} color={color} lineWidth={object.strokeWidth ?? 2.5} transparent opacity={opacity} />
            {object.label && (
              // Rectangles default to a fully opaque bright fill — dark text
              // centered on it reads far better than white-on-bright, same
              // convention Canvas.tsx's own roundedRectangle branch uses.
              <Html center distanceFactor={9} style={{ pointerEvents: "none" }}>
                <div
                  style={{
                    ...CANVAS3D_LABEL_STYLE,
                    fontSize: 26,
                    color: object.filled ? "#111315" : COLORS.text,
                    opacity,
                  }}
                >
                  {object.label}
                </div>
              </Html>
            )}
          </group>
        </Billboard>
      </group>
    );
  }

  if (object.type === "line") {
    const length = percentToWorldWidth3D(width);
    const x2 = px + length * Math.cos(rotationRad);
    // World Y is inverted relative to Canvas's screen-space y (see
    // percentToCanvasWorld3D) — flipping the sin term keeps a given rotation
    // angle pointing the same visual direction it would in 2D Canvas.
    const y2 = worldY - length * Math.sin(rotationRad);
    return (
      <group>
        {trailNodes}
        {orbitGhostNodes}
        <Line points={[[px, worldY, pz], [x2, y2, pz]]} color={color} lineWidth={object.strokeWidth ?? 2.5} transparent opacity={opacity} />
        {object.label && (
          <Html center distanceFactor={9} position={[(px + x2) / 2, (worldY + y2) / 2 + 0.5, pz]} style={{ pointerEvents: "none" }}>
            <div style={{ ...CANVAS3D_LABEL_STYLE, fontSize: 24, opacity, textShadow: `0 0 6px ${COLORS.background}` }}>{object.label}</div>
          </Html>
        )}
      </group>
    );
  }

  if (object.type === "icon") {
    const IconComponent = object.icon ? CANVAS_ICON_COMPONENTS[object.icon] : null;
    if (!IconComponent) return null;
    const sizePx = Math.max(20, radius * 4.2);
    return (
      <group position={[px, worldY, pz]}>
        {trailNodes}
        {orbitGhostNodes}
        <Billboard>
          <Html center distanceFactor={9} style={{ pointerEvents: "none" }}>
            <div style={{ color, opacity, transform: `rotate(${rotation}deg) scale(${scale})` }}>
              <IconComponent style={{ width: sizePx, height: sizePx }} />
            </div>
          </Html>
          {belowLabel(-(percentToWorldRadius3D(radius) + 0.6))}
        </Billboard>
      </group>
    );
  }

  // "label" — the whole object is just text, no shape.
  return (
    <group position={[px, worldY, pz]}>
      <Billboard>
        <Html center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            style={{
              ...CANVAS3D_LABEL_STYLE,
              fontSize: 40,
              opacity,
              transform: `rotate(${rotation}deg) scale(${scale})`,
              textShadow: `0 0 8px ${COLORS.background}`,
            }}
          >
            {object.label}
          </div>
        </Html>
      </Billboard>
    </group>
  );
}

function crossWithUp(from: [number, number, number], to: [number, number, number]): [number, number, number] {
  const dir: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(...dir) || 1;
  const n: [number, number, number] = [dir[0] / len, dir[1] / len, dir[2] / len];
  const up: [number, number, number] = [0, 1, 0];
  const cross: [number, number, number] = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
  const clen = Math.hypot(...cross) || 1;
  return [cross[0] / clen, cross[1] / clen, cross[2] / clen];
}

function CanvasArrow3D({
  arrow,
  positionById,
  frame,
  startFrame,
}: {
  arrow: CanvasArrow3DT;
  positionById: Map<string, [number, number, number]>;
  frame: number;
  startFrame: number;
}) {
  const from = positionById.get(arrow.from);
  if (!from) return null;
  const to = typeof arrow.to === "string" ? positionById.get(arrow.to) : percentToCanvasWorld3D(arrow.to.x, arrow.to.y, arrow.to.z);
  if (!to) return null;

  const progress = drawIn(frame, startFrame, 18);
  if (progress <= 0) return null;
  const tip: [number, number, number] = [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
    from[2] + (to[2] - from[2]) * progress,
  ];
  const color = arrow.color ?? COLORS.movement;
  const lineWidth = arrow.strokeWidth ?? 3;
  const dashed = arrow.style === "dashed" || arrow.style === "dotted";
  const dashSize = arrow.style === "dashed" ? 0.28 : 0.06;
  const gapSize = arrow.style === "dashed" ? 0.18 : 0.14;
  const opacity = progress;
  const mid: [number, number, number] = [(from[0] + tip[0]) / 2, (from[1] + tip[1]) / 2, (from[2] + tip[2]) / 2];

  return (
    <group>
      {arrow.style === "double" ? (
        (() => {
          const perp = crossWithUp(from, tip);
          const off: [number, number, number] = [perp[0] * ARROW_DOUBLE_OFFSET, perp[1] * ARROW_DOUBLE_OFFSET, perp[2] * ARROW_DOUBLE_OFFSET];
          const a1: [number, number, number] = [from[0] + off[0], from[1] + off[1], from[2] + off[2]];
          const a2: [number, number, number] = [tip[0] + off[0], tip[1] + off[1], tip[2] + off[2]];
          const b1: [number, number, number] = [from[0] - off[0], from[1] - off[1], from[2] - off[2]];
          const b2: [number, number, number] = [tip[0] - off[0], tip[1] - off[1], tip[2] - off[2]];
          return (
            <>
              <Line points={[a1, a2]} color={color} lineWidth={lineWidth} transparent opacity={opacity} />
              <Line points={[b1, b2]} color={color} lineWidth={lineWidth} transparent opacity={opacity} />
            </>
          );
        })()
      ) : (
        <Line
          points={[from, tip]}
          color={color}
          lineWidth={lineWidth}
          dashed={dashed}
          dashSize={dashSize}
          gapSize={gapSize}
          transparent
          opacity={opacity}
        />
      )}
      <mesh position={tip}>
        <sphereGeometry args={[ARROW_TIP_RADIUS, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={progress > 0.02 && progress < 0.98 ? 1 : 0} />
      </mesh>
      {arrow.label && (
        <Html center distanceFactor={9} position={mid} style={{ pointerEvents: "none" }}>
          <div style={{ ...CANVAS3D_LABEL_STYLE, fontSize: 24, opacity, textShadow: `0 0 6px ${COLORS.background}` }}>{arrow.label}</div>
        </Html>
      )}
    </group>
  );
}

/** 3D counterpart to Canvas — see the "Canvas 3D" visual definition
 * (src/model/visualDefinitions.ts) for the exact scope cut relative to the
 * 2D version: 6 object types (dot/circle/roundedRectangle/line/icon/label)
 * instead of Canvas's 9 (ellipse/polygon/sharp-rectangle deferred), no arrow
 * `flow` animation, no `snap`, no Continue-Canvas cross-scene folding. Adds
 * an optional per-object `z` (depth, default 50/mid) that Canvas's flat
 * plane has no equivalent of — real parallax as the camera moves is the
 * actual payoff of this being genuinely 3D rather than a pitch-style flat
 * billboard field.
 *
 * Icons/labels render through drei's `<Html>` (a real Heroicon component for
 * icons — its solid variant uses `fill="currentColor"`, so CSS `color` tints
 * it directly, no texture bake needed) rather than baked sprites, so unlike
 * the pitch family this needs no `SuspenseLoader3D` — nothing here loads an
 * async texture. */
export const Canvas3D: React.FC<{ data: Canvas3DData } & SharedVisualProps> = ({
  data: { title, objects, arrows = [], phases: dataPhases, camera: topCamera, cameraStyle = "sway" },
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const { width: canvasWidth, height: canvasHeight } = isPortrait ? CANVAS_SIZE.portrait : CANVAS_SIZE.landscape;

  const allPhases: ResolvedPhase[] = [
    { objects, arrows, camera: topCamera },
    ...(dataPhases ?? []).map((phase) => ({ objects: phase.objects, arrows: phase.arrows ?? [], camera: phase.camera })),
  ];
  const phaseStartFrames = allPhases.map((_, i) => i * CANVAS3D_PHASE_DURATION_FRAMES);
  let phaseIndex = 0;
  for (let i = 0; i < phaseStartFrames.length; i++) if (frame >= phaseStartFrames[i]) phaseIndex = i;
  const phaseLocalFrame = frame - phaseStartFrames[phaseIndex];
  const currentPhase = allPhases[phaseIndex];
  const previousPhase = phaseIndex > 0 ? allPhases[phaseIndex - 1] : undefined;

  const titleOpacity = fadeIn(frame, 0, 10);

  // Camera target/zoom glide the same generalized way as any object's
  // properties — see canvasCamera3DSchema's docstring for why `style` itself
  // (sway/orbit/etc.) is a scene-level field instead of glided here.
  const targetCam = resolveCamera(currentPhase);
  const entryCam = phaseIndex === 0 ? targetCam : resolveCamera(previousPhase);
  const camT = phaseIndex === 0 ? 1 : drawIn(phaseLocalFrame, 0, CANVAS3D_GLIDE_DURATION_FRAMES, "easeInOut");
  const camX = entryCam.target.x + (targetCam.target.x - entryCam.target.x) * camT;
  const camY = entryCam.target.y + (targetCam.target.y - entryCam.target.y) * camT;
  const camZ = entryCam.target.z + (targetCam.target.z - entryCam.target.z) * camT;
  const camZoom = entryCam.zoom + (targetCam.zoom - entryCam.zoom) * camT;
  const cameraTarget = percentToCanvasWorld3D(camX, camY, camZ);
  const pose = resolveCameraPose3D(cameraStyle, frame, durationInFrames, {
    target: cameraTarget,
    radius: CAMERA_BASE_RADIUS / camZoom,
    height: CAMERA_BASE_HEIGHT,
  });

  const resolvedObjects: ResolvedObject[] = currentPhase.objects.map((object, index) => {
    const previous = previousPhase?.objects.find((o) => o.id === object.id);
    const isNew = phaseIndex > 0 && !previous;
    const props = resolveAnimatedProps(object, previous, phaseLocalFrame, object.easing);

    const entranceActive = phaseIndex === 0 || isNew;
    const entranceStart = phaseIndex === 0 ? 10 + index * 4 : 0;
    const entranceFrame = phaseIndex === 0 ? frame : phaseLocalFrame;
    let entranceOpacity = 1;
    let entranceScale = 1;
    let entranceSlideY = 0;
    if (entranceActive && object.enter !== "none") {
      entranceOpacity = fadeIn(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, object.easing);
      if (object.enter === "scale") entranceScale = drawIn(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, object.easing);
      if (object.enter === "slide") entranceSlideY = slideIn(entranceFrame, entranceStart, LIFECYCLE_DURATION_FRAMES, SLIDE_DISTANCE_UNITS, object.easing);
    }

    return {
      object,
      x: props.x,
      y: props.y,
      z: props.z,
      radius: props.radius,
      width: props.width,
      height: props.height,
      rotation: props.rotation,
      scale: props.scale * entranceScale,
      opacity: props.opacity * entranceOpacity,
      slideYOffset: entranceSlideY,
      isExiting: false,
    };
  });

  const exitingObjects: ResolvedObject[] =
    phaseIndex > 0 && previousPhase
      ? previousPhase.objects
          .filter((o) => o.exit !== "none" && !currentPhase.objects.some((c) => c.id === o.id))
          .filter(() => phaseLocalFrame < LIFECYCLE_DURATION_FRAMES)
          .map((object) => {
            const exitProgress = fadeIn(phaseLocalFrame, 0, LIFECYCLE_DURATION_FRAMES, object.easing);
            const baseOpacity = object.opacity;
            let opacity = baseOpacity;
            let scale = object.scale;
            let slideYOffset = 0;
            if (object.exit === "fade") opacity = baseOpacity * (1 - exitProgress);
            if (object.exit === "scale") {
              scale = object.scale * (1 - exitProgress);
              opacity = baseOpacity * (1 - exitProgress * 0.5);
            }
            if (object.exit === "slide") {
              opacity = baseOpacity * (1 - exitProgress);
              slideYOffset = -exitProgress * SLIDE_DISTANCE_UNITS;
            }
            return {
              object,
              x: object.x,
              y: object.y,
              z: object.z,
              radius: object.radius ?? 0,
              width: object.width ?? 0,
              height: object.height ?? 0,
              rotation: object.rotation,
              scale,
              opacity,
              slideYOffset,
              isExiting: true,
            };
          })
      : [];

  const renderObjects = [...resolvedObjects, ...exitingObjects].sort((a, b) => a.object.layer - b.object.layer);

  const positionById = new Map<string, [number, number, number]>();
  for (const r of renderObjects) if (!r.isExiting) positionById.set(r.object.id, percentToCanvasWorld3D(r.x, r.y, r.z));

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
        <div style={{ width: canvasWidth, height: canvasHeight }}>
          <ThreeCanvas width={canvasWidth} height={canvasHeight} camera={{ position: pose.position, fov: pose.fov }}>
            <CameraRig3D pose={pose} />
            <ambientLight intensity={1.1} />
            <directionalLight position={[10, 20, 10]} intensity={0.6} />
            {currentPhase.arrows?.map((arrow, index) => (
              <CanvasArrow3D key={index} arrow={arrow} positionById={positionById} frame={phaseLocalFrame} startFrame={10 + index * 6} />
            ))}
            {renderObjects.map((resolved) => (
              <CanvasObjectMesh3D key={resolved.object.id} resolved={resolved} frame={frame} previousPhase={previousPhase} phaseIndex={phaseIndex} />
            ))}
          </ThreeCanvas>
        </div>
      </div>
    </SceneFrame>
  );
};
