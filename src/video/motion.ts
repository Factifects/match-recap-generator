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
