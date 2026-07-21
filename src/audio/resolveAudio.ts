import { generateSoundEffect, generateSpeech, type GeneratedSpeech } from "./elevenLabs";
import { generateSpeechEdge } from "./edgeTts";
import type { TimedSegment } from "../model/Segment";

const CHAPTER_WHOOSH_PROMPT = "short sharp whoosh transition sound effect, cinematic, punchy";

const BACKGROUND_MUSIC_PROMPT =
  "very low, sparse, mysterious magical orchestral ambience, soft sustained strings and distant celesta, " +
  "Harry Potter-style underscore, no drums, no percussion, no melody hooks, gentle and unobtrusive, loopable";
// 22s stays under the sound-generation endpoint's 30s cap; long enough for a
// low sustained pad to loop under a multi-minute video without an obvious seam.
const BACKGROUND_MUSIC_DURATION_SECONDS = 22;

export type TtsProvider = "elevenlabs" | "edge";

export interface ResolveAudioOptions {
  provider?: TtsProvider;
  /** Edge voice ID (e.g. "en-US-GuyNeural") — only meaningful when provider is "edge". */
  edgeVoice?: string;
}

// Edge TTS is free/unmetered (Microsoft's Read Aloud service, no API key, no
// per-character cost) so running several calls at once carries none of the
// runaway-cost risk a parallel ElevenLabs loop would — ElevenLabs stays
// strictly sequential below, unchanged. 4 is a modest batch size: enough to
// meaningfully cut wall-clock time on a multi-scene script without hammering
// a free third-party service hard enough to risk it rate-limiting us.
const EDGE_TTS_CONCURRENCY = 4;

/** Runs `fn` over `items` with at most `limit` in flight at once, returning
 * results in the same order as `items` regardless of completion order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Replaces every segment's word-count-estimated duration with its real narration
 * audio length, and attaches a shared whoosh SFX to chapter beats to go with the
 * swoosh wipe transition. This is what makes on-screen timing exactly match what
 * gets said out loud, instead of an estimate.
 *
 * The chapter whoosh SFX is always generated via ElevenLabs (edge-tts is speech-only,
 * it can't produce a sound effect) — when provider is "edge", chapter beats simply
 * play without a whoosh instead of silently requiring an ElevenLabs key just for
 * that one sound, which would defeat the point of trying a free provider.
 *
 * Edge-tts narration generation runs with bounded parallelism (see
 * EDGE_TTS_CONCURRENCY) since it's free/unmetered network I/O, not a
 * memory-heavy step — safe to speed up independently of render concurrency,
 * which stays capped by free RAM (see renderVideo.ts's safeConcurrency).
 * ElevenLabs generation stays sequential, one call at a time, to keep its
 * cost/rate-limit behavior exactly as it's always been. */
/** Synthesizes one piece of text via whichever provider is active — the
 * single call site every branch below (single-clip and multi-clip alike)
 * funnels through, so provider selection only lives in one place. */
function synthesizeOne(text: string, provider: TtsProvider, edgeVoice?: string): Promise<GeneratedSpeech> {
  return provider === "edge" ? generateSpeechEdge(text, edgeVoice) : generateSpeech(text);
}

export async function resolveSegmentAudio(
  segments: TimedSegment[],
  options: ResolveAudioOptions = {},
): Promise<TimedSegment[]> {
  const provider = options.provider ?? "elevenlabs";
  const edgeVoice = options.edgeVoice;
  const sfx = provider === "elevenlabs" ? await generateSoundEffect(CHAPTER_WHOOSH_PROMPT, 1) : null;

  // A merged Canvas passage (see mergeCanvasContinuity.ts) carries several
  // sub-scenes' own narration in `narrationClips` instead of one text in
  // `text`/`narrationText` — each of its clips needs its own `generateSpeech`
  // call, synthesized in the same order as the clips themselves (still one
  // ElevenLabs call at a time for that segment, matching this function's
  // existing "stay sequential" cost/rate-limit posture; edge-tts's bounded
  // cross-segment concurrency below is otherwise unaffected). Every ordinary
  // segment (the overwhelming majority) takes the exact same single-text path
  // as before — `narrationText` still wins over `text` when set (Chapter
  // scenes: a short on-screen Annotation shouldn't also cap what actually
  // gets spoken).
  async function synthesizeSegment(segment: TimedSegment): Promise<GeneratedSpeech | GeneratedSpeech[]> {
    if (segment.narrationClips) {
      const results: GeneratedSpeech[] = [];
      for (const clip of segment.narrationClips) results.push(await synthesizeOne(clip.text, provider, edgeVoice));
      return results;
    }
    return synthesizeOne(segment.narrationText ?? segment.text, provider, edgeVoice);
  }

  const speeches: (GeneratedSpeech | GeneratedSpeech[])[] =
    provider === "edge"
      ? await mapWithConcurrency(segments, EDGE_TTS_CONCURRENCY, (segment) => synthesizeSegment(segment))
      : await (async () => {
          const results: (GeneratedSpeech | GeneratedSpeech[])[] = [];
          for (const segment of segments) results.push(await synthesizeSegment(segment));
          return results;
        })();

  return segments.map((segment, index) => {
    const speech = speeches[index];

    if (Array.isArray(speech)) {
      // Only mergeCanvasContinuity.ts ever sets `narrationClips`, and only on
      // a "statement" segment (chapters have no Canvas visual to merge) — this
      // narrows `segment` so `.visual` is accessible below without every
      // other branch of TimedSegment's discriminated union getting in the way.
      if (segment.type !== "statement") throw new Error("narrationClips set on a non-statement segment — mergeCanvasContinuity.ts invariant broken");

      // Merged Canvas passage — each clip plays at the running sum of every
      // prior clip's own real duration, so the total is exactly as long as
      // all the narration takes, with no fixed-frame guess involved anywhere.
      let offset = 0;
      const narrationClips = segment.narrationClips!.map((clip, clipIndex) => {
        const clipSpeech = speech[clipIndex];
        const resolved = { ...clip, staticPath: clipSpeech.staticFilePath, offsetSeconds: offset, durationSeconds: clipSpeech.durationSeconds };
        offset += clipSpeech.durationSeconds;
        return resolved;
      });
      const totalSpeechSeconds = offset;
      const durationSeconds = segment.manualDurationOverride
        ? segment.durationSeconds
        : segment.visualMinDurationSeconds
          ? Math.max(totalSpeechSeconds, segment.visualMinDurationSeconds)
          : totalSpeechSeconds;

      // Anchor each folded-in sub-scene's boundary Canvas phase, and shift
      // each sub-scene's own on-screen captions, to that sub-scene's real
      // cumulative narration offset — see mergeCanvasContinuity.ts's own
      // comments on `_canvasClipBoundaries`/`_canvasCaptionRanges` for why
      // this can only happen now, once real (not estimated) durations exist.
      let visual = segment.visual;
      if (visual?.kind === "canvas" && segment._canvasClipBoundaries) {
        const phases = [...(visual.phases ?? [])];
        segment._canvasClipBoundaries.forEach((phaseIndex, boundaryIndex) => {
          // boundaries[i] is the boundary phase for narrationClips[i + 1]
          // (clip 0 — the passage's first sub-scene — always starts at 0 and
          // has no boundary phase of its own; see foldCanvasScene).
          phases[phaseIndex] = { ...phases[phaseIndex], startSeconds: narrationClips[boundaryIndex + 1].offsetSeconds };
        });
        visual = { ...visual, phases };
      }
      const phases = segment._canvasCaptionRanges
        ? segment.phases?.map((caption, captionIndex) => {
            const range = segment._canvasCaptionRanges!.find((r) => captionIndex >= r.from && captionIndex < r.to);
            const clipIndex = range ? segment._canvasCaptionRanges!.indexOf(range) : 0;
            const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
            return { ...caption, startSeconds: (caption.startSeconds ?? 0) + clipOffset };
          })
        : segment.phases;

      return {
        ...segment,
        durationSeconds,
        visual,
        phases,
        narrationClips,
        sfxStaticPath: undefined,
        // Bookkeeping only mergeCanvasContinuity.ts/this branch needed —
        // already fully applied above (boundary phases anchored, captions
        // shifted), so cleared rather than left stale for anything
        // downstream to mistake for still-pending work.
        _canvasClipBoundaries: undefined,
        _canvasCaptionRanges: undefined,
      };
    }

    // A duration the user explicitly set in the pre-generation timeline
    // preview wins outright — narration audio still gets attached below (so
    // it plays), but its real length no longer dictates on-screen duration
    // the way it does for every other, unedited segment.
    const durationSeconds = segment.manualDurationOverride
      ? segment.durationSeconds
      : segment.visualMinDurationSeconds
        ? Math.max(speech.durationSeconds, segment.visualMinDurationSeconds)
        : speech.durationSeconds;
    return {
      ...segment,
      durationSeconds,
      audioStaticPath: speech.staticFilePath,
      sfxStaticPath: segment.type === "chapter" && sfx ? sfx.staticFilePath : undefined,
    };
  });
}

/** A single low, ambient music bed for the whole video (looped in AnalysisVideo.tsx via
 * Html5Audio's `loop` prop, not regenerated per segment) — same "always on with elevenlabs,
 * absent with edge" rule as the chapter whoosh above, since edge-tts has no sound-generation
 * endpoint. Cached by prompt text, same as every other generated asset. */
export async function generateBackgroundMusic(provider: TtsProvider = "elevenlabs"): Promise<string | undefined> {
  if (provider !== "elevenlabs") return undefined;
  const music = await generateSoundEffect(BACKGROUND_MUSIC_PROMPT, BACKGROUND_MUSIC_DURATION_SECONDS);
  return music.staticFilePath;
}
