import React from "react";
import { COLORS } from "../theme";

// A separate, parallel coordinate system from Pitch.tsx's landscape one —
// not a change to it. camera.ts and five other components depend on
// Pitch.tsx's exact PITCH_WIDTH/HEIGHT today; touching those would risk
// every existing script. This is for the vertical/portrait board only,
// goal-to-goal running top-to-bottom instead of left-to-right.
export const VERTICAL_PITCH_WIDTH = 560;
export const VERTICAL_PITCH_HEIGHT = 900;

export function vpitchX(percentX: number): number {
  return (percentX / 100) * VERTICAL_PITCH_WIDTH;
}

/** 0 = bottom (own goal, camera-near end), 100 = top (opponent's goal, far
 * end) — "up the pitch" reads as "up the frame", matching how a vertical
 * tactics board is normally drawn. */
export function vpitchY(percentY: number): number {
  return VERTICAL_PITCH_HEIGHT - (percentY / 100) * VERTICAL_PITCH_HEIGHT;
}

const STRIPE_COUNT = 10;
const STRIPE_HEIGHT = VERTICAL_PITCH_HEIGHT / STRIPE_COUNT;
const BOX_WIDTH = 180;
const BOX_HEIGHT = 80;

/** Portrait counterpart to Pitch.tsx — same green/stripe/line-art look, same
 * shared theme tokens, just rotated: mowing stripes run horizontally (bands
 * stacked down the height), the halfway line is horizontal, and the penalty
 * boxes sit at the top and bottom edges instead of left/right. */
export const VerticalPitch: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  return (
    <svg
      width={VERTICAL_PITCH_WIDTH}
      height={VERTICAL_PITCH_HEIGHT}
      viewBox={`0 0 ${VERTICAL_PITCH_WIDTH} ${VERTICAL_PITCH_HEIGHT}`}
      style={{ opacity }}
    >
      <clipPath id="vertical-pitch-clip">
        <rect x={0} y={0} width={VERTICAL_PITCH_WIDTH} height={VERTICAL_PITCH_HEIGHT} rx={6} />
      </clipPath>
      <g clipPath="url(#vertical-pitch-clip)">
        <rect x={0} y={0} width={VERTICAL_PITCH_WIDTH} height={VERTICAL_PITCH_HEIGHT} fill={COLORS.pitch} />
        {Array.from({ length: STRIPE_COUNT }).map((_, i) =>
          i % 2 === 0 ? (
            <rect key={i} x={0} y={i * STRIPE_HEIGHT} width={VERTICAL_PITCH_WIDTH} height={STRIPE_HEIGHT} fill={COLORS.pitchStripe} />
          ) : null,
        )}
      </g>
      <rect
        x={1}
        y={1}
        width={VERTICAL_PITCH_WIDTH - 2}
        height={VERTICAL_PITCH_HEIGHT - 2}
        fill="none"
        stroke={COLORS.pitchLines}
        strokeWidth={2}
        rx={5}
      />
      <line x1={0} y1={VERTICAL_PITCH_HEIGHT / 2} x2={VERTICAL_PITCH_WIDTH} y2={VERTICAL_PITCH_HEIGHT / 2} stroke={COLORS.pitchLines} strokeWidth={2} />
      <circle cx={VERTICAL_PITCH_WIDTH / 2} cy={VERTICAL_PITCH_HEIGHT / 2} r={72} fill="none" stroke={COLORS.pitchLines} strokeWidth={2} />
      <rect
        x={VERTICAL_PITCH_WIDTH / 2 - BOX_WIDTH / 2}
        y={0}
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        fill="none"
        stroke={COLORS.pitchLines}
        strokeWidth={2}
      />
      <rect
        x={VERTICAL_PITCH_WIDTH / 2 - BOX_WIDTH / 2}
        y={VERTICAL_PITCH_HEIGHT - BOX_HEIGHT}
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        fill="none"
        stroke={COLORS.pitchLines}
        strokeWidth={2}
      />
    </svg>
  );
};
