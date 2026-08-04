// motion.ts is deliberately calm — "no spring()/bounce/overshoot anywhere...
// that's the whole point" — and stays that way for every scene type that
// isn't reaching for a cinematic feel. This file is the deliberate
// departure: two curves out of the Disney animation-principles vocabulary
// (anticipation, overshoot-then-settle) that read as directed/intentional
// rather than mechanical. Curated pair, not an open-ended physics library —
// real momentum/friction/drag simulation is more than a keyframe-driven
// video needs; professional motion tools mostly fake momentum with exactly
// this kind of hand-tuned curve rather than running physics, which is the
// honest, right-sized choice here too.

/** Overshoots past 1 before settling back — "ease-out-back," the standard
 * easing-functions.net formula. `c1` is the amount of overshoot (1.70158 is
 * the canonical "10% back" constant); left fixed rather than exposed as a
 * param since a hand-tuned single feel is the point, not a tunable knob
 * every call site has to get right. */
const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;
export function easeOutBack(t: number): number {
  const x = t - 1;
  return 1 + BACK_C3 * x * x * x + BACK_C1 * x * x;
}

/** A small backward dip before accelerating forward — the "anticipation"
 * principle (a camera/object pulling back slightly before its real move
 * telegraphs intent, the same way a diver bends knees before jumping).
 * Android's AnticipateInterpolator formula: t^2 * ((tension+1)*t - tension).
 * `tension = 2` dips to roughly -t at small t before curving up through 0
 * and on to 1 — enough to read as a deliberate wind-up without the value
 * spending long in negative territory. */
const ANTICIPATE_TENSION = 2;
export function anticipate(t: number): number {
  return t * t * ((ANTICIPATE_TENSION + 1) * t - ANTICIPATE_TENSION);
}

/** Material Design's "emphasized decelerate" feel — launches near-instantly,
 * then spends most of its time settling (a much longer tail than easeOut's
 * cubic). This is the curve that makes big-studio motion graphics read as
 * weighted/intentional: the element is already moving by the time you notice
 * it, and the arrival is soft. Approximated as a quartic-out-plus rather
 * than solving Material's cubic-bezier(0.05, 0.7, 0.1, 1) numerically —
 * the visual read is equivalent at 30fps, and a closed-form polynomial keeps
 * this file's "hand-tuned curve, not a physics engine" philosophy. */
export function emphasized(t: number): number {
  return 1 - Math.pow(1 - t, 3.6);
}

/** A damped spring settle — overshoots ~12% then oscillates once, very
 * faintly, before resting. This is Figma Motion's signature "springy
 * arrival" feel, expressed closed-form (decaying cosine) rather than as a
 * physics sim, same philosophy as everything else in this file. Distinct
 * from easeOutBack: back overshoots once and settles monotonically; spring
 * crosses the target twice, which is what actually reads as springy. */
export function spring(t: number): number {
  return 1 - Math.exp(-6 * t) * Math.cos(9 * t);
}

export const CINEMATIC_EASING_CURVES = {
  easeOutBack,
  anticipate,
  emphasized,
  spring,
} as const;
export type CinematicEasingName = keyof typeof CINEMATIC_EASING_CURVES;
