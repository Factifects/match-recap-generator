// Keystroke-by-keystroke reveal for the editor medium.
//
// WHY IT IS A SEPARATE, PURE MODULE
//
// The caret position is needed by three different things — which characters are
// drawn, where the horizontal scroll has to be, and when the typing sound plays
// — and getting three different answers to "where is the cursor right now"
// would desynchronise all of them. So it is computed once, here, from plain
// numbers, and tested without a renderer.
//
// ON SPEED
//
// "Fast" here means a FAST HUMAN, not a machine. The first pass ran at 55
// characters per second, which the user corrected: "that was too fast, i meant
// it would be fast enough for human typing, that is like at most 2 words per
// second." At ~6 characters per word that is a ceiling of ~12 c/s — brisk
// touch-typing, roughly 120 words per minute.
//
// This matters because the whole point of typing a line rather than revealing
// it is that the viewer's eye can follow a hand writing code. Past human speed
// the characters stop reading as keystrokes and become a smear, which buys the
// cost of the technique without its benefit.
//
// The practical consequence for authors: typed lines have to be SHORT. At this
// speed a 60-character line is a five-second beat, so `type` is for the one or
// two lines a lesson actually turns on, and `reveal` carries the rest.

/** Characters per second — the ceiling of comfortable human typing (~2 words
 * per second). Do not raise this toward machine speed; see the note above. */
export const DEFAULT_CHARS_PER_SECOND = 12;

/** A newline costs a little more than a character, so line breaks read as
 * deliberate rather than the caret teleporting to the next row. */
const NEWLINE_COST = 3;

export interface TypingRun {
  /** 1-based, inclusive. The first line this run types. */
  fromLine: number;
  /** 1-based, inclusive. The last line this run types. */
  throughLine: number;
  startSeconds: number;
  /** When set, the run is stretched to exactly this long and speed is derived,
   * so narrationFit can re-time a typing run like any other beat. */
  durationSeconds?: number;
  charsPerSecond?: number;
}

/** Cost of typing one line, including the newline that ends it. */
function lineCost(length: number): number {
  return length + NEWLINE_COST;
}

/** Total keystrokes a run represents. */
export function runCost(lineLengths: readonly number[], run: TypingRun): number {
  let total = 0;
  for (let line = run.fromLine; line <= run.throughLine; line++) {
    total += lineCost(lineLengths[line - 1] ?? 0);
  }
  return Math.max(1, total);
}

/** How long a run takes, whether it was given a duration or a speed. Callers
 * need this to place the typing sound and to know when the run is over. */
export function runDuration(lineLengths: readonly number[], run: TypingRun): number {
  if (run.durationSeconds !== undefined) return run.durationSeconds;
  const speed = run.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND;
  return runCost(lineLengths, run) / speed;
}

export interface TypingState {
  /** How many characters of each 1-based line are currently visible.
   * `Infinity` means the whole line. Lines outside the run are not listed. */
  visibleChars: Map<number, number>;
  /** Where the cursor is, 1-based line and 0-based column. */
  caret: { line: number; column: number } | null;
  /** True once every keystroke in the run has landed. */
  complete: boolean;
}

/**
 * Resolves a typing run at a moment in time.
 *
 * Everything before `fromLine` is the caller's business (it was already on
 * screen); this only describes the lines the run itself is responsible for.
 */
export function typingStateAt(lineLengths: readonly number[], run: TypingRun, atSeconds: number): TypingState {
  const visibleChars = new Map<number, number>();
  const elapsed = atSeconds - run.startSeconds;

  if (elapsed < 0) {
    for (let line = run.fromLine; line <= run.throughLine; line++) visibleChars.set(line, 0);
    return { visibleChars, caret: null, complete: false };
  }

  const total = runCost(lineLengths, run);
  const duration = runDuration(lineLengths, run);
  const typed = duration <= 0 ? total : Math.min(total, (elapsed / duration) * total);

  if (typed >= total) {
    for (let line = run.fromLine; line <= run.throughLine; line++) visibleChars.set(line, Number.POSITIVE_INFINITY);
    return { visibleChars, caret: null, complete: true };
  }

  let remaining = typed;
  let caret: { line: number; column: number } | null = null;
  for (let line = run.fromLine; line <= run.throughLine; line++) {
    const length = lineLengths[line - 1] ?? 0;
    const cost = lineCost(length);
    if (remaining >= cost) {
      visibleChars.set(line, Number.POSITIVE_INFINITY);
      remaining -= cost;
      continue;
    }
    // This is the line being typed right now.
    const chars = Math.min(length, Math.floor(remaining));
    visibleChars.set(line, chars);
    if (caret === null) caret = { line, column: chars };
    remaining = 0;
  }

  return { visibleChars, caret, complete: false };
}

/**
 * Where the editor has to be scrolled horizontally to keep the caret on screen.
 *
 * Returns a NEGATIVE pixel offset to apply to the code, or 0 when the line fits.
 * A long line scrolls to follow the cursor rather than being cut off at the
 * pane's right edge, and snaps back to column zero the moment the caret returns
 * to the start of a line — which is what an editor does, and what stops a wide
 * line from silently losing its last characters the way `overflow: hidden` did.
 *
 * `isComment` suppresses it: a long prose comment scrolling sideways under the
 * viewer is disorienting and unreadable, and a comment that long should have
 * been broken across lines by the author instead.
 */
export function horizontalScrollFor(options: {
  caretColumn: number;
  lineIsComment: boolean;
  charWidthPx: number;
  viewportPx: number;
  /** Keeps the caret off the very edge so the next few characters are visible. */
  trailingMarginChars?: number;
}): number {
  const { caretColumn, lineIsComment, charWidthPx, viewportPx } = options;
  if (lineIsComment) return 0;
  const margin = (options.trailingMarginChars ?? 8) * charWidthPx;
  const caretPx = caretColumn * charWidthPx;
  const overflow = caretPx + margin - viewportPx;
  return overflow > 0 ? -overflow : 0;
}

/**
 * Which line the editor should be scrolled to vertically so the active line
 * stays visible. Keeps it a third of the way down rather than pinned to the
 * top, so the reader retains the lines above it as context.
 */
export function verticalScrollLines(options: {
  activeLine: number;
  totalLines: number;
  visibleLines: number;
}): number {
  const { activeLine, totalLines, visibleLines } = options;
  if (totalLines <= visibleLines) return 0;
  const maxScroll = totalLines - visibleLines;
  const desired = activeLine - 1 - Math.floor(visibleLines / 3);
  return Math.max(0, Math.min(maxScroll, desired));
}

// NOTE: nothing below is currently wired up. Typing sound was switched off at
// the user's request on 2026-08-11 ("remove the keyboard typing sfx, just leave
// the typing feature") because the generated cue kept coming out as a
// typewriter. The visual typing above is unaffected. Kept intact and tested
// because the timing logic was correct and hard-won; re-enabling is one
// restored block in resolveAudio.ts, which documents exactly what to put back.

/** One burst of keyboard sound: a word's worth of keystrokes. */
export interface TypingSoundBurst {
  startSeconds: number;
  durationSeconds: number;
}

/**
 * When the keyboard should actually be audible during a typing run.
 *
 * The first version laid cues on a flat half-second grid for the whole run,
 * which was wrong in three ways at once, all reported together: it "is not
 * naturally spaced by words, rather it is just constantly going", and it kept
 * playing "even when nothing was being typed".
 *
 * Real typing is bursty. Fingers rattle through a word, then pause on the
 * space, then rattle through the next one. So bursts are derived from the
 * TEXT: each unbroken run of non-whitespace characters becomes one burst
 * covering exactly the moment those keys are struck, and every space, indent
 * and line break becomes a genuine silence. That gives the rhythm of typing for
 * free, because it is the rhythm of the words themselves.
 *
 * Nothing is ever emitted past the end of the run, which is what stopped the
 * sound outliving the visible typing.
 */
export function typingSoundBursts(lines: readonly string[], run: TypingRun): TypingSoundBurst[] {
  const lineLengths = lines.map((line) => line.length);
  const total = runCost(lineLengths, run);
  const duration = runDuration(lineLengths, run);
  if (duration <= 0) return [];
  const secondsPerUnit = duration / total;

  const bursts: TypingSoundBurst[] = [];
  let elapsedUnits = 0;
  let burstStart: number | null = null;

  const closeBurst = (endUnits: number) => {
    if (burstStart === null) return;
    const start = run.startSeconds + burstStart * secondsPerUnit;
    const end = Math.min(run.startSeconds + endUnits * secondsPerUnit, run.startSeconds + duration);
    // A single keystroke still needs to be audible, so a burst has a floor.
    const length = Math.max(0.09, end - start);
    bursts.push({ startSeconds: start, durationSeconds: Math.min(length, run.startSeconds + duration - start) });
    burstStart = null;
  };

  for (let line = run.fromLine; line <= run.throughLine; line++) {
    const text = lines[line - 1] ?? "";
    for (const character of text) {
      if (/\s/.test(character)) {
        // Whitespace is the pause between words — the thing that makes typing
        // sound like typing rather than like a drone.
        closeBurst(elapsedUnits);
      } else if (burstStart === null) {
        burstStart = elapsedUnits;
      }
      elapsedUnits += 1;
    }
    closeBurst(elapsedUnits);
    elapsedUnits += NEWLINE_COST;
  }
  closeBurst(elapsedUnits);

  return bursts.filter((burst) => burst.durationSeconds > 0);
}
