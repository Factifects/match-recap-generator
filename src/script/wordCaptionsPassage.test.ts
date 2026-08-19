import { describe, expect, it } from "vitest";
import { buildPassageCaptionLines } from "./wordCaptions";

const FPS = 30;

describe("buildPassageCaptionLines", () => {
  const clips = [
    { text: "before the cache existed.", offsetSeconds: 0, durationSeconds: 4 },
    { text: "A cache works by remembering answers.", offsetSeconds: 4, durationSeconds: 6 },
  ];

  it("never lets a caption line straddle a clip boundary", () => {
    // The reported bug: one line read "existed. A cache works" — the end of
    // scene one and the start of scene two in the same caption.
    const lines = buildPassageCaptionLines(clips, 10, FPS);
    for (const line of lines) {
      const text = line.words.map((w) => w.text).join(" ");
      const fromFirst = text.includes("existed.");
      const fromSecond = text.includes("cache works") || text.includes("remembering");
      expect(fromFirst && fromSecond).toBe(false);
    }
  });

  it("anchors each clip's words inside that clip's own measured window", () => {
    const lines = buildPassageCaptionLines(clips, 10, FPS);
    const second = lines.filter((l) => l.words.some((w) => w.text.includes("remembering")));
    expect(second.length).toBeGreaterThan(0);
    for (const line of second) expect(line.startFrame).toBeGreaterThanOrEqual(4 * FPS - 1);
  });

  it("covers the whole passage, not just the first clip", () => {
    const lines = buildPassageCaptionLines(clips, 10, FPS);
    expect(Math.max(...lines.map((l) => l.endFrame))).toBeGreaterThan(8 * FPS);
  });

  it("falls back to text-length weighting when durations are not measured yet", () => {
    const unmeasured = [{ text: "one two three four" }, { text: "five six" }];
    const lines = buildPassageCaptionLines(unmeasured, 9, FPS);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const text = line.words.map((w) => w.text).join(" ");
      expect(text.includes("four") && text.includes("five")).toBe(false);
    }
  });

  it("ignores empty clips rather than emitting blank lines", () => {
    expect(buildPassageCaptionLines([{ text: "   " }], 5, FPS)).toEqual([]);
  });
});
