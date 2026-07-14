import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, TITLE_STYLE } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { Pitch, PITCH_WIDTH, PITCH_HEIGHT, pitchX, pitchY } from "./Pitch";
import { PerspectivePitch, PERSPECTIVE_PITCH_WIDTH, PERSPECTIVE_PITCH_HEIGHT, perspectiveProject } from "./PerspectivePitch";
import { JerseyDisc } from "./JerseyDisc";
import { fadeIn, drawIn, scaleSettle } from "../motion";
import { ballisticPath } from "../trajectory";
import { getCameraTransform, getCameraTransformPerspective } from "../camera";
import type { CameraStage } from "../../model/Segment";
import type { SharedVisualProps, GoalSequenceData } from "../sharedVisualProps";

const BALL_START_FRAME = 20;
const BALL_DURATION = 24;
const EDGE_MARGIN = 4;
// Same "push in harder on anything already zoomed" boost as TacticalBoard —
// a full-pitch establishing stage is left alone, a directed zoom leans in
// further than the script literally asked for.
const ZOOM_BOOST = 1.15;
// Ghost trail behind the traveling ball — same recipe as TacticalBoard's
// gliding-marker trail, applied to the ball instead of a player disc.
const BALL_GHOST_TRAIL = [
  { lag: 0.16, opacity: 0.15 },
  { lag: 0.09, opacity: 0.3 },
  { lag: 0.04, opacity: 0.5 },
];

function boostZoom(stages: CameraStage[]): CameraStage[] {
  return stages.map((stage) => (stage.zoom > 1 ? { ...stage, zoom: stage.zoom * ZOOM_BOOST } : stage));
}

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
export const GoalSequence: React.FC<{ data: GoalSequenceData } & SharedVisualProps> = ({
  data: { title, shooter, from, to, keeper, keeperAt, curve = false, bouncePoints },
  camera = [{ focus: "full", zoom: 1 }],
  durationInFrames = 90,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const boardWidth = isPortrait ? PERSPECTIVE_PITCH_WIDTH : PITCH_WIDTH;
  const boardHeight = isPortrait ? PERSPECTIVE_PITCH_HEIGHT : PITCH_HEIGHT;
  // from.x/to.x/keeperAt.x are the goal-to-goal (length) axis, the .y's the
  // touchline-to-touchline (width) axis — portrait must feed each into the
  // opposite pixel-mapper, not just swap which mapper function is used.
  const project = (px: number, py: number): [number, number] =>
    isPortrait ? perspectiveProject(px, py) : [pitchX(px), pitchY(py)];
  const titleOpacity = fadeIn(frame, 0, 14);
  const pitchOpacity = fadeIn(frame, 4, 16);
  const boostedCamera = boostZoom(camera);
  const cameraTransform = isPortrait
    ? getCameraTransformPerspective(boostedCamera, frame, durationInFrames)
    : getCameraTransform(boostedCamera, frame, durationInFrames);

  const [x1, y1] = project(clampPercent(from.x), clampPercent(from.y));
  const [x2, y2] = project(clampPercent(to.x), clampPercent(to.y));
  const [keeperCx, keeperCy] = keeperAt ? project(clampPercent(keeperAt.x), clampPercent(keeperAt.y)) : [0, 0];
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const isBounce = curve === "bounce";
  const bow = curve === true ? 50 : 0;
  // Landscape offsets the control point's x by a sign driven by the y-delta
  // (bows the shot sideways along the goal-to-goal axis, direction flipping
  // with which way the shot moves across the box). Portrait's goal-to-goal
  // axis is y instead of x, so the offset and the driving delta both swap
  // axes — same axis-swap logic as Formation's positionX/positionY and
  // TacticalBoard's highlightZone.
  const controlX = isPortrait ? midX : midX - bow * Math.sign(y2 - y1 || 1);
  const controlY = isPortrait ? midY - bow * Math.sign(x2 - x1 || 1) : midY;

  // Bounce mode arcs through real ground waypoints (start, any authored
  // bounce points, end — defaulting to a single implied bounce at the
  // midpoint) instead of one smooth bezier — a loose ball, a lofted
  // through-ball, or a deflection actually touches down between hops rather
  // than gliding in a single continuous curve.
  const BOUNCE_APEX = isPortrait ? 30 : 55;
  const bounceWaypoints = isBounce
    ? [
        { x: x1, y: y1 },
        ...(bouncePoints && bouncePoints.length > 0
          ? bouncePoints.map((p) => {
              const [px, py] = project(clampPercent(p.x), clampPercent(p.y));
              return { x: px, y: py };
            })
          : [{ x: midX, y: midY }]),
        { x: x2, y: y2 },
      ]
    : [];

  const ballPositionAt = (t: number) => {
    if (isBounce) {
      const { x, y, height } = ballisticPath(bounceWaypoints, BOUNCE_APEX, t);
      return { x, y: y - height };
    }
    return {
      x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * controlX + t * t * x2,
      y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * controlY + t * t * y2,
    };
  };
  const t = drawIn(frame, BALL_START_FRAME, BALL_DURATION);
  const { x: ballX, y: ballY } = ballPositionAt(t);
  const isBallMoving = t > 0 && t < 1;

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
            {isPortrait ? <PerspectivePitch /> : <Pitch />}
          </g>

          <path
            d={
              isBounce
                ? `M ${bounceWaypoints.map((p) => `${p.x} ${p.y}`).join(" L ")}`
                : `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`
            }
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
              <JerseyDisc cx={keeperCx} cy={keeperCy} radius={16} color={COLORS.awayTeam} />
              <text
                x={keeperCx}
                y={keeperCy + 44}
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
            <JerseyDisc cx={x1} cy={y1} radius={16} color={COLORS.homeTeam} />
            <text x={x1} y={y1 + 44} textAnchor="middle" fontFamily={FONT_FAMILY} fontWeight={600} fontSize={18} fill={COLORS.text}>
              {shooter}
            </text>
          </g>

          {isBallMoving &&
            BALL_GHOST_TRAIL.map(({ lag, opacity: ghostOpacity }, index) => {
              const ghostT = t - lag;
              if (ghostT <= 0) return null;
              const ghost = ballPositionAt(ghostT);
              return <circle key={index} cx={ghost.x} cy={ghost.y} r={5} fill={COLORS.ball} opacity={ghostOpacity} />;
            })}
          <circle cx={ballX} cy={ballY} r={7} fill={COLORS.ball} opacity={fadeIn(frame, BALL_START_FRAME - 2, 8)} />
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
