import React from "react";
import { COLORS } from "../theme";

// Standard pixel size every consumer renders at. Player/shot/arrow positions
// are authored in a 0-100 x 0-100 percentage coordinate space (see
// pitchX/pitchY below) so they're independent of this exact pixel size.
// Sized to make better use of the 1920x1080 frame instead of leaving most of
// it as unused black space around a small, centered diagram.
export const PITCH_WIDTH = 1120;
export const PITCH_HEIGHT = 700;

export function pitchX(percentX: number): number {
  return (percentX / 100) * PITCH_WIDTH;
}

export function pitchY(percentY: number): number {
  return (percentY / 100) * PITCH_HEIGHT;
}

const STRIPE_COUNT = 10;
const STRIPE_WIDTH = PITCH_WIDTH / STRIPE_COUNT;

/** Shared pitch outline — a filled pitch-green rect with mowing-stripe
 * texture and white-ish line art, no players. Every tactical/formation/
 * shot-map component composes this as its base layer so the pitch itself
 * always looks identical across the whole video. */
export const Pitch: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  return (
    <svg width={PITCH_WIDTH} height={PITCH_HEIGHT} viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`} style={{ opacity }}>
      <clipPath id="pitch-clip">
        <rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_HEIGHT} rx={6} />
      </clipPath>
      <g clipPath="url(#pitch-clip)">
        <rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_HEIGHT} fill={COLORS.pitch} />
        {Array.from({ length: STRIPE_COUNT }).map((_, i) =>
          i % 2 === 0 ? (
            <rect key={i} x={i * STRIPE_WIDTH} y={0} width={STRIPE_WIDTH} height={PITCH_HEIGHT} fill={COLORS.pitchStripe} />
          ) : null,
        )}
      </g>
      <rect x={1} y={1} width={PITCH_WIDTH - 2} height={PITCH_HEIGHT - 2} fill="none" stroke={COLORS.pitchLines} strokeWidth={2} rx={5} />
      <line x1={PITCH_WIDTH / 2} y1={0} x2={PITCH_WIDTH / 2} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={2} />
      <circle cx={PITCH_WIDTH / 2} cy={PITCH_HEIGHT / 2} r={72} fill="none" stroke={COLORS.pitchLines} strokeWidth={2} />
      <rect x={0} y={PITCH_HEIGHT / 2 - 90} width={80} height={180} fill="none" stroke={COLORS.pitchLines} strokeWidth={2} />
      <rect x={PITCH_WIDTH - 80} y={PITCH_HEIGHT / 2 - 90} width={80} height={180} fill="none" stroke={COLORS.pitchLines} strokeWidth={2} />
    </svg>
  );
};
