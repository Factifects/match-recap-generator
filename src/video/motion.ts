import { Easing, interpolate } from "remotion";

// Calm, broadcast-style motion vocabulary: fade, slide, line-draw, scale/opacity
// settle. Deliberately no spring()/bounce/overshoot anywhere in this file —
// that's the whole point. Every component (new and retrofitted) should build
// its animation out of these instead of hand-rolling spring configs.

const EASE = Easing.out(Easing.cubic);

/** Named easing curves selectable per-object (Canvas v2) — deliberately just
 * these four ("that's enough," per the feature request this was built for),
 * not an open-ended curve library. `easeOut` is byte-for-byte the same curve
 * every other helper in this file already hardcodes, so it's the default
 * everywhere an `easing` param is added, keeping every existing call site's
 * behavior unchanged. */
export const EASING_CURVES = {
  linear: Easing.linear,
  easeIn: Easing.in(Easing.cubic),
  easeOut: EASE,
  easeInOut: Easing.inOut(Easing.cubic),
} as const;
export type EasingName = keyof typeof EASING_CURVES;

/** 0 -> 1 opacity ramp. */
export function fadeIn(frame: number, start: number, duration = 14, easing: EasingName = "easeOut"): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING_CURVES[easing],
  });
}

/** Offset (px) that eases from `distance` down to 0 — pair with fadeIn and
 * apply as a translateX/translateY. */
export function slideIn(frame: number, start: number, duration = 16, distance = 40, easing: EasingName = "easeOut"): number {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING_CURVES[easing],
  });
}

/** 0 -> 1 progress for a stroke-draw reveal (pair with strokeDasharray/
 * strokeDashoffset on an SVG path/line with pathLength=1). */
export function drawIn(frame: number, start: number, duration = 20, easing: EasingName = "easeOut"): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING_CURVES[easing],
  });
}

/** Scale that eases from `from` up to 1 — a quiet settle, not a spring pop. */
export function scaleSettle(frame: number, start: number, duration = 16, from = 0.96): number {
  return interpolate(frame, [start, start + duration], [from, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

/** Generic settle from `from` to `to` — the fully general form scaleSettle is
 * a fixed (from, 1) special case of. Used for anything that eases between two
 * numeric values (a rotation offset, a blur radius), not just scale, so a new
 * entrance/exit variant doesn't need its own bespoke interpolate() call. */
export function settleFrom(frame: number, start: number, duration: number, from: number, to: number, easing: EasingName = "easeOut"): number {
  return interpolate(frame, [start, start + duration], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING_CURVES[easing],
  });
}

/** Continuous sine oscillation between `min` and `max` — unlike every other
 * helper in this file, this never settles; it's for ambient "still alive"
 * motion (a pulsing highlight zone, an idle glow at a landed arrow's tip)
 * layered on TOP of a one-shot entrance, not a replacement for one. `period`
 * is frames per full cycle. `phaseOffset` (radians) staggers multiple
 * pulsing elements in the same scene so they don't all breathe in lockstep. */
export function pulse(frame: number, period: number, min: number, max: number, phaseOffset = 0): number {
  const t = (frame / period) * Math.PI * 2 + phaseOffset;
  return min + ((Math.sin(t) + 1) / 2) * (max - min);
}

/** Maps each item index (0..itemCount-1) to its reveal POSITION (0 = first to
 * appear), given a script-authored `focusOrder` permutation of indices. Any
 * index missing from `focusOrder` (a partial/short list, or one referencing
 * an out-of-range index) is appended afterward in natural order, so a
 * malformed focusOrder degrades gracefully instead of throwing or leaving
 * an item with no reveal position at all. */
export function resolveRevealOrder(focusOrder: number[], itemCount: number): number[] {
  const positions = new Array(itemCount).fill(-1);
  let nextPosition = 0;
  for (const index of focusOrder) {
    if (index >= 0 && index < itemCount && positions[index] === -1) {
      positions[index] = nextPosition++;
    }
  }
  for (let index = 0; index < itemCount; index++) {
    if (positions[index] === -1) positions[index] = nextPosition++;
  }
  return positions;
}
