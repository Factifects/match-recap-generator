import React from "react";
import { COLORS } from "../theme";

// Widened from the original 560 (a real render showed it reading as "too
// slim" — only ~52% of a 1080px portrait frame's width, leaving large dead
// margins either side even at the pitch's own widest edge). 760 brings that
// up to ~70%, still leaving room for the title above and progress dots
// below. This is now WIDER than VerticalPitch's 560x900 flat footprint on
// purpose — the two no longer need to match; VerticalTacticalBoard (the one
// composition that also renders on this same board) gets the same widening.
export const PERSPECTIVE_PITCH_WIDTH = 760;
export const PERSPECTIVE_PITCH_HEIGHT = 900;

// TacticalBoard/Formation use this size instead of the portrait constants
// above when the overall video is landscape (16:9) — a real render (a
// midfield-triangle Formation) showed three player labels (e.g. "Left
// Central Midfielder"/"Right Central Midfielder"/"Holding Midfielder")
// overlapping at 760px wide, since that width was tuned for a 1080px-wide
// PORTRAIT frame, not the ~1920px of spare horizontal room a landscape frame
// actually has. 1400 uses that extra room directly (vs. 760's ~70% fill of
// a 1080px portrait width, this is ~73% of 1920) — every position is still
// authored in the same 0-100 percent space, so widening this doesn't change
// any script's data, just how much real pixel space each percent covers.
// Height stays much shorter than the portrait board's 900 (which relied on
// 1920px of portrait height) since a landscape frame only has 1080px total
// and still needs room for the title above the board.
export const PERSPECTIVE_PITCH_WIDTH_LANDSCAPE = 1400;
export const PERSPECTIVE_PITCH_HEIGHT_LANDSCAPE = 820;

// How much narrower the far (top, opponent-goal) edge is than the near
// (bottom, own-goal) edge — 1 would be no perspective at all (VerticalPitch's
// flat rectangle); lower is a more dramatic "bent backwards" angle. 0.6
// roughly matches the FPL pitch-view reference screenshot.
const FAR_WIDTH_SCALE = 0.6;
// u = lengthPercent/100 (0 = near/bottom, 1 = far/top) gets compressed by
// this power before driving both the width taper and the vertical spacing —
// exponents below 1 expand space near u=0 and compress it near u=1, which is
// exactly "things recede and bunch up as they get further away."
const RECESSION_POWER = 0.62;

/** Maps a pitch position in the project's normal 0-100 percent space
 * (lengthPercent: 0 = own goal/near camera, 100 = opponent's goal/far;
 * widthPercent: 0-100 across the touchlines) onto a pseudo-3D "camera behind
 * the near goal, looking up the pitch" projection — the far end renders
 * narrower and the far half of the pitch gets visually compressed, instead
 * of VerticalPitch's flat top-down rectangle. Deliberately a hand-rolled 2D
 * warp (not a true CSS 3D transform): a real 3D rotation would also tilt
 * player labels/jerseys out of plane and make them harder to read, where
 * every reference this is modeled on (FPL's pitch view, broadcast tactics
 * boards) keeps markers and text upright and only perspective-warps their
 * position and the pitch's own line art. */
export function perspectiveProject(
  lengthPercent: number,
  widthPercent: number,
  width: number = PERSPECTIVE_PITCH_WIDTH,
  height: number = PERSPECTIVE_PITCH_HEIGHT,
): [number, number] {
  const u = Math.min(1, Math.max(0, lengthPercent / 100));
  const uc = Math.pow(u, RECESSION_POWER);
  const pixelY = height * (1 - uc);
  const widthScale = 1 - (1 - FAR_WIDTH_SCALE) * uc;
  const flatX = (widthPercent / 100) * width;
  const pixelX = width / 2 + (flatX - width / 2) * widthScale;
  return [pixelX, pixelY];
}

/** The trapezoid pitch boundary as an SVG path — exported so cards that need
 * to clip content to the actual pitch shape (not the full rectangular board,
 * which is wider than the trapezoid at every row except the very bottom) can
 * reuse the exact same outline PerspectivePitch itself draws. A flat
 * boardWidth x boardHeight clip rect would let content bleed past the
 * trapezoid's slanted edges into the letterboxed corners. */
export function perspectivePitchOutlinePath(width?: number, height?: number): string {
  return pathFromPercentPoints(
    [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
    ],
    true,
    width,
    height,
  );
}

function pathFromPercentPoints(points: [number, number][], close = true, width?: number, height?: number): string {
  const pixels = points.map(([l, w]) => perspectiveProject(l, w, width, height));
  const [first, ...rest] = pixels;
  const segments = rest.map(([x, y]) => `L ${x} ${y}`).join(" ");
  return `M ${first[0]} ${first[1]} ${segments}${close ? " Z" : ""}`;
}

/** Samples an ellipse in percent-space (not pixel-space) so the perspective
 * warp bends it the same way it bends everything else on the board, rather
 * than drawing a true circle and warping it after the fact. */
function ellipsePath(
  centerLength: number,
  centerWidth: number,
  radiusLength: number,
  radiusWidth: number,
  segments = 48,
  width?: number,
  height?: number,
): string {
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([centerLength + radiusLength * Math.sin(angle), centerWidth + radiusWidth * Math.cos(angle)]);
  }
  return pathFromPercentPoints(points, true, width, height);
}

const STRIPE_BAND_COUNT = 12;
// Percent-space box sizes derived from VerticalPitch's pixel constants
// (BOX_WIDTH=180/560, BOX_HEIGHT=80/900) so the markings read at the same
// real-world proportions, just projected through the new perspective.
const BOX_WIDTH_PCT = (180 / PERSPECTIVE_PITCH_WIDTH) * 100;
const BOX_DEPTH_PCT = (80 / PERSPECTIVE_PITCH_HEIGHT) * 100;
const GOAL_BOX_WIDTH_PCT = BOX_WIDTH_PCT * 0.5;
const GOAL_BOX_DEPTH_PCT = BOX_DEPTH_PCT * 0.42;
const CIRCLE_RADIUS_WIDTH_PCT = (72 / PERSPECTIVE_PITCH_WIDTH) * 100;
const CIRCLE_RADIUS_LENGTH_PCT = (72 / PERSPECTIVE_PITCH_HEIGHT) * 100;

/** Pseudo-3D counterpart to VerticalPitch — same green/stripe/line-art
 * vocabulary and shared theme tokens, but drawn through perspectiveProject
 * instead of a flat linear scale, so the far (opponent-goal) end of the
 * pitch renders narrower and more compressed, like a broadcast camera
 * planted behind the near goal rather than a satellite view from directly
 * above. Every line here is built from percent-space points projected
 * individually (not native <rect>/<circle> elements) because a perspective
 * warp turns rectangles into trapezoids and circles into non-uniform curves —
 * there's no single CSS transform that produces this from the flat version. */
export const PerspectivePitch: React.FC<{ opacity?: number; width?: number; height?: number }> = ({
  opacity = 1,
  width = PERSPECTIVE_PITCH_WIDTH,
  height = PERSPECTIVE_PITCH_HEIGHT,
}) => {
  const outline = pathFromPercentPoints(
    [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
    ],
    true,
    width,
    height,
  );

  const stripeBands: string[] = [];
  for (let i = 0; i < STRIPE_BAND_COUNT; i++) {
    if (i % 2 !== 0) continue;
    const l0 = (i / STRIPE_BAND_COUNT) * 100;
    const l1 = ((i + 1) / STRIPE_BAND_COUNT) * 100;
    stripeBands.push(
      pathFromPercentPoints(
        [
          [l0, 0],
          [l0, 100],
          [l1, 100],
          [l1, 0],
        ],
        true,
        width,
        height,
      ),
    );
  }

  const nearBox = pathFromPercentPoints(
    [
      [0, 50 - BOX_WIDTH_PCT / 2],
      [0, 50 + BOX_WIDTH_PCT / 2],
      [BOX_DEPTH_PCT, 50 + BOX_WIDTH_PCT / 2],
      [BOX_DEPTH_PCT, 50 - BOX_WIDTH_PCT / 2],
    ],
    true,
    width,
    height,
  );
  const farBox = pathFromPercentPoints(
    [
      [100, 50 - BOX_WIDTH_PCT / 2],
      [100, 50 + BOX_WIDTH_PCT / 2],
      [100 - BOX_DEPTH_PCT, 50 + BOX_WIDTH_PCT / 2],
      [100 - BOX_DEPTH_PCT, 50 - BOX_WIDTH_PCT / 2],
    ],
    true,
    width,
    height,
  );
  const nearGoalBox = pathFromPercentPoints(
    [
      [0, 50 - GOAL_BOX_WIDTH_PCT / 2],
      [0, 50 + GOAL_BOX_WIDTH_PCT / 2],
      [GOAL_BOX_DEPTH_PCT, 50 + GOAL_BOX_WIDTH_PCT / 2],
      [GOAL_BOX_DEPTH_PCT, 50 - GOAL_BOX_WIDTH_PCT / 2],
    ],
    true,
    width,
    height,
  );
  const farGoalBox = pathFromPercentPoints(
    [
      [100, 50 - GOAL_BOX_WIDTH_PCT / 2],
      [100, 50 + GOAL_BOX_WIDTH_PCT / 2],
      [100 - GOAL_BOX_DEPTH_PCT, 50 + GOAL_BOX_WIDTH_PCT / 2],
      [100 - GOAL_BOX_DEPTH_PCT, 50 - GOAL_BOX_WIDTH_PCT / 2],
    ],
    true,
    width,
    height,
  );

  const halfwayLine = pathFromPercentPoints(
    [
      [50, 0],
      [50, 100],
    ],
    false,
    width,
    height,
  );

  const centerCircle = ellipsePath(50, 50, CIRCLE_RADIUS_LENGTH_PCT, CIRCLE_RADIUS_WIDTH_PCT, 48, width, height);
  const [centerSpotX, centerSpotY] = perspectiveProject(50, 50, width, height);
  const [nearSpotX, nearSpotY] = perspectiveProject(6.5, 50, width, height);
  const [farSpotX, farSpotY] = perspectiveProject(93.5, 50, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ opacity, overflow: "visible" }}
    >
      <defs>
        <clipPath id="perspective-pitch-clip">
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath="url(#perspective-pitch-clip)">
        <path d={outline} fill={COLORS.pitch} />
        {stripeBands.map((d, i) => (
          <path key={i} d={d} fill={COLORS.pitchStripe} />
        ))}
      </g>
      <path d={outline} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <path d={halfwayLine} stroke={COLORS.pitchLines} strokeWidth={3} fill="none" />
      <path d={centerCircle} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <circle cx={centerSpotX} cy={centerSpotY} r={2.5} fill={COLORS.pitchLines} />
      <path d={nearBox} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <path d={farBox} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <path d={nearGoalBox} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <path d={farGoalBox} fill="none" stroke={COLORS.pitchLines} strokeWidth={3} />
      <circle cx={nearSpotX} cy={nearSpotY} r={2.5} fill={COLORS.pitchLines} />
      <circle cx={farSpotX} cy={farSpotY} r={2.5} fill={COLORS.pitchLines} />
    </svg>
  );
};
