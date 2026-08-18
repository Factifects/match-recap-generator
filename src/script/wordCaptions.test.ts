import { describe, expect, it } from "vitest";
import { buildWordCaptionLines } from "./wordCaptions";

describe("buildWordCaptionLines", () => {
  it("returns no lines for empty text", () => {
    expect(buildWordCaptionLines("   ", 3, 30)).toEqual([]);
  });

  it("chunks words into lines of the requested size", () => {
    const lines = buildWordCaptionLines("if traffic drops again keep calm and scale", 4, 30, 4);
    expect(lines).toHaveLength(2);
    expect(lines[0].words.map((w) => w.text)).toEqual(["if", "traffic", "drops", "again"]);
    expect(lines[1].words.map((w) => w.text)).toEqual(["keep", "calm", "and", "scale"]);
  });

  it("covers the whole clip with no gaps and ends exactly at the real duration", () => {
    const fps = 30;
    const durationSeconds = 4;
    const lines = buildWordCaptionLines("if traffic drops again", durationSeconds, fps, 4);
    const words = lines.flatMap((l) => l.words);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startFrame).toBe(words[i - 1].endFrame);
    }
    expect(words[0].startFrame).toBe(0);
    expect(words[words.length - 1].endFrame).toBe(Math.round(durationSeconds * fps));
  });

  it("gives longer words a larger share of the duration than short ones", () => {
    const lines = buildWordCaptionLines("a extraordinarily", 3, 30, 4);
    const [short, long] = lines[0].words;
    expect(long.endFrame - long.startFrame).toBeGreaterThan(short.endFrame - short.startFrame);
  });

  it("every word window is at least one frame long", () => {
    const lines = buildWordCaptionLines("a b c d e f g h i j", 0.1, 30, 10);
    for (const word of lines[0].words) {
      expect(word.endFrame).toBeGreaterThan(word.startFrame);
    }
  });
});
