import React from "react";
import { useCurrentFrame } from "remotion";
import { Line, Html, Billboard } from "@react-three/drei";
import { ThreeCanvas } from "@remotion/three";
import { SuspenseLoader3D } from "./SuspenseLoader3D";
import { COLORS, TITLE_STYLE, PLAYER_LABEL_STYLE, FPS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import {
  PERSPECTIVE_PITCH_WIDTH,
  PERSPECTIVE_PITCH_HEIGHT,
  PERSPECTIVE_PITCH_WIDTH_LANDSCAPE,
  PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE,
} from "./PerspectivePitch";
import { Pitch3D } from "./Pitch3D";
import { PlayerMarker3D, DEFAULT_JERSEY_3D } from "./PlayerMarker3D";
import { CameraRig3D } from "./CameraRig3D";
import { percentToWorld, MARKER_HEIGHT_UNITS, PITCH_LENGTH_UNITS, PITCH_WIDTH_UNITS } from "../coords3D";
import { resolveCameraPose3D } from "../camera3D";
import { fadeIn, drawIn, pulse } from "../motion";
import { RUN_TYPE_GEOMETRY } from "./CurvedMovementArrow";
import { computeEffectiveSeconds, resolveActiveFreeze, movesFor, statesFor, objectOpacity, type TimelineAction } from "../timelineTiming";
import type { SharedVisualProps, TacticalBoard3DData } from "../sharedVisualProps";

const PLAYER_RADIUS = 0.55;
const HOME_COLOR = COLORS.homeTeam;
const AWAY_COLOR = COLORS.awayTeam;
const ARROW_DRAW_START = 26;
const ARROW_DRAW_DURATION = 18;

type Player = TacticalBoard3DData["players"][number];
type Arrow = NonNullable<TacticalBoard3DData["arrows"]>[number];
type TacticalObject3D = NonNullable<TacticalBoard3DData["tacticalObjects"]>[number];

// A flat, deliberately-darker fill (COLORS.pitchVoid, not COLORS.pitch —
// 2026-07-22, replaces an earlier grass-blade CSS texture) for the space
// around the rendered board. Plain and darker on purpose: this is empty
// space, not more pitch, and keeping it a distinct step below the actual
// Pitch3D ground mesh's tone avoids the two ever blending into one mass or
// clashing where the WebGL canvas' lit mesh meets this flat CSS layer.

// v1 (no `timeline`) deliberately doesn't glide the FROM player's own marker
// along an outgoing arrow the way TacticalBoard.tsx's 2D "run" kind does —
// see resolveActorFold3D/movesFor below for the actual real-movement path,
// which a `timeline`-authored scene uses instead of this static arrow.
function Arrow3D({ arrow, players, frame }: { arrow: Arrow; players: Player[]; frame: number }) {
  const origin = players.find((p) => p.id === arrow.from);
  if (!origin) return null;
  const progress = drawIn(frame, ARROW_DRAW_START, ARROW_DRAW_DURATION);
  if (progress <= 0) return null;
  const from = percentToWorld(origin.x, origin.y, MARKER_HEIGHT_UNITS * 0.4);
  const to = percentToWorld(arrow.to.x, arrow.to.y, MARKER_HEIGHT_UNITS * 0.4);
  const tip: [number, number, number] = [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
    from[2] + (to[2] - from[2]) * progress,
  ];
  return (
    <group>
      <Line points={[from, tip]} color={COLORS.movement} lineWidth={3} transparent opacity={progress > 0.02 ? 1 : 0} />
      <mesh position={tip}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial color={COLORS.movement} transparent opacity={progress > 0.02 && progress < 0.98 ? 1 : 0} />
      </mesh>
    </group>
  );
}

// A real pass/shot arcs — a flat glide read as "sliding a coin across a
// table," not a struck ball. One sine hump over the same draw-in window the
// arrow itself uses, peaking at the midpoint of the travel.
const BALL_BOUNCE_HEIGHT_UNITS = 1.1;
const BALL_BASE_HEIGHT_UNITS = MARKER_HEIGHT_UNITS * 0.35;

// Answers "the ball never moves" directly: when `ball.belongsTo` names a
// player who also has an outgoing arrow, the ball glides along that exact
// arrow path (same easing/window as the arrow's own draw-in, so the line
// draws and the ball travels together) and rests at the arrow's `to` point
// once it lands — instead of sitting frozen at its authored (x, y) the whole
// scene. Falls back to the authored static position when there's no
// matching arrow, so a plain ball-marker scene is unaffected. Only used when
// the scene has no `timeline` — see resolveBallFold3D for the timeline path.
function resolveBallPosition3D(
  ball: NonNullable<TacticalBoard3DData["ball"]>,
  arrows: Arrow[],
  players: Player[],
  frame: number,
): [number, number, number] {
  const carryArrow = ball.belongsTo ? arrows.find((a) => a.from === ball.belongsTo) : undefined;
  const origin = carryArrow ? players.find((p) => p.id === carryArrow.from) : undefined;
  if (!carryArrow || !origin) return percentToWorld(ball.x, ball.y, MARKER_HEIGHT_UNITS * 0.35);
  const progress = drawIn(frame, ARROW_DRAW_START, ARROW_DRAW_DURATION);
  const from = percentToWorld(origin.x, origin.y, MARKER_HEIGHT_UNITS * 0.35);
  const to = percentToWorld(carryArrow.to.x, carryArrow.to.y, MARKER_HEIGHT_UNITS * 0.35);
  const bounce = Math.sin(Math.min(Math.max(progress, 0), 1) * Math.PI) * BALL_BOUNCE_HEIGHT_UNITS;
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress + bounce,
    from[2] + (to[2] - from[2]) * progress,
  ];
}

// Fading echoes of the ball's own recent positions, replacing the old
// static line from passer to ball — a line that stays drawn the whole time
// reads as "still tethered to the passer," not "the ball already left."
// Reuses resolveBallPosition3D at a few earlier frames rather than a second
// position formula, so the trail always matches the ball's actual path
// (including its bounce arc) exactly.
const BALL_TRAIL_LAG_FRAMES = [4, 8, 13];
const BALL_TRAIL_OPACITY = [0.4, 0.24, 0.12];

function BallGhostTrail3D({
  ball,
  arrows,
  players,
  frame,
}: {
  ball: NonNullable<TacticalBoard3DData["ball"]>;
  arrows: Arrow[];
  players: Player[];
  frame: number;
}) {
  const carryArrow = ball.belongsTo ? arrows.find((a) => a.from === ball.belongsTo) : undefined;
  if (!carryArrow) return null;
  return (
    <>
      {BALL_TRAIL_LAG_FRAMES.map((lag, i) => {
        const ghostFrame = frame - lag;
        const progress = drawIn(ghostFrame, ARROW_DRAW_START, ARROW_DRAW_DURATION);
        // Skip ghosts still sitting at the passer (hasn't left yet) or
        // already resting at the landing spot (would just stack on the ball).
        if (progress <= 0.01 || progress >= 0.99) return null;
        const position = resolveBallPosition3D(ball, arrows, players, ghostFrame);
        return (
          <mesh key={i} position={position}>
            <sphereGeometry args={[BALL_RADIUS * 0.75, 12, 12]} />
            <meshBasicMaterial color="#f2f2f0" transparent opacity={BALL_TRAIL_OPACITY[i]} />
          </mesh>
        );
      })}
    </>
  );
}

// A genuine sphere (not a billboarded flat disc, which is right for players'
// jersey discs but reads as a coin, not a ball) — two thin seam rings break
// up the otherwise flat-shaded sphere enough to sell "football" at this
// small size without needing a real texture asset.
const BALL_RADIUS = 0.15;

function BallMarker3D({ position, opacity }: { position: [number, number, number]; opacity: number }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[BALL_RADIUS, 20, 20]} />
        <meshStandardMaterial color="#f2f2f0" roughness={0.5} transparent opacity={opacity} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[BALL_RADIUS * 0.88, 0.007, 8, 24]} />
        <meshBasicMaterial color="#2a2a2a" transparent opacity={opacity} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[BALL_RADIUS * 0.88, 0.007, 8, 24]} />
        <meshBasicMaterial color="#2a2a2a" transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function HighlightZone3D({ zone, opacity }: { zone: NonNullable<TacticalBoard3DData["highlightZone"]>; opacity: number }) {
  const [cx, cy, cz] = percentToWorld(zone.x + zone.width / 2, zone.y + zone.height / 2, 0.02);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, cy, cz]}>
      <planeGeometry args={[(zone.width / 100) * PITCH_LENGTH_UNITS, (zone.height / 100) * PITCH_WIDTH_UNITS]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={opacity} />
    </mesh>
  );
}

// ---- Real movement (`timeline`) support ---------------------------------
// Everything below is the 3D counterpart to TacticalBoard.tsx's evented
// fold (resolveActorFold/resolveBallFold) — same authoring shape (move/
// state/possession/freeze), same shared timing math (timelineTiming.ts),
// but folding to a Three.js world position instead of a projected SVG pixel.
// Only engaged when a scene actually authors `timeline`; every scene without
// one renders through the exact pre-existing static/arrow path above,
// unchanged.

// RUN_TYPE_GEOMETRY's bow values were tuned for TacticalBoard.tsx's SVG
// pixel space (a ~900-1900px-wide board) — this pitch's world units are a
// much smaller, fixed-size box (PITCH_LENGTH_UNITS=24) regardless of render
// resolution, so those pixel-tuned magnitudes need converting down to world
// units rather than reused directly (a bow of 75 applied as 75 world units
// would curve clean off the pitch). This scale was picked by eye against a
// real render, not derived from an exact 2D-board-width ratio — the 2D
// board's own width already varies by orientation, so there's no single
// "correct" ratio to convert from anyway.
const WORLD_UNIT_SCALE = 0.03;

/** World-space counterpart to CurvedMovementArrow's bezierPointAt — same
 * quadratic-bezier-with-perpendicular-control-point technique, operating on
 * world (x, z) instead of projected pixel (x, y), so a gliding marker's path
 * and a `bow`-curved run read as the same curve shape in both dimensions. */
function bezierPointWorld(x1: number, z1: number, x2: number, z2: number, bow: number, t: number): { x: number; z: number } {
  const midX = (x1 + x2) / 2;
  const midZ = (z1 + z2) / 2;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const controlX = midX + nx * bow;
  const controlZ = midZ + nz * bow;
  return {
    x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * controlX + t * t * x2,
    z: (1 - t) * (1 - t) * z1 + 2 * (1 - t) * t * controlZ + t * t * z2,
  };
}

interface ActorFold3D {
  position: [number, number, number];
  state?: Player["state"];
}

/** Folds every `move`/`state` action for one actor up to nominal time `te`
 * into a world-space position — the 3D counterpart to
 * TacticalBoard.tsx's resolveActorFold, same fold logic, world coordinates
 * instead of projected pixels. */
function resolveActorFold3D(actor: Player, timeline: TimelineAction[], te: number): ActorFold3D {
  let fromX = actor.x;
  let fromY = actor.y;
  let activeMove: Extract<TimelineAction, { type: "move" }> | undefined;
  for (const move of movesFor(timeline, actor.id)) {
    if (move.startSeconds > te) break;
    const endSeconds = move.startSeconds + move.durationSeconds;
    if (te < endSeconds) {
      activeMove = move;
      break;
    }
    fromX = move.to.x;
    fromY = move.to.y;
  }

  let state = actor.state;
  for (const action of statesFor(timeline, actor.id)) {
    if (action.startSeconds > te) break;
    if (action.state !== undefined) state = action.state;
  }

  if (!activeMove) {
    return { position: percentToWorld(fromX, fromY, MARKER_HEIGHT_UNITS), state };
  }

  const moveProgress = drawIn(te * FPS, activeMove.startSeconds * FPS, Math.max(activeMove.durationSeconds, 1 / FPS) * FPS);
  const bow = (activeMove.bow ?? RUN_TYPE_GEOMETRY[activeMove.runType].bow) * WORLD_UNIT_SCALE;
  const [x1, , z1] = percentToWorld(fromX, fromY);
  const [x2, , z2] = percentToWorld(activeMove.to.x, activeMove.to.y);
  const { x, z } = bezierPointWorld(x1, z1, x2, z2, bow, moveProgress);
  return { position: [x, MARKER_HEIGHT_UNITS, z], state };
}

interface BallFold3D {
  position: [number, number, number];
}

/** Folds every `possession` action up to nominal time `te` into "where is
 * the ball" — the 3D counterpart to TacticalBoard.tsx's resolveBallFold.
 * Outside an in-flight window the ball simply snaps to its current holder's
 * LIVE folded world position every frame, same "the eye follows the ball
 * even while its possessor is also mid-move" behavior the 2D fold has.
 * `actorWorldById` is this frame's already-computed per-actor world
 * positions (see resolveActorFold3D above), reused so a pass targets a
 * moving receiver's real position, not a static roster coordinate. */
function resolveBallFold3D(
  ball: NonNullable<TacticalBoard3DData["ball"]> | undefined,
  timeline: TimelineAction[],
  te: number,
  actorWorldById: Map<string, [number, number, number]>,
): BallFold3D | null {
  if (!ball) return null;
  const possessions = timeline
    .filter((a): a is Extract<TimelineAction, { type: "possession" }> => a.type === "possession")
    .sort((a, b) => a.startSeconds - b.startSeconds);

  let rest: [number, number] = [percentToWorld(ball.x, ball.y)[0], percentToWorld(ball.x, ball.y)[2]];
  let holderId: string | undefined = ball.belongsTo;

  for (const action of possessions) {
    if (action.startSeconds > te) break;
    const endSeconds = action.startSeconds + action.durationSeconds;
    if (te < endSeconds) {
      const fromPos = holderId ? actorWorldById.get(holderId) : undefined;
      const from: [number, number] = fromPos ? [fromPos[0], fromPos[2]] : rest;
      const toPos = action.toId ? actorWorldById.get(action.toId) : undefined;
      const to: [number, number] = toPos
        ? [toPos[0], toPos[2]]
        : action.toPoint
          ? [percentToWorld(action.toPoint.x, action.toPoint.y)[0], percentToWorld(action.toPoint.x, action.toPoint.y)[2]]
          : from;
      const progress = drawIn(te * FPS, action.startSeconds * FPS, Math.max(action.durationSeconds, 1 / FPS) * FPS);
      const bounce = Math.sin(Math.min(Math.max(progress, 0), 1) * Math.PI) * BALL_BOUNCE_HEIGHT_UNITS;
      const { x, z } = bezierPointWorld(from[0], from[1], to[0], to[1], 0, progress);
      return { position: [x, BALL_BASE_HEIGHT_UNITS + bounce, z] };
    }
    if (action.toId) {
      holderId = action.toId;
      const pos = actorWorldById.get(action.toId);
      if (pos) rest = [pos[0], pos[2]];
    } else if (action.toPoint) {
      holderId = undefined;
      const p = percentToWorld(action.toPoint.x, action.toPoint.y);
      rest = [p[0], p[2]];
    }
  }

  if (holderId) {
    const pos = actorWorldById.get(holderId);
    if (pos) return { position: [pos[0], BALL_BASE_HEIGHT_UNITS, pos[2]] };
  }
  return { position: [rest[0], BALL_BASE_HEIGHT_UNITS, rest[1]] };
}

// A dashed touchline-to-touchline line at a fixed length-axis position — the
// 3D counterpart to TacticalBoard.tsx's `shape: "line"` tacticalObject
// (a defensive/offside line). Only `line` is implemented in 3D v1; `zone`/
// `lane`/`triangle` tacticalObjects are silently skipped (see the
// TacticalObjectMarkers3D filter below) — HighlightZone3D above already
// covers the single-zone case most 3D scenes need, and lane/triangle callouts
// haven't come up in a 3D script yet, same "add it when a real script needs
// it" posture as every other v1 scope cut in this file.
function DefensiveLine3D({ object, te }: { object: Extract<TacticalObject3D, { shape: "line" }>; te: number }) {
  const opacity = objectOpacity(te, object.appearSeconds, object.disappearSeconds);
  if (opacity <= 0.01) return null;
  const [worldX] = percentToWorld(object.x, 50);
  const halfWidth = PITCH_WIDTH_UNITS / 2;
  return (
    <>
      <Line
        points={[
          [worldX, 0.03, -halfWidth],
          [worldX, 0.03, halfWidth],
        ]}
        color={COLORS.movement}
        lineWidth={2.5}
        dashed
        dashSize={0.35}
        gapSize={0.22}
        transparent
        opacity={opacity}
      />
      {object.label && (
        <Html position={[worldX, 2.2, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            style={{
              ...PLAYER_LABEL_STYLE,
              color: COLORS.text,
              whiteSpace: "nowrap",
              opacity,
              background: "rgba(10, 12, 14, 0.62)",
              padding: "2px 8px",
              borderRadius: 5,
            }}
          >
            {object.label}
          </div>
        </Html>
      )}
    </>
  );
}

function TacticalObjectMarkers3D({ objects, te }: { objects: TacticalObject3D[]; te: number }) {
  return (
    <>
      {objects.map((object, index) => (object.shape === "line" ? <DefensiveLine3D key={index} object={object} te={te} /> : null))}
    </>
  );
}

const FREEZE_CIRCLE_WORLD_RADIUS_SCALE = WORLD_UNIT_SCALE;

/** The 3D counterpart to TacticalBoard.tsx's freeze rendering — same "pause,
 * dim, draw over it" coaching-analysis technique (see that file's own
 * comment for the convention this is modeled on): a flat CSS dim layer over
 * the whole canvas (simpler and more reliable than dimming individual
 * WebGL materials), a billboarded ring around whatever `circles` the freeze
 * names, and Html-overlay annotation text — same solid-pill-background
 * legibility treatment PlayerMarker3D's own labels use. */
function FreezeCircle3D({ x, y, radius, opacity }: { x: number; y: number; radius: number; opacity: number }) {
  const position = percentToWorld(x, y, MARKER_HEIGHT_UNITS);
  const worldRadius = Math.max(0.3, radius * FREEZE_CIRCLE_WORLD_RADIUS_SCALE);
  return (
    <Billboard position={position}>
      <mesh>
        <ringGeometry args={[worldRadius, worldRadius + 0.08, 32]} />
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={opacity} />
      </mesh>
    </Billboard>
  );
}

function FreezeAnnotation3D({ x, y, text, opacity }: { x: number; y: number; text: string; opacity: number }) {
  const position = percentToWorld(x, y, MARKER_HEIGHT_UNITS + 1.6);
  return (
    <Html position={position} center distanceFactor={9} style={{ pointerEvents: "none" }}>
      <div
        style={{
          ...PLAYER_LABEL_STYLE,
          fontSize: 20,
          fontWeight: 700,
          color: COLORS.text,
          whiteSpace: "nowrap",
          opacity,
          background: "rgba(10, 12, 14, 0.72)",
          padding: "4px 12px",
          borderRadius: 6,
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/** 3D counterpart to TacticalBoard — see the "Tactical Board (3D)" visual
 * definition (src/model/visualDefinitions.ts) for the exact scope cut
 * relative to the 2D version (no `phases`, no `camera`-type timeline
 * events — those two are the only gaps left; `timeline`'s move/state/
 * possession/freeze all work here now, see resolveActorFold3D/
 * resolveBallFold3D above). Players/ball render as billboarded markers
 * (PlayerMarker3D) so labels stay upright at any camera angle — the direct
 * answer to PerspectivePitch.tsx's own documented reason for avoiding real
 * 3D rotation. */
export const TacticalBoard3D: React.FC<{ data: TacticalBoard3DData } & SharedVisualProps> = ({
  data: { title, players, arrows = [], highlight = [], highlightZone, ball, cameraStyle = "sway", timeline, tacticalObjects = [] },
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const boardWidth = orientation === "portrait" ? PERSPECTIVE_PITCH_WIDTH : PERSPECTIVE_PITCH_WIDTH_LANDSCAPE;
  const boardHeight = orientation === "portrait" ? PERSPECTIVE_PITCH_HEIGHT : PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE;
  const titleOpacity = fadeIn(frame, 0, 14);
  const zoneOpacity = highlightZone ? fadeIn(frame, 10, 16) * pulse(frame, 90, 0.22, 0.36) : 0;

  const te = timeline ? computeEffectiveSeconds(timeline, frame / FPS) : frame / FPS;
  const activeFreeze = timeline ? resolveActiveFreeze(timeline, frame / FPS) : null;

  // Frame around where the players actually are instead of always centering
  // pitch-wide — a tight cluster far from pitch center (a corner/box scene)
  // otherwise sits as a small speck in an otherwise-empty frame. Target =
  // highlightZone center if given (the author's own "this is the subject"
  // signal), otherwise the centroid of every player's own FULL range of
  // motion — not just their t=0 roster position. A `timeline` scene's whole
  // point is often a player covering real ground (an offside run, a
  // one-two's overlapping run) — framing purely on where everyone STARTS
  // left the camera sized for the opening shape, so anyone who then moved
  // any real distance drifted straight out of frame (confirmed via a real
  // render: an offside-trap scene's own attacker, and the freeze/annotation
  // marking his exact landing spot, were both simply invisible). Each
  // player's own `move` destinations are included as extra waypoints here so
  // the frame accounts for wherever the choreography actually takes them,
  // even though the camera itself still doesn't re-target mid-scene (no
  // `camera`-type timeline events in 3D yet) — this sizes the shot for the
  // scene's overall footprint, not one single moment of it.
  const waypoints: { x: number; y: number }[] = highlightZone
    ? [{ x: highlightZone.x + highlightZone.width / 2, y: highlightZone.y + highlightZone.height / 2 }]
    : players.flatMap((p) => [{ x: p.x, y: p.y }, ...(timeline ? movesFor(timeline, p.id).map((m) => m.to) : [])]);
  const centroidPercent = {
    x: waypoints.reduce((s, p) => s + p.x, 0) / waypoints.length,
    y: waypoints.reduce((s, p) => s + p.y, 0) / waypoints.length,
  };
  const target = percentToWorld(centroidPercent.x, centroidPercent.y, 1.2);
  const worldSpread = Math.max(
    ...waypoints.map((p) => {
      const [wx, , wz] = percentToWorld(p.x, p.y);
      return Math.hypot(wx - target[0], wz - target[2]);
    }),
    4,
  );
  // Low floor (9) — a tight cluster (a corner/box scene, worldSpread near
  // its own 4-unit floor) should be allowed to actually get close instead of
  // being forced back out to a wide, elevated view. 9 just keeps the camera
  // from clipping through a marker when a scene is extremely tight.
  const baseRadius = Math.max(9, worldSpread * 1.8);
  const pose = resolveCameraPose3D(cameraStyle, frame, durationInFrames, {
    radius: baseRadius,
    // dolly-in's own default endRadius (18) was never overridden here, so a
    // tight cluster's computed `radius` (often smaller than 18) made the
    // "push in" actually pull the camera BACK out to 18 over the scene —
    // the opposite of what dolly-in is supposed to do. Always ending at a
    // fraction of the starting radius guarantees a real zoom in.
    endRadius: Math.max(4, baseRadius * 0.45),
    // Height scales down with radius too — this used to floor at 13
    // regardless of how tight the shot was, which is what pushed the camera
    // up into a wide aerial angle even for a tightly-clustered scene.
    height: Math.max(6, baseRadius * 0.7),
    // sideline-pan doesn't use radius/endRadius at all — it has its own
    // panRange/sidelineOffset, which need the same baseRadius-relative
    // scaling or they'd stay fixed regardless of how tight this scene's
    // cluster is (orbit/sway/dolly-in simply ignore these two fields).
    panRange: baseRadius * 0.8,
    sidelineOffset: baseRadius * 1.1,
    target,
  });

  // Per-player folded position/state — timeline-driven when authored,
  // otherwise the exact static position this component always rendered.
  // Computed once here (not inline in the players.map below) so
  // resolveBallFold3D can consume the SAME live positions via
  // actorWorldById, matching TacticalBoard.tsx's 2D fold's own reasoning.
  const actorWorldById = new Map<string, [number, number, number]>();
  const folds = players.map((player) => {
    const fold = timeline ? resolveActorFold3D(player, timeline, te) : { position: percentToWorld(player.x, player.y, MARKER_HEIGHT_UNITS) };
    actorWorldById.set(player.id, fold.position);
    return fold;
  });

  const timelineBallFold = timeline ? resolveBallFold3D(ball, timeline, te, actorWorldById) : null;
  const freezeDimOpacity = activeFreeze ? fadeIn(activeFreeze.localSeconds * FPS, 0, 8) * 0.55 : 0;

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      {/* Flat CSS backdrop, not 3D geometry — fills the space around the
          rendered pitch with a plain, deliberately-darker-than-the-pitch
          color (see COLORS.pitchVoid) rather than this project's default
          near-black SceneFrame background reading as an empty void.
          `gl={{ alpha: true }}` on the ThreeCanvas below lets this show
          through anywhere the 3D scene itself doesn't draw over it. */}
      <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.pitchVoid }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
          <ThreeCanvas width={boardWidth} height={boardHeight} camera={{ position: pose.position, fov: pose.fov }} gl={{ alpha: true }}>
            <SuspenseLoader3D>
              <CameraRig3D pose={pose} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[10, 20, 10]} intensity={0.6} />
              <Pitch3D />
              {highlightZone && <HighlightZone3D zone={highlightZone} opacity={zoneOpacity} />}
              {tacticalObjects.length > 0 && <TacticalObjectMarkers3D objects={tacticalObjects} te={te} />}
              {!timeline &&
                arrows.map((arrow, index) =>
                  // A ball actually carried along this arrow shows the pass via
                  // its own motion + ghost trail below — a static line staying
                  // drawn from the passer to the ball's current position reads
                  // as "the ball is still tethered to the passer," not "this
                  // already happened." Plain (ball-less) arrows keep the line.
                  // Only rendered pre-timeline — a `timeline` scene's arrows
                  // (if any) are static overlays independent of real actor
                  // movement, which reads as contradicting the actual glide
                  // right next to it, so timeline scenes skip static arrows
                  // entirely in favor of the real moves/passes themselves.
                  ball?.belongsTo === arrow.from ? null : <Arrow3D key={index} arrow={arrow} players={players} frame={frame} />,
                )}
              {timeline
                ? timelineBallFold && <BallMarker3D position={timelineBallFold.position} opacity={fadeIn(frame, 4, 14)} />
                : ball && (
                    <>
                      <BallGhostTrail3D ball={ball} arrows={arrows} players={players} frame={frame} />
                      <BallMarker3D position={resolveBallPosition3D(ball, arrows, players, frame)} opacity={fadeIn(frame, 4, 14)} />
                    </>
                  )}
              {players.map((player, index) => (
                <PlayerMarker3D
                  key={player.id}
                  position={folds[index].position}
                  color={player.team === "home" ? HOME_COLOR : AWAY_COLOR}
                  jerseyImage={DEFAULT_JERSEY_3D}
                  label={player.label}
                  radius={PLAYER_RADIUS}
                  opacity={fadeIn(frame, 14 + index * 4, 12)}
                  highlighted={highlight.includes(player.id)}
                />
              ))}
              {activeFreeze?.freeze.circles?.map((circle, index) => (
                <FreezeCircle3D
                  key={index}
                  x={circle.x}
                  y={circle.y}
                  radius={circle.radius}
                  opacity={fadeIn(activeFreeze.localSeconds * FPS, 6, 10)}
                />
              ))}
              {activeFreeze?.freeze.annotations?.map((annotation, index) => (
                <FreezeAnnotation3D
                  key={index}
                  x={annotation.x}
                  y={annotation.y}
                  text={annotation.text}
                  opacity={fadeIn(activeFreeze.localSeconds * FPS, 10, 12)}
                />
              ))}
            </SuspenseLoader3D>
          </ThreeCanvas>
          {/* CSS dim layer, not WebGL — sits above the canvas as a plain
              sibling div rather than trying to darken individual Three.js
              materials, which would need touching every mesh's own opacity
              (the pitch, every marker, every highlight) instead of one flat
              overlay. Matches TacticalBoard.tsx's own freeze dimming
              (a single `<rect fill="#000000">` over everything already
              drawn) — same technique, CSS instead of SVG. */}
          {freezeDimOpacity > 0.01 && (
            <div style={{ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: freezeDimOpacity, pointerEvents: "none" }} />
          )}
        </div>
      </div>
    </SceneFrame>
  );
};
