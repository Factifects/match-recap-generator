import { EASING_CURVES, type EasingName } from "./motion";
import { CINEMATIC_EASING_CURVES, type CinematicEasingName } from "./cinematicEasing";

// The one generalization every scene's hand-rolled interpolate() call
// (motion.ts's fadeIn/slideIn/drawIn, Canvas.tsx's resolveAnimatedProps,
// camera3D.ts's per-pose progress math) is really doing: given a track of
// {frame, values} snapshots, produce this frame's interpolated values. A
// scene authors ITS OWN keyframes; this file only knows how to walk between
// them. Pure function of `frame` (no useFrame/real-time ticker), matching
// this project's existing Remotion-determinism convention everywhere else.

type AnyEasingName = EasingName | CinematicEasingName;
interface EasedPoint {
  at: number;
  value: number;
  easing: AnyEasingName | undefined;
}

/** Resolves any easing name this project knows about — motion.ts's original
 * four (linear/easeIn/easeOut/easeInOut) or cinematicEasing.ts's two
 * (easeOutBack/anticipate) — to its actual `(t) => number` curve. Exported
 * so any consumer needing the broader set (e.g. Canvas3D.tsx's entrance
 * animations) can reuse this exact lookup instead of hand-rolling their own
 * motion.ts-vs-cinematicEasing.ts branch. */
export function resolveEasing(name: AnyEasingName | undefined): (t: number) => number {
  if (!name) return EASING_CURVES.easeOut;
  if (name in CINEMATIC_EASING_CURVES) return CINEMATIC_EASING_CURVES[name as CinematicEasingName];
  return EASING_CURVES[name as EasingName];
}

export interface Keyframe<T extends Record<string, number>> {
  /** Absolute frame this keyframe lands on. */
  at: number;
  /** Only the properties that actually change at this keyframe — anything
   * omitted holds whatever value the previous keyframe left it at, the same
   * "build on what's already there" convention Canvas.tsx's own phases use. */
  values: Partial<T>;
  /** Curve driving the interpolation INTO this keyframe from the previous
   * one. Meaningless on a track's first keyframe (nothing to interpolate
   * from). Defaults to motion.ts's own "easeOut" — this project's baseline
   * curve everywhere else. */
  easing?: AnyEasingName;
}

/** Interpolates a `Keyframe<T>` track at `frame`, per-property — each key in
 * `T` is resolved independently by finding its own two bracketing keyframes
 * (skipping any keyframe that didn't specify that key) and easing between
 * them, so a track can update x/y/opacity on different beats without every
 * keyframe having to restate every property. Clamps: before the first
 * keyframe or after the last, holds that keyframe's own resolved value
 * (no extrapolation) — matches every existing interpolate() call in this
 * codebase's `extrapolateLeft/Right: "clamp"` convention. An empty track
 * or a track missing a key entirely falls back to `defaults`. */
export function resolveKeyframes<T extends Record<string, number>>(
  frame: number,
  track: Keyframe<T>[],
  defaults: T,
): T {
  if (track.length === 0) return defaults;
  const sorted = [...track].sort((a, b) => a.at - b.at);
  const result = { ...defaults };

  for (const key of Object.keys(defaults) as (keyof T)[]) {
    // Every keyframe that actually sets this key, in order — the two
    // bracketing this frame (or the nearest edge one) drive the value.
    const withValues: EasedPoint[] = [];
    for (const kf of sorted) {
      const value = kf.values[key];
      if (value !== undefined) withValues.push({ at: kf.at, value: value as number, easing: kf.easing });
    }
    if (withValues.length === 0) continue; // this key never appears in the track — keep the default

    const first = withValues[0];
    const last = withValues[withValues.length - 1];
    if (frame <= first.at) {
      result[key] = first.value as T[keyof T];
      continue;
    }
    if (frame >= last.at) {
      result[key] = last.value as T[keyof T];
      continue;
    }

    let segmentStart = first;
    let segmentEnd = last;
    for (let i = 1; i < withValues.length; i++) {
      const point = withValues[i];
      if (point.at >= frame) {
        segmentStart = withValues[i - 1];
        segmentEnd = point;
        break;
      }
    }
    const span = segmentEnd.at - segmentStart.at;
    const t = span <= 0 ? 1 : resolveEasing(segmentEnd.easing)((frame - segmentStart.at) / span);
    result[key] = (segmentStart.value + (segmentEnd.value - segmentStart.value) * t) as T[keyof T];
  }

  return result;
}
