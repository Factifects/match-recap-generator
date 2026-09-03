import type { WordTiming } from "../audio/elevenLabs";

// Karaoke-style caption timing: short lines of a few words each, with a
// per-word [startFrame, endFrame) window so a caption overlay can highlight
// whichever word is being spoken right now.
//
// TWO SOURCES OF TIMING, and the difference is not academic.
//
// `buildWordCaptionLinesFromTimings` uses REAL per-word timings measured by the
// speech synthesiser. Edge TTS emits WordBoundary events on every synthesis and
// the client library already parses them into millisecond offsets — this file
// previously asserted that no such alignment existed, which was simply wrong,
// and the timings were being generated and discarded on every render.
//
// `buildWordCaptionLines` ESTIMATES, by distributing a real total duration
// across words proportional to a weight (character count, plus a bonus for
// trailing punctuation to admit the pause a comma actually gets spoken with).
// It remains the fallback for audio cached before timings were captured, and
// for providers that do not report them.
//
// Prefer the real one wherever it is available. For a subtitle sitting under a
// diagram the estimate is fine. For short-form captions — where the caption IS
// the content and the viewer is watching the word, not the picture — a word
// landing 200ms off the voice is the whole difference between a video that
// reads as produced and one that reads as generated.

const DEFAULT_WORDS_PER_LINE = 4;
// A held pause (comma/period/etc.) reads as roughly one extra short word of
// dead air in real speech — this is a heuristic, not measured, same spirit as
// estimateDuration.ts's WORDS_PER_MINUTE constant.
const PAUSE_PUNCTUATION_BONUS = 3;

export interface CaptionWord {
  /** Original word text, punctuation included (e.g. "again," not "again"). */
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface CaptionLine {
  words: CaptionWord[];
  startFrame: number;
  endFrame: number;
}

function wordWeight(word: string): number {
  const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
  const bonus = /[,.;:!?]\s*$/.test(word) ? PAUSE_PUNCTUATION_BONUS : 0;
  return Math.max(1, bare.length) + bonus;
}

/** Words that carry grammar rather than meaning.
 *
 * Not a stopword list for search — a list of words a viewer's eye should never
 * be stopped on. Short-form captions mark the word being spoken, and marking
 * "the" or "of" wastes the single strongest emphasis the format has on a word
 * nobody reads. The set is deliberately small and closed: articles,
 * prepositions, conjunctions, auxiliaries and pronouns. Anything outside it is
 * treated as carrying meaning, because a false negative (emphasising a real
 * word) costs nothing, while a false positive (skipping a meaningful one) is a
 * missed beat. */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "if", "of", "to", "in", "on", "at", "by", "for",
  "with", "from", "into", "over", "as", "is", "are", "was", "were", "be", "been", "am", "do",
  "does", "did", "has", "have", "had", "will", "would", "can", "could", "it", "its", "this",
  "that", "these", "those", "you", "your", "we", "our", "they", "their", "he", "she", "his",
  "her", "i", "my", "me", "us", "them", "there", "here", "than", "then", "up", "out", "off",
]);

/** True when a word carries meaning worth stopping the eye on. */
export function isContentWord(word: string): boolean {
  const bare = word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  if (bare.length === 0) return false;
  return !FUNCTION_WORDS.has(bare);
}

/** True when a word ends a clause — the natural place to break a caption line. */
function endsClause(word: string): boolean {
  return /[.,;:!?—]$/.test(word.trim());
}

/**
 * Groups words into caption lines that break where the SENTENCE breaks.
 *
 * Fixed-size chunking is what produced lines like "RUNNING, EATING THE" — it
 * counts to three and cuts, so a line routinely ends on an article left
 * dangling from the phrase it belongs to. Two rules fix almost all of it:
 * break after punctuation even when the line is short, and never end a line on
 * a function word if there is a following word to keep it with.
 */
function groupIntoLines(words: CaptionWord[], wordsPerLine: number): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: CaptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      words: current,
      startFrame: current[0].startFrame,
      endFrame: current[current.length - 1].endFrame,
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);
    const isLast = i === words.length - 1;
    if (isLast) break;

    // A clause boundary is a better break than any word count, and breaking
    // there is what makes a caption read as speech rather than as a buffer
    // being flushed.
    if (endsClause(words[i].text) && current.length >= 2) {
      flush();
      continue;
    }
    if (current.length < wordsPerLine) continue;
    // At the limit — but a trailing function word belongs with what follows it,
    // so carry it over rather than stranding it at the end of the line.
    if (!isContentWord(words[i].text) && current.length > 1) {
      const carried = current.pop()!;
      flush();
      current.push(carried);
      continue;
    }
    flush();
  }
  flush();
  return lines;
}

/** Builds caption lines from REAL per-word timings measured by the synthesiser.
 *
 * `timings` comes from the TTS provider (see WordTiming in elevenLabs.ts) and
 * is authoritative: no weighting, no estimating, each word shown exactly when
 * it is spoken.
 *
 * Returns `[]` when there is nothing to time, so a caller can fall back to the
 * estimating builder with a plain empty check rather than a try/catch. */
export function buildWordCaptionLinesFromTimings(
  timings: WordTiming[],
  fps: number,
  wordsPerLine: number = DEFAULT_WORDS_PER_LINE,
): CaptionLine[] {
  if (timings.length === 0) return [];

  const words: CaptionWord[] = timings.map((timing, index) => {
    const startFrame = Math.max(0, Math.round((timing.startMs / 1000) * fps));
    // A word's window is extended to the moment the NEXT word begins rather
    // than ending at its own measured end. The synthesiser reports the span in
    // which a word is voiced, which leaves a gap during the natural pause after
    // it — and a highlight that switches off during that gap flickers between
    // every pair of words. Holding until the next word starts is what makes the
    // highlight read as moving through the sentence.
    const nextStartMs = timings[index + 1]?.startMs;
    const endMs = nextStartMs !== undefined ? Math.max(timing.endMs, nextStartMs) : timing.endMs;
    return {
      text: timing.text,
      startFrame,
      endFrame: Math.max(startFrame + 1, Math.round((endMs / 1000) * fps)),
    };
  });

  return groupIntoLines(words, wordsPerLine);
}

/** Splits narration text into short (default 4-word) lines, each word given an
 * estimated [startFrame, endFrame) window inside `durationSeconds` of real
 * audio. Returns `[]` for empty/whitespace-only text rather than throwing —
 * callers should treat that the same as "no caption for this segment". */
export function buildWordCaptionLines(
  text: string,
  durationSeconds: number,
  fps: number,
  wordsPerLine: number = DEFAULT_WORDS_PER_LINE,
): CaptionLine[] {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  const weights = rawWords.map(wordWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));

  const words: CaptionWord[] = [];
  let cursorFrame = 0;
  let cursorWeight = 0;
  for (let i = 0; i < rawWords.length; i++) {
    cursorWeight += weights[i];
    const endFrame = i === rawWords.length - 1 ? totalFrames : Math.round((cursorWeight / totalWeight) * totalFrames);
    words.push({ text: rawWords[i], startFrame: cursorFrame, endFrame: Math.max(cursorFrame + 1, endFrame) });
    cursorFrame = words[i].endFrame;
  }

  const lines: CaptionLine[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const lineWords = words.slice(i, i + wordsPerLine);
    lines.push({ words: lineWords, startFrame: lineWords[0].startFrame, endFrame: lineWords[lineWords.length - 1].endFrame });
  }
  return lines;
}

/** One narration clip within a merged passage. */
export interface NarrationClipTiming {
  text: string;
  /** Absolute seconds from the start of the passage. Present once real audio
   * has been measured; absent on an estimate-only render. */
  offsetSeconds?: number;
  durationSeconds?: number;
}

/** Caption lines for a MERGED passage, built per clip rather than over the
 * concatenated text.
 *
 * A folded passage (see mergeStageContinuity.ts) is one segment carrying
 * several narration clips, each its own audio file with its own real duration.
 * Treating that as one long string and spreading the words evenly across the
 * total is wrong twice over: the words drift out of step with speech, because
 * clips are not equally dense; and a single caption line can straddle a scene
 * boundary, showing the end of one scene's sentence next to the start of the
 * next one's. Anchoring each clip's words inside that clip's own window fixes
 * both, and it means a caption can never cross a boundary — the clip is the
 * unit of speech, so it is the unit of captioning.
 *
 * Falls back to distributing by text length when durations are not yet
 * measured, which at least keeps lines from crossing boundaries on a no-audio
 * preview. */
export function buildPassageCaptionLines(
  clips: NarrationClipTiming[],
  totalSeconds: number,
  fps: number,
  wordsPerLine: number = DEFAULT_WORDS_PER_LINE,
): CaptionLine[] {
  const usable = clips.filter((c) => c.text.trim().length > 0);
  if (usable.length === 0) return [];

  const measured = usable.every((c) => typeof c.durationSeconds === "number" && c.durationSeconds > 0);
  const weights = usable.map((c) => Math.max(1, c.text.trim().length));
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  const lines: CaptionLine[] = [];
  let estimatedOffset = 0;

  usable.forEach((clip, index) => {
    const duration = measured ? clip.durationSeconds! : (weights[index] / weightTotal) * totalSeconds;
    const offset = measured ? (clip.offsetSeconds ?? 0) : estimatedOffset;
    estimatedOffset += duration;

    const offsetFrames = Math.round(offset * fps);
    for (const line of buildWordCaptionLines(clip.text, duration, fps, wordsPerLine)) {
      lines.push({
        startFrame: line.startFrame + offsetFrames,
        endFrame: line.endFrame + offsetFrames,
        words: line.words.map((w) => ({ ...w, startFrame: w.startFrame + offsetFrames, endFrame: w.endFrame + offsetFrames })),
      });
    }
  });

  return lines;
}
