import type { Keyframe } from "./keyframes";

// Named, reusable keyframe-track factories — a scene references one of
// these instead of hand-writing its own {at, values, easing} array inline.
// A representative starting set sized to what the F1 benchmark (and the
// near-future scenes it's the proof-of-concept for) actually need, not the
// full wishlist of preset names — more get added here as real scenes need
// them, following this same shape, rather than speculatively built now.

export interface HeroEntranceValues extends Record<string, number> {
  opacity: number;
  scale: number;
  y: number;
}

/** A dramatic reveal: pulls back/down slightly (anticipation), then
 * overshoots up into full size/position and settles — for a single focal
 * element that should feel *arrived*, not just faded in. `restY` is the
 * element's own resting y (world/local units) once settled; the entrance
 * starts BELOW that by `dropDistance` and dips further before rising. */
export function heroEntrance(
  startFrame: number,
  restY: number,
  dropDistance = 1.5,
  durationFrames = 36,
): Keyframe<HeroEntranceValues>[] {
  const anticipateEnd = startFrame + Math.round(durationFrames * 0.22);
  const settleEnd = startFrame + durationFrames;
  return [
    { at: startFrame, values: { opacity: 0, scale: 0.82, y: restY - dropDistance } },
    // Anticipation: a small extra dip/shrink before the real rise — reads as
    // a wind-up, not a stutter, because it's brief and eases into itself.
    { at: anticipateEnd, values: { opacity: 0.4, scale: 0.76, y: restY - dropDistance * 1.15 }, easing: "anticipate" },
    { at: settleEnd, values: { opacity: 1, scale: 1, y: restY }, easing: "easeOutBack" },
  ];
}

export interface CinematicPushValues extends Record<string, number> {
  scale: number;
}

/** A steady push-in on a layer's own scale (distinct from a CAMERA push —
 * this is for a foreground element that should grow toward the viewer on its
 * own beat, e.g. a focal object during a reveal). Plain easeOut (this
 * project's baseline curve) — a push should read as deliberate and smooth,
 * not overshoot like an entrance. */
export function cinematicPush(startFrame: number, durationFrames: number, fromScale: number, toScale: number): Keyframe<CinematicPushValues>[] {
  return [
    { at: startFrame, values: { scale: fromScale } },
    { at: startFrame + durationFrames, values: { scale: toScale }, easing: "easeOut" },
  ];
}

export interface StaggerFadeUpValues extends Record<string, number> {
  opacity: number;
  y: number;
}

/** One item's own track out of a staggered group entrance (e.g. background
 * silhouette shapes appearing in sequence rather than all at once) — pass
 * this item's `index`; the actual stagger offset (`index * staggerFrames`)
 * is computed here so every call site shares the same stagger math instead
 * of each re-deriving `index * N`. Rises from `restY + riseDistance` into
 * `restY`, `easeOutBack` for a small settle-pop consistent with the rest of
 * this project's entrance vocabulary. */
export function staggerFadeUp(
  startFrame: number,
  index: number,
  restY: number,
  staggerFrames = 6,
  riseDistance = 0.6,
  durationFrames = 20,
): Keyframe<StaggerFadeUpValues>[] {
  const itemStart = startFrame + index * staggerFrames;
  return [
    { at: itemStart, values: { opacity: 0, y: restY + riseDistance } },
    { at: itemStart + durationFrames, values: { opacity: 1, y: restY }, easing: "easeOutBack" },
  ];
}
