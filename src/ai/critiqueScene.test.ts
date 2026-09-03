import { describe, it, expect } from "vitest";
import { PROBE_FRACTIONS, critiqueSchema, frameOffsetsFor } from "./critiqueScene";
import { FPS } from "../video/theme";
import type { TimedSegment } from "../model/Segment";

const seg = (durationSeconds: number, visualMin?: number) =>
  ({ type: "statement", text: "n", durationSeconds, visualMinDurationSeconds: visualMin }) as unknown as TimedSegment;

describe("frameOffsetsFor", () => {
  it("samples inside the requested scene, not from the top of the video", () => {
    // Scene 3 starts after 10s + 10s = 20s. Sampling from frame 0 would
    // critique whichever scene happens to be first and report it as this one.
    const frames = frameOffsetsFor([seg(10), seg(10), seg(10)], 2);
    const sceneStart = 20 * FPS;
    for (const frame of frames) {
      expect(frame).toBeGreaterThanOrEqual(sceneStart);
      expect(frame).toBeLessThan(sceneStart + 10 * FPS);
    }
  });

  it("honours visualMinDurationSeconds when placing later scenes", () => {
    // A scene's real length is max(duration, visualMin) — ignoring the floor
    // makes every subsequent scene's offsets drift earlier, silently
    // critiquing the wrong scene the further down the script you go.
    const withFloor = frameOffsetsFor([seg(5, 12), seg(10)], 1);
    const withoutFloor = frameOffsetsFor([seg(5), seg(10)], 1);
    expect(withFloor[0]).toBeGreaterThan(withoutFloor[0]);
    expect(withFloor[0]).toBeGreaterThanOrEqual(12 * FPS);
  });

  it("returns one frame per probe fraction, in order", () => {
    const frames = frameOffsetsFor([seg(10)], 0);
    expect(frames).toHaveLength(PROBE_FRACTIONS.length);
    expect([...frames].sort((a, b) => a - b)).toEqual(frames);
  });

  it("samples the middle of a scene rather than its edges", () => {
    // Start and end frames mostly capture entrance/exit transitions, which
    // look alike in every scene and say nothing about whether the middle did
    // any work — the "progression" score depends on avoiding them.
    const frames = frameOffsetsFor([seg(10)], 0);
    expect(frames[0]).toBeGreaterThan(0);
    expect(frames[frames.length - 1]).toBeLessThan(10 * FPS - 1);
  });
});

describe("critiqueSchema", () => {
  const valid = {
    readable: 8,
    demonstratesMechanism: 7,
    textLegible: 9,
    progression: 6,
    looksEmpty: false,
    problems: ["the label is too small"],
    verdict: "good" as const,
  };

  it("accepts a well-formed critique", () => {
    expect(critiqueSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects scores outside 0-10 so a bad response cannot pass as a good score", () => {
    expect(critiqueSchema.safeParse({ ...valid, readable: 50 }).success).toBe(false);
    expect(critiqueSchema.safeParse({ ...valid, readable: -1 }).success).toBe(false);
  });

  it("rejects an unknown verdict", () => {
    expect(critiqueSchema.safeParse({ ...valid, verdict: "excellent" }).success).toBe(false);
  });

  it("requires the emptiness flag, the failure static checks are blindest to", () => {
    const withoutFlag: Record<string, unknown> = { ...valid };
    delete withoutFlag.looksEmpty;
    expect(critiqueSchema.safeParse(withoutFlag).success).toBe(false);
  });
});
