import { Easing, interpolate } from "remotion";

// Calm, broadcast-style motion vocabulary: fade, slide, line-draw, scale/opacity
// settle. Deliberately no spring()/bounce/overshoot anywhere in this file —
// that's the whole point. Every component (new and retrofitted) should build
// its animation out of these instead of hand-rolling spring configs.

const EASE = Easing.out(Easing.cubic);

/** 0 -> 1 opacity ramp. */
export function fadeIn(frame: number, start: number, duration = 14): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

/** Offset (px) that eases from `distance` down to 0 — pair with fadeIn and
 * apply as a translateX/translateY. */
export function slideIn(frame: number, start: number, duration = 16, distance = 40): number {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

/** 0 -> 1 progress for a stroke-draw reveal (pair with strokeDasharray/
 * strokeDashoffset on an SVG path/line with pathLength=1). */
export function drawIn(frame: number, start: number, duration = 20): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
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
