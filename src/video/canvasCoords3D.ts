// World-space conventions for Canvas3D.tsx — the generic-diagram counterpart
// to coords3D.ts (which is pitch-specific: real pitch proportions, a fixed
// goal-to-goal length axis). Canvas has no such real-world reference, so this
// is just a plain box big enough to comfortably hold the pitch family's own
// camera3D.ts defaults (radius/height tuned around a ~24x16 pitch world)
// without needing separate camera tuning.

export const CANVAS3D_WIDTH_UNITS = 20; // author x (0-100)
export const CANVAS3D_HEIGHT_UNITS = 14; // author y (0-100)
export const CANVAS3D_DEPTH_UNITS = 14; // author z (0-100)

/** Maps an authored (x, y, z) percent triple onto a Three.js world position.
 * `x`/`y` follow Canvas's own 2D screen convention (y=0 is the TOP of the
 * frame, y=100 the bottom — see Canvas.tsx's `project`, a plain SVG-style
 * mapping, NOT the pitch family's touchline convention), so `y` is inverted
 * here (world Y-up: higher on screen = higher world Y). `z` is new for this
 * 3D family: 0 = furthest from the default camera, 100 = closest, 50 (the
 * schema default) = the mid-depth plane every object sits on if the author
 * never sets it — i.e. omitting `z` reproduces a flat "everything on one
 * plane" arrangement, same as the pitch family's markers. */
export function percentToCanvasWorld3D(x: number, y: number, z: number = 50): [number, number, number] {
  const worldX = (x / 100 - 0.5) * CANVAS3D_WIDTH_UNITS;
  const worldY = (0.5 - y / 100) * CANVAS3D_HEIGHT_UNITS;
  const worldZ = (z / 100 - 0.5) * CANVAS3D_DEPTH_UNITS;
  return [worldX, worldY, worldZ];
}

/** A size (radius) relative to whichever of width/height is shorter — same
 * convention as Canvas.tsx's own `projectRadius` (a circle's radius must be
 * relative to the shorter dimension, or a reasonable-looking radius overflows
 * the longer axis when perfectly centered). */
export function percentToWorldRadius3D(percent: number): number {
  return (percent / 100) * Math.min(CANVAS3D_WIDTH_UNITS, CANVAS3D_HEIGHT_UNITS);
}

export function percentToWorldWidth3D(percent: number): number {
  return (percent / 100) * CANVAS3D_WIDTH_UNITS;
}

export function percentToWorldHeight3D(percent: number): number {
  return (percent / 100) * CANVAS3D_HEIGHT_UNITS;
}
