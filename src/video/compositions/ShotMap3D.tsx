import React from "react";
import { useCurrentFrame } from "remotion";
import { Billboard, Line } from "@react-three/drei";
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
import { JerseyMarkerBase3D, DEFAULT_JERSEY_3D } from "./PlayerMarker3D";
import { CameraRig3D } from "./CameraRig3D";
import { percentToWorld, MARKER_HEIGHT_UNITS } from "../coords3D";
import { resolveCameraPose3D } from "../camera3D";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, ShotMap3DData } from "../sharedVisualProps";

type Shot = ShotMap3DData["shots"][number];

const BASE_RADIUS = 0.26;
const STAGGER_FRAMES = 4;

// Every shot now renders on the same recolored-jersey base as a player
// marker (see PlayerMarker3D/JerseyMarkerBase3D) rather than a bare
// goal/saved/blocked/off-target glyph — the result distinction moves to a
// small corner badge instead, the same "small corner mark on an otherwise
// uniform marker" convention JerseyDisc.tsx's own `stateBadge` already uses
// for 2D player state.
function ResultBadge3D({ result, radius, opacity }: { result: Shot["result"]; radius: number; opacity: number }) {
  const offset = radius * 0.75;
  if (result === "goal") {
    return (
      <mesh position={[offset, offset, 0.02]}>
        <circleGeometry args={[radius * 0.32, 16]} />
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={opacity} />
      </mesh>
    );
  }
  if (result === "saved") {
    return (
      <mesh position={[offset, offset, 0.02]}>
        <ringGeometry args={[radius * 0.2, radius * 0.32, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
      </mesh>
    );
  }
  if (result === "blocked") {
    const arm = radius * 0.22;
    return (
      <>
        <Line
          points={[
            [offset - arm, offset - arm, 0.02],
            [offset + arm, offset + arm, 0.02],
          ]}
          color={COLORS.danger}
          lineWidth={3}
          transparent
          opacity={opacity}
        />
        <Line
          points={[
            [offset - arm, offset + arm, 0.02],
            [offset + arm, offset - arm, 0.02],
          ]}
          color={COLORS.danger}
          lineWidth={3}
          transparent
          opacity={opacity}
        />
      </>
    );
  }
  // off-target
  return (
    <mesh position={[offset, offset, 0.02]}>
      <ringGeometry args={[radius * 0.2, radius * 0.3, 16]} />
      <meshBasicMaterial color={COLORS.textDim} transparent opacity={opacity * 0.6} />
    </mesh>
  );
}

function ShotMarker3D({ shot, color, startFrame }: { shot: Shot; color: string; startFrame: number }) {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, startFrame, 10);
  const scale = scaleSettle(frame, startFrame, 12, 0.5);
  const radius = shot.xg ? BASE_RADIUS + Math.min(shot.xg, 1) * 0.3 : BASE_RADIUS + 0.08;
  const position = percentToWorld(shot.x, shot.y, MARKER_HEIGHT_UNITS * 0.7);

  return (
    <group position={position} scale={scale}>
      <Billboard>
        <JerseyMarkerBase3D jerseyImage={DEFAULT_JERSEY_3D} color={color} radius={radius} opacity={opacity} />
        <ResultBadge3D result={shot.result} radius={radius} opacity={opacity} />
      </Billboard>
    </group>
  );
}

/** 3D counterpart to ShotMap — every shot as a billboarded jersey marker
 * (tinted by team, same recolor technique as every other 3D pitch marker)
 * on a genuine 3D pitch with an arcing camera, with the goal/saved/blocked/
 * off-target distinction moved to a small corner badge — see ResultBadge3D
 * above. */
export const ShotMap3D: React.FC<{ data: ShotMap3DData } & SharedVisualProps> = ({
  data: { title, shots, cameraStyle = "sway" },
  durationInFrames = 90,
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const boardWidth = orientation === "portrait" ? PERSPECTIVE_PITCH_WIDTH : PERSPECTIVE_PITCH_WIDTH_LANDSCAPE;
  const boardHeight = orientation === "portrait" ? PERSPECTIVE_PITCH_HEIGHT : PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE;
  const titleOpacity = fadeIn(frame, 0, 14);
  const pose = resolveCameraPose3D(cameraStyle, frame, durationInFrames, { radius: 28, height: 15 });

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>
        <div style={{ width: boardWidth, height: boardHeight }}>
          <ThreeCanvas width={boardWidth} height={boardHeight} camera={{ position: pose.position, fov: pose.fov }}>
            <SuspenseLoader3D>
              <CameraRig3D pose={pose} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[10, 20, 10]} intensity={0.6} />
              <Pitch3D />
              {shots.map((shot, index) => (
                <ShotMarker3D
                  key={index}
                  shot={shot}
                  color={shot.team === "home" ? COLORS.homeTeam : COLORS.awayTeam}
                  startFrame={14 + index * STAGGER_FRAMES}
                />
              ))}
            </SuspenseLoader3D>
          </ThreeCanvas>
        </div>
      </div>
    </SceneFrame>
  );
};
