import { describe, it, expect } from "vitest";
import {
  resolveAnnotations,
  placeAnnotations,
  placeEdgeLabels,
  connectorObstacles,
  type AnnotationTarget,
  type AnnotationTimelineAction,
  type Rect,
} from "./diagramAnnotations";

// The scene that produced the bug: process, thread and core, explained in four
// beats, each beat a `focus` -> `annotate` -> `focus: []`. Every note used to
// stay on screen for the rest of the scene.
const processThreadCore: AnnotationTimelineAction[] = [
  { type: "focus", startSeconds: 3.5, ids: ["proc"] },
  { type: "annotate", startSeconds: 4.0, target: "proc", text: "PROCESS: your program, with memory only it can see" },
  { type: "focus", startSeconds: 8.5, ids: [] },
  { type: "focus", startSeconds: 9.8, ids: ["t1", "t2", "proc"] },
  { type: "annotate", startSeconds: 10.4, target: "proc", text: "THREAD: a separate line of execution, inside that process" },
  { type: "focus", startSeconds: 14.5, ids: [] },
  { type: "annotate", startSeconds: 19.4, target: "mem", text: "threads in one process SHARE this. one stock number." },
  { type: "focus", startSeconds: 23.5, ids: [] },
  { type: "focus", startSeconds: 26.0, ids: ["cpu", "c1", "c2"] },
  { type: "annotate", startSeconds: 26.6, target: "cpu", text: "CORE: what actually executes. 2 cores = 2 threads in the same instant." },
  { type: "focus", startSeconds: 31.5, ids: [] },
];

describe("an annotation leaves with the beat it belongs to", () => {
  it("shows only the beat's own note, not every note so far", () => {
    const live = resolveAnnotations(processThreadCore, 28.0);
    expect(live.map((a) => a.target)).toEqual(["cpu"]);
  });

  it("clears a note when focus is released", () => {
    expect(resolveAnnotations(processThreadCore, 13.0).map((a) => a.target)).toEqual(["proc"]);
    expect(resolveAnnotations(processThreadCore, 16.0)).toEqual([]);
  });

  it("never shows more than one note at a time in this scene", () => {
    for (let t = 0; t <= 40; t += 0.25) {
      expect(resolveAnnotations(processThreadCore, t).length, `at ${t}s`).toBeLessThanOrEqual(1);
    }
  });

  it("supersedes a note when the same node is annotated again", () => {
    const timeline: AnnotationTimelineAction[] = [
      { type: "annotate", startSeconds: 1, target: "stock", text: "still 1. A has not written yet." },
      { type: "annotate", startSeconds: 5, target: "stock", text: "both are holding the number 1" },
    ];
    const live = resolveAnnotations(timeline, 6);
    expect(live).toHaveLength(1);
    expect(live[0].text).toBe("both are holding the number 1");
  });

  it("fades out rather than cutting", () => {
    const [fading] = resolveAnnotations(processThreadCore, 8.65);
    expect(fading.opacity).toBeGreaterThan(0);
    expect(fading.opacity).toBeLessThan(1);
  });

  it("shows nothing before the first annotation", () => {
    expect(resolveAnnotations(processThreadCore, 1.0)).toEqual([]);
  });

  it("keeps a note open when the scene never releases focus", () => {
    // Deliberate: the geometric pass is what protects this case, not a guess
    // about when the author meant the beat to end.
    const timeline: AnnotationTimelineAction[] = [
      { type: "annotate", startSeconds: 1, target: "a", text: "one" },
      { type: "annotate", startSeconds: 2, target: "b", text: "two" },
    ];
    expect(resolveAnnotations(timeline, 5)).toHaveLength(2);
  });
});

describe("annotations cannot overlap or leave the frame", () => {
  const targets: Record<string, AnnotationTarget> = {
    cpu: { x: 22, y: 55, height: 20 },
    proc: { x: 50, y: 55, height: 20 },
    mem: { x: 78, y: 55, height: 20 },
  };
  const targetOf = (id: string) => targets[id];

  function overlaps(a: { left: number; top: number; width: number; height: number }, b: typeof a): boolean {
    return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  }

  it("stacks two long notes on adjacent nodes instead of printing them across each other", () => {
    const placed = placeAnnotations(
      [
        { target: "cpu", text: "CORE: what actually executes. 2 cores = 2 threads in the same instant.", opacity: 1 },
        { target: "proc", text: "THREAD: a separate line of execution, inside that process", opacity: 1 },
      ],
      targetOf,
      25,
      1920,
      1080,
    );
    expect(placed).toHaveLength(2);
    expect(overlaps(placed[0], placed[1])).toBe(false);
  });

  it("keeps every note inside the frame, however long and however far out its node sits", () => {
    const placed = placeAnnotations(
      [
        { target: "cpu", text: "CORE: what actually executes. 2 cores = 2 threads in the same instant.", opacity: 1 },
        { target: "mem", text: "threads in one process SHARE this. one stock number, one copy of it", opacity: 1 },
        { target: "proc", text: "PROCESS: your program, with memory only it can see", opacity: 1 },
      ],
      targetOf,
      25,
      1920,
      1080,
    );
    for (const note of placed) {
      expect(note.left).toBeGreaterThanOrEqual(0);
      expect(note.left + note.width).toBeLessThanOrEqual(100);
      expect(note.top).toBeGreaterThanOrEqual(0);
      expect(note.top + note.height).toBeLessThanOrEqual(100);
    }
  });

  it("never overlaps any pair, for any number of simultaneous notes", () => {
    const placed = placeAnnotations(
      Object.keys(targets).map((target) => ({ target, text: `a fairly long note about ${target} and what it does here`, opacity: 1 })),
      targetOf,
      25,
      1920,
      1080,
    );
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j]), `${placed[i].text} overlaps ${placed[j].text}`).toBe(false);
      }
    }
  });

  it("wraps a note too long for one line rather than running past the frame", () => {
    const [wide] = placeAnnotations(
      [{ target: "proc", text: "CORE: what actually executes. 2 cores = 2 threads in the same instant.", opacity: 1 }],
      targetOf,
      25,
      1920,
      1080,
    );
    expect(wide.width).toBeLessThanOrEqual(34.01);
    // Two lines tall, so the stacking pass knows how much room it really takes.
    expect(wide.height).toBeGreaterThan((25 * 1.28 * 1.5) / 1080 * 100);
  });

  it("centres a short note under its own node", () => {
    const [note] = placeAnnotations([{ target: "proc", text: "held by A", opacity: 1 }], targetOf, 25, 1920, 1080);
    expect(note.left + note.width / 2).toBeCloseTo(50, 5);
    expect(note.top).toBeGreaterThan(55);
  });

  it("drops a note whose target is not on the diagram", () => {
    expect(placeAnnotations([{ target: "ghost", text: "x", opacity: 1 }], targetOf, 25, 1920, 1080)).toEqual([]);
  });
});

describe("diagram text keeps off the diagram", () => {
  function overlaps(a: Rect, b: Rect): boolean {
    return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  }

  // "shared memory", drawn as a tile with its caption underneath, with two
  // connectors arriving from the left.
  const memory: Rect = { left: 76, top: 46, width: 12, height: 22 };
  const threadB: Rect = { left: 41, top: 58, width: 22, height: 14 };

  it("keeps an edge label ON its own connector rather than parking it in space", () => {
    // Deliberate: a chip floating between two lines stops saying which flow it
    // names. Its anchor is fixed (longest run) instead of its position.
    const points = [{ x: 63, y: 66 }, { x: 74, y: 66 }, { x: 74, y: 55 }, { x: 76, y: 55 }];
    const [label] = placeEdgeLabels([{ text: "reads and writes", points }], 22, 1920, 1080);
    const centreX = label.left + label.width / 2;
    expect(centreX).toBeGreaterThanOrEqual(63);
    expect(centreX).toBeLessThanOrEqual(74);
    // Sits just above the run it belongs to, not lifted clear of the diagram.
    expect(66 - (label.top + label.height)).toBeLessThan(2);
  });

  it("separates two chips that would otherwise print on each other", () => {
    const placed = placeEdgeLabels(
      [
        { text: "reads and writes", points: [{ x: 63, y: 55 }, { x: 76, y: 55 }] },
        { text: "reads and writes", points: [{ x: 63, y: 55.4 }, { x: 76, y: 55.4 }] },
      ],
      22,
      1920,
      1080,
    );
    expect(overlaps(placed[0], placed[1])).toBe(false);
  });

  it("puts an edge label on the connector's longest run, not on a short turn", () => {
    // A long horizontal departure, then a short step across. The midpoint of
    // the polyline by parameter lands on the short step; by length it does not.
    const [label] = placeEdgeLabels(
      [{ text: "runs", points: [{ x: 10, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 53 }, { x: 62, y: 53 }] }],
      22,
      1920,
      1080,
    );
    expect(label.left + label.width / 2).toBeGreaterThan(20);
    expect(label.left + label.width / 2).toBeLessThan(50);
  });

  it("keeps a note off the connectors it would otherwise be written across", () => {
    const edges = [{ points: [{ x: 63, y: 66 }, { x: 74, y: 66 }, { x: 74, y: 55 }, { x: 76, y: 55 }] }];
    const obstacles = [memory, threadB, ...connectorObstacles(edges)];
    const [note] = placeAnnotations(
      [{ target: "mem", text: "threads in one process SHARE this. one stock number.", opacity: 1 }],
      () => ({ x: 82, y: 57, height: 22 }),
      25,
      1920,
      1080,
      obstacles,
    );
    for (const obstacle of obstacles) {
      expect(overlaps(note, obstacle), `note overlaps ${JSON.stringify(obstacle)}`).toBe(false);
    }
  });

  it("still keeps every note inside the frame once it has dodged obstacles", () => {
    const obstacles: Rect[] = [{ left: 0, top: 60, width: 100, height: 25 }];
    const placed = placeAnnotations(
      [
        { target: "a", text: "a note that has to get out of the way of a very wide obstacle", opacity: 1 },
        { target: "b", text: "and a second one that also has to fit somewhere legible", opacity: 1 },
      ],
      (id) => ({ x: id === "a" ? 30 : 70, y: 55, height: 10 }),
      25,
      1920,
      1080,
      obstacles,
    );
    for (const note of placed) {
      expect(note.top).toBeGreaterThanOrEqual(0);
      expect(note.top + note.height).toBeLessThanOrEqual(100);
    }
  });

  it("turns each connector segment into an obstacle with real thickness", () => {
    const rects = connectorObstacles([{ points: [{ x: 10, y: 50 }, { x: 60, y: 50 }] }]);
    expect(rects).toHaveLength(1);
    expect(rects[0].height).toBeGreaterThan(0);
    expect(rects[0].width).toBeCloseTo(50, 5);
  });

  it("places labels with no obstacles exactly where the connector wants them", () => {
    const [label] = placeEdgeLabels([{ text: "buy", points: [{ x: 20, y: 50 }, { x: 60, y: 50 }] }], 22, 1920, 1080);
    expect(label.left + label.width / 2).toBeCloseTo(40, 5);
    expect(label.top + label.height).toBeLessThanOrEqual(50);
  });
});
