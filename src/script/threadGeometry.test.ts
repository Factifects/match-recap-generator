import { describe, expect, it } from "vitest";
import {
  threadCurve,
  pointOnCurve,
  partialCurve,
  gatheringCurve,
  braidThickness,
  braidCurve,
  braidWobble,
  threadsFromMarks,
  type Thread,
} from "./threadGeometry";
import type { Mark } from "./channelLayout";

const A = { x: 100, y: 400 };
const B = { x: 700, y: 300 };

function thread(overrides: Partial<Thread> = {}): Thread {
  return { id: "t0", fromId: "phone", anchor: A, tail: B, signals: ["running"], emittedAt: 8, ...overrides };
}

describe("thread — it hangs, it does not point", () => {
  it("starts and ends exactly where it is hooked", () => {
    const curve = threadCurve(A, B);
    expect(curve[0]).toEqual(A);
    expect(curve[3]).toEqual(B);
  });

  it("sags below the straight line, so it reads as a cord rather than an arrow", () => {
    const curve = threadCurve(A, B);
    const middle = pointOnCurve(curve, 0.5);
    const straightY = (A.y + B.y) / 2;
    expect(middle.y).toBeGreaterThan(straightY);
  });
});

describe("thread — paying out", () => {
  it("grows from its anchor and never jumps off its own path", () => {
    // The fault this prevents: interpolating toward the bezier's control points
    // (which are not on the curve) makes the growing end drift sideways as it
    // finishes, so the thread appears to move rather than to be left behind.
    const curve = threadCurve(A, B);
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      const points = partialCurve(curve, progress);
      const last = points[points.length - 1];
      const expected = pointOnCurve(curve, progress);
      expect(last.x).toBeCloseTo(expected.x, 6);
      expect(last.y).toBeCloseTo(expected.y, 6);
    }
  });

  it("is a single point at the anchor before it has paid out at all", () => {
    const points = partialCurve(threadCurve(A, B), 0);
    expect(points.every((p) => p.x === A.x && p.y === A.y)).toBe(true);
  });

  it("gets monotonically longer", () => {
    const curve = threadCurve(A, B);
    const lengthAt = (progress: number) => {
      const points = partialCurve(curve, progress);
      let total = 0;
      for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      return total;
    };
    let previous = -1;
    for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const length = lengthAt(progress);
      expect(length).toBeGreaterThanOrEqual(previous);
      previous = length;
    }
  });
});

describe("thread — gathering", () => {
  it("never moves the anchor, however far the free end travels", () => {
    // A trace sliding off the doorway it belongs to would undo the causal
    // reading the whole journey is built on.
    const meet = { x: 400, y: 200 };
    for (const progress of [0, 0.5, 1]) {
      expect(gatheringCurve(thread(), meet, progress)[0]).toEqual(A);
    }
  });

  it("brings the free end all the way to the meeting point", () => {
    const meet = { x: 400, y: 200 };
    const curve = gatheringCurve(thread(), meet, 1);
    expect(curve[3].x).toBeCloseTo(meet.x, 6);
    expect(curve[3].y).toBeCloseTo(meet.y, 6);
  });

  it("leaves the free end untouched before gathering starts", () => {
    expect(gatheringCurve(thread(), { x: 400, y: 200 }, 0)[3]).toEqual(B);
  });
});

describe("braid — thickness is a count, not a constant", () => {
  it("gets thicker with every strand in it", () => {
    expect(braidThickness(6)).toBeGreaterThan(braidThickness(4));
    expect(braidThickness(4)).toBeGreaterThan(braidThickness(1));
  });

  it("visibly thins when a channel is cut, which is the closing beat", () => {
    // Six traces become four when location is switched off. If thickness were
    // authored rather than counted, that beat would be a claim.
    const before = braidThickness(6);
    const after = braidThickness(4);
    expect(before - after).toBeGreaterThan(3);
  });

  it("is still drawn when only one strand is left", () => {
    expect(braidThickness(1)).toBeGreaterThan(0);
  });

  it("uses the same curve shape as a single thread, so it reads as one", () => {
    const meet = { x: 300, y: 300 };
    const end = { x: 900, y: 250 };
    expect(braidCurve(meet, end)[0]).toEqual(meet);
    expect(braidCurve(meet, end)[3]).toEqual(end);
  });

  it("wobbles in the middle and is smooth at both ends", () => {
    const curve = braidCurve({ x: 300, y: 300 }, { x: 900, y: 300 });
    const points = braidWobble(curve, 6);
    const plain = (t: number) => pointOnCurve(curve, t);
    expect(Math.abs(points[0].y - plain(0).y)).toBeLessThan(0.001);
    expect(Math.abs(points[points.length - 1].y - plain(1).y)).toBeLessThan(0.001);
    const middleDeviation = Math.max(...points.slice(10, 30).map((p, i) => Math.abs(p.y - plain((i + 10) / 40).y)));
    expect(middleDeviation).toBeGreaterThan(0.5);
  });
});

describe("thread — one source of truth with the inference", () => {
  it("carries the same signals the conclusion is voted from", () => {
    const marks: Mark[] = [
      { at: 8.2, channel: "location", signals: ["running"] },
      { at: 11.0, channel: "search", signals: ["cooking"] },
    ];
    const threads = threadsFromMarks(marks, () => A, () => B);
    expect(threads).toHaveLength(2);
    expect(threads[0].signals).toEqual(["running"]);
    expect(threads[1].signals).toEqual(["cooking"]);
    expect(threads[0].emittedAt).toBe(8.2);
  });

  it("lets the braid be built from exactly what supports the conclusion", () => {
    const marks: Mark[] = [
      { at: 8, channel: "location", signals: ["running"] },
      { at: 9, channel: "social", signals: ["running"] },
      { at: 11, channel: "search", signals: ["cooking"] },
    ];
    const threads = threadsFromMarks(marks, () => A, () => B);
    const supporting = threads.filter((t) => t.signals.includes("running"));
    expect(supporting).toHaveLength(2);
    expect(braidThickness(supporting.length)).toBeLessThan(braidThickness(threads.length));
  });
});
