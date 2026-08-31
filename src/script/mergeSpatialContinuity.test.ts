import { describe, expect, it } from "vitest";
import { mergeSpatialContinuity } from "./mergeSpatialContinuity";
import type { TimedSegment, Visual } from "../model/Segment";

type SpatialVisual = Extract<Visual, { kind: "spatial" }>;

function spatialVisualOf(segment: TimedSegment): SpatialVisual {
  const visual = (segment as { visual?: Visual }).visual;
  if (!visual || visual.kind !== "spatial") throw new Error("expected a spatial visual");
  return visual;
}

interface SceneOptions {
  objects?: { id: string; kind?: string; label?: string; at?: [number, number, number] }[];
  timeline?: unknown[];
  continues?: boolean;
  durationSeconds?: number;
}

function spatialScene(text: string, options: SceneOptions = {}): TimedSegment {
  const objects = options.objects ?? [{ id: "map", kind: "livingMap" }];
  const focusId = objects[0]?.id ?? "map";
  return {
    type: "statement",
    text,
    durationSeconds: options.durationSeconds ?? 10,
    continuesSpatialFrom: options.continues || undefined,
    visual: {
      kind: "spatial",
      theme: "light",
      objects: objects.map((o) => ({ id: o.id, kind: o.kind ?? "pin", label: o.label, at: o.at ?? [0, 0, 0] })),
      timeline: options.timeline ?? [{ type: "camera", move: "frame", focus: focusId, startSeconds: 0.2, durationSeconds: 1.2 }],
    },
  } as unknown as TimedSegment;
}

describe("mergeSpatialContinuity", () => {
  it("leaves an unmarked run of scenes alone", () => {
    const { segments, notes } = mergeSpatialContinuity([spatialScene("a"), spatialScene("b")]);
    expect(segments).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });

  it("folds a continuing scene into its predecessor", () => {
    const { segments } = mergeSpatialContinuity([spatialScene("a"), spatialScene("b", { continues: true })]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("a b");
    expect(segments[0].narrationClips?.map((c) => c.text)).toEqual(["a", "b"]);
  });

  it("unions objects so an entity introduced in one scene still exists in the next", () => {
    const { segments } = mergeSpatialContinuity([
      spatialScene("a", { objects: [{ id: "map", kind: "livingMap" }] }),
      spatialScene("b", { objects: [{ id: "traveller", kind: "pin" }], continues: true }),
    ]);
    expect(spatialVisualOf(segments[0]).objects.map((o) => o.id)).toEqual(["map", "traveller"]);
  });

  it("lets the FIRST declaration win when a scene redeclares an entity, and says so", () => {
    const { segments, notes } = mergeSpatialContinuity([
      spatialScene("a", { objects: [{ id: "map", kind: "livingMap", at: [0, 0, 0] }] }),
      spatialScene("b", { objects: [{ id: "map", kind: "livingMap", at: [9, 9, 9] }], continues: true }),
    ]);
    const objects = spatialVisualOf(segments[0]).objects;
    expect(objects).toHaveLength(1);
    expect(objects[0].at).toEqual([0, 0, 0]);
    expect(notes.some((n) => n.includes("different position/label"))).toBe(true);
  });

  it("warns when a redeclaration changes an object's kind, since the actions aimed at it will silently do nothing", () => {
    const { notes } = mergeSpatialContinuity([
      spatialScene("a", { objects: [{ id: "world", kind: "plane" }] }),
      spatialScene("b", { objects: [{ id: "world", kind: "livingMap" }], continues: true }),
    ]);
    expect(notes.some((n) => n.includes("already has it as a plane"))).toBe(true);
  });

  it("shifts the folded scene's timeline by the running estimate and records what it applied", () => {
    const { segments } = mergeSpatialContinuity([
      spatialScene("a", { durationSeconds: 12 }),
      spatialScene("b", { continues: true, timeline: [{ type: "camera", move: "push", focus: "map", startSeconds: 2, durationSeconds: 3 }] }),
    ]);
    const timeline = spatialVisualOf(segments[0]).timeline!;
    // 2s into its own scene, which is 14s into the passage — so a no-audio
    // preview plays the passage in sequence instead of stacking it on frame 0.
    expect(timeline[timeline.length - 1].startSeconds).toBe(14);
    expect(segments[0]._spatialClipRanges).toEqual([
      { from: 0, to: 1, appliedOffsetSeconds: 0 },
      { from: 1, to: 2, appliedOffsetSeconds: 12 },
    ]);
  });

  it("enters a new object at ITS OWN scene rather than at the start of the passage", () => {
    // The failure this prevents: SpatialStage only hides an object at t=0 if
    // some `enter` names it, so without a synthesized entrance this traveller
    // would stand in the world for the whole first scene.
    const { segments, notes } = mergeSpatialContinuity([
      spatialScene("a", { durationSeconds: 12 }),
      spatialScene("b", { objects: [{ id: "traveller", kind: "pin" }], continues: true }),
    ]);
    const timeline = spatialVisualOf(segments[0]).timeline!;
    const entrance = timeline.find((action) => action.type === "enter");
    expect(entrance).toMatchObject({ id: "traveller", startSeconds: 12 });
    expect(notes.some((n) => n.includes("without an \"enter\""))).toBe(true);
  });

  it("does not synthesize an entrance for an object that authors its own", () => {
    const { segments } = mergeSpatialContinuity([
      spatialScene("a", { durationSeconds: 12 }),
      spatialScene("b", {
        objects: [{ id: "traveller", kind: "pin" }],
        continues: true,
        timeline: [{ type: "enter", id: "traveller", startSeconds: 4, durationSeconds: 0.7 }],
      }),
    ]);
    const entrances = spatialVisualOf(segments[0]).timeline!.filter((a) => a.type === "enter");
    expect(entrances).toHaveLength(1);
    expect(entrances[0].startSeconds).toBe(16);
  });

  it("keeps the passage's own world settings rather than the continuing scene's", () => {
    const first = spatialScene("a");
    const second = spatialScene("b", { continues: true });
    spatialVisualOf(second).theme = "dark";
    const { segments } = mergeSpatialContinuity([first, second]);
    expect(spatialVisualOf(segments[0]).theme).toBe("light");
  });

  it("notes when a continuing scene authors no camera action, since it inherits the shot", () => {
    const { notes } = mergeSpatialContinuity([
      spatialScene("a"),
      spatialScene("b", { continues: true, timeline: [{ type: "travel", id: "map", to: [1, 0, 0], startSeconds: 1, durationSeconds: 2 }] }),
    ]);
    expect(notes.some((n) => n.includes("inherits the passage's current shot"))).toBe(true);
  });

  it("folds a chain of three scenes into one passage with three clips", () => {
    const { segments } = mergeSpatialContinuity([
      spatialScene("a", { durationSeconds: 10 }),
      spatialScene("b", { continues: true, durationSeconds: 8 }),
      spatialScene("c", { continues: true, durationSeconds: 6 }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].narrationClips).toHaveLength(3);
    expect(segments[0].durationSeconds).toBe(24);
    expect(segments[0]._spatialClipRanges?.map((r) => r.appliedOffsetSeconds)).toEqual([0, 10, 18]);
  });

  it("refuses to fold across a different medium and says why, instead of dropping the scene", () => {
    const stage = { type: "statement", text: "s", durationSeconds: 5, visual: { kind: "stage", objects: [], edges: [], timeline: [] } } as unknown as TimedSegment;
    const { segments, notes } = mergeSpatialContinuity([stage, spatialScene("b", { continues: true })]);
    expect(segments).toHaveLength(2);
    expect(notes.some((n) => n.includes("isn't a timeline-authored Spatial scene"))).toBe(true);
  });

  it("flags an object-less scene that continues nothing, since its timeline has nothing to act on", () => {
    const { notes } = mergeSpatialContinuity([spatialScene("a", { objects: [] })]);
    expect(notes.some((n) => n.includes("nothing to act on"))).toBe(true);
  });

  it("says nothing about an object-less scene that DOES continue a passage — that is the normal shape", () => {
    const { notes } = mergeSpatialContinuity([spatialScene("a"), spatialScene("b", { objects: [], continues: true })]);
    expect(notes.some((n) => n.includes("nothing to act on"))).toBe(false);
  });

  it("does not fold a spatial scene that has no timeline of its own", () => {
    const { segments, notes } = mergeSpatialContinuity([spatialScene("a"), spatialScene("b", { continues: true, timeline: [] })]);
    expect(segments).toHaveLength(2);
    expect(notes.some((n) => n.includes("isn't a timeline-authored Spatial scene"))).toBe(true);
  });
});
