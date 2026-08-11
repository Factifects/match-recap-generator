import { describe, expect, it } from "vitest";
import { flattenTimeline, compileDataBinding, type TimelineNode } from "./timelineIR";

function appear(id: string, durationSeconds = 0): TimelineNode {
  return { kind: "action", action: { type: "appear", id, startSeconds: 0 } };
}
function move(id: string, durationSeconds: number): TimelineNode {
  return { kind: "action", action: { type: "move", id, startSeconds: 0, durationSeconds, to: { x: 50 } } };
}

describe("flattenTimeline — sequence", () => {
  it("chains children so each starts when the previous one's real end is reached", () => {
    const node: TimelineNode = { kind: "sequence", children: [move("a", 2), move("b", 3), move("c", 1)] };
    const { actions, endSeconds } = flattenTimeline(node, 10);
    expect(actions.map((a) => a.startSeconds)).toEqual([10, 12, 15]);
    expect(endSeconds).toBe(16);
  });

  it("respects each child's own offsetSeconds within the sequence", () => {
    const node: TimelineNode = {
      kind: "sequence",
      children: [move("a", 1), { ...move("b", 1), offsetSeconds: 5 } as TimelineNode],
    };
    const { actions } = flattenTimeline(node, 0);
    // a starts at 0, ends at 1; b's own +5 offset applies ON TOP of where
    // the sequence would otherwise place it (1), landing at 6.
    expect(actions[1].startSeconds).toBe(6);
  });
});

describe("flattenTimeline — parallel", () => {
  it("starts every child at the same time and ends at the LONGEST child's end", () => {
    const node: TimelineNode = { kind: "parallel", children: [move("a", 2), move("b", 5), appear("c")] };
    const { actions, endSeconds } = flattenTimeline(node, 3);
    expect(actions.every((a) => a.startSeconds === 3)).toBe(true);
    expect(endSeconds).toBe(8);
  });
});

describe("flattenTimeline — delay", () => {
  it("pushes its child's whole start by a fixed amount", () => {
    const node: TimelineNode = { kind: "delay", seconds: 4, child: move("a", 1) };
    const { actions } = flattenTimeline(node, 10);
    expect(actions[0].startSeconds).toBe(14);
  });
});

describe("flattenTimeline — stagger", () => {
  it("overlaps children by a fixed gap regardless of their own duration", () => {
    const node: TimelineNode = { kind: "stagger", gap: 0.5, children: [move("a", 3), move("b", 3), move("c", 3)] };
    const { actions, endSeconds } = flattenTimeline(node, 0);
    expect(actions.map((a) => a.startSeconds)).toEqual([0, 0.5, 1]);
    // Each is 3s long; the LAST one to finish determines the end, not the
    // last one to start.
    expect(endSeconds).toBe(4);
  });
});

describe("flattenTimeline — repeat", () => {
  it("repeats a fixed number of times, interval apart", () => {
    const node: TimelineNode = { kind: "repeat", child: appear("spawn"), interval: 1, count: 4 };
    const { actions } = flattenTimeline(node, 0);
    expect(actions.map((a) => a.startSeconds)).toEqual([0, 1, 2, 3]);
  });

  it("repeats until a scene-relative time is reached — real continuous motion, not a fixed count", () => {
    const node: TimelineNode = { kind: "repeat", child: appear("spawn"), interval: 2, untilSeconds: 9 };
    const { actions } = flattenTimeline(node, 1);
    expect(actions.map((a) => a.startSeconds)).toEqual([1, 3, 5, 7]);
  });

  it("emits nothing when neither count nor untilSeconds is given, rather than looping forever", () => {
    const node: TimelineNode = { kind: "repeat", child: appear("spawn"), interval: 1 };
    const { actions } = flattenTimeline(node, 0);
    expect(actions).toHaveLength(0);
  });

  it("does not hang when interval is non-positive and untilSeconds is set (the real infinite-loop shape)", () => {
    const node: TimelineNode = { kind: "repeat", child: appear("spawn"), interval: 0, untilSeconds: 100 };
    const start = Date.now();
    const { actions } = flattenTimeline(node, 0);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(actions.length).toBeGreaterThan(0); // hit the iteration ceiling, not zero output
  });
});

describe("compileDataBinding", () => {
  it("expands a value series into chained move actions between consecutive samples", () => {
    const node = compileDataBinding({
      id: "queueLevel",
      property: "radius",
      samples: [
        { atSeconds: 0, value: 5 },
        { atSeconds: 2, value: 10 },
        { atSeconds: 4, value: 3 },
      ],
    });
    const { actions } = flattenTimeline(node, 10);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: "move", id: "queueLevel", startSeconds: 10, durationSeconds: 2, radius: 10 });
    expect(actions[1]).toMatchObject({ type: "move", id: "queueLevel", startSeconds: 12, durationSeconds: 2, radius: 3 });
  });
});
