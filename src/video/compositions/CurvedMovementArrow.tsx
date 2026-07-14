import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../theme";
import { drawIn, pulse } from "../motion";
import { vpitchX, vpitchY } from "./VerticalPitch";
import { BallGlyph } from "./BallGlyph";

export const CURVED_ARROW_DRAW_DURATION = 18;

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
}) => {
  const frame = useCurrentFrame();
  const progress = drawIn(frame, startFrame, duration);

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

  return (
    <g opacity={progress > 0 ? 1 : 0}>
      <path
        d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
      <circle cx={tip.x} cy={tip.y} r={11 * travelPulse} fill={color} opacity={travelOpacity * 0.22} />
      {kind === "pass" ? (
        <BallGlyph cx={tip.x} cy={tip.y} size={9} opacity={travelOpacity} />
      ) : (
        <circle cx={tip.x} cy={tip.y} r={4.5} fill="#ffffff" opacity={travelOpacity * 0.9} />
      )}
      <circle cx={tip.x} cy={tip.y} r={13} fill={color} opacity={idleGlowOpacity} />
      {progress > 0.02 && <polygon points={`${tip.x},${tip.y} ${leftWing.x},${leftWing.y} ${rightWing.x},${rightWing.y}`} fill={color} />}
    </g>
  );
};
