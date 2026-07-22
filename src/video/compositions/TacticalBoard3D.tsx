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
  const pose = resolveCameraPose3D(cameraStyle, frame, durationInFrames, { radius: 26, height: 15 });

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ width: boardWidth, height: boardHeight }}>
          <ThreeCanvas width={boardWidth} height={boardHeight} camera={{ position: pose.position, fov: pose.fov }}>
            <SuspenseLoader3D>
              <CameraRig3D pose={pose} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[10, 20, 10]} intensity={0.6} />
              <Pitch3D />
              {highlightZone && <HighlightZone3D zone={highlightZone} opacity={zoneOpacity} />}
              {arrows.map((arrow, index) => (
                <Arrow3D key={index} arrow={arrow} players={players} frame={frame} />
              ))}
              {ball && (
                <PlayerMarker3D
                  position={percentToWorld(ball.x, ball.y, MARKER_HEIGHT_UNITS * 0.35)}
                  color={COLORS.ball}
                  radius={0.24}
                  opacity={fadeIn(frame, 4, 14)}
                />
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
