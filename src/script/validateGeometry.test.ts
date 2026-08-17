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

function timelineCanvasSegment(objects: CanvasObjectT[], timeline: NonNullable<CanvasData["timeline"]>): TimedSegment {
  return {
    type: "statement",
    text: "test",
    durationSeconds: 5,
    visual: { kind: "canvas", objects, timeline } as CanvasData,
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

describe("autoFixGeometry — Canvas timeline-driven checks (regression coverage for real render bugs)", () => {
  it("flags two objects that overlap once their timeline settles, even though their AUTHORED positions never overlap", () => {
    // Reproduces composeSelect.ts's real resolvePhase bug: a subject
    // authored far from a candidate label, but its own `move` action docks
    // it right on top of that label — a check that only ever looked at
    // authored (t=0) positions provably cannot catch this.
    const segments = [
      timelineCanvasSegment(
        [
          canvasObject({ id: "subject", type: "icon", x: 5, y: 50, radius: 10, label: "Subject" }),
          canvasObject({ id: "candidate", type: "label", x: 50, y: 50, label: "Candidate" }),
        ],
        [{ type: "move", id: "subject", startSeconds: 1, durationSeconds: 0.5, path: "line", to: { x: 50, y: 50 } }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "overlap" && d.message.includes("settles"))).toBe(true);
  });

  it("does NOT flag two objects whose timeline-resolved positions never overlap", () => {
    const segments = [
      timelineCanvasSegment(
        [
          canvasObject({ id: "subject", type: "icon", x: 5, y: 50, radius: 10, label: "Subject" }),
          canvasObject({ id: "candidate", type: "label", x: 90, y: 50, label: "Candidate" }),
        ],
        [{ type: "move", id: "subject", startSeconds: 1, durationSeconds: 0.5, path: "line", to: { x: 20, y: 50 } }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "overlap")).toBe(false);
  });

  it("flags an object authored at opacity:0 that only ever gets an `appear` action — appear does not restore opacity", () => {
    // Reproduces composeContinuous.ts's real depth-gauge bug directly.
    const segments = [
      timelineCanvasSegment(
        [canvasObject({ id: "gauge", type: "dot", x: 50, y: 20, opacity: 0, label: "0 waiting" })],
        [{ type: "appear", id: "gauge", startSeconds: 1 }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "never-visible" && d.message.includes("gauge"))).toBe(true);
  });

  it("does NOT flag an opacity:0 object that a `move` action actually reveals", () => {
    const segments = [
      timelineCanvasSegment(
        [canvasObject({ id: "gauge", type: "dot", x: 50, y: 20, opacity: 0, label: "0 waiting" })],
        [{ type: "move", id: "gauge", startSeconds: 1, durationSeconds: 0.1, path: "line", opacity: 1 }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "never-visible")).toBe(false);
  });

  it("flags an icon/dot object with a label that ends up too close to the bottom edge (caption clipping)", () => {
    // Reproduces composeSelect.ts's real eject-position bug: y:92 clipped
    // the "Payment" caption off the bottom of a real render.
    const segments = [
      timelineCanvasSegment(
        [canvasObject({ id: "subject", type: "icon", x: 8, y: 50, radius: 10, label: "Payment" })],
        [{ type: "move", id: "subject", startSeconds: 1, durationSeconds: 0.5, path: "line", to: { x: 8, y: 92 } }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "caption-clipping")).toBe(true);
  });

  it("does NOT flag an icon/dot object that stays within safe caption headroom", () => {
    const segments = [
      timelineCanvasSegment(
        [canvasObject({ id: "subject", type: "icon", x: 8, y: 50, radius: 10, label: "Payment" })],
        [{ type: "move", id: "subject", startSeconds: 1, durationSeconds: 0.5, path: "line", to: { x: 8, y: 78 } }],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "caption-clipping")).toBe(false);
  });

  it("flags two objects whose motion paths cross mid-transit, even though neither their authored start nor their settled end overlaps", () => {
    // Reproduces a real render bug: a CTA scene sent four icons out from
    // nearby points toward four different quadrants via `path: "arc"` moves.
    // Neither endpoint overlapped, but the arcs crossed mid-flight and
    // visibly collided on screen. Minimal repro here: two icons literally
    // swap places on the same horizontal line over the same window, which
    // puts them exactly on top of each other at the midpoint.
    const segments = [
      timelineCanvasSegment(
        [
          canvasObject({ id: "left-to-right", type: "icon", x: 20, y: 50, radius: 10, label: "A" }),
          canvasObject({ id: "right-to-left", type: "icon", x: 80, y: 50, radius: 10, label: "B" }),
        ],
        [
          { type: "move", id: "left-to-right", startSeconds: 1, durationSeconds: 1, path: "line", to: { x: 80, y: 50 } },
          { type: "move", id: "right-to-left", startSeconds: 1, durationSeconds: 1, path: "line", to: { x: 20, y: 50 } },
        ],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "overlap" && d.message.includes("mid-motion"))).toBe(true);
  });

  it("does NOT flag two objects moving in parallel that never cross", () => {
    const segments = [
      timelineCanvasSegment(
        [
          canvasObject({ id: "top-row", type: "icon", x: 20, y: 30, radius: 8, label: "A" }),
          canvasObject({ id: "bottom-row", type: "icon", x: 20, y: 70, radius: 8, label: "B" }),
        ],
        [
          { type: "move", id: "top-row", startSeconds: 1, durationSeconds: 1, path: "line", to: { x: 80, y: 30 } },
          { type: "move", id: "bottom-row", startSeconds: 1, durationSeconds: 1, path: "line", to: { x: 80, y: 70 } },
        ],
      ),
    ];
    const { diagnostics } = autoFixGeometry(segments);
    expect(diagnostics.some((d) => d.category === "overlap" && d.message.includes("mid-motion"))).toBe(false);
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
