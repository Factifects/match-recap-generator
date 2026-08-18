import { describe, expect, it } from "vitest";
import { mergeStageContinuity } from "./mergeStageContinuity";
import type { TimedSegment, Visual } from "../model/Segment";

type StageVisual = Extract<Visual, { kind: "stage" }>;

/** The merge only ever produces statement segments carrying a stage visual;
 * this narrows for assertions without repeating the Extract at every site. */
function stageVisualOf(segment: TimedSegment): StageVisual {
  const visual = (segment as { visual?: Visual }).visual;
  if (!visual || visual.kind !== "stage") throw new Error("expected a stage visual");
  return visual;
}

function stageScene(text: string, objects: string[], startAt: number, continues = false): TimedSegment {
  return {
    type: "statement",
    text,
    durationSeconds: 10,
    continuesStageFrom: continues || undefined,
    visual: {
      kind: "stage",
      objects: objects.map((id) => ({ id, kind: "service" as const, label: id, at: "center" as const })),
      edges: [],
      timeline: [{ type: "appear" as never, id: objects[0], startSeconds: startAt, durationSeconds: 0.5 } as never],
    },
  } as unknown as TimedSegment;
}

describe("mergeStageContinuity", () => {
  it("folds a continuing scene into its predecessor", () => {
    const { segments, notes } = mergeStageContinuity([stageScene("a", ["api"], 0), stageScene("b", ["db"], 1, true)]);
    expect(segments).toHaveLength(1);
    expect(notes).toHaveLength(1);
    expect(segments[0].text).toBe("a b");
  });

  it("unions objects across the passage so entities persist", () => {
    const { segments } = mergeStageContinuity([stageScene("a", ["api"], 0), stageScene("b", ["db"], 1, true)]);
    const visual = stageVisualOf(segments[0]);
    expect(visual.objects.map((o) => o.id).sort()).toEqual(["api", "db"]);
  });

  it("lets the FIRST declaration win when a scene redeclares an entity", () => {
    const first = stageScene("a", ["api"], 0);
    const second = stageScene("b", ["api"], 1, true);
    // A copy-pasted redeclaration must not silently reset the established world.
    stageVisualOf(second).objects[0].label = "RESET";
    const { segments } = mergeStageContinuity([first, second]);
    const visual = stageVisualOf(segments[0]);
    expect(visual.objects).toHaveLength(1);
    expect(visual.objects[0].label).toBe("api");
  });

  it("concatenates timelines unshifted and records one clip range per scene", () => {
    const { segments } = mergeStageContinuity([stageScene("a", ["api"], 0), stageScene("b", ["db"], 1, true)]);
    const visual = stageVisualOf(segments[0]);
    expect(visual.timeline).toHaveLength(2);
    expect(visual.timeline![1].startSeconds).toBe(1);
    expect(segments[0]._stageClipRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
  });

  it("keeps one narration clip per original scene", () => {
    const { segments } = mergeStageContinuity([stageScene("a", ["api"], 0), stageScene("b", ["db"], 1, true)]);
    expect(segments[0].narrationClips?.map((c) => c.text)).toEqual(["a", "b"]);
  });

  it("folds a chain of three", () => {
    const { segments } = mergeStageContinuity([
      stageScene("a", ["api"], 0),
      stageScene("b", ["db"], 1, true),
      stageScene("c", ["cache"], 2, true),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]._stageClipRanges).toHaveLength(3);
  });

  it("leaves a scene alone when its predecessor is not a Stage, and says so", () => {
    const notStage = { type: "statement", text: "x", durationSeconds: 5 } as unknown as TimedSegment;
    const { segments, notes } = mergeStageContinuity([notStage, stageScene("b", ["db"], 1, true)]);
    expect(segments).toHaveLength(2);
    expect(notes[0]).toContain("isn't a timeline-authored Stage");
  });

  it("is a no-op when nothing continues", () => {
    const { segments, notes } = mergeStageContinuity([stageScene("a", ["api"], 0), stageScene("b", ["db"], 1)]);
    expect(segments).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });
});
