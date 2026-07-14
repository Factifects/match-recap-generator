import { Easing, interpolate } from "remotion";

// A real ball doesn't glide in a straight line between two points — it
// arcs up and comes back down, once per bounce/hop. This is deliberately
// separate from motion.ts (whose own comment states it's "calm, broadcast
// style... no spring()/bounce/overshoot anywhere in this file, that's the
// whole point") — a ball's physical arc is a different vocabulary from a
// card's entrance animation, not a violation of motion.ts's scope.

const HOP_EASE = Easing.inOut(Easing.quad);

export interface TrajectoryPoint {
  x: number;
  y: number;
}

/** Position at progress `t` (0-1) along a multi-hop ball path: `waypoints`
 * is the ground track (start, any bounce points, end — minimum 2), `apex`
 * is how high (in the same coordinate units as x/y) each hop arcs at its
 * midpoint. Ground position eases linearly hop-to-hop; height within a hop
 * follows a parabola (0 at both ends of the hop, `apex` at its midpoint) so
 * each bounce actually touches down before the next one starts, instead of
 * one continuous smooth curve pretending to be several bounces. */
export function ballisticPath(waypoints: TrajectoryPoint[], apex: number, t: number): TrajectoryPoint & { height: number } {
  const hopCount = waypoints.length - 1;
  const clampedT = Math.max(0, Math.min(1, t));
  const hopFloat = clampedT * hopCount;
  const hopIndex = Math.min(hopCount - 1, Math.floor(hopFloat));
  const hopT = interpolate(hopFloat - hopIndex, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: HOP_EASE });

  const from = waypoints[hopIndex];
  const to = waypoints[hopIndex + 1];
  const x = from.x + (to.x - from.x) * hopT;
  const y = from.y + (to.y - from.y) * hopT;
  // Parabola through (0,0), (0.5, apex), (1,0) in hop-local progress.
  const height = 4 * apex * hopT * (1 - hopT);

  return { x, y, height };
}
