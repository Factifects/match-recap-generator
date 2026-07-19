import React from "react";
import { COLORS, FONT_FAMILY } from "../theme";

export const POD_WIDTH = 50;
export const POD_HEIGHT = 32;

const ROLE_LABEL_STYLE = {
  fontFamily: FONT_FAMILY,
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
};

/** A Football Manager-style position pod: a flat rounded-rect filled with
 * the team's color and the short role code (e.g. "CM", "TF") centered
 * inside — the tactics-screen look, as opposed to JerseyDisc's circular
 * marker (built for TacticalBoard's live event timeline: pulse/facing/state
 * badges that a static formation lineup has no use for). */
export const RolePod: React.FC<{
  cx: number;
  cy: number;
  role: string;
  color: string;
  opacity?: number;
}> = ({ cx, cy, role, color, opacity = 1 }) => {
  return (
    <g opacity={opacity}>
      <rect
        x={cx - POD_WIDTH / 2}
        y={cy - POD_HEIGHT / 2}
        width={POD_WIDTH}
        height={POD_HEIGHT}
        rx={8}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeOpacity={0.45}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={COLORS.text} style={ROLE_LABEL_STYLE}>
        {role}
      </text>
    </g>
  );
};
