import React, { useId } from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../theme";
import { drawIn, pulse } from "../motion";
import { vpitchX, vpitchY } from "./VerticalPitch";
import { BallGlyph } from "./BallGlyph";
import type { RUN_TYPE_KEYS } from "../../model/visualDefinitions";

export type RunType = (typeof RUN_TYPE_KEYS)[number];

export const CURVED_ARROW_DRAW_DURATION = 18;

export type ArrowStyle = "standard" | "press" | "recovery" | "third-man-run";

// Pure pixel-space quadratic-bezier point, factored out of the component
// below so TacticalBoard's evented timeline fold (resolveActorFold) can
// interpolate a gliding player's position along the exact same curve shape
// an arrow of the same `bow` would draw, instead of a second slightly-
// different curve implementation. Takes already-projected pixel coordinates
// (not pitch percent) — same convention as the component's own internal
// bezierPoint below, which this does not replace (left untouched to avoid
// any risk to its already-proven rendering).
export function bezierPointAt(x1: number, y1: number, x2: number, y2: number, bow: number, t: number): { x: number; y: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const controlX = midX + nx * bow;
  const controlY = midY + ny * bow;
  return {
    x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * controlX + t * t * x2,
    y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * controlY + t * t * y2,
  };
}

// Purely visual per-concept treatment, independent of `kind` (which governs
// ball-vs-player-glide semantics, not appearance) — a real render showed
// every arrow reading as the same generic colored line regardless of what
// tactical idea it depicted. `dash` is in the path's own normalized
// pathLength=1 units (a fraction of the curve's total length per on/off
// segment), not pixels, so the pattern scales with any arrow's length.
// `color` absent means "use whatever the caller passed" (today's behavior);
// press/recovery override it because those concepts read as a fixed color
// regardless of team.
const ARROW_STYLE_PRESETS: Record<ArrowStyle, { color?: string; strokeWidth: number; dash?: string }> = {
  standard: { strokeWidth: 2.5 },
  press: { color: COLORS.danger, strokeWidth: 3.5 },
  recovery: { color: COLORS.textDim, strokeWidth: 2, dash: "0.05 0.035" },
  "third-man-run": { strokeWidth: 1.5, dash: "0.012 0.03" },
};

// Per-named-run-type curvature + (optional) reuse of an existing ArrowStyle
// preset — maps TacticalBoard's evented `timeline` `move` actions onto this
// component's already-proven `bow`/`style` parameters instead of inventing
// new geometry per run type. Sign of `bow` only matters relative to travel
// direction (positive = curves to the right of travel, negative = left);
// magnitude is a starting point tuned by eye against the Gegenpressing test
// scene, not a precise tactical measurement. `standard`/`counterRun`/
// `diagonalRun` stay straight (bow 0) — their identity comes from the
// authored `to` point (a diagonal/counter run IS its direction), not from
// added curvature.
export const RUN_TYPE_GEOMETRY: Record<RunType, { bow: number; style?: ArrowStyle }> = {
  standard: { bow: 0 },
  overlap: { bow: 55 },
  underlap: { bow: -35 },
  blindsideRun: { bow: 10 },
  diagonalRun: { bow: 0 },
  thirdManRun: { bow: 20, style: "third-man-run" },
  recoveryRun: { bow: -15, style: "recovery" },
  counterRun: { bow: 0 },
  dummyRun: { bow: 15 },
  supportRun: { bow: 25 },
  channelRun: { bow: 45 },
  halfSpaceRun: { bow: 30 },
};

// A real render showed a "pass" arrow reading as just a static colored line
// with an arrowhead — the BallGlyph only exists while `travelOpacity` is on
// (a ~0.5s window mid-draw), so anyone who wasn't looking at that exact
// instant never sees a ball at all, only the line it left behind. This trail
// samples the same bezier curve at earlier progress values, same lag/opacity
// recipe as TacticalBoard's own GHOST_TRAIL for player gliding, so a pass
// reads as a ball actually traveling (with a fading motion trail) instead of
// a single dot that blinks past.
const BALL_GHOST_TRAIL = [
  { lag: 0.3, opacity: 0.14 },
  { lag: 0.18, opacity: 0.26 },
  { lag: 0.08, opacity: 0.42 },
];

/** Curved counterpart to MovementArrow.tsx's straight line — scoped to
 * vertical/perspective boards rather than adding curve support to
 * MovementArrow itself, whose straight-line + arrow-synced-glide behavior in
 * TacticalBoard.tsx is already shipped and self-reviewed. Reuses the same
 * quadratic-bezier math already proven in GoalSequence.tsx's ball path, but
 * also needs the curve's tangent angle at the current draw progress (to
 * orient the arrowhead), which GoalSequence's straight-line-only arrowhead
 * never had to compute. `bow` is the perpendicular offset of the control
 * point from the straight-line midpoint — positive curves one way, negative
 * the other; 0 draws a straight line. `project` maps (fromX/toX,
 * fromY/toY) into pixel space — defaults to the flat VerticalPitch mapping,
 * but a caller on a perspective board passes its own projection so the
 * curve bends through the same warp as everything else on that board. */
export const CurvedMovementArrow: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame?: number;
  duration?: number;
  color?: string;
  bow?: number;
  project?: (px: number, py: number) => [number, number];
  kind?: "run" | "pass";
  style?: ArrowStyle;
}> = ({
  fromX,
  fromY,
  toX,
  toY,
  startFrame = 0,
  duration = CURVED_ARROW_DRAW_DURATION,
  color = COLORS.movement,
  bow = 40,
  project = (px, py) => [vpitchX(px), vpitchY(py)],
  kind = "run",
  style = "standard",
}) => {
  const frame = useCurrentFrame();
  const progress = drawIn(frame, startFrame, duration);
  const maskId = useId();
  const preset = ARROW_STYLE_PRESETS[style];
  const strokeColor = preset.color ?? color;
  const strokeWidth = preset.strokeWidth;

  const [x1, y1] = project(fromX, fromY);
  const [x2, y2] = project(toX, toY);

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal to the straight line — offsetting the control point along
  // this (rather than a fixed axis) keeps the bow consistent regardless of
  // which direction the arrow points.
  const nx = -dy / len;
  const ny = dx / len;
  const controlX = midX + nx * bow;
  const controlY = midY + ny * bow;

  const bezierPoint = (t: number) => ({
    x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * controlX + t * t * x2,
    y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * controlY + t * t * y2,
  });
  const tangentAngle = (t: number) => {
    const dxdt = 2 * (1 - t) * (controlX - x1) + 2 * t * (x2 - controlX);
    const dydt = 2 * (1 - t) * (controlY - y1) + 2 * t * (y2 - controlY);
    return Math.atan2(dydt, dxdt);
  };

  const tip = bezierPoint(progress);
  const angle = tangentAngle(progress);
  const headLength = 10;
  const headAngle = Math.PI / 7;
  const leftWing = { x: tip.x - headLength * Math.cos(angle - headAngle), y: tip.y - headLength * Math.sin(angle - headAngle) };
  const rightWing = { x: tip.x - headLength * Math.cos(angle + headAngle), y: tip.y - headLength * Math.sin(angle + headAngle) };

  // Same traveling pulse as MovementArrow's straight-line case — see its
  // docstring for why the static curve alone isn't enough.
  const travelOpacity = progress > 0.01 && progress < 0.96 ? 1 : 0;
  const travelPulse = 1 + Math.sin(frame / 4) * 0.25;

  // Same idle-glow handoff as MovementArrow once the curve has landed — see
  // its comment for why the tip would otherwise go dead for the rest of the
  // scene.
  const idleGlowOpacity = progress >= 0.96 ? pulse(frame, 80, 0.06, 0.18, startFrame) : 0;

  const pathD = `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;

  return (
    <g opacity={progress > 0 ? 1 : 0}>
      {preset.dash ? (
        // Two-path trick: a `<mask>` reveals the curve progressively (the
        // exact same pathLength=1/dasharray=1/offset reveal used everywhere
        // else in this file), then the actual visual path — stroked with
        // the real dash pattern, not the reveal trick's single dash — is
        // clipped by that mask, so the line both draws in AND reads as
        // dashed/dotted rather than solid.
        <>
          <mask id={maskId}>
            <path
              d={pathD}
              fill="none"
              stroke="#ffffff"
              strokeWidth={strokeWidth + 4}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
            />
          </mask>
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={preset.dash}
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
        />
      )}
      <circle cx={tip.x} cy={tip.y} r={11 * travelPulse} fill={strokeColor} opacity={travelOpacity * 0.22} />
      {kind === "pass" &&
        travelOpacity > 0 &&
        BALL_GHOST_TRAIL.map(({ lag, opacity: ghostOpacity }, index) => {
          const ghostProgress = progress - lag;
          if (ghostProgress <= 0) return null;
          const ghostPoint = bezierPoint(ghostProgress);
          return <BallGlyph key={index} cx={ghostPoint.x} cy={ghostPoint.y} size={7} opacity={ghostOpacity} />;
        })}
      {kind === "pass" ? (
        <BallGlyph cx={tip.x} cy={tip.y} size={9} opacity={travelOpacity} />
      ) : (
        <circle cx={tip.x} cy={tip.y} r={4.5} fill="#ffffff" opacity={travelOpacity * 0.9} />
      )}
      <circle cx={tip.x} cy={tip.y} r={13} fill={strokeColor} opacity={idleGlowOpacity} />
      {progress > 0.02 && <polygon points={`${tip.x},${tip.y} ${leftWing.x},${leftWing.y} ${rightWing.x},${rightWing.y}`} fill={strokeColor} />}
    </g>
  );
};
