import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { CameraRig3D } from "./CameraRig3D";
import { Layer, useLayerOpacity } from "./Layer";
import { resolveCameraPose3D } from "../camera3D";
import { resolveKeyframes, type Keyframe } from "../keyframes";
import { staggerFadeUp } from "../animationPresets";

// Standalone proof scene — NOT wired into the script/segment pipeline
// (AnalysisVideo/TransitionSeries). This exists to answer one question
// before any more motion-graphics engine work happens: does the Layer/
// keyframe/camera core (Layer.tsx, keyframes.ts, cinematicEasing.ts,
// animationPresets.ts, camera3D.ts's "cinematic-drift" pose) actually
// produce something that reads as directed motion — real depth, continuous
// motion, a choreographed moment — rather than "shapes moving on a canvas."
// Registered as its own <Composition> in Root.tsx, viewable in isolation.

export const BENCHMARK_DURATION_FRAMES = 300; // 10s @ 30fps
export const BENCHMARK_WIDTH = 1920;
export const BENCHMARK_HEIGHT = 1080;

const ROAD_HALF_WIDTH = 5;
const ROAD_LENGTH = 300;

// The loop every recycled object (car, roadside post) travels: appears at
// NEAR_Z, travels toward FAR_Z, wraps back to NEAR_Z. Both boundaries are
// deliberately NOT "as close/far as physically possible" — NEAR_Z is a
// modest distance ahead of the camera (never point-blank), and FAR_Z sits
// well inside the fog's falloff — because the actual trick that hides the
// wrap isn't the boundary placement, it's that `smoothFade` below drives
// opacity to ~0 at BOTH ends: the jump from FAR_Z back to NEAR_Z happens
// while the object is already invisible on both sides of it, regardless of
// where exactly the boundary sits.
const NEAR_Z = -1;
const FAR_Z = -26;
const LOOP_LENGTH = NEAR_Z - FAR_Z;

const FOG_NEAR = 10;
const FOG_FAR = 34;

const OVERTAKE_START = 108;
const OVERTAKE_PEAK = 148;
const OVERTAKE_END = 178;

/** 0 at both loop boundaries, 1 in the middle — the actual disguise for the
 * modulo wrap (see LOOP_LENGTH's comment): fades in over the first 12% of
 * the loop, fades out over the last 15%, full opacity between. */
function smoothFade(loopFrac: number): number {
  const fadeIn = loopFrac / 0.12;
  const fadeOut = (1 - loopFrac) / 0.15;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

function loopState(frame: number, speed: number, baseOffset: number): { z: number; loopFrac: number; opacity: number } {
  const traveled = (((frame * speed + baseOffset) % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  const loopFrac = traveled / LOOP_LENGTH;
  return { z: NEAR_Z - traveled, loopFrac, opacity: smoothFade(loopFrac) };
}

// ---------------------------------------------------------------------------
// Road surface — a single plane, seamless infinite scroll via a scrolling
// CanvasTexture (offset animated per frame), not geometry recycling. Real
// UV wrapping has no seam to reset at, which is the honest reason this loop
// is actually invisible rather than merely well-hidden.
// ---------------------------------------------------------------------------

function buildRoadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#292b30";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e9e6df";
  ctx.fillRect(14, 0, 8, canvas.height);
  ctx.fillRect(canvas.width - 22, 0, 8, canvas.height);
  ctx.fillStyle = "#e8c93a";
  const dashH = 70;
  const gapH = 46;
  for (let y = -gapH; y < canvas.height; y += dashH + gapH) {
    ctx.fillRect(canvas.width / 2 - 4, y, 8, dashH);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, ROAD_LENGTH / 22);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const RoadSurface: React.FC<{ frame: number }> = ({ frame }) => {
  const texture = useMemo(() => buildRoadTexture(), []);
  texture.offset.y = (frame * 0.0055) % 1;
  return (
    <mesh position={[0, 0, -20]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[ROAD_HALF_WIDTH * 2, ROAD_LENGTH]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Cars — real volumetric geometry (boxes, not billboards: see
// feedback_canvas3d_needs_real_geometry), continuous modulo-wrapped forward
// motion, a scripted lane-change overtake, a speed-scaled motion-streak
// (the honest substitute for true per-pixel motion blur), and a contact
// shadow that stays attached by construction (same Layer, same x/z).
// ---------------------------------------------------------------------------

interface CarConfig {
  id: string;
  color: string;
  speed: number;
  baseOffset: number;
  laneDefault: number;
  laneTrack: Keyframe<{ x: number }>[];
}

const CAR_CONFIGS: CarConfig[] = [
  {
    id: "carA",
    color: "#e63946",
    speed: 0.095,
    baseOffset: 6,
    laneDefault: 0,
    laneTrack: [{ at: 0, values: { x: 0 } }],
  },
  {
    id: "carB",
    color: "#3d5af1",
    speed: 0.14,
    baseOffset: 0,
    laneDefault: 2.4,
    // The overtake: holds in the right lane, a brief anticipation dip wider
    // right (the wind-up), then darts left past carA into the open lane
    // with an overshoot-settle — a deliberate maneuver, not a coincidence
    // of relative speed alone.
    laneTrack: [
      { at: 0, values: { x: 2.4 } },
      { at: OVERTAKE_START, values: { x: 2.4 } },
      { at: OVERTAKE_START + 20, values: { x: 3.0 }, easing: "anticipate" },
      { at: OVERTAKE_PEAK + 10, values: { x: -2.4 }, easing: "easeOutBack" },
      { at: BENCHMARK_DURATION_FRAMES, values: { x: -2.4 } },
    ],
  },
  {
    id: "carC",
    color: "#ffd23f",
    speed: 0.07,
    baseOffset: 20,
    laneDefault: -2.4,
    laneTrack: [{ at: 0, values: { x: -2.4 } }],
  },
];

const MAX_CAR_SPEED = Math.max(...CAR_CONFIGS.map((c) => c.speed));
const GHOST_LAGS = [6, 12, 20];

function resolveCarX(car: CarConfig, frame: number): number {
  return resolveKeyframes(frame, car.laneTrack, { x: car.laneDefault }).x;
}

const CarBody: React.FC<{ color: string }> = ({ color }) => {
  const opacity = useLayerOpacity();
  return (
    <group>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[1.15, 0.42, 2.6]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.62, -0.25]}>
        <boxGeometry args={[0.7, 0.3, 1]} />
        <meshStandardMaterial color="#12141a" transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.52, 1.35]}>
        <boxGeometry args={[1.3, 0.09, 0.32]} />
        <meshStandardMaterial color="#12141a" transparent opacity={opacity} />
      </mesh>
    </group>
  );
};

const ContactShadow: React.FC = () => {
  const opacity = useLayerOpacity();
  return (
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.3, 20]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.32 * opacity} />
    </mesh>
  );
};

const SpeedStreak: React.FC<{ color: string; stretch: number }> = ({ color, stretch }) => {
  const opacity = useLayerOpacity();
  return (
    <mesh position={[0, 0.3, 0]} scale={[0.55, 0.55, stretch]}>
      <boxGeometry args={[1, 0.3, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
};

const Car: React.FC<{ car: CarConfig; frame: number }> = ({ car, frame }) => {
  const { z, opacity } = loopState(frame, car.speed, car.baseOffset);
  const x = resolveCarX(car, frame);
  const speedFactor = car.speed / MAX_CAR_SPEED;

  return (
    <>
      <Layer position={[x, 0, z]} opacity={opacity}>
        <CarBody color={car.color} />
        <ContactShadow />
      </Layer>
      {GHOST_LAGS.map((lag, i) => {
        const ghostFrame = Math.max(0, frame - lag);
        const ghost = loopState(ghostFrame, car.speed, car.baseOffset);
        const ghostX = resolveCarX(car, ghostFrame);
        const ghostOpacity = ghost.opacity * (0.24 - i * 0.06) * speedFactor;
        if (ghostOpacity <= 0.01) return null;
        return (
          <Layer key={lag} position={[ghostX, 0, ghost.z]} opacity={ghostOpacity}>
            <SpeedStreak color={car.color} stretch={1 + speedFactor * 1.5} />
          </Layer>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// Roadside posts — same loop/fade technique as cars but a faster relative
// pace, one of the strongest "we are moving fast" cues in real driving
// footage, cheap to add given the loop machinery already exists.
// ---------------------------------------------------------------------------

const POST_CONFIGS = Array.from({ length: 6 }, (_, i) => ({
  id: `post-${i}`,
  side: i % 2 === 0 ? 1 : -1,
  speed: 0.2,
  baseOffset: i * (LOOP_LENGTH / 6),
}));

const RoadsidePost: React.FC<{ side: number; speed: number; baseOffset: number; frame: number }> = ({ side, speed, baseOffset, frame }) => {
  const { z, opacity } = loopState(frame, speed, baseOffset);
  const x = side * (ROAD_HALF_WIDTH + 1.1);
  return (
    <Layer position={[x, 0, z]} opacity={opacity}>
      <PostMesh />
    </Layer>
  );
};

const PostMesh: React.FC = () => {
  const opacity = useLayerOpacity();
  return (
    <mesh position={[0, 0.9, 0]}>
      <cylinderGeometry args={[0.06, 0.06, 1.8, 8]} />
      <meshStandardMaterial color="#e8c93a" transparent opacity={opacity} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Background — distant hills, staggered entrance (animationPresets), a very
// slow independent drift so the backdrop is never frozen even though it's
// the least-active layer. The relationship background(slowest) < road <
// cars/foreground(fastest) IS the parallax/depth cue, not a separate effect.
// ---------------------------------------------------------------------------

// Positioned and colored deliberately, not just "far away and dark" — a
// silhouette that's too dim relative to the sky reads as an empty void (the
// first pass here), and one that's too large/close for a chase-cam this
// tight reads as a flat wall, not a horizon (the second pass, after the
// camera moved much closer for the cars — confirmed against real renders
// both times). Small, distant, and BRIGHT (fog does the desaturating) is
// what actually reads as a soft hazy horizon band from this close a shot.
const HILL_CONFIGS = [
  { x: -8, z: -32, w: 10, h: 4.2, color: "#7c8fc0" },
  { x: 2, z: -35, w: 13, h: 5, color: "#65779f" },
  { x: 10, z: -31, w: 9, h: 3.8, color: "#7c8fc0" },
];

const BackgroundHills: React.FC<{ frame: number }> = ({ frame }) => (
  <>
    {HILL_CONFIGS.map((hill, i) => {
      const track = staggerFadeUp(0, i, hill.h / 2 - 0.4, 10, 1.2, 26);
      const { opacity, y } = resolveKeyframes(frame, track, { opacity: 0, y: hill.h / 2 - 0.4 });
      const drift = Math.sin(frame / 340 + i * 2) * 0.4;
      return (
        <mesh key={hill.x} position={[hill.x + drift, y, hill.z]}>
          <planeGeometry args={[hill.w, hill.h]} />
          <meshBasicMaterial color={hill.color} transparent opacity={opacity} />
        </mesh>
      );
    })}
  </>
);

// ---------------------------------------------------------------------------
// Speed lines — appear only around the overtake beat, silent otherwise.
// ---------------------------------------------------------------------------

const speedLineTrack: Keyframe<{ opacity: number }>[] = [
  { at: 0, values: { opacity: 0 } },
  { at: OVERTAKE_START, values: { opacity: 0 } },
  { at: OVERTAKE_PEAK, values: { opacity: 1 } },
  { at: OVERTAKE_END, values: { opacity: 0 } },
  { at: BENCHMARK_DURATION_FRAMES, values: { opacity: 0 } },
];

const SpeedLineMesh: React.FC = () => {
  const opacity = useLayerOpacity();
  return (
    <mesh>
      <boxGeometry args={[0.12, 0.12, 5]} />
      <meshBasicMaterial color="#f5f5f0" transparent opacity={opacity * 0.7} />
    </mesh>
  );
};

const SpeedLines: React.FC<{ frame: number }> = ({ frame }) => {
  const { opacity } = resolveKeyframes(frame, speedLineTrack, { opacity: 0 });
  if (opacity <= 0.01) return null;
  return (
    <Layer opacity={opacity}>
      <group position={[-3.4, 1.5, 1.5]} rotation={[0, 0, -0.12]}>
        <SpeedLineMesh />
      </group>
      <group position={[3.4, 1.5, 1.5]} rotation={[0, 0, 0.12]}>
        <SpeedLineMesh />
      </group>
    </Layer>
  );
};

// ---------------------------------------------------------------------------
// Sky — a gradient backdrop, not a flat fill. A single flat color behind
// everything is exactly the "empty void" a screenshot-worthy composed frame
// can't afford (confirmed against a real render: the first pass here read
// as dead space, not sky). Same technique as the road surface — a small
// CanvasTexture, generated once, this one static (no per-frame offset).
// ---------------------------------------------------------------------------

function buildSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#060a14");
  gradient.addColorStop(0.55, "#0d1420");
  gradient.addColorStop(0.82, "#1c2740");
  gradient.addColorStop(1, "#33405f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const Sky: React.FC = () => {
  const texture = useMemo(() => buildSkyTexture(), []);
  return (
    <mesh position={[0, 9, -34]}>
      <planeGeometry args={[110, 46]} />
      <meshBasicMaterial map={texture} fog={false} depthWrite={false} />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Camera + assembly
// ---------------------------------------------------------------------------

const REFRAME_AT = (OVERTAKE_START + (OVERTAKE_END - OVERTAKE_START) * 0.6) / BENCHMARK_DURATION_FRAMES;

export const InfiniteRoadBenchmark: React.FC = () => {
  const frame = useCurrentFrame();

  // Low and close, not high and wide — the earlier pass (camera at y=3.4,
  // target 30 units out) read as a distant toy-town aerial view: weak
  // perspective foreshortening, cars shrunk to dots, an empty void of sky
  // above a thin sliver of action (confirmed against a real render, not
  // guessed). A chase-cam sitting near the cars' own height, holding on a
  // MUCH closer target, is what actually produces strong perspective
  // convergence and keeps the cars reading as foreground subjects.
  const pose = resolveCameraPose3D("cinematic-drift", frame, BENCHMARK_DURATION_FRAMES, {
    basePosition: [0, 1.7, 4.2],
    target: [0, 0.85, -13],
    driftAmplitude: 0.32,
    driftPeriodFrames: 260,
    pushInFraction: 0.087,
    fov: 42,
    reframeAtProgress: REFRAME_AT,
    reframeTarget: [1.2, 0.85, -13],
    reframeWindow: 0.18,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1420" }}>
      <ThreeCanvas width={BENCHMARK_WIDTH} height={BENCHMARK_HEIGHT} camera={{ position: pose.position, fov: pose.fov }}>
        <CameraRig3D pose={pose} />
        <color attach="background" args={["#0d1420"]} />
        <fog attach="fog" args={["#0d1420", FOG_NEAR, FOG_FAR]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[10, 22, 6]} intensity={0.7} />

        <Sky />
        <BackgroundHills frame={frame} />
        <RoadSurface frame={frame} />
        {POST_CONFIGS.map((p) => (
          <RoadsidePost key={p.id} side={p.side} speed={p.speed} baseOffset={p.baseOffset} frame={frame} />
        ))}
        {CAR_CONFIGS.map((car) => (
          <Car key={car.id} car={car} frame={frame} />
        ))}
        <SpeedLines frame={frame} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
