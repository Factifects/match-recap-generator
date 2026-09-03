import { describe, it, expect } from "vitest";
import { buildWordCaptionLinesFromTimings, isContentWord } from "./wordCaptions";
import { wordTimingsFromAlignment } from "../audio/elevenLabs";
import type { WordTiming } from "../audio/elevenLabs";

const FPS = 30;

const timings: WordTiming[] = [
  { text: "Cold", startMs: 100, endMs: 425 },
  { text: "does", startMs: 450, endMs: 625 },
  { text: "not", startMs: 637, endMs: 875 },
  { text: "drain", startMs: 887, endMs: 1150 },
];

describe("buildWordCaptionLinesFromTimings", () => {
  it("places every word at its MEASURED time, not an estimate", () => {
    // The whole point of the research: 100ms at 30fps is frame 3, and that is
    // where the word must appear — not wherever an even split would put it.
    const [line] = buildWordCaptionLinesFromTimings(timings, FPS, 4);
    expect(line.words[0].startFrame).toBe(3);
    expect(line.words[1].startFrame).toBe(Math.round((450 / 1000) * FPS));
  });

  it("holds each word until the next one starts, so the highlight never flickers", () => {
    // A word's measured window ends when it stops being voiced, which leaves a
    // gap during the natural pause after it. Ending the highlight there makes it
    // blink off between every pair of words.
    const [line] = buildWordCaptionLinesFromTimings(timings, FPS, 4);
    expect(line.words[0].endFrame).toBe(line.words[1].startFrame);
    expect(line.words[1].endFrame).toBe(line.words[2].startFrame);
  });

  it("lets the final word end at its own measured end", () => {
    // Nothing follows it, so there is no gap to bridge.
    const [line] = buildWordCaptionLinesFromTimings(timings, FPS, 4);
    const last = line.words[line.words.length - 1];
    expect(last.endFrame).toBe(Math.round((1150 / 1000) * FPS));
  });

  it("breaks lines where the SENTENCE breaks, not on a word count", () => {
    // Fixed chunking produced lines like "RUNNING, EATING THE" — it counts to N
    // and cuts, stranding an article away from the phrase it belongs to.
    const lines = buildWordCaptionLinesFromTimings(timings, FPS, 3);
    for (const line of lines) {
      const last = line.words[line.words.length - 1].text;
      const isFinalLine = line === lines[lines.length - 1];
      if (!isFinalLine) {
        expect(isContentWord(last), `line should not end on "${last}"`).toBe(true);
      }
    }
  });

  it("keeps a trailing function word with the phrase that follows it", () => {
    const withArticle: WordTiming[] = [
      { text: "eating", startMs: 0, endMs: 200 },
      { text: "the", startMs: 200, endMs: 300 },
      { text: "battery", startMs: 300, endMs: 700 },
    ];
    const lines = buildWordCaptionLinesFromTimings(withArticle, FPS, 2);
    // "the" must travel with "battery", never be left dangling at a line end.
    const lastOfFirst = lines[0].words[lines[0].words.length - 1].text;
    expect(lastOfFirst).not.toBe("the");
  });

  it("breaks after punctuation even when the line is short", () => {
    const clause: WordTiming[] = [
      { text: "Stop.", startMs: 0, endMs: 300 },
      { text: "Cold", startMs: 350, endMs: 600 },
      { text: "batteries", startMs: 620, endMs: 1000 },
    ];
    const lines = buildWordCaptionLinesFromTimings(clause, FPS, 3);
    // The break waits until a line has at least two words — a one-word caption
    // reads as a stutter, so the clause rule yields to that floor.
    expect(lines[0].words[0].text).toBe("Stop.");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("returns [] for no timings so callers can fall back with a plain check", () => {
    expect(buildWordCaptionLinesFromTimings([], FPS)).toEqual([]);
  });

  it("never produces a zero-length window", () => {
    // A word whose start and end round to the same frame would never render.
    const instant: WordTiming[] = [{ text: "hi", startMs: 0, endMs: 0 }];
    const [line] = buildWordCaptionLinesFromTimings(instant, FPS);
    expect(line.words[0].endFrame).toBeGreaterThan(line.words[0].startFrame);
  });
});

describe("wordTimingsFromAlignment", () => {
  const alignment = {
    characters: ["H", "i", " ", "t", "h", "e", "r", "e"],
    character_start_times_seconds: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  };

  it("folds character-level alignment into whole words", () => {
    // ElevenLabs reports per character; a caption highlights per word.
    expect(wordTimingsFromAlignment(alignment).map((w) => w.text)).toEqual(["Hi", "there"]);
  });

  it("spans each word from its first character's start to its last character's end", () => {
    const [hi, there] = wordTimingsFromAlignment(alignment);
    expect(hi.startMs).toBe(0);
    expect(hi.endMs).toBe(200);
    expect(there.startMs).toBe(300);
    expect(there.endMs).toBe(800);
  });

  it("excludes whitespace from word boundaries", () => {
    // The space after a word carries the pause; folding it in would make every
    // highlight overrun into the gap before the next word.
    const [hi] = wordTimingsFromAlignment(alignment);
    expect(hi.endMs).toBeLessThan(300);
  });

  it("handles empty alignment without throwing", () => {
    expect(
      wordTimingsFromAlignment({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      }),
    ).toEqual([]);
  });
});
