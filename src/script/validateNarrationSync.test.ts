import { describe, it, expect } from "vitest";
import { diagnoseNarrationSync, deriveNarrationBeats } from "./validateNarrationSync";
import { fitSegmentsToNarration } from "./fitSegmentsToNarration";
import type { TimedSegment } from "../model/Segment";

// The end-to-end property these tests protect: after the narration fit has run,
// a scene's choreography must not outlast what the narrator actually says. The
// pre-existing dead-time check in validateScene.ts could not catch this — it
// measures animation ending EARLY inside a long scene, and the scene's own
// duration had already been stretched to match the animation, so the scene
// reported zero dead time while being maximally desynchronized.

function transport(id: string, startSeconds: number, durationSeconds: number): Record<string, unknown> {
  return { type: "move", id, startSeconds, durationSeconds, to: { x: 50, y: 50 } };
}

function canvasSegment(options: {
  timeline: Record<string, unknown>[];
  narrationSeconds?: number;
  durationSeconds?: number;
  visualMinDurationSeconds?: number;
  text?: string;
  tailHoldSeconds?: number;
  manualDurationOverride?: boolean;
}): TimedSegment {
  return {
    type: "statement",
    text: options.text ?? "The client sends a request. The server validates it. Then it queries the database.",
    durationSeconds: options.durationSeconds ?? 49,
    visualMinDurationSeconds: options.visualMinDurationSeconds,
    narrationSeconds: options.narrationSeconds,
    tailHoldSeconds: options.tailHoldSeconds,
    manualDurationOverride: options.manualDurationOverride,
    visual: {
      kind: "canvas",
      objects: [{ id: "a", type: "icon", icon: "server", x: 50, y: 50, radius: 8 }],
      timeline: options.timeline,
    },
  } as unknown as TimedSegment;
}

/** The production failure: choreography authored to ~49s, narration ~44s. */
function overrunSegment(): TimedSegment {
  const timeline = Array.from({ length: 12 }, (_, i) => transport(`s${i}`, i * 4, 2.5));
  return canvasSegment({ timeline, narrationSeconds: 44, durationSeconds: 49, visualMinDurationSeconds: 49 });
}

describe("diagnoseNarrationSync — visual overrun", () => {
  it("reports a hard NARRATION_VISUAL_DESYNC when the visual outlasts the narration", () => {
    const diagnostics = diagnoseNarrationSync([overrunSegment()]);
    const overrun = diagnostics.find((d) => d.category === "narration-overrun");
    expect(overrun).toBeDefined();
    expect(overrun!.severity).toBe("hard");
    expect(overrun!.message).toContain("44.0s");
  });

  it("goes quiet once the fitter has re-timed the same scene", () => {
    const { segments } = fitSegmentsToNarration([overrunSegment()]);
    const diagnostics = diagnoseNarrationSync(segments);
    expect(diagnostics.filter((d) => d.category === "narration-overrun")).toHaveLength(0);
  });

  it("accepts a declared tail hold as a legitimate reason to outlast narration", () => {
    const timeline = [transport("a", 0, 2), transport("b", 3, 2)];
    const withoutHold = canvasSegment({ timeline, narrationSeconds: 3 });
    const withHold = canvasSegment({ timeline, narrationSeconds: 3, tailHoldSeconds: 3 });
    expect(diagnoseNarrationSync([withoutHold]).some((d) => d.category === "narration-overrun")).toBe(true);
    expect(diagnoseNarrationSync([withHold]).some((d) => d.category === "narration-overrun")).toBe(false);
  });

  it("says nothing at all when narration was never measured (estimate-only render)", () => {
    const timeline = Array.from({ length: 12 }, (_, i) => transport(`s${i}`, i * 4, 2.5));
    expect(diagnoseNarrationSync([canvasSegment({ timeline })])).toEqual([]);
  });
});

describe("diagnoseNarrationSync — coverage", () => {
  it("reports narration that plays over a scene which has stopped doing anything", () => {
    const segment = canvasSegment({ timeline: [transport("a", 0, 2)], narrationSeconds: 20 });
    const diagnostics = diagnoseNarrationSync([segment]);
    expect(diagnostics.some((d) => d.category === "narration-uncovered")).toBe(true);
  });

  it("reports a narration beat with no meaningful visual under it", () => {
    // Three sentences across 30s; all choreography crammed into the first 4s.
    const segment = canvasSegment({
      timeline: [transport("a", 0, 2), transport("b", 2, 2)],
      narrationSeconds: 30,
      text: "The client sends a request to the server. The server then validates every field on that request carefully. Finally it queries the database and returns the rows.",
    });
    const diagnostics = diagnoseNarrationSync([segment]);
    expect(diagnostics.some((d) => d.category === "narration-beat-unvisualized")).toBe(true);
  });

  it("does not count a bare entrance as visualizing a narration beat", () => {
    const segment = canvasSegment({
      timeline: [{ type: "appear", id: "a", startSeconds: 10 }, transport("b", 0, 2)],
      narrationSeconds: 24,
      text: "The client sends a request to the server. The server validates every single field on that incoming request.",
    });
    const diagnostics = diagnoseNarrationSync([segment]);
    expect(diagnostics.some((d) => d.category === "narration-beat-unvisualized")).toBe(true);
  });
});

describe("deriveNarrationBeats", () => {
  it("uses measured clip durations for a merged passage rather than inferring them", () => {
    const segment = {
      type: "statement",
      text: "merged",
      durationSeconds: 10,
      narrationClips: [
        { text: "First part.", offsetSeconds: 0, durationSeconds: 4 },
        { text: "Second part.", offsetSeconds: 4, durationSeconds: 6 },
      ],
    } as unknown as TimedSegment;
    const beats = deriveNarrationBeats(segment, 10);
    expect(beats).toEqual([
      { text: "First part.", startSeconds: 0, endSeconds: 4 },
      { text: "Second part.", startSeconds: 4, endSeconds: 10 },
    ]);
  });

  it("apportions sentences across the real narration duration by word count", () => {
    const segment = { type: "statement", text: "One two three four. Five six.", durationSeconds: 6 } as unknown as TimedSegment;
    const beats = deriveNarrationBeats(segment, 6);
    expect(beats).toHaveLength(2);
    expect(beats[0].endSeconds).toBeCloseTo(4, 5);
    expect(beats[1].endSeconds).toBeCloseTo(6, 5);
  });

  it("returns nothing for empty narration instead of throwing", () => {
    expect(deriveNarrationBeats({ type: "statement", text: "  ", durationSeconds: 3 } as unknown as TimedSegment, 3)).toEqual([]);
  });
});

describe("fitSegmentsToNarration", () => {
  it("collapses the segment's on-screen length onto narration, plus a declared settle", () => {
    const { segments } = fitSegmentsToNarration([overrunSegment()]);
    // 44s of narration + a 0.7s hold. NOT the 49s the choreography was authored
    // for — but not a hard cut on the final syllable either, which is what
    // exactly-narration produced.
    expect(segments[0].durationSeconds).toBeGreaterThan(44);
    expect(segments[0].durationSeconds).toBeLessThan(45);
  });

  it("keeps the settle as real on-screen time rather than letting the floor eat it", () => {
    const { segments } = fitSegmentsToNarration([overrunSegment()]);
    const effective = Math.max(segments[0].durationSeconds, segments[0].visualMinDurationSeconds ?? 0);
    expect(effective - 44).toBeGreaterThan(0.5);
  });

  it("lowers the stale visualMinDurationSeconds floor that caused the original tail", () => {
    const { segments } = fitSegmentsToNarration([overrunSegment()]);
    // Left at 49 (as it was pre-fit), effectiveDurationOf would take max(44, 49)
    // downstream and the 5s tail would come straight back.
    expect(segments[0].visualMinDurationSeconds).toBeLessThanOrEqual(44.5);
  });

  it("reports what it did", () => {
    const { outcomes } = fitSegmentsToNarration([overrunSegment()]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].report.changed).toBe(true);
    expect(outcomes[0].report.narrationSeconds).toBe(44);
  });

  it("respects a duration the user set by hand", () => {
    const segment = { ...overrunSegment(), manualDurationOverride: true };
    const { segments, outcomes } = fitSegmentsToNarration([segment]);
    expect(outcomes).toHaveLength(0);
    expect(segments[0].durationSeconds).toBe(49);
  });

  it("leaves a segment with no measured narration untouched", () => {
    const timeline = [transport("a", 0, 2)];
    const segment = canvasSegment({ timeline, durationSeconds: 12 });
    const { segments } = fitSegmentsToNarration([segment]);
    expect(segments[0]).toBe(segment);
  });

  it("re-times captions and sfx cues onto the fitted timeline, not just the actions", () => {
    const base = overrunSegment();
    const segment: TimedSegment = {
      ...base,
      phases: [{ caption: "later beat", startSeconds: 40 }],
      sfxClips: [{ staticPath: "x.mp3", startSeconds: 40, durationSeconds: 0.5 }],
    };
    const { segments } = fitSegmentsToNarration([segment]);
    expect(segments[0].phases![0].startSeconds).toBeLessThan(40);
    expect(segments[0].sfxClips![0].startSeconds).toBeLessThan(40);
  });
});

describe("fitting re-times a clip's length, not only its position", () => {
  // Keyboard bursts are placed on the authored timeline and then compressed
  // onto real narration. Remapping only their starts left them their original
  // length, so they overlapped back into one continuous drone — seen on a real
  // render as two 0.42s bursts starting 0.19s apart.
  it("keeps sfx clips from overlapping after the timeline is compressed", () => {
    const segments = [
      {
        type: "statement" as const,
        text: "x",
        durationSeconds: 30,
        visual: {
          kind: "canvas" as const,
          objects: [{ id: "a", type: "dot" as const, x: 10, y: 10 }],
          timeline: [
            { type: "appear" as const, id: "a", startSeconds: 0 },
            { type: "move" as const, id: "a", startSeconds: 20, durationSeconds: 2, to: { x: 80, y: 80 } },
          ],
        },
        narrationSeconds: 10,
        sfxClips: [
          { staticPath: "k.mp3", startSeconds: 20, durationSeconds: 0.42 },
          { staticPath: "k.mp3", startSeconds: 21, durationSeconds: 0.42 },
        ],
      },
    ] as never[];

    const fitted = fitSegmentsToNarration(segments).segments as unknown as {
      sfxClips: { startSeconds: number; durationSeconds: number }[];
    }[];
    const clips = fitted[0].sfxClips;
    const firstEnd = clips[0].startSeconds + clips[0].durationSeconds;
    expect(firstEnd).toBeLessThanOrEqual(clips[1].startSeconds + 1e-9);
  });
});
