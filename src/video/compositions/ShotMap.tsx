import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { fadeIn, scaleSettle } from "../motion";
import type { SharedVisualProps, ShotMapData } from "../sharedVisualProps";

type Shot = ShotMapData["shots"][number];

const BASE_RADIUS = 8;
const STAGGER_FRAMES = 4;

function ShotMarker({
  shot,
  color,
  startFrame,
  project,
}: {
  shot: Shot;
  color: string;
  startFrame: number;
  project: (px: number, py: number) => [number, number];
}) {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, startFrame, 10);
  const scale = scaleSettle(frame, startFrame, 12, 0.5);
  const radius = shot.xg ? BASE_RADIUS + Math.min(shot.xg, 1) * 14 : BASE_RADIUS + 4;

  const [cx, cy] = project(shot.x, shot.y);

  return (
    <g opacity={opacity} style={{ transformOrigin: `${cx}px ${cy}px`, transform: `scale(${scale})` }}>
      {shot.result === "goal" && <circle cx={cx} cy={cy} r={radius} fill={color} />}
      {shot.result === "saved" && <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={3} />}
      {shot.result === "blocked" && (
        <>
          <line x1={cx - radius * 0.7} y1={cy - radius * 0.7} x2={cx + radius * 0.7} y2={cy + radius * 0.7} stroke={color} strokeWidth={3} />
          <line x1={cx - radius * 0.7} y1={cy + radius * 0.7} x2={cx + radius * 0.7} y2={cy - radius * 0.7} stroke={color} strokeWidth={3} />
        </>
      )}
      {shot.result === "off-target" && <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" opacity={0.6} />}
    </g>
  );
}

/** Every shot from the match as a dot on the pitch — filled for goals, ringed
 * for saves, an X for blocks, a faint dashed ring for off-target — optionally
 * sized by xG. For narration about shot quality/quantity/location rather
 * than a single aggregate number. */
export const ShotMap: React.FC<{ data: ShotMapData } & SharedVisualProps> = ({ data: { title, shots }, backgroundColor, orientation }) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;
  // shot.x is the goal-to-goal (length) axis, shot.y the touchline-to-
  // touchline (width) axis — landscape's length axis is pixel-x, portrait's
  // is pixel-y, so portrait must feed each coordinate into the opposite
  // pixel-mapper rather than just swapping which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? perspectiveProject(px, py) : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...TITLE_STYLE, opacity: titleOpacity, marginBottom: 24 }}>{title}</div>

        <div style={{ width: boardWidth, height: boardHeight, position: "relative" }}>
        <svg width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ overflow: "visible" }}>
          <g opacity={pitchOpacity}>
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>
          {shots.map((shot, index) => (
            <ShotMarker
              key={index}
              shot={shot}
              color={shot.team === "home" ? COLORS.homeTeam : COLORS.awayTeam}
              startFrame={14 + index * STAGGER_FRAMES}
              project={project}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: boardWidth,
            height: boardHeight,
            pointerEvents: "none",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 46%, rgba(0,0,0,0.5) 100%)",
          }}
        />
        </div>
      </div>
    </SceneFrame>
  );
};
