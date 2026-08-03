import { describe, expect, it, vi } from "vitest";
import { autoFixGeometry } from "./validateGeometry";
import { parseSceneScript } from "./parseSceneScript";
import { resolveObjectPosition, estimateObjectBoundingBox, boxesOverlap } from "../video/canvasLayout";
import { CANVAS_ANCHOR_POSITIONS } from "../model/visualDefinitions";
import type { TimedSegment } from "../model/Segment";
import type { CanvasData } from "../video/sharedVisualProps";

type CanvasObjectT = CanvasData["objects"][number];

function canvasObject(overrides: Partial<CanvasObjectT> & { id: string; type: CanvasObjectT["type"] }): CanvasObjectT {
  return overrides as CanvasObjectT;
}

function canvasSegment(objects: CanvasObjectT[], phases?: CanvasData["phases"]): TimedSegment {
  return {
    type: "statement",
    text: "test",
    durationSeconds: 5,
    visual: { kind: "canvas", objects, ...(phases ? { phases } : {}) } as CanvasData,
  };
}

describe("canvasLayout — resolveObjectPosition", () => {
  it("resolves from an explicit x/y", () => {
    const object = canvasObject({ id: "a", type: "dot", x: 12, y: 34 });
    expect(resolveObjectPosition(object)).toEqual({ x: 12, y: 34 });
  });

  it("resolves from a named anchor when x/y are absent", () => {
    const object = canvasObject({ id: "a", type: "dot", anchor: "topCenter" });
    expect(resolveObjectPosition(object)).toEqual(CANVAS_ANCHOR_POSITIONS.topCenter);
  });

  it("prefers explicit x/y over anchor when both are somehow present", () => {
    const object = canvasObject({ id: "a", type: "dot", anchor: "topCenter", x: 5, y: 5 });
    expect(resolveObjectPosition(object)).toEqual({ x: 5, y: 5 });
  });
});

describe("canvasLayout — estimateObjectBoundingBox / boxesOverlap", () => {
  it("flags two overlapping rectangles", () => {
    const a = estimateObjectBoundingBox(canvasObject({ id: "a", type: "roundedRectangle", width: 20, height: 10 }), 50, 50);
    const b = estimateObjectBoundingBox(canvasObject({ id: "b", type: "roundedRectangle", width: 20, height: 10 }), 55, 50);
    expect(boxesOverlap(a, b)).toBe(true);
  });

  it("does not flag two clearly separated rectangles", () => {
    const a = estimateObjectBoundingBox(canvasObject({ id: "a", type: "roundedRectangle", width: 10, height: 10 }), 10, 50);
    const b = estimateObjectBoundingBox(canvasObject({ id: "b", type: "roundedRectangle", width: 10, height: 10 }), 90, 50);
    expect(boxesOverlap(a, b)).toBe(false);
  });
});

describe("autoFixGeometry — Canvas overlap", () => {
  it("nudges and logs two objects placed at the identical position", () => {
    const segments = [
      canvasSegment([
        canvasObject({ id: "a", type: "dot", x: 50, y: 50, label: "A" }),
        canvasObject({ id: "b", type: "dot", x: 50, y: 50, label: "B" }),
      ]),
    ];
    const { segments: fixed, fixes } = autoFixGeometry(segments);
    expect(fixes.some((f) => f.includes('"b"') && f.includes("same position"))).toBe(true);
    const visual = fixed[0].type === "statement" ? (fixed[0].visual as CanvasData) : undefined;
    const b = visual?.objects.find((o) => o.id === "b");
    expect(b?.x).not.toBe(50);
    expect(b?.y).not.toBe(50);
    // The untouched object stays exactly where it was authored.
    const a = visual?.objects.find((o) => o.id === "a");
    expect(a).toMatchObject({ x: 50, y: 50 });
  });

  it("flags (via console.warn) but does NOT move two merely-close, non-identical objects", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const segments = [
      canvasSegment([
        canvasObject({ id: "a", type: "roundedRectangle", x: 40, y: 50, width: 20, height: 10 }),
        canvasObject({ id: "b", type: "roundedRectangle", x: 50, y: 50, width: 20, height: 10 }),
      ]),
    ];
    const { segments: fixed, fixes } = autoFixGeometry(segments);
    expect(fixes).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("possible overlap");
    const visual = fixed[0].type === "statement" ? (fixed[0].visual as CanvasData) : undefined;
    expect(visual?.objects.find((o) => o.id === "a")).toMatchObject({ x: 40, y: 50 });
    expect(visual?.objects.find((o) => o.id === "b")).toMatchObject({ x: 50, y: 50 });
    warnSpy.mockRestore();
  });

  it("produces zero fixes and zero warnings for a normal, non-overlapping scene", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const segments = [
      canvasSegment([
        canvasObject({ id: "a", type: "dot", x: 15, y: 20, label: "A" }),
        canvasObject({ id: "b", type: "dot", x: 85, y: 80, label: "B" }),
        canvasObject({ id: "c", type: "label", anchor: "bottomCenter", label: "Caption" }),
      ]),
    ];
    const { fixes } = autoFixGeometry(segments);
    expect(fixes).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("checks overlap independently within each Canvas phase", () => {
    const segments = [
      canvasSegment(
        [canvasObject({ id: "a", type: "dot", x: 20, y: 20 }), canvasObject({ id: "b", type: "dot", x: 80, y: 80 })],
        [{ objects: [canvasObject({ id: "a", type: "dot", x: 50, y: 50 }), canvasObject({ id: "b", type: "dot", x: 50, y: 50 })] }],
      ),
    ];
    const { fixes } = autoFixGeometry(segments);
    // Phase 0 (top-level objects) is fine; the SECOND phase has the
    // identical-position collision, so exactly one nudge fix is expected,
    // labeled against phase 2 specifically.
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toContain("phase 2");
  });
});

describe("parseSceneScript — Canvas anchor field", () => {
  it("accepts an object authored with `anchor` instead of x/y", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** Anchor-authored object.

**Data:** {"objects":[{"id":"a","type":"dot","anchor":"middleCenter","label":"Hi"}]}

**Duration:** 5 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments).toHaveLength(1);
    const segment = segments[0];
    if (segment.type !== "statement") throw new Error("expected a statement segment");
    expect(segment.visual?.kind).toBe("canvas");
  });

  it("falls back to a plain Statement when an object has neither anchor nor x/y", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** Object with no position at all.

**Data:** {"objects":[{"id":"a","type":"dot","label":"Hi"}]}

**Duration:** 5 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments).toHaveLength(1);
    const segment = segments[0];
    if (segment.type !== "statement") throw new Error("expected a statement segment");
    expect(segment.visual).toBeUndefined();
  });
});
