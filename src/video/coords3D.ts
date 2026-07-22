// Shared world-space conventions for the 3D pitch family (TacticalBoard3D/
// Formation3D/ShotMap3D) — the 3D counterpart to Pitch.tsx/PerspectivePitch.tsx's
// pitchX/pitchY/perspectiveProject. Every author-facing coordinate stays the
// same 0-100 pitch-percent space every other pitch component already uses
// (x = goal-to-goal length axis, y = touchline-to-touchline width axis), so
// tacticalPatterns.ts and every existing analyses/ script's coordinates work
// unchanged — only the PROJECTION target differs (a Vector3 instead of an
// SVG pixel pair).

// Real pitch proportions (FIFA standard, meters), scaled down into a compact
// world-unit box — not meant to be a physically exact simulator, just close
// enough that a center circle/penalty box reads as the right shape/proportion
// from any camera angle.
const REAL_LENGTH_M = 105;
const REAL_WIDTH_M = 68;

export const PITCH_LENGTH_UNITS = 24;
export const PITCH_WIDTH_UNITS = 16;

const LENGTH_SCALE = PITCH_LENGTH_UNITS / REAL_LENGTH_M;
const WIDTH_SCALE = PITCH_WIDTH_UNITS / REAL_WIDTH_M;

export const CENTER_CIRCLE_RADIUS_UNITS = 9.15 * LENGTH_SCALE;
export const CENTER_SPOT_RADIUS_UNITS = 0.3 * LENGTH_SCALE;
export const BOX_DEPTH_UNITS = 16.5 * LENGTH_SCALE;
export const BOX_WIDTH_UNITS = 40.3 * WIDTH_SCALE;
export const GOAL_WIDTH_UNITS = 7.32 * WIDTH_SCALE;
export const GOAL_HEIGHT_UNITS = 2.44 * LENGTH_SCALE;

// Where a billboarded marker's disc sits above the pitch surface, and how far
// below the disc its HTML name label is offset — shared so every marker
// (player, ball, shot) sits at a consistent "floating just above the turf"
// height rather than each card picking its own.
export const MARKER_HEIGHT_UNITS = 1.1;

/** Maps an authored (x, y) pitch-percent pair — the exact same convention as
 * every 2D pitch component (x = length axis 0-100, y = width axis 0-100,
 * LOW y = the "right" side per Pitch.tsx's edge labels/SCRIPT_TEMPLATE
 * convention) — onto a Three.js world position. World X follows length, Z
 * follows width; Y is height above the pitch (defaults to ground level).
 *
 * The default camera (see camera3D.ts) sits behind the low-X ("near") goal
 * looking up the +X axis with +Y up — in that orientation `right = +Z`, so
 * mapping LOW authored-y to +Z (not -Z) is what makes a "right"-labeled
 * player actually appear on the camera's right, matching every 2D board's
 * own mirror-fix (see TacticalBoard.tsx's `project` closure and
 * feedback_formation_slot_order_bug in memory) — done directly in this
 * mapping rather than via a second (100 - y) fix at each call site. */
export function percentToWorld(x: number, y: number, height: number = 0): [number, number, number] {
  const worldX = (x / 100 - 0.5) * PITCH_LENGTH_UNITS;
  const worldZ = (0.5 - y / 100) * PITCH_WIDTH_UNITS;
  return [worldX, height, worldZ];
}
