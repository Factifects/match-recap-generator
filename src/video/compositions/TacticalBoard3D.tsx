import React from "react";
import { useCurrentFrame } from "remotion";
import { Line } from "@react-three/drei";
import { ThreeCanvas } from "@remotion/three";
import { SuspenseLoader3D } from "./SuspenseLoader3D";
import { COLORS, TITLE_STYLE } from "../theme";
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
import type { SharedVisualProps, TacticalBoard3DData } from "../sharedVisualProps";

const PLAYER_RADIUS = 0.55;
const HOME_COLOR = COLORS.homeTeam;
const AWAY_COLOR = COLORS.awayTeam;
const ARROW_DRAW_START = 26;
const ARROW_DRAW_DURATION = 18;

// A dense field of individual grass-blade strokes, without ever rendering
// thousands of real elements — one small SVG tile (6 curved blades) gets
// repeated by the browser's own CSS background-repeat, the same trick a
// tileable ground texture uses. At a 34px tile over a 1920x1080 frame that's
// roughly 57 x 32 tiles = ~1,824 repeats x 6 blades = ~10,900 blades total,
// landing right around the density asked for, for the cost of rendering one
// tiny SVG rather than an actual 10k-node scene.
const GRASS_BLADE_TILE_SIZE = 34;
const GRASS_BLADE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='${GRASS_BLADE_TILE_SIZE}' height='${GRASS_BLADE_TILE_SIZE}'>
  <path d='M3 34 Q5 18 2 0' stroke='#245e34' stroke-width='1.3' fill='none' opacity='0.55'/>
  <path d='M9 34 Q12 20 7 2' stroke='#2f7d40' stroke-width='1.3' fill='none' opacity='0.5'/>
  <path d='M16 34 Q14 16 19 0' stroke='#245e34' stroke-width='1.3' fill='none' opacity='0.5'/>
  <path d='M23 34 Q26 18 21 2' stroke='#357f47' stroke-width='1.3' fill='none' opacity='0.55'/>
  <path d='M30 34 Q28 16 33 0' stroke='#2f7d40' stroke-width='1.3' fill='none' opacity='0.5'/>
  <path d='M13 34 Q10 22 15 4' stroke='#357f47' stroke-width='1.1' fill='none' opacity='0.4'/>
</svg>`;
// encodeURIComponent (not a hand-rolled `#` -> %23 substitution) so every
// special character — quotes, `#`, whitespace — is correctly escaped;
// partial escaping is a common source of a silently-failed data URI.
const GRASS_BLADE_LAYER_CSS = `url("data:image/svg+xml,${encodeURIComponent(GRASS_BLADE_SVG)}")`;
// A soft two-tone mowing-stripe base underneath the blades, so the pattern
// reads as "a mowed pitch surface with grass texture," not blades floating
// on a flat single color.
const GRASS_BACKDROP_CSS = `${GRASS_BLADE_LAYER_CSS}, repeating-linear-gradient(100deg, #2f7d40 0px, #2f7d40 70px, #357f47 70px, #357f47 140px)`;

type Player = TacticalBoard3DData["players"][number];
type Arrow = NonNullable<TacticalBoard3DData["arrows"]>[number];

// v1 deliberately doesn't glide the FROM player's own marker along an
// outgoing arrow the way TacticalBoard.tsx's 2D "run" kind does — that
// requires the same per-player outgoing-arrow tracking TacticalBoard.tsx
// builds (see its `outgoingIndex`/`positionAt`), which is exactly the kind
// of extra fidelity this 3D v1 is scoped to skip. Every arrow here (`run` or
// `pass`) is a static overlay showing the intended movement/pass line, drawn
// once, independent of where markers themselves sit.
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

// Answers "the ball never moves" directly: when `ball.belongsTo` names a
// player who also has an outgoing arrow, the ball glides along that exact
// arrow path (same easing/window as the arrow's own draw-in, so the line
// draws and the ball travels together) and rests at the arrow's `to` point
// once it lands — instead of sitting frozen at its authored (x, y) the whole
// scene. Falls back to the authored static position when there's no
// matching arrow, so a plain ball-marker scene is unaffected.
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

/** 3D counterpart to TacticalBoard — see the "Tactical Board (3D)" visual
 * definition (src/model/visualDefinitions.ts) for the exact scope cut
 * relative to the 2D version (no `phases`/`timeline`, a single static
 * arrangement with camera motion supplying the reveal instead of re-
 * arrangement). Players/ball render as billboarded markers (PlayerMarker3D)
 * so labels stay upright at any camera angle — the direct answer to
 * PerspectivePitch.tsx's own documented reason for avoiding real 3D
 * rotation. */
export const TacticalBoard3D: React.FC<{ data: TacticalBoard3DData } & SharedVisualProps> = ({
  data: { title, players, arrows = [], highlight = [], highlightZone, ball, cameraStyle = "sway" },
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

  // Frame around where the players actually are instead of always centering
  // pitch-wide — a tight cluster far from pitch center (a corner/box scene)
  // otherwise sits as a small speck in an otherwise-empty frame. Target =
  // highlightZone center if given (the author's own "this is the subject"
  // signal), otherwise the players' centroid. Radius scales with the
  // players' spread so a tight cluster gets pulled in close and a full-width
  // formation still gets a wide-enough view to stay readable.
  const centroidPercent = highlightZone
    ? { x: highlightZone.x + highlightZone.width / 2, y: highlightZone.y + highlightZone.height / 2 }
    : { x: players.reduce((s, p) => s + p.x, 0) / players.length, y: players.reduce((s, p) => s + p.y, 0) / players.length };
  const target = percentToWorld(centroidPercent.x, centroidPercent.y, 1.2);
  const worldSpread = Math.max(
    ...players.map((p) => {
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

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      {/* CSS grass backdrop, not 3D geometry — fills the space around the
          rendered pitch (previously this project's default near-black
          SceneFrame background, reading as an empty void) with a simple
          mowing-stripe gradient. `gl={{ alpha: true }}` on the ThreeCanvas
          below lets this show through anywhere the 3D scene itself doesn't
          draw over it. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: GRASS_BACKDROP_CSS,
          backgroundRepeat: "repeat, repeat",
          backgroundSize: `${GRASS_BLADE_TILE_SIZE}px ${GRASS_BLADE_TILE_SIZE}px, auto`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ width: boardWidth, height: boardHeight }}>
          <ThreeCanvas width={boardWidth} height={boardHeight} camera={{ position: pose.position, fov: pose.fov }} gl={{ alpha: true }}>
            <SuspenseLoader3D>
              <CameraRig3D pose={pose} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[10, 20, 10]} intensity={0.6} />
              <Pitch3D />
              {highlightZone && <HighlightZone3D zone={highlightZone} opacity={zoneOpacity} />}
              {arrows.map((arrow, index) =>
                // A ball actually carried along this arrow shows the pass via
                // its own motion + ghost trail below — a static line staying
                // drawn from the passer to the ball's current position reads
                // as "the ball is still tethered to the passer," not "this
                // already happened." Plain (ball-less) arrows keep the line.
                ball?.belongsTo === arrow.from ? null : <Arrow3D key={index} arrow={arrow} players={players} frame={frame} />,
              )}
              {ball && (
                <>
                  <BallGhostTrail3D ball={ball} arrows={arrows} players={players} frame={frame} />
                  <BallMarker3D position={resolveBallPosition3D(ball, arrows, players, frame)} opacity={fadeIn(frame, 4, 14)} />
                </>
              )}
              {players.map((player, index) => (
                <PlayerMarker3D
                  key={player.id}
                  position={percentToWorld(player.x, player.y, MARKER_HEIGHT_UNITS)}
                  color={player.team === "home" ? HOME_COLOR : AWAY_COLOR}
                  jerseyImage={DEFAULT_JERSEY_3D}
                  label={player.label}
                  radius={PLAYER_RADIUS}
                  opacity={fadeIn(frame, 14 + index * 4, 12)}
                  highlighted={highlight.includes(player.id)}
                />
              ))}
            </SuspenseLoader3D>
          </ThreeCanvas>
        </div>
      </div>
    </SceneFrame>
  );
};
