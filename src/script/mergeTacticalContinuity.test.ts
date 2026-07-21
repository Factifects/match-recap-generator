import { describe, expect, it } from "vitest";
import { mergeTacticalContinuity } from "./mergeTacticalContinuity";
import type { TimedSegment } from "../model/Segment";

function boardSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 10,
    visual: {
      kind: "tactical-board",
      title: "Board",
      players: [{ id: "a", x: 50, y: 50, team: "home", label: "A" }],
      timeline: [{ type: "move", actorId: "a", startSeconds: 0.3, durationSeconds: 0.6, to: { x: 60, y: 50 }, runType: "standard" }],
    },
    ...overrides,
  } as TimedSegment;
}

function nonTimelineBoardSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 8,
    visual: {
      kind: "tactical-board",
      title: "Board",
      players: [{ id: "a", x: 50, y: 50, team: "home", label: "A" }],
    },
    ...overrides,
  } as TimedSegment;
}

function nonBoardSegment(overrides: Partial<TimedSegment> & { text: string }): TimedSegment {
  return {
    type: "statement",
    durationSeconds: 3,
    visual: { kind: "single-stat", title: "Stat", value: 5 },
    ...overrides,
  } as TimedSegment;
}

describe("mergeTacticalContinuity", () => {
  it("leaves segments with no continuesBoardFrom flag untouched", () => {
    const segments = [boardSegment({ text: "One" }), boardSegment({ text: "Two" })];
    const { segments: merged, notes } = mergeTacticalContinuity(segments);
    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(0);
  });

  it("folds a continuesBoardFrom scene into its timeline TacticalBoard predecessor", () => {
    const first = boardSegment({ text: "First beat" });
    const second = boardSegment({ text: "Second beat", continuesBoardFrom: true });
    const { segments: merged, notes } = mergeTacticalContinuity([first, second]);

    expect(merged).toHaveLength(1);
    expect(notes).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "tactical-board") throw new Error("expected a tactical-board statement segment");

    expect(result.visual.timeline).toHaveLength(2);
    expect(result.visual.players).toHaveLength(1); // same id "a" in both — deduped, not duplicated

    expect(result.narrationClips).toHaveLength(2);
    expect(result.narrationClips?.[0].text).toBe("First beat");
    expect(result.narrationClips?.[1].text).toBe("Second beat");
    expect(result.durationSeconds).toBe(20); // 10 + 10, pre-audio placeholder sum
    expect(result._boardClipRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
  });

  it("folds a chain of 3+ continuesBoardFrom scenes into one segment, unioning new player ids", () => {
    const segments = [
      boardSegment({ text: "A" }),
      boardSegment({
        text: "B",
        continuesBoardFrom: true,
        visual: {
          kind: "tactical-board",
          title: "Board",
          players: [{ id: "b", x: 70, y: 50, team: "away", label: "B" }],
          timeline: [{ type: "move", actorId: "b", startSeconds: 0.2, durationSeconds: 0.5, to: { x: 65, y: 50 }, runType: "standard" }],
        },
      }),
      boardSegment({ text: "C", continuesBoardFrom: true }),
    ];
    const { segments: merged } = mergeTacticalContinuity(segments);
    expect(merged).toHaveLength(1);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "tactical-board") throw new Error("expected a tactical-board statement segment");
    expect(result.visual.timeline).toHaveLength(3);
    expect(result.visual.players.map((p) => p.id)).toEqual(["a", "b"]); // "a" from A/C, "b" newly introduced by B
    expect(result.narrationClips).toHaveLength(3);
    expect(result._boardClipRanges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
  });

  it("does not merge when continuesBoardFrom is set but the predecessor isn't a timeline TacticalBoard", () => {
    const first = nonBoardSegment({ text: "Stat card" });
    const second = boardSegment({ text: "Board scene", continuesBoardFrom: true });
    const { segments: merged, notes } = mergeTacticalContinuity([first, second]);

    expect(merged).toHaveLength(2); // graceful no-op, not an error
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/isn't a timeline-authored TacticalBoard/);
  });

  it("does not merge when continuesBoardFrom is set but THIS scene isn't a timeline TacticalBoard", () => {
    const first = boardSegment({ text: "Board scene" });
    const second = nonTimelineBoardSegment({ text: "Phases-only board", continuesBoardFrom: true });
    const { segments: merged, notes } = mergeTacticalContinuity([first, second]);

    expect(merged).toHaveLength(2);
    expect(notes).toHaveLength(1);
  });

  it("keeps the accumulator's ball and takes the most recent highlightZone", () => {
    const first = boardSegment({
      text: "First",
      visual: {
        kind: "tactical-board",
        title: "Board",
        players: [{ id: "a", x: 50, y: 50, team: "home", label: "A" }],
        timeline: [{ type: "move", actorId: "a", startSeconds: 0.3, durationSeconds: 0.6, to: { x: 60, y: 50 }, runType: "standard" }],
        ball: { x: 50, y: 50, belongsTo: "a" },
      },
    });
    const second = boardSegment({
      text: "Second",
      continuesBoardFrom: true,
      visual: {
        kind: "tactical-board",
        title: "Board",
        players: [{ id: "a", x: 50, y: 50, team: "home", label: "A" }],
        timeline: [{ type: "move", actorId: "a", startSeconds: 0.2, durationSeconds: 0.5, to: { x: 70, y: 50 }, runType: "standard" }],
        ball: { x: 90, y: 50 },
        highlightZone: { x: 60, y: 40, width: 20, height: 20 },
      },
    });
    const { segments: merged } = mergeTacticalContinuity([first, second]);
    const result = merged[0];
    if (result.type !== "statement" || result.visual?.kind !== "tactical-board") throw new Error("expected a tactical-board statement segment");
    expect(result.visual.ball).toEqual({ x: 50, y: 50, belongsTo: "a" });
    expect(result.visual.highlightZone).toEqual({ x: 60, y: 40, width: 20, height: 20 });
  });
});
