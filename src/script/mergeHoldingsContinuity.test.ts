import { describe, expect, it } from "vitest";
import { mergeHoldingsContinuity } from "./mergeHoldingsContinuity";
import type { TimedSegment, Visual } from "../model/Segment";

type HoldingsVisual = Extract<Visual, { kind: "holdings" }>;

function holdingsVisualOf(segment: TimedSegment): HoldingsVisual {
  const visual = (segment as { visual?: Visual }).visual;
  if (!visual || visual.kind !== "holdings") throw new Error("expected a holdings visual");
  return visual;
}

function scene(text: string, options: { continues?: boolean; durationSeconds?: number; seed?: number; subject?: string; timeline?: unknown[] } = {}): TimedSegment {
  return {
    type: "statement",
    text,
    durationSeconds: options.durationSeconds ?? 10,
    continuesHoldingsFrom: options.continues || undefined,
    visual: {
      kind: "holdings",
      theme: "dark",
      seed: options.seed ?? 1,
      subject: options.subject ?? "DEVICE",
      holds: "SEGMENTS",
      timeline: options.timeline ?? [{ type: "panes", count: 4, startSeconds: 1, durationSeconds: 2 }],
    },
  } as unknown as TimedSegment;
}

describe("mergeHoldingsContinuity", () => {
  it("folds a continuing scene into its predecessor", () => {
    const { segments } = mergeHoldingsContinuity([scene("a"), scene("b", { continues: true })]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("a b");
    expect(segments[0].narrationClips?.map((c) => c.text)).toEqual(["a", "b"]);
  });

  it("leaves an unmarked run alone", () => {
    const { segments, notes } = mergeHoldingsContinuity([scene("a"), scene("b")]);
    expect(segments).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });

  it("carries the wall across the boundary as one timeline", () => {
    const { segments } = mergeHoldingsContinuity([
      scene("a", { durationSeconds: 12 }),
      scene("b", { continues: true, timeline: [{ type: "assemble", startSeconds: 2, durationSeconds: 3 }] }),
    ]);
    const timeline = holdingsVisualOf(segments[0]).timeline!;
    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toMatchObject({ type: "assemble", startSeconds: 14 });
    expect(segments[0]._holdingsClipRanges).toEqual([
      { from: 0, to: 1, appliedOffsetSeconds: 0 },
      { from: 1, to: 2, appliedOffsetSeconds: 12 },
    ]);
  });

  it("refuses a mid-passage seed change, because it would silently swap every device's holdings", () => {
    const { segments, notes } = mergeHoldingsContinuity([scene("a", { seed: 1 }), scene("b", { continues: true, seed: 9 })]);
    expect(holdingsVisualOf(segments[0]).seed).toBe(1);
    expect(notes.some((n) => n.includes("keeping the passage's population"))).toBe(true);
  });

  it("keeps the passage's own subject", () => {
    const { segments, notes } = mergeHoldingsContinuity([scene("a", { subject: "DEVICE" }), scene("b", { continues: true, subject: "PHONE" })]);
    expect(holdingsVisualOf(segments[0]).subject).toBe("DEVICE");
    expect(notes.some((n) => n.includes("one passage, one thing being counted"))).toBe(true);
  });

  it("folds a chain of four scenes into one passage", () => {
    const { segments } = mergeHoldingsContinuity([
      scene("a", { durationSeconds: 8 }),
      scene("b", { continues: true, durationSeconds: 7 }),
      scene("c", { continues: true, durationSeconds: 6 }),
      scene("d", { continues: true, durationSeconds: 5 }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].narrationClips).toHaveLength(4);
    expect(segments[0]._holdingsClipRanges?.map((r) => r.appliedOffsetSeconds)).toEqual([0, 8, 15, 21]);
  });

  it("does not fold across a different medium", () => {
    const stage = { type: "statement", text: "s", durationSeconds: 5, visual: { kind: "stage", objects: [], edges: [], timeline: [] } } as unknown as TimedSegment;
    const { segments, notes } = mergeHoldingsContinuity([stage, scene("b", { continues: true })]);
    expect(segments).toHaveLength(2);
    expect(notes.some((n) => n.includes("isn't a timeline-authored Holdings scene"))).toBe(true);
  });
});
