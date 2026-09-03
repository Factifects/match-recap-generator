import { describe, it, expect } from "vitest";
import {
  arcPoint,
  moveWithWeight,
  overlapOffsets,
  springSettle,
  squashOnImpact,
  staggerDelay,
  trail,
} from "./choreography";

describe("moveWithWeight", () => {
  const sample = (frame: number) => moveWithWeight(frame, 0, 30, 0, 100);

  it("holds its endpoints exactly", () => {
    // A move that does not land precisely on its mark is worse than no
    // choreography — every downstream position depends on the final value.
    expect(sample(0)).toBe(0);
    expect(sample(30)).toBe(100);
    expect(sample(60)).toBe(100);
  });

  it("winds up AGAINST the direction of travel before moving", () => {
    // Anticipation. The object gathers itself first; without this the move
    // reads as a value being interpolated rather than a decision to move.
    expect(sample(3)).toBeLessThan(0);
  });

  it("overshoots the target and settles back", () => {
    // Follow-through. Nothing with mass stops dead on its mark.
    const frames = Array.from({ length: 31 }, (_, f) => sample(f));
    expect(Math.max(...frames)).toBeGreaterThan(100);
    expect(frames[30]).toBe(100);
  });

  it("winds up and overshoots in the correct directions when travelling backwards", () => {
    // The wind-up is relative to travel direction, not to screen axes — a sign
    // error here would be invisible in one direction and absurd in the other.
    const back = (frame: number) => moveWithWeight(frame, 0, 30, 100, 0);
    expect(back(3)).toBeGreaterThan(100);
    expect(Math.min(...Array.from({ length: 31 }, (_, f) => back(f)))).toBeLessThan(0);
  });

  it("can have its wind-up and overshoot turned off", () => {
    // Some moves genuinely should be dead-straight — a value ticking up, a
    // progress bar. The vocabulary has to permit restraint.
    const plain = (frame: number) => moveWithWeight(frame, 0, 30, 0, 100, { windUp: 0, overshoot: 0 });
    for (let f = 0; f <= 30; f++) {
      expect(plain(f)).toBeGreaterThanOrEqual(0);
      expect(plain(f)).toBeLessThanOrEqual(100);
    }
  });
});

describe("springSettle", () => {
  it("starts at `from` and ends exactly at `to`", () => {
    expect(springSettle(0, 0, 24, 0, 50)).toBeCloseTo(0, 6);
    expect(springSettle(24, 0, 24, 0, 50)).toBe(50);
  });

  it("oscillates around the target rather than easing into it", () => {
    // The property that distinguishes a spring from an ease: it passes the
    // target at least once on the way to settling.
    const frames = Array.from({ length: 24 }, (_, f) => springSettle(f, 0, 24, 0, 50));
    expect(Math.max(...frames)).toBeGreaterThan(50);
  });

  it("settles: later swings are smaller than earlier ones", () => {
    const deviation = (f: number) => Math.abs(springSettle(f, 0, 60, 0, 50) - 50);
    expect(deviation(40)).toBeLessThan(deviation(10));
  });
});

describe("staggerDelay", () => {
  it("gives the first item no delay and later items progressively more", () => {
    expect(staggerDelay(0, 5)).toBe(0);
    expect(staggerDelay(3, 5)).toBeGreaterThan(staggerDelay(1, 5));
  });

  it("does not stagger a group of one", () => {
    expect(staggerDelay(0, 1)).toBe(0);
  });

  it("compresses as the group grows so a cascade stays a flourish", () => {
    // Twelve items must not take four times as long to arrive as three, or the
    // stagger stops being a flourish and becomes the pace of the scene.
    const perItemSmall = staggerDelay(2, 3) / 2;
    const perItemLarge = staggerDelay(2, 12) / 2;
    expect(perItemLarge).toBeLessThanOrEqual(perItemSmall);
  });
});

describe("trail", () => {
  it("lags behind its parent rather than matching it", () => {
    const lagged = trail(100, 0, 0.6);
    expect(lagged).toBeGreaterThan(0);
    expect(lagged).toBeLessThan(100);
  });

  it("follows exactly when looseness is zero", () => {
    expect(trail(100, 0, 0)).toBe(100);
  });

  it("never runs ahead of its parent", () => {
    for (const looseness of [0, 0.3, 0.6, 0.95, 5]) {
      expect(trail(100, 0, looseness)).toBeLessThanOrEqual(100);
    }
  });
});

describe("squashOnImpact", () => {
  it("is neutral before the impact and after recovery", () => {
    expect(squashOnImpact(0, 10)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(squashOnImpact(40, 10)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("conserves volume — it widens exactly as much as it flattens", () => {
    // What keeps the deformation reading as elastic instead of as a resize.
    const { scaleX, scaleY } = squashOnImpact(11, 10);
    expect(scaleX + scaleY).toBeCloseTo(2, 6);
  });

  it("deforms immediately on impact", () => {
    expect(squashOnImpact(10.5, 10).scaleX).not.toBe(1);
  });
});

describe("arcPoint", () => {
  it("hits both endpoints", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    expect(arcPoint(0, from, to)).toEqual(from);
    expect(arcPoint(1, from, to).x).toBeCloseTo(100, 6);
  });

  it("bows off the straight line at the midpoint", () => {
    // Almost nothing physical travels along a chord; a straight path is the
    // most mechanical-reading thing in interpolated motion.
    const mid = arcPoint(0.5, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(Math.abs(mid.y)).toBeGreaterThan(1);
  });

  it("handles a zero-length move without dividing by zero", () => {
    expect(arcPoint(0.5, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });
});

describe("overlapOffsets", () => {
  it("staggers an object's own properties so it arrives in parts", () => {
    // A box whose position, scale and opacity all resolve on the same frame
    // reads as one property changing, not as a thing arriving.
    const { position, scale, opacity } = overlapOffsets(20);
    expect(position).toBe(0);
    expect(scale).toBeGreaterThan(position);
    expect(opacity).toBeGreaterThan(scale);
  });
});
