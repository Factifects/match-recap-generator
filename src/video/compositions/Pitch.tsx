import React from "react";
import { COLORS, FONT_FAMILY } from "../theme";

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

// This pitch is drawn goal-to-goal along the WIDE screen axis, which leaves
// only top/bottom to distinguish the two flanks — a right-sided player can
// never sit on the screen's right edge the way a left-sided player never
// sits on the screen's left edge (see feedback_formation_slot_order_bug in
// memory: a viewer flagged the front three rendering top-to-bottom instead of
// left-to-right, expecting screen-left/right to match pitch-left/right,
// which only a portrait/vertical pitch can actually do). Rather than switch
// orientation, these two small edge labels make the top=right/bottom=left
// convention (the one already used throughout every authored script's y
// coordinates) explicit on every pitch instead of relying on the viewer to
// infer it.
const EDGE_LABEL_STYLE = {
  fontFamily: FONT_FAMILY,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: 2,
  textTransform: "uppercase" as const,
  fill: COLORS.textDim,
  opacity: 0.55,
};

// Attack-direction cue, in addition to the Right Side/Left Side edge labels
// above — this codebase's fixed convention (see tacticalPatterns.ts's
// "pressing trigger" comment and formations.ts's header comment): home
// defends x=0 and attacks toward x=100, away defends x=100 and attacks
// toward x=0. Positioned just below each goal box so it doesn't collide with
// the corner edge labels.
const DIRECTION_LABEL_STYLE = {
  ...EDGE_LABEL_STYLE,
  fontSize: 13,
};
const GOAL_BOX_HALF_HEIGHT = 90;
const DIRECTION_LABEL_Y = PITCH_HEIGHT / 2 + GOAL_BOX_HALF_HEIGHT + 22;

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
      <rect x={1} y={1} width={PITCH_WIDTH - 2} height={PITCH_HEIGHT - 2} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} rx={5} />
      <line x1={PITCH_WIDTH / 2} y1={0} x2={PITCH_WIDTH / 2} y2={PITCH_HEIGHT} stroke={COLORS.pitchLines} strokeWidth={3} />
      <circle cx={PITCH_WIDTH / 2} cy={PITCH_HEIGHT / 2} r={72} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <rect x={0} y={PITCH_HEIGHT / 2 - 90} width={80} height={180} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <rect x={PITCH_WIDTH - 80} y={PITCH_HEIGHT / 2 - 90} width={80} height={180} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <text x={16} y={26} style={EDGE_LABEL_STYLE}>Right Side</text>
      <text x={16} y={PITCH_HEIGHT - 14} style={EDGE_LABEL_STYLE}>Left Side</text>
      <text x={6} y={DIRECTION_LABEL_Y} textAnchor="start" style={DIRECTION_LABEL_STYLE}>Home Attacks →</text>
      <text x={PITCH_WIDTH - 6} y={DIRECTION_LABEL_Y} textAnchor="end" style={DIRECTION_LABEL_STYLE}>← Away Attacks</text>
    </svg>
  );
};
