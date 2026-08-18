// Karaoke-style caption timing: given a segment's narration TEXT and its real
// (post-TTS) spoken duration, produce short lines of a few words each with a
// per-word [startFrame, endFrame) window so a caption overlay can highlight
// whichever word is being spoken right now. There is no per-word ASR/alignment
// available from either TTS provider this project uses (see resolveAudio.ts —
// ElevenLabs/Edge both return only a whole-clip duration), so word timing is
// ESTIMATED by distributing the real total duration across words proportional
// to a weight (character count, with a bonus for trailing punctuation to admit
// the small pause a comma/period actually gets spoken with) — the same
// estimate-against-a-real-total approach estimateDuration.ts and narrationFit.ts
// already use elsewhere in this pipeline, just at word granularity instead of
// scene granularity.

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
