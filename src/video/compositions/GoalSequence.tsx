import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE, type PanelColorKey, type Orientation } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { VerticalPitch, VERTICAL_PITCH_WIDTH, VERTICAL_PITCH_HEIGHT, vpitchX, vpitchY } from "./VerticalPitch";
import { fadeIn, drawIn, scaleSettle } from "../motion";
import { getCameraTransform, getCameraTransformVertical } from "../camera";
import type { CameraStage } from "../../model/Segment";

interface PitchPoint {
  x: number;
  y: number;
}

const BALL_START_FRAME = 20;
const BALL_DURATION = 24;
const EDGE_MARGIN = 4;

// Same defense-in-depth as TacticalBoard's clampPercent: a tight camera zoom
// can push a position right at the pitch boundary out of the clipped
// viewport entirely, regardless of what a script or pattern asks for.
function clampPercent(value: number): number {
  return Math.min(100 - EDGE_MARGIN, Math.max(EDGE_MARGIN, value));
}

/** One shot/touch as a ball-path animation: the ball travels a straight or
 * curved line from `from` to `to`, with an optional keeper marker reacting —
 * the dramatic beat for a save that falls short or a clean finish. Schematic
 * illustration of the narration's claim, not literal tracking data, same as
 * TacticalBoard. The shooter is always drawn in the home color and the
 * keeper in the away color, matching every scene this is used for. */
export const GoalSequence: React.FC<{
  title: string;
  shooter: string;
  from: PitchPoint;
  to: PitchPoint;
  keeper?: string;
  keeperAt?: PitchPoint;
  curve?: boolean;
  camera?: CameraStage[];
  durationInFrames?: number;
  backgroundImage?: string;
  backgroundImageMode?: "faded" | "featured";
  backgroundImageSide?: "left" | "right" | "center";
  backgroundColor?: PanelColorKey;
  /** Portrait swaps the pitch primitive/pixel functions/camera system, same
   * pattern as TacticalBoard. The curve bow direction also swaps which axis
   * it offsets — see the comment at `controlX`/`controlY` below. */
  orientation?: Orientation;
}> = ({
  title,
  shooter,
  from,
  to,
  keeper,
  keeperAt,
  curve = false,
  camera = [{ focus: "full", zoom: 1 }],
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation = "landscape",
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? VERTICAL_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? VERTICAL_PITCH_HEIGHT : PITCH_HEIGHT;
  // from.x/to.x/keeperAt.x are the goal-to-goal (length) axis, the .y's the
  // touchline-to-touchline (width) axis — portrait must feed each into the
  // opposite pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? [vpitchX(py), vpitchY(px)] : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const cameraTransform = isPortrait
    ? getCameraTransformVertical(camera, frame, durationInFrames)
    : getCameraTransform(camera, frame, durationInFrames);

  const [x1, y1] = project(clampPercent(from.x), clampPercent(from.y));
  const [x2, y2] = project(clampPercent(to.x), clampPercent(to.y));
  const [keeperCx, keeperCy] = keeperAt ? project(clampPercent(keeperAt.x), clampPercent(keeperAt.y)) : [0, 0];
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const bow = curve ? 50 : 0;
  // Landscape offsets the control point's x by a sign driven by the y-delta
  // (bows the shot sideways along the goal-to-goal axis, direction flipping
  // with which way the shot moves across the box). Portrait's goal-to-goal
  // axis is y instead of x, so the offset and the driving delta both swap
  // axes — same axis-swap logic as Formation's positionX/positionY and
  // TacticalBoard's highlightZone.
  const controlX = isPortrait ? midX : midX - bow * Math.sign(y2 - y1 || 1);
  const controlY = isPortrait ? midY - bow * Math.sign(x2 - x1 || 1) : midY;

  const t = drawIn(frame, BALL_START_FRAME, BALL_DURATION);
  const ballX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * controlX + t * t * x2;
  const ballY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * controlY + t * t * y2;

  const shooterOpacity = fadeIn(frame, 0, 14);
  const keeperOpacity = keeper ? fadeIn(frame, 8, 14) : 0;
  const keeperReact = keeper ? scaleSettle(frame, BALL_START_FRAME + 6, 16, 0.92) : 1;

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

        {/* Fixed-size clip container: the camera transform below can scale/pan
            the svg element itself to anywhere on the page, so this wrapper is
            what actually keeps the zoomed pitch confined to its own box
            instead of visually bleeding up over the title. */}
        <div style={{ width: boardWidth, height: boardHeight, overflow: "hidden", position: "relative" }}>
        <svg
          width={boardWidth}
          height={boardHeight}
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          style={{ overflow: "visible", transform: cameraTransform, transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}
        >
          <g opacity={pitchOpacity}>
            {isPortrait ? <VerticalPitch /> : <Pitch />}
          </g>

          <path
            d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
            fill="none"
            stroke={COLORS.ball}
            strokeWidth={2}
            strokeDasharray="4 5"
            opacity={0.4}
          />

          {keeper && keeperAt && (
            <g
              opacity={keeperOpacity}
              style={{
                transformOrigin: `${keeperCx}px ${keeperCy}px`,
                transform: `scale(${keeperReact})`,
              }}
            >
              <circle cx={keeperCx} cy={keeperCy} r={16} fill={COLORS.awayTeam} />
              <text
                x={keeperCx}
                y={keeperCy + 28}
                textAnchor="middle"
                fontFamily={FONT_FAMILY}
                fontWeight={600}
                fontSize={18}
                fill={COLORS.text}
              >
                {keeper}
              </text>
            </g>
          )}

          <g opacity={shooterOpacity}>
            <circle cx={x1} cy={y1} r={16} fill={COLORS.homeTeam} />
            <text x={x1} y={y1 + 28} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={600} fontSize={18} fill={COLORS.text}>
              {shooter}
            </text>
          </g>

          <circle cx={ballX} cy={ballY} r={7} fill={COLORS.ball} opacity={fadeIn(frame, BALL_START_FRAME - 2, 8)} />
        </svg>
        </div>
      </div>
    </SceneFrame>
  );
};
