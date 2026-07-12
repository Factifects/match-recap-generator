import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../theme";
import { pitchX, pitchY } from "./Pitch";
import { drawIn } from "../motion";

// Exported so callers that need a player marker (or anything else) to glide
// in exact sync with an arrow's draw-in can compute the identical progress
// value themselves, rather than duplicating this number and risking drift.
export const ARROW_DRAW_DURATION = 18;

/** A single line-draw arrow between two points in the pitch's 0-100 percentage
 * coordinate space. Meant to be rendered as a child of Pitch's <svg> (shares
 * its coordinate system via pitchX/pitchY) — not a standalone component, since
 * an arrow with no pitch/player context isn't a scene on its own. Line grows
 * in, then a small arrowhead fades in at the end — no arrowhead "pop". */
export const MovementArrow: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame?: number;
  duration?: number;
  color?: string;
}> = ({ fromX, fromY, toX, toY, startFrame = 0, duration = ARROW_DRAW_DURATION, color = COLORS.accent }) => {
  const frame = useCurrentFrame();
  const progress = drawIn(frame, startFrame, duration);

  const x1 = pitchX(fromX);
  const y1 = pitchY(fromY);
  const x2 = pitchX(fromX + (toX - fromX) * progress);
  const y2 = pitchY(fromY + (toY - fromY) * progress);

  const angle = Math.atan2(pitchY(toY) - y1, pitchX(toX) - x1);
  const headOpacity = progress > 0.92 ? 1 : 0;
  const headSize = 9;
  const headX1 = x2 - headSize * Math.cos(angle - Math.PI / 6);
  const headY1 = y2 - headSize * Math.sin(angle - Math.PI / 6);
  const headX2 = x2 - headSize * Math.cos(angle + Math.PI / 6);
  const headY2 = y2 - headSize * Math.sin(angle + Math.PI / 6);

  // A bright pulse riding the line's current tip while it draws — the static
  // line alone reads as "a line appeared," not "something is moving along
  // it." Fades out once the arrowhead lands, handing motion off to whatever
  // glides to match this progress (see ARROW_DRAW_DURATION's docstring).
  const travelOpacity = progress > 0.01 && progress < 0.96 ? 1 : 0;
  const travelPulse = 1 + Math.sin(frame / 4) * 0.25;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <circle cx={x2} cy={y2} r={11 * travelPulse} fill={color} opacity={travelOpacity * 0.22} />
      <circle cx={x2} cy={y2} r={4.5} fill="#ffffff" opacity={travelOpacity * 0.9} />
      <polygon points={`${x2},${y2} ${headX1},${headY1} ${headX2},${headY2}`} fill={color} opacity={headOpacity} />
    </g>
  );
};
