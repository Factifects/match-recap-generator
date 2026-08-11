import { describe, it, expect } from "vitest";
import { fitTimelineToNarration, deriveBeats, actionMinSeconds, FIT_TOLERANCE_SECONDS, type CanvasTimelineAction } from "./narrationFit";

// These tests deliberately assert SEMANTIC properties (ordering, causality,
// perceptual legibility, where the final consequence lands) rather than exact
// arithmetic. Asserting exact scaled timestamps would just re-encode whatever
// the implementation happens to do today and would pass just as happily for the
// global-speed-scaling approach the doctrine rejects.

function move(id: string, startSeconds: number, durationSeconds: number, to?: { x: number; y: number }): CanvasTimelineAction {
  return { type: "move", id, startSeconds, durationSeconds, ...(to ? { to } : { scale: 1.2 }) } as CanvasTimelineAction;
}
function appear(id: string, startSeconds: number): CanvasTimelineAction {
  return { type: "appear", id, startSeconds } as CanvasTimelineAction;
}
function camera(startSeconds: number, durationSeconds: number): CanvasTimelineAction {
  return { type: "camera", startSeconds, durationSeconds, zoom: 1.4 } as CanvasTimelineAction;
}
function style(id: string, startSeconds: number, durationSeconds: number): CanvasTimelineAction {
  return { type: "style", id, startSeconds, durationSeconds, color: "#fff" } as CanvasTimelineAction;
}

function endOf(actions: CanvasTimelineAction[]): number {
  return actions.reduce((end, a) => Math.max(end, a.startSeconds + ("durationSeconds" in a ? (a.durationSeconds ?? 0) : 0)), 0);
}
function durationOf(action: CanvasTimelineAction): number {
  return "durationSeconds" in action ? (action.durationSeconds ?? 0) : 0;
}

/** The worked example from the architecture directive: a REST scene authored
 * across 26s with a clear causal chain and generous pauses between stages. */
function restScene(): CanvasTimelineAction[] {
  return [
    appear("client", 0),
    move("client", 0.5, 1.5),
    move("request", 2, 3, { x: 20, y: 50 }),
    move("request", 5, 3, { x: 45, y: 50 }),
    move("server", 8, 3, { x: 50, y: 50 }),
    style("validation", 11, 4),
    move("query", 15, 4, { x: 75, y: 50 }),
    move("response", 19, 4, { x: 20, y: 50 }),
    style("result", 23, 3),
  ];
}

describe("deriveBeats", () => {
  it("groups simultaneous actions into one beat rather than several", () => {
    const actions = [camera(4, 1), move("token", 4, 1, { x: 10, y: 10 }), style("label", 4.1, 0.8)];
    const beats = deriveBeats(actions);
    expect(beats).toHaveLength(1);
    expect(beats[0].actionIndices).toEqual([0, 1, 2]);
  });

  it("separates actions divided by a real pause", () => {
    const beats = deriveBeats([move("a", 0, 1, { x: 1, y: 1 }), move("b", 5, 1, { x: 2, y: 2 })]);
    expect(beats).toHaveLength(2);
  });

  it("handles an empty timeline and zero-duration actions without throwing", () => {
    expect(deriveBeats([])).toEqual([]);
    const beats = deriveBeats([appear("a", 0), appear("b", 0)]);
    expect(beats).toHaveLength(1);
    expect(beats[0].minSeconds).toBe(0);
  });
});

describe("fitTimelineToNarration — the 49s/44s regression", () => {
  // The exact production failure this whole subsystem exists for: choreography
  // authored to ~49s, real TTS narration comes in at ~44s, and the old pipeline
  // ran the full 49 with the narrator silent for the last 5.
  const authored: CanvasTimelineAction[] = Array.from({ length: 12 }, (_, i) =>
    move(`step${i}`, i * 4, 2.5, { x: 10 + i * 5, y: 50 }),
  ).concat([style("final", 47, 2)]);

  it("lands the final visual consequence with the narration, not 5s after it", () => {
    expect(endOf(authored)).toBeCloseTo(49, 1);
    const { actions, report } = fitTimelineToNarration(authored, { narrationSeconds: 44 });
    expect(report.changed).toBe(true);
    expect(endOf(actions)).toBeGreaterThan(44 - 1);
    expect(endOf(actions)).toBeLessThanOrEqual(44 + FIT_TOLERANCE_SECONDS);
  });

  it("reports no overflow — 49s of this choreography compresses into 44s safely", () => {
    const { report } = fitTimelineToNarration(authored, { narrationSeconds: 44 });
    expect(report.overflowSeconds).toBe(0);
  });
});

describe("fitTimelineToNarration — compression", () => {
  it("takes time from pauses before it takes time from meaningful actions", () => {
    // 2s of action, 6s of pause, 2s of action = 10s authored. Asking for 6s can
    // be paid for entirely out of the pauses.
    const actions = [move("a", 0, 2, { x: 10, y: 10 }), move("b", 8, 2, { x: 20, y: 20 })];
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 6 });
    expect(durationOf(fitted[0])).toBeCloseTo(2, 1);
    expect(durationOf(fitted[1])).toBeCloseTo(2, 1);
  });

  it("never compresses a transport below its perceptual minimum", () => {
    const actions = restScene();
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 8 });
    for (let i = 0; i < actions.length; i++) {
      expect(durationOf(fitted[i])).toBeGreaterThanOrEqual(actionMinSeconds(actions[i]) - 1e-6);
    }
  });

  it("reports a real timing conflict instead of squashing past legibility", () => {
    // Ten consecutive transports cannot go below 10 x MIN_TRANSPORT (5s) and
    // stay perceptible, so three seconds of narration is a genuine conflict —
    // the directive's own "the system should know that before rendering".
    // Note the contrast with the test above: four 2s transports DO fit into 3s
    // (0.75s each, still legible), and the fitter must not cry conflict there.
    const actions = Array.from({ length: 10 }, (_, i) => move(`s${i}`, i * 2, 2, { x: 10 + i, y: 10 }));
    const { report } = fitTimelineToNarration(actions, { narrationSeconds: 3 });
    expect(report.overflowSeconds).toBeGreaterThan(1);
  });

  it("preserves action order and causality under heavy compression", () => {
    const actions = restScene();
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 11 });
    for (let i = 1; i < fitted.length; i++) {
      expect(fitted[i].startSeconds).toBeGreaterThanOrEqual(fitted[i - 1].startSeconds - 1e-6);
    }
    // The cache-miss -> database-query shape: a later stage must still begin
    // after the earlier one it depends on has begun.
    const queryStart = fitted[6].startSeconds;
    const validationStart = fitted[5].startSeconds;
    expect(queryStart).toBeGreaterThan(validationStart);
  });

  it("keeps a camera move welded to the beat it belongs to", () => {
    const actions = [
      move("intro", 0, 1.5, { x: 5, y: 5 }),
      camera(6, 1.2),
      move("subject", 6, 1.2, { x: 60, y: 40 }),
    ];
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 4 });
    expect(fitted[1].startSeconds).toBeCloseTo(fitted[2].startSeconds, 2);
  });
});

describe("fitTimelineToNarration — expansion", () => {
  it("expands meaningful beats rather than freezing the scene", () => {
    const actions = [move("a", 0, 2, { x: 10, y: 10 }), move("b", 3, 2, { x: 20, y: 20 })];
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 12 });
    const grew = durationOf(fitted[0]) > 2 + 1e-6 && durationOf(fitted[1]) > 2 + 1e-6;
    expect(grew).toBe(true);
  });

  it("still lands the last beat at the end of the narration", () => {
    const actions = [move("a", 0, 2, { x: 10, y: 10 }), move("b", 3, 2, { x: 20, y: 20 })];
    const { actions: fitted } = fitTimelineToNarration(actions, { narrationSeconds: 12 });
    expect(endOf(fitted)).toBeGreaterThan(12 - 1);
    expect(endOf(fitted)).toBeLessThanOrEqual(12 + FIT_TOLERANCE_SECONDS);
  });

  it("reports uncovered narration when a scene has far less content than time", () => {
    const actions = [move("a", 0, 1, { x: 10, y: 10 })];
    const { report } = fitTimelineToNarration(actions, { narrationSeconds: 30 });
    expect(report.uncoveredSeconds).toBeGreaterThan(0);
  });
});

describe("fitTimelineToNarration — anchors", () => {
  it("pins an anchored moment to its narration time", () => {
    // "the request reaches the server" is authored at 8s and really spoken at
    // 5s; it must land at 5s regardless of how the rest is compressed.
    const actions = restScene();
    const { remapSeconds } = fitTimelineToNarration(actions, {
      narrationSeconds: 18,
      anchors: [{ authoredSeconds: 8, narrationSeconds: 5 }],
    });
    expect(remapSeconds(8)).toBeCloseTo(5, 2);
  });

  it("keeps every action on the correct side of an anchor", () => {
    const actions = restScene();
    const anchorAuthored = 15;
    const anchorNarration = 9;
    const { actions: fitted } = fitTimelineToNarration(actions, {
      narrationSeconds: 18,
      anchors: [{ authoredSeconds: anchorAuthored, narrationSeconds: anchorNarration }],
    });
    actions.forEach((action, index) => {
      if (action.startSeconds < anchorAuthored) {
        expect(fitted[index].startSeconds).toBeLessThanOrEqual(anchorNarration + 1e-6);
      } else {
        expect(fitted[index].startSeconds).toBeGreaterThanOrEqual(anchorNarration - 1e-6);
      }
    });
  });
});

describe("fitTimelineToNarration — no-ops and edges", () => {
  it("leaves an already-fitted timeline untouched", () => {
    const actions = restScene();
    const { actions: fitted, report } = fitTimelineToNarration(actions, { narrationSeconds: 26 });
    expect(report.changed).toBe(false);
    expect(fitted).toBe(actions);
  });

  it("no-ops on an empty timeline or a missing narration duration", () => {
    expect(fitTimelineToNarration([], { narrationSeconds: 20 }).actions).toEqual([]);
    const actions = restScene();
    expect(fitTimelineToNarration(actions, { narrationSeconds: 0 }).actions).toBe(actions);
  });

  it("never pushes an action past the narration window", () => {
    for (const narrationSeconds of [6, 12, 20, 33, 40]) {
      const { actions: fitted } = fitTimelineToNarration(restScene(), { narrationSeconds });
      for (const action of fitted) {
        expect(action.startSeconds + durationOf(action)).toBeLessThanOrEqual(narrationSeconds + FIT_TOLERANCE_SECONDS);
      }
    }
  });

  it("remaps monotonically, so nothing placed against the old timeline reorders", () => {
    const { remapSeconds } = fitTimelineToNarration(restScene(), { narrationSeconds: 15 });
    let previous = -Infinity;
    for (let t = 0; t <= 26; t += 0.5) {
      const mapped = remapSeconds(t);
      expect(mapped).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = mapped;
    }
  });
});
