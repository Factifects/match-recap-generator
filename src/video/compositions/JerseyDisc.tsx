import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";
import type { PLAYER_STATE_KEYS } from "../../model/visualDefinitions";

type PlayerState = (typeof PLAYER_STATE_KEYS)[number];

// Grouped into a small semantic palette (not 12 unique colors) so a glance
// at a crowded board still reads at a distance: red = actively disrupting
// the ball (defensive intent), green = on/creating the ball (attacking
// intent), amber = positional/off-ball shape. A future state can slot into
// whichever bucket it behaviorally matches without a new color.
const STATE_COLORS: Record<PlayerState, string> = {
  pressing: COLORS.danger,
  marking: COLORS.danger,
  covering: COLORS.danger,
  screening: COLORS.danger,
  receiving: COLORS.highlight,
  carrying: COLORS.highlight,
  overlapping: COLORS.highlight,
  underlapping: COLORS.highlight,
  dropping: COLORS.textDim,
  holdingWidth: COLORS.textDim,
  checkingShoulder: COLORS.textDim,
  waiting: COLORS.textDim,
};

// A continuously looping, outward-expanding ring — a live "sonar ping" read
// as "this marker is a live, tracked thing," not a flat static sticker. Runs
// for the marker's entire on-screen life (not just its entrance), which is
// the whole point: an entrance animation says "I arrived," a pulse says "I'm
// still here and active."
const PULSE_PERIOD_FRAMES = 55;
const PULSE_MAX_GROWTH = 16;

// The only jersey art in the project today is these two specific national
// kits (public/assets/jerseys/) — real per-team art plugs in via the
// `jerseyImage` prop when a caller has resolved one (see Formation.tsx's
// jerseyImages, resolved from a real team name), but most pitch-diagram
// scenes only know `team: "home" | "away"`, not a real team name, so there's
// nothing to resolve. For those, this is a generic "it's a shirt, not a
// dot" shape — recolored to the team's own accent color below specifically
// so it never reads as an actual claim about which kit either side wore.
const FALLBACK_JERSEY = staticFile("assets/jerseys/france.png");

/** A player marker rendered as a recolored jersey silhouette instead of a
 * flat circle — real fabric shading/collar/sleeve detail from the source
 * photo survives the recolor (a `mix-blend-mode: color` overlay swaps hue/
 * saturation only, leaving the underlying luminance shading intact), so it
 * reads as "a jersey in this team's color" rather than a flat disc or an
 * obviously-fake tint. */
export const JerseyDisc: React.FC<{
  cx: number;
  cy: number;
  radius?: number;
  color: string;
  highlighted?: boolean;
  opacity?: number;
  jerseyImage?: string;
  // Degrees, 0 = attacking-direction "up" — an evented-timeline addition
  // (see TacticalBoard.tsx's resolveActorFold), absent for every marker that
  // doesn't come from a `timeline`-authored board.
  facing?: number;
  state?: PlayerState;
}> = ({ cx, cy, radius = 15, color, highlighted = false, opacity = 1, jerseyImage, facing, state }) => {
  const frame = useCurrentFrame();
  const clipId = `jersey-clip-${Math.round(cx)}-${Math.round(cy)}-${Math.round(radius)}`;
  const src = jerseyImage ?? FALLBACK_JERSEY;
  // Oversized relative to the clip circle and nudged down slightly so the
  // crop lands on the chest/collar area of the source photo (which is a
  // head-on product shot with margin above the collar), not the whole
  // square including its empty top margin.
  const imageSize = radius * 2.6;
  // Offsetting each marker's cycle by its own position (rather than one
  // shared global phase) keeps a whole team from blinking in unison like a
  // single blob — each disc pings independently, closer to how a real
  // live-tracking overlay would look.
  const phaseOffset = Math.round(cx * 3 + cy * 7) % PULSE_PERIOD_FRAMES;
  const pulseProgress = ((frame + phaseOffset) % PULSE_PERIOD_FRAMES) / PULSE_PERIOD_FRAMES;
  const pulseRadius = radius + pulseProgress * PULSE_MAX_GROWTH;
  const pulseOpacity = (1 - pulseProgress) * 0.4;

  // A small wedge just outside the disc's rim pointing in `facing`'s
  // direction (0deg = up/attacking direction, clockwise) — body orientation
  // is otherwise invisible on a top-down disc, and "opening the body to
  // receive" is meaningless without something to show which way it opened.
  const facingWedge = facing !== undefined && (
    <polygon
      points="0,-6 5,3 -5,3"
      fill={COLORS.text}
      opacity={0.9}
      transform={`translate(${cx}, ${cy}) rotate(${facing}) translate(0, ${-(radius + 7)})`}
    />
  );
  const stateBadge = state !== undefined && (
    <circle cx={cx + radius * 0.72} cy={cy - radius * 0.72} r={4.5} fill={STATE_COLORS[state]} stroke="#ffffff" strokeWidth={1} />
  );

  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={pulseRadius} fill="none" stroke={color} strokeWidth={1.5} opacity={pulseOpacity} />
      {highlighted && <circle cx={cx} cy={cy} r={radius + 6} fill="none" stroke={COLORS.highlight} strokeWidth={2} opacity={0.85} />}
      {facingWedge}
      <circle cx={cx} cy={cy} r={radius} fill={color} />
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} style={{ isolation: "isolate" }}>
        <image
          href={src}
          x={cx - imageSize / 2}
          y={cy - imageSize / 2 + radius * 0.35}
          width={imageSize}
          height={imageSize}
          preserveAspectRatio="xMidYMid slice"
        />
        <circle cx={cx} cy={cy} r={radius} fill={color} style={{ mixBlendMode: "color" }} opacity={0.9} />
      </g>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.45} />
      {stateBadge}
    </g>
  );
};
