import { describe, expect, it } from "vitest";
import { mergeCanvasContinuity } from "./mergeCanvasContinuity";
import type { TimedSegment } from "../model/Segment";

function canvasSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 4,
    visual: {
      kind: "canvas",
      objects: [{ id: "a", type: "dot", x: 50, y: 50, rotation: 0, scale: 1, opacity: 1, filled: true, layer: 0, enter: "fade", exit: "none", easing: "easeOut", idle: "none", trail: false }],
    },
    ...overrides,
  } as TimedSegment;
}

function nonCanvasSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 3,
    visual: { kind: "single-stat", title: "Stat", value: 5 },
    ...overrides,
  } as TimedSegment;
}

describe("mergeCanvasContinuity", () => {
  it("leaves segments with no continuesCanvasFrom flag untouched", () => {
    const segments = [canvasSegment({ text: "One" }), canvasSegment({ text: "Two" })];
    const { segments: merged, notes } = mergeCanvasContinuity(segments);
    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });

  it("folds a continuesCanvasFrom scene into its Canvas predecessor", () => {
    const first = canvasSegment({ text: "First beat" });
    const second = canvasSegment({ text: "Second beat", continuesCanvasFrom: true });
    const { segments: merged, notes } = mergeCanvasContinuity([first, second]);

    expect(merged).toHaveLength(1);
    expect(notes).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "canvas") throw new Error("expected a canvas statement segment");

    // First scene's own object stays as the top-level (phase 0) content;
    // second scene's object becomes phase 0 of the appended `phases` array.
    expect(result.visual.objects[0].id).toBe("a");
    expect(result.visual.phases).toHaveLength(1);
    expect(result.visual.phases?.[0].objects[0].id).toBe("a");

    expect(result.narrationClips).toHaveLength(2);
    expect(result.narrationClips?.[0].text).toBe("First beat");
    expect(result.narrationClips?.[1].text).toBe("Second beat");
    expect(result.durationSeconds).toBe(8); // 4 + 4, pre-audio placeholder sum
    expect(result._canvasClipBoundaries).toEqual([0]); // one boundary phase, at phases[0]
  });

  it("folds a chain of 3+ continuesCanvasFrom scenes into one segment", () => {
    const segments = [
      canvasSegment({ text: "A" }),
      canvasSegment({ text: "B", continuesCanvasFrom: true }),
      canvasSegment({ text: "C", continuesCanvasFrom: true }),
    ];
    const { segments: merged } = mergeCanvasContinuity(segments);
    expect(merged).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "canvas") throw new Error("expected a canvas statement segment");
    expect(result.visual.phases).toHaveLength(2);
    expect(result.narrationClips).toHaveLength(3);
    expect(result._canvasClipBoundaries).toEqual([0, 1]);
  });

  it("does not merge when continuesCanvasFrom is set but the predecessor isn't a Canvas visual", () => {
    const first = nonCanvasSegment({ text: "Stat card" });
    const second = canvasSegment({ text: "Canvas scene", continuesCanvasFrom: true });
    const { segments: merged, notes } = mergeCanvasContinuity([first, second]);

    expect(merged).toHaveLength(2); // graceful no-op, not an error
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/isn't a Canvas visual/);
  });

  it("does not merge when continuesCanvasFrom is set but THIS scene isn't a Canvas visual", () => {
    const first = canvasSegment({ text: "Canvas scene" });
    const second = nonCanvasSegment({ text: "Stat card", continuesCanvasFrom: true });
    const { segments: merged, notes } = mergeCanvasContinuity([first, second]);

    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(1);
  });

  it("resolves each sub-scene's own captions to absolute seconds within its own span before concatenating", () => {
    const first = canvasSegment({ text: "First", durationSeconds: 10, phases: [{ caption: "Hello" }] });
    const second = canvasSegment({
      text: "Second",
      durationSeconds: 6,
      continuesCanvasFrom: true,
      phases: [{ caption: "World" }],
    });
    const { segments: merged } = mergeCanvasContinuity([first, second]);
    const result = merged[0];

    expect(result.phases).toHaveLength(2);
    expect(result.phases?.[0]).toMatchObject({ caption: "Hello", startSeconds: 0 });
    expect(result.phases?.[1]).toMatchObject({ caption: "World", startSeconds: 0 });
    expect(result._canvasCaptionRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
  });
});
