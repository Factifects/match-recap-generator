import { describe, it, expect } from "vitest";
import {
  typingStateAt,
  runDuration,
  runCost,
  horizontalScrollFor,
  verticalScrollLines,
  typingSoundBursts,
  DEFAULT_CHARS_PER_SECOND,
  type TypingRun,
} from "./typewriter";

const lines = [20, 34, 12];
const run: TypingRun = { fromLine: 1, throughLine: 3, startSeconds: 2 };

describe("typing is keystroke by keystroke, and fast", () => {
  it("shows nothing before the run starts", () => {
    const state = typingStateAt(lines, run, 1.5);
    expect(state.caret).toBeNull();
    expect([...state.visibleChars.values()]).toEqual([0, 0, 0]);
  });

  it("types at a fast HUMAN speed, not a machine one", () => {
    // ~2 words per second at ~6 characters a word. Past this the keystrokes
    // stop reading as someone typing, which is the only reason to type at all.
    expect(DEFAULT_CHARS_PER_SECOND).toBeLessThanOrEqual(12);
    // ...and still quick enough that a short line is not a dead beat.
    expect(DEFAULT_CHARS_PER_SECOND).toBeGreaterThanOrEqual(8);
  });

  it("puts a typed line in the seconds a real beat can absorb", () => {
    const oneLine = runDuration([34], { fromLine: 1, throughLine: 1, startSeconds: 0 });
    expect(oneLine).toBeGreaterThan(2);
    expect(oneLine).toBeLessThan(4);
  });

  it("fills earlier lines completely before touching later ones", () => {
    const state = typingStateAt(lines, { ...run }, 2 + runDuration(lines, run) * 0.5);
    expect(state.visibleChars.get(1)).toBe(Number.POSITIVE_INFINITY);
    expect(state.visibleChars.get(3)).toBe(0);
  });

  it("advances the caret along the line being typed", () => {
    const duration = runDuration(lines, run);
    const early = typingStateAt(lines, run, 2 + duration * 0.05);
    const later = typingStateAt(lines, run, 2 + duration * 0.15);
    expect(early.caret!.line).toBe(1);
    expect(later.caret!.column).toBeGreaterThan(early.caret!.column);
  });

  it("never lets the caret run past the end of its line", () => {
    const duration = runDuration(lines, run);
    for (let t = 0; t <= 1; t += 0.01) {
      const state = typingStateAt(lines, run, 2 + duration * t);
      if (!state.caret) continue;
      expect(state.caret.column).toBeLessThanOrEqual(lines[state.caret.line - 1]);
    }
  });

  it("completes with every line whole and no caret left behind", () => {
    const state = typingStateAt(lines, run, 2 + runDuration(lines, run) + 0.01);
    expect(state.complete).toBe(true);
    expect(state.caret).toBeNull();
    expect([...state.visibleChars.values()].every((v) => v === Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("honours an explicit duration so narrationFit can re-time a run", () => {
    expect(runDuration(lines, { ...run, durationSeconds: 9 })).toBe(9);
    const midway = typingStateAt(lines, { ...run, durationSeconds: 10 }, 2 + 5);
    expect(midway.complete).toBe(false);
    expect(midway.caret).not.toBeNull();
  });

  it("counts a newline as more than a character, so line breaks read", () => {
    expect(runCost([0], { fromLine: 1, throughLine: 1, startSeconds: 0 })).toBeGreaterThan(1);
  });
});

describe("the view follows the caret instead of cropping it", () => {
  it("scrolls a long line horizontally rather than cutting it off", () => {
    const offset = horizontalScrollFor({ caretColumn: 120, lineIsComment: false, charWidthPx: 12, viewportPx: 800 });
    expect(offset).toBeLessThan(0);
  });

  it("stays at column zero while the line still fits", () => {
    expect(horizontalScrollFor({ caretColumn: 10, lineIsComment: false, charWidthPx: 12, viewportPx: 800 })).toBe(0);
  });

  it("snaps back when the caret returns to the start of a line", () => {
    const away = horizontalScrollFor({ caretColumn: 120, lineIsComment: false, charWidthPx: 12, viewportPx: 800 });
    const back = horizontalScrollFor({ caretColumn: 0, lineIsComment: false, charWidthPx: 12, viewportPx: 800 });
    expect(away).toBeLessThan(0);
    expect(back).toBe(0);
  });

  it("never scrolls a comment sideways, however long it is", () => {
    expect(horizontalScrollFor({ caretColumn: 400, lineIsComment: true, charWidthPx: 12, viewportPx: 800 })).toBe(0);
  });

  it("does not scroll vertically while the whole file fits", () => {
    expect(verticalScrollLines({ activeLine: 8, totalLines: 10, visibleLines: 10 })).toBe(0);
  });

  it("keeps the active line on screen once the file is taller than the pane", () => {
    const scroll = verticalScrollLines({ activeLine: 40, totalLines: 60, visibleLines: 12 });
    expect(scroll).toBeGreaterThan(0);
    expect(scroll).toBeLessThanOrEqual(60 - 12);
    // Active line lands inside the visible window.
    expect(40).toBeGreaterThan(scroll);
    expect(40).toBeLessThanOrEqual(scroll + 12);
  });
});

describe("keyboard sound is bursty like real typing, and stops when typing does", () => {
  // "const id = req.query.id" — four unbroken runs of keys ("const", "id",
  // "=", "req.query.id"), so four bursts with real gaps on the spaces.
  const text = ["const id = req.query.id"];
  const oneLine: TypingRun = { fromLine: 1, throughLine: 1, startSeconds: 2 };

  it("emits one burst per word, not a continuous grid", () => {
    const bursts = typingSoundBursts(text, oneLine);
    expect(bursts).toHaveLength(4);
  });

  it("leaves real silence on the spaces between words", () => {
    const bursts = typingSoundBursts(text, oneLine);
    for (let i = 1; i < bursts.length; i++) {
      const gap = bursts[i].startSeconds - (bursts[i - 1].startSeconds + bursts[i - 1].durationSeconds);
      expect(gap, `no gap before burst ${i}`).toBeGreaterThan(0);
    }
  });

  it("never sounds after the last keystroke has landed", () => {
    const run = { ...oneLine, durationSeconds: 4 };
    const end = 2 + 4;
    for (const burst of typingSoundBursts(text, run)) {
      expect(burst.startSeconds + burst.durationSeconds).toBeLessThanOrEqual(end + 1e-9);
    }
  });

  it("stays silent through an indent instead of rattling over it", () => {
    const bursts = typingSoundBursts(["    x"], oneLine);
    expect(bursts).toHaveLength(1);
    // The single burst begins after the four spaces, not at the line start.
    expect(bursts[0].startSeconds).toBeGreaterThan(2);
  });

  it("gives a one-character word an audible floor rather than a click of nothing", () => {
    const bursts = typingSoundBursts(["a b"], oneLine);
    expect(bursts).toHaveLength(2);
    for (const burst of bursts) expect(burst.durationSeconds).toBeGreaterThanOrEqual(0.09);
  });

  it("emits nothing at all for a run with no duration", () => {
    expect(typingSoundBursts(text, { ...oneLine, durationSeconds: 0 })).toEqual([]);
  });

  it("spans more of the run as more lines are typed", () => {
    const single = typingSoundBursts(["const a = 1"], { fromLine: 1, throughLine: 1, startSeconds: 0 });
    const many = typingSoundBursts(["const a = 1", "const b = 2"], { fromLine: 1, throughLine: 2, startSeconds: 0 });
    expect(many.length).toBeGreaterThan(single.length);
  });
});
