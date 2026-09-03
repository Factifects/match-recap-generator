import { Easing, interpolate } from "remotion";

// ---------------------------------------------------------------------------
// Choreography: the animation principles motion.ts deliberately excludes.
//
// motion.ts opens by stating its own rule — "deliberately no spring()/bounce/
// overshoot anywhere in this file — that's the whole point" — and offers four
// cubic easing curves. That is a legitimate choice for a subtitle or a quiet
// broadcast lower-third, where motion should not draw attention to itself.
//
// It is the wrong choice for anything that has to feel PHYSICAL, and it is why
// this engine's vocabulary bottoms out at boxes changing colour and dots
// travelling along lines. An object that eases politely from A to B reads as a
// value being interpolated, because that is exactly what it is. An object that
// gathers itself, moves, overshoots and settles reads as something that
// DECIDED to move — and that difference is most of what separates motion design
// from animated data.
//
// So this is a separate module rather than an edit to motion.ts: both
// vocabularies are correct, for different jobs, and a component picks one
// deliberately. Nothing here changes any existing scene.
//
// The principles implemented, in the traditional naming:
//   anticipation      — wind up against the direction of travel first
//   follow-through    — overshoot the target and settle back
//   overlapping action— parts of a thing arrive at different times
//   secondary motion  — a dependent element trails its parent
//   arcs              — nothing living moves in a straight line
//   staggered timing  — a group arrives as a cascade, never in unison
//   squash and stretch— deformation on acceleration and impact
// ---------------------------------------------------------------------------

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

/** Normalized 0-1 progress through a window, clamped at both ends. */
function progress(frame: number, start: number, duration: number): number {
  if (duration <= 0) return frame >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (frame - start) / duration));
}

export interface AnticipationOptions {
  /** How far to wind up, as a fraction of the total travel. Small on purpose:
   * anticipation is felt rather than seen, and a large wind-up reads as a
   * mistake — as though the object moved the wrong way first. */
  windUp?: number;
  /** Fraction of the total duration spent winding up. */
  windUpFraction?: number;
  /** How far past the target to travel before settling. */
  overshoot?: number;
}

/**
 * A complete move with anticipation, travel and follow-through.
 *
 * The three-phase shape is the whole point, and it is what a plain eased
 * interpolation cannot express:
 *   1. WIND UP — drift slightly backwards. Weight has to be gathered before it
 *      is thrown, and the eye reads the wind-up as intent.
 *   2. TRAVEL — accelerate out of the wind-up toward the target.
 *   3. SETTLE — pass the target and come back to it. Nothing with mass stops
 *      dead on its mark.
 *
 * Returns the value at `frame`, so it drops into the same call sites as
 * `interpolate` — a component adopts it by changing one function name.
 */
export function moveWithWeight(
  frame: number,
  start: number,
  duration: number,
  from: number,
  to: number,
  options: AnticipationOptions = {},
): number {
  const { windUp = 0.06, windUpFraction = 0.22, overshoot = 0.08 } = options;
  const t = progress(frame, start, duration);
  if (t <= 0) return from;
  if (t >= 1) return to;

  const travel = to - from;
  const windUpValue = from - travel * windUp;
  const overshootValue = to + travel * overshoot;

  if (t < windUpFraction) {
    // Eased IN: the wind-up starts slowly, which is what makes it read as
    // gathering rather than as a twitch.
    const local = t / windUpFraction;
    return interpolate(EASE_IN(local), [0, 1], [from, windUpValue]);
  }

  // Travel and settle share one curve so the overshoot is not a separate
  // visible event — it is the tail of the same motion.
  const local = (t - windUpFraction) / (1 - windUpFraction);
  const overshootPeak = 0.72;
  if (local < overshootPeak) {
    return interpolate(EASE_OUT(local / overshootPeak), [0, 1], [windUpValue, overshootValue]);
  }
  const settle = (local - overshootPeak) / (1 - overshootPeak);
  return interpolate(EASE_OUT(settle), [0, 1], [overshootValue, to]);
}

/**
 * Critically-damped-ish spring, expressed as a pure function of the frame.
 *
 * Remotion ships `spring()`, which is better physics; this exists because it
 * takes an explicit duration. A spring defined by stiffness and damping settles
 * whenever it settles, which is unusable when a beat has to land on a narration
 * word — and narration is the timeline authority in this project. So the
 * bounciness is expressive and the duration is fixed.
 */
export function springSettle(
  frame: number,
  start: number,
  duration: number,
  from: number,
  to: number,
  bounciness = 0.35,
): number {
  const t = progress(frame, start, duration);
  if (t <= 0) return from;
  if (t >= 1) return to;
  // Decaying cosine: amplitude falls off exponentially while the oscillation
  // continues, which is what a real damped spring does.
  const decay = Math.exp(-5.2 * t);
  const oscillation = Math.cos(2 * Math.PI * (1 + bounciness * 2) * t);
  return to - (to - from) * decay * oscillation;
}

/**
 * Per-item delay for a group that should arrive as a cascade.
 *
 * The single cheapest upgrade available to any multi-object scene. Objects
 * appearing in unison read as a diagram being switched on; the same objects
 * arriving 3-5 frames apart read as a sequence with a direction, and the eye
 * follows the cascade instead of trying to take in everything at once.
 *
 * `spread` compresses the stagger as the group grows, so twelve items do not
 * take four times as long to arrive as three — the cascade should stay a
 * flourish, never become the pace of the scene.
 */
export function staggerDelay(index: number, count: number, perItemFrames = 4, spread = 0.75): number {
  if (count <= 1) return 0;
  const compressed = perItemFrames * Math.pow(count, spread - 1) * Math.pow(count, 0);
  return index * Math.max(1, compressed * Math.pow(3 / Math.max(3, count), 1 - spread));
}

/**
 * Secondary motion: a dependent element trailing its parent.
 *
 * Given the parent's current value and its value a few frames ago, returns
 * where the trailing element should be. A label that arrives with its object
 * reads as painted on; one that arrives a few frames later reads as attached to
 * it. The lag is what implies a connection with give in it.
 */
export function trail(parentNow: number, parentBefore: number, looseness = 0.6): number {
  return parentBefore + (parentNow - parentBefore) * (1 - Math.min(0.95, Math.max(0, looseness)));
}

/**
 * Squash and stretch on impact, as a scale pair.
 *
 * Volume is conserved — the object widens exactly as much as it flattens — which
 * is what keeps the deformation reading as elastic rather than as a resize.
 * Returns `{ scaleX, scaleY }` to multiply into an existing transform.
 */
export function squashOnImpact(
  frame: number,
  impactFrame: number,
  recoveryFrames = 9,
  intensity = 0.18,
): { scaleX: number; scaleY: number } {
  const t = progress(frame, impactFrame, recoveryFrames);
  if (frame < impactFrame || t >= 1) return { scaleX: 1, scaleY: 1 };
  // One decaying oscillation: flatten hard, rebound past, settle.
  const amount = intensity * Math.exp(-4.5 * t) * Math.cos(2 * Math.PI * 1.35 * t);
  return { scaleX: 1 + amount, scaleY: 1 - amount };
}

/**
 * Squash and stretch driven by an INTENSITY rather than a frame.
 *
 * `squashOnImpact` owns its own timing, which is right when the impact is a
 * moment the caller only knows the frame of. Some callers instead already have
 * a 0-1 strength for the event — a decaying hit value, a pulse amount — and
 * need the deformation to track that curve rather than run its own.
 *
 * Volume is conserved exactly as in `squashOnImpact`: the object widens by the
 * same factor it flattens, which is what reads as elastic rather than as a
 * resize.
 */
export function squashFromIntensity(amount: number, intensity = 0.18): { scaleX: number; scaleY: number } {
  const clamped = Math.max(0, Math.min(1, amount));
  const deform = intensity * clamped;
  return { scaleX: 1 + deform, scaleY: 1 - deform };
}

/**
 * A point along an arc between two positions.
 *
 * Straight-line travel is the single most mechanical-reading thing about
 * interpolated motion — almost nothing in the physical world moves along a
 * chord. `bow` is the perpendicular displacement at the midpoint, defaulting to
 * a quarter of the distance, which is roughly what reads as natural without
 * looking thrown.
 */
export function arcPoint(
  t: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  bow?: number,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { ...from };
  const lift = bow ?? distance * 0.25;
  const cx = from.x + dx / 2 + (-dy / distance) * lift;
  const cy = from.y + dy / 2 + (dx / distance) * lift;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

/**
 * Overlapping action: staggered arrival of a single object's own properties.
 *
 * A box whose position, scale and opacity all resolve on the same frame reads
 * as one property changing. Offsetting them — position leads, scale follows,
 * opacity trails — makes one object read as having parts, which is the
 * difference between a shape appearing and a thing arriving.
 */
export function overlapOffsets(baseFrames: number): { position: number; scale: number; opacity: number } {
  return {
    position: 0,
    scale: Math.round(baseFrames * 0.18),
    opacity: Math.round(baseFrames * 0.32),
  };
}
