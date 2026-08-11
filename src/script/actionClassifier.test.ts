import { describe, expect, it } from "vitest";
import { classifyTimelineAction, classifySceneMotion, moveHasTransport } from "./actionClassifier";

describe("classifyTimelineAction", () => {
  it("classifies appear as entrance", () => {
    expect(classifyTimelineAction({ type: "appear", id: "a", startSeconds: 0 })).toBe("entrance");
  });

  it("classifies camera as camera, never explanatory", () => {
    expect(classifyTimelineAction({ type: "camera", startSeconds: 0, durationSeconds: 1 })).toBe("camera");
  });

  it("classifies disappear as explanatory (a real consequence, not decoration)", () => {
    expect(classifyTimelineAction({ type: "disappear", id: "a", startSeconds: 0, durationSeconds: 0.3 })).toBe("explanatory");
  });

  it("classifies a scale-pop move (no `to`) as decorative — the exact reverse-proxy Scene 1 idiom", () => {
    const scalePop = { type: "move" as const, path: "line" as const, id: "a", startSeconds: 8.4, durationSeconds: 0.25, scale: 1.15 };
    expect(classifyTimelineAction(scalePop)).toBe("decorative");
    expect(moveHasTransport(scalePop)).toBe(false);
  });

  it("classifies a move with a real `to` as explanatory transport", () => {
    const transport = { type: "move" as const, path: "line" as const, id: "a", startSeconds: 3, durationSeconds: 0.8, to: { x: 50, y: 45 } };
    expect(classifyTimelineAction(transport)).toBe("explanatory");
    expect(moveHasTransport(transport)).toBe(true);
  });

  it("classifies a style action with a color change as explanatory (a real state signal)", () => {
    expect(classifyTimelineAction({ type: "style", id: "a", startSeconds: 0, durationSeconds: 0.3, color: "#e5484d" })).toBe("explanatory");
  });

  it("classifies a style action with a label change as explanatory", () => {
    expect(classifyTimelineAction({ type: "style", id: "a", startSeconds: 0, durationSeconds: 0.3, label: "DENIED" })).toBe("explanatory");
  });

  it("classifies a style action with neither color nor label as decorative (a no-op signal)", () => {
    expect(classifyTimelineAction({ type: "style", id: "a", startSeconds: 0, durationSeconds: 0.3 })).toBe("decorative");
  });
});

describe("classifySceneMotion", () => {
  it("aggregates a mix of action classes correctly and preserves the explanatory actions themselves", () => {
    const timeline = [
      { type: "appear" as const, id: "a", startSeconds: 0 },
      { type: "appear" as const, id: "b", startSeconds: 0.5 },
      { type: "move" as const, path: "line" as const, id: "a", startSeconds: 1, durationSeconds: 0.25, scale: 1.15 }, // decorative
      { type: "move" as const, path: "line" as const, id: "a", startSeconds: 1.3, durationSeconds: 0.8, to: { x: 50, y: 45 } }, // explanatory
      { type: "camera" as const, startSeconds: 2, durationSeconds: 1 },
      { type: "disappear" as const, id: "b", startSeconds: 5, durationSeconds: 0.3 }, // explanatory
    ];
    const summary = classifySceneMotion(timeline);
    expect(summary.entranceCount).toBe(2);
    expect(summary.decorativeCount).toBe(1);
    expect(summary.explanatoryCount).toBe(2);
    expect(summary.cameraCount).toBe(1);
    expect(summary.explanatoryActions).toHaveLength(2);
  });

  it("returns all zeros for an empty timeline", () => {
    const summary = classifySceneMotion([]);
    expect(summary).toEqual({ entranceCount: 0, decorativeCount: 0, explanatoryCount: 0, cameraCount: 0, explanatoryActions: [] });
  });

  it("reproduces the reverse-proxy Scene 1 shape directly: entrances + scale-pops, zero explanatory", () => {
    // Verbatim shape from analyses/reverse-proxy-short-2026-08-07.txt Scene 1
    // — 5 appears, 4 scale-pop pairs, and (this is the actual bug) nothing
    // that transports or changes state.
    const timeline = [
      { type: "appear" as const, id: "urlLabel", startSeconds: 0.3 },
      { type: "appear" as const, id: "clientIcon", startSeconds: 0.9 },
      { type: "appear" as const, id: "hiddenZone", startSeconds: 1.3 },
      { type: "appear" as const, id: "backendIcon", startSeconds: 1.6 },
      { type: "appear" as const, id: "proxyIcon", startSeconds: 8.0 },
      { type: "move" as const, path: "line" as const, id: "proxyIcon", startSeconds: 8.4, durationSeconds: 0.25, scale: 1.15 },
      { type: "move" as const, path: "line" as const, id: "proxyIcon", startSeconds: 8.65, durationSeconds: 0.3, scale: 1.0 },
      { type: "move" as const, path: "line" as const, id: "backendIcon", startSeconds: 16.0, durationSeconds: 0.25, scale: 1.15 },
      { type: "move" as const, path: "line" as const, id: "backendIcon", startSeconds: 16.25, durationSeconds: 0.3, scale: 1.0 },
    ];
    const summary = classifySceneMotion(timeline);
    expect(summary.entranceCount).toBe(5);
    expect(summary.decorativeCount).toBe(4);
    expect(summary.explanatoryCount).toBe(0);
  });
});
