import { describe, expect, it } from "vitest";
import { mergeDiagramContinuity } from "./mergeDiagramContinuity";
import type { TimedSegment } from "../model/Segment";

function diagramSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 10,
    visual: {
      kind: "diagram",
      nodes: [{ id: "client", label: "Client" }],
      edges: [],
      timeline: [{ type: "addNode", id: "client", startSeconds: 0.2, durationSeconds: 0.5 }],
    },
    ...overrides,
  } as TimedSegment;
}

function nonTimelineDiagramSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 8,
    visual: {
      kind: "diagram",
      nodes: [{ id: "client", label: "Client" }],
      edges: [],
    },
    ...overrides,
  } as TimedSegment;
}

function nonDiagramSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 3,
    visual: { kind: "single-stat", title: "Stat", value: 5 },
    ...overrides,
  } as TimedSegment;
}

describe("mergeDiagramContinuity", () => {
  it("leaves segments with no continuesDiagramFrom flag untouched", () => {
    const segments = [diagramSegment({ text: "One" }), diagramSegment({ text: "Two" })];
    const { segments: merged, notes } = mergeDiagramContinuity(segments);
    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });

  it("folds a continuesDiagramFrom scene into its timeline Diagram predecessor", () => {
    const first = diagramSegment({ text: "First beat" });
    const second = diagramSegment({ text: "Second beat", continuesDiagramFrom: true });
    const { segments: merged, notes } = mergeDiagramContinuity([first, second]);

    expect(merged).toHaveLength(1);
    expect(notes).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "diagram") throw new Error("expected a diagram statement segment");

    expect(result.visual.timeline).toHaveLength(2);
    expect(result.visual.nodes).toHaveLength(1); // same id "client" in both — deduped, not duplicated

    expect(result.narrationClips).toHaveLength(2);
    expect(result.narrationClips?.[0].text).toBe("First beat");
    expect(result.narrationClips?.[1].text).toBe("Second beat");
    expect(result.durationSeconds).toBe(20); // 10 + 10, pre-audio placeholder sum
    expect(result._diagramClipRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
  });

  it("folds a chain of 3+ continuesDiagramFrom scenes into one segment, unioning new node/edge ids", () => {
    const segments = [
      diagramSegment({ text: "A" }),
      diagramSegment({
        text: "B",
        continuesDiagramFrom: true,
        visual: {
          kind: "diagram",
          nodes: [{ id: "service", label: "Service" }],
          edges: [{ from: "client", to: "service", kind: "request", style: "solid" }],
          timeline: [{ type: "addNode", id: "service", startSeconds: 0.2, durationSeconds: 0.5 }],
        },
      }),
      diagramSegment({ text: "C", continuesDiagramFrom: true }),
    ];
    const { segments: merged } = mergeDiagramContinuity(segments);
    expect(merged).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "diagram") throw new Error("expected a diagram statement segment");
    expect(result.visual.timeline).toHaveLength(3);
    expect(result.visual.nodes.map((n) => n.id)).toEqual(["client", "service"]); // "client" from A/C, "service" newly introduced by B
    expect(result.visual.edges).toHaveLength(1);
    expect(result.narrationClips).toHaveLength(3);
    expect(result._diagramClipRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
  });

  it("does not merge when continuesDiagramFrom is set but the predecessor isn't a timeline Diagram", () => {
    const first = nonDiagramSegment({ text: "Stat card" });
    const second = diagramSegment({ text: "Diagram scene", continuesDiagramFrom: true });
    const { segments: merged, notes } = mergeDiagramContinuity([first, second]);

    expect(merged).toHaveLength(2); // graceful no-op, not an error
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/isn't a timeline-authored Diagram/);
  });

  it("does not merge when continuesDiagramFrom is set but THIS scene isn't a timeline Diagram", () => {
    const first = diagramSegment({ text: "Diagram scene" });
    const second = nonTimelineDiagramSegment({ text: "Snapshot-only diagram", continuesDiagramFrom: true });
    const { segments: merged, notes } = mergeDiagramContinuity([first, second]);

    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(1);
  });

  it("keeps the earlier node's own definition when a later scene redeclares the same id", () => {
    const first = diagramSegment({
      text: "First",
      visual: {
        kind: "diagram",
        nodes: [{ id: "service", label: "Orders Service", accent: "neutral" }],
        edges: [],
        timeline: [{ type: "addNode", id: "service", startSeconds: 0.2, durationSeconds: 0.5 }],
      },
    });
    const second = diagramSegment({
      text: "Second",
      continuesDiagramFrom: true,
      visual: {
        kind: "diagram",
        // Same id, different accent — a script author copy-pasting the
        // previous scene's Data as a starting point rather than authoring a
        // proper setState event; continuity means this is ignored.
        nodes: [{ id: "service", label: "Orders Service", accent: "danger" }],
        edges: [],
        timeline: [{ type: "setState", id: "service", accent: "danger", startSeconds: 0.2 }],
      },
    });
    const { segments: merged } = mergeDiagramContinuity([first, second]);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "diagram") throw new Error("expected a diagram statement segment");
    expect(result.visual.nodes).toHaveLength(1);
    expect(result.visual.nodes[0].accent).toBe("neutral"); // first declaration wins — the setState event is what actually recolors it at render time
  });
});
