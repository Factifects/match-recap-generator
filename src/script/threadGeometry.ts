// The `thread` primitive — the one object that carries the whole explanation.
//
// A thread is what an ordinary action leaves behind. It pays out from a device,
// hooks to the place the action happened, stays there after the camera moves on,
// and later joins other threads into a braid. It is deliberately ONE object with
// changing behaviour rather than a family of look-alikes, because the viewer's
// understanding depends on recognising, in the aerial pattern and in the braid,
// the same thing they watched come out of a phone.
//
// THE RULE THAT MUST SURVIVE EVERY EDIT: a thread never becomes a different kind
// of mark. Not an arrow when it points, not a particle when there are many, not a
// bar when it is counted. The continuity IS the explanation — if the strand in
// the braid is a new object, the viewer has to be told what it means instead of
// already knowing.
//
// The computed model lives underneath: threads carry the same `signals` the
// inference in channelLayout.ts votes over, so the braid's thickness is a count
// of real supporting evidence and "it still arrives without location" stays a
// measured fact rather than a drawn flourish.

import type { Mark } from "./channelLayout";

export interface Point {
  x: number;
  y: number;
}

export interface Thread {
  id: string;
  /** What produced it — the device, at the moment of the action. */
  fromId: string;
  /** Where it stays hooked once paid out. */
  anchor: Point;
  /** Where the source was when the thread finished paying out; the far end. */
  tail: Point;
  /** What this trace is evidence for — the same vocabulary the inference votes
   * over, so nothing on screen can disagree with what was computed. */
  signals: string[];
  /** Scene seconds at which it was emitted. */
  emittedAt: number;
}

/** How far a thread sags between its two ends, as a fraction of their distance.
 *
 * A straight line between two points is an ARROW — the exact thing the doctrine
 * bans as a default, and the thing a viewer reads as "A causes B" rather than
 * "something was left here". A hanging curve reads as a physical object with
 * weight, which is what lets it later braid without changing meaning. */
const SAG_RATIO = 0.18;

/** A thread as a cubic bezier: `[start, control1, control2, end]`.
 *
 * The two control points hang BELOW the straight line between the ends, so the
 * curve behaves like a slack cord. Returned as raw points rather than an SVG
 * string so the geometry stays testable without parsing path syntax. */
export function threadCurve(from: Point, to: Point, sag = SAG_RATIO): [Point, Point, Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const drop = distance * sag;
  return [
    from,
    { x: from.x + dx * 0.28, y: from.y + dy * 0.28 + drop },
    { x: from.x + dx * 0.72, y: from.y + dy * 0.72 + drop },
    to,
  ];
}

export function curveToPath(curve: readonly [Point, Point, Point, Point]): string {
  const [a, b, c, d] = curve;
  return `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`;
}

/** A point along the curve, by de Casteljau. Used to pay a thread out from its
 * anchor toward the moving source, so the viewer watches it being LEFT rather
 * than seeing a finished line appear. */
export function pointOnCurve(curve: readonly [Point, Point, Point, Point], t: number): Point {
  const clamped = Math.max(0, Math.min(1, t));
  const u = 1 - clamped;
  const [a, b, c, d] = curve;
  return {
    x: u * u * u * a.x + 3 * u * u * clamped * b.x + 3 * u * clamped * clamped * c.x + clamped * clamped * clamped * d.x,
    y: u * u * u * a.y + 3 * u * u * clamped * b.y + 3 * u * clamped * clamped * c.y + clamped * clamped * clamped * d.y,
  };
}

/** The visible part of a thread while it is still paying out.
 *
 * Subdivides rather than trimming the control points: a bezier's control points
 * are not on the curve, so interpolating toward them would make the growing end
 * drift off the path the finished thread will occupy — the thread would appear
 * to move sideways as it finished, which is exactly the kind of thing that stops
 * it reading as one continuous object. */
export function partialCurve(curve: readonly [Point, Point, Point, Point], progress: number): Point[] {
  const steps = 24;
  const end = Math.max(0, Math.min(1, progress));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) points.push(pointOnCurve(curve, (i / steps) * end));
  return points;
}

export function pointsToPath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

/** Where a thread's free end sits while the threads gather.
 *
 * The ANCHOR never moves — the thing that happened, happened in a place, and a
 * trace sliding off the doorway it belongs to would quietly undo the causal
 * reading the whole journey is built on. Only the free end travels. */
export function gatheringCurve(thread: Thread, meetAt: Point, progress: number): [Point, Point, Point, Point] {
  const t = Math.max(0, Math.min(1, progress));
  const tail = {
    x: thread.tail.x + (meetAt.x - thread.tail.x) * t,
    y: thread.tail.y + (meetAt.y - thread.tail.y) * t,
  };
  // The sag relaxes as the threads pull together, so a gathered bundle reads as
  // taut rather than as a heap of slack curves.
  return threadCurve(thread.anchor, tail, SAG_RATIO * (1 - t * 0.7));
}

/** How thick the braid is: a real count of what is in it, never a constant.
 *
 * This is where the computed model reaches the screen. Cutting a channel removes
 * threads, and the braid MUST visibly thin — if thickness were authored, the
 * closing beat would be a claim rather than a consequence. */
export function braidThickness(strandCount: number, perStrand = 2.4, base = 1.6): number {
  return base + Math.max(0, strandCount) * perStrand;
}

/** The braid's own path, continuing from where the threads meet.
 *
 * Deliberately the SAME curve function as a single thread. A braid is a thicker
 * thread, not a new kind of line — which is what lets a viewer who has been
 * following one strand understand the bundle without being told. */
export function braidCurve(meetAt: Point, to: Point): [Point, Point, Point, Point] {
  return threadCurve(meetAt, to, SAG_RATIO * 0.55);
}

/** A small sideways wobble along the braid, so it reads as several things twisted
 * together rather than one fat stroke. Amplitude scales with the strand count and
 * dies to nothing at both ends. */
export function braidWobble(curve: readonly [Point, Point, Point, Point], strandCount: number, samples = 40): Point[] {
  const amplitude = Math.min(9, 1.2 + strandCount * 0.6);
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = pointOnCurve(curve, t);
    const taper = Math.sin(Math.PI * t);
    points.push({ x: point.x, y: point.y + Math.sin(t * Math.PI * strandCount) * amplitude * taper });
  }
  return points;
}

/** Builds the episode's threads from the SAME marks the inference votes over.
 *
 * One source of truth: a trace that supports the conclusion is a thread that
 * joins the braid, because both facts come from the identical `signals` array.
 * A separate hand-authored thread list would let the picture and the computation
 * drift apart, which is the failure this project keeps rediscovering. */
export function threadsFromMarks(marks: readonly Mark[], placeOf: (mark: Mark) => Point, sourceOf: (mark: Mark) => Point): Thread[] {
  return marks.map((mark, index) => ({
    id: `t${index}`,
    fromId: mark.channel,
    anchor: placeOf(mark),
    tail: sourceOf(mark),
    signals: mark.signals,
    emittedAt: mark.at,
  }));
}
