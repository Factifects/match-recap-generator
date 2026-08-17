import { describe, expect, it } from "vitest";
import { autoCardSizePercent, boundaryPoint, type ObjectShape } from "./Canvas";

// Reference frame for every test below — arbitrary but realistic (1080p
// 16:9), since the functions under test work in real pixels internally
// before converting back to canvas-percent.
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const SIZE_SCALE = 0.84;

describe("autoCardSizePercent — Canvas's answer to diagramLayout.ts's sizeNode", () => {
  it("sizes wider for a longer label", () => {
    const short = autoCardSizePercent("OK", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE);
    const long = autoCardSizePercent("GET /users/42/refund-status", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("never shrinks below a legible minimum, even for a one-character label", () => {
    const tiny = autoCardSizePercent("1", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE);
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });

  it("handles an empty/undefined label without throwing", () => {
    expect(() => autoCardSizePercent(undefined, CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE)).not.toThrow();
    expect(() => autoCardSizePercent("", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE)).not.toThrow();
  });

  it("returns height independent of label length (single-line card, fixed row height)", () => {
    const short = autoCardSizePercent("OK", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE);
    const long = autoCardSizePercent("SELECT * FROM users WHERE id = 42", CANVAS_WIDTH, CANVAS_HEIGHT, SIZE_SCALE);
    expect(long.height).toBeCloseTo(short.height, 5);
  });
});

describe("boundaryPoint — Canvas's answer to diagramLayout.ts's anchorBox", () => {
  it("anchors a circle-shaped object at its radius, not its centre", () => {
    const shape: ObjectShape = { cx: 100, cy: 100, kind: "circle", rPx: 30 };
    const [x, y] = boundaryPoint(shape, 200, 100); // approaching from the right
    expect(x).toBeCloseTo(130, 1); // centre + radius along the approach direction
    expect(y).toBeCloseTo(100, 1);
  });

  it("anchors a rect-shaped object at its edge, not its centre", () => {
    const shape: ObjectShape = { cx: 100, cy: 100, kind: "rect", wPx: 80, hPx: 40 };
    const [x, y] = boundaryPoint(shape, 500, 100); // approaching from directly the right
    expect(x).toBeCloseTo(140, 1); // centre + half-width
    expect(y).toBeCloseTo(100, 1);
  });

  it("picks the nearer face when approaching a rect diagonally", () => {
    // A wide, short rect approached from directly above should exit through
    // its TOP face (the short axis), not its side.
    const shape: ObjectShape = { cx: 100, cy: 100, kind: "rect", wPx: 200, hPx: 40 };
    const [, y] = boundaryPoint(shape, 100, -1000);
    expect(y).toBeCloseTo(80, 1); // centre - half-height
  });

  it("falls back to the centre when the two points coincide (no defined direction)", () => {
    const shape: ObjectShape = { cx: 50, cy: 50, kind: "circle", rPx: 10 };
    const [x, y] = boundaryPoint(shape, 50, 50);
    expect(x).toBe(50);
    expect(y).toBe(50);
  });
});
