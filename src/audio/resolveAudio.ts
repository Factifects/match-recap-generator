import path from "node:path";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { generateSoundEffect, generateSpeechWithTimestamps as generateSpeech, type GeneratedSpeech } from "./elevenLabs";
import { generateSpeechEdge } from "./edgeTts";
import type { TimedSegment, Visual } from "../model/Segment";
import { getCanvasSoundCue, type CanvasSoundEvent } from "../cadence/canvasCadences";
import { findSfxAsset } from "../video/assets";

const CHAPTER_TRANSITION_PROMPT = "soft page turn sound, book flip, gentle paper rustle, brief, no whoosh, no music";

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
 * audio length, and attaches a shared page-turn SFX to chapter beats to go with the
 * swoosh wipe transition. This is what makes on-screen timing exactly match what
 * gets said out loud, instead of an estimate.
 *
 * The chapter transition SFX is always generated via ElevenLabs (edge-tts is speech-only,
 * it can't produce a sound effect) — when provider is "edge", chapter beats simply
 * play without it instead of silently requiring an ElevenLabs key just for
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

// Real, curated files win over ElevenLabs sound-generation for Canvas SFX
// cues — prompt-generated SFX has repeatedly landed wrong ("sounds like a
// bounce", "ball dropped in a bucket of water" — see canvasCadences.ts's own
// history) and re-prompting is a dead end the code there explicitly warns
// against. A real file's own duration (not the palette's guessed
// durationSeconds) is what actually gets used once one exists — same
// parseMedia call generateAndCache already uses for generated audio, so a
// real file behaves identically to a generated one everywhere downstream
// (sidecar JSON, Html5Audio Sequence length). Cached per-process (a
// long-running server/CLI call resolves the same handful of files many
// times across many segments) rather than per-render, since these never
// change mid-process.
const sfxFileCache = new Map<string, Promise<GeneratedSpeech> | null>();

async function resolveCanvasSoundCue(event: CanvasSoundEvent): Promise<GeneratedSpeech> {
  if (!sfxFileCache.has(event)) {
    const relativePath = findSfxAsset(event);
    sfxFileCache.set(
      event,
      relativePath
        ? (async (): Promise<GeneratedSpeech> => {
            const audioFilePath = path.join(process.cwd(), "public", relativePath);
            const { durationInSeconds } = await parseMedia({ src: audioFilePath, fields: { durationInSeconds: true }, reader: nodeReader });
            if (!durationInSeconds) throw new Error(`Could not determine duration for sfx asset: ${audioFilePath}`);
            return { audioFilePath, staticFilePath: relativePath, durationSeconds: durationInSeconds };
          })()
        : null,
    );
  }
  const cached = sfxFileCache.get(event);
  if (cached) return cached;
  const cue = getCanvasSoundCue(event);
  return generateSoundEffect(cue.prompt, cue.durationSeconds);
}

export interface SegmentSoundCue {
  prompt: string;
  durationSeconds: number;
}

function inferCanvasCueEvent(visual: Visual): CanvasSoundEvent {
  if (visual.kind !== "canvas") return "entrance";

  const hasTimelineMotion = Array.isArray((visual as { timeline?: unknown[] }).timeline)
    && (visual as { timeline?: unknown[] }).timeline!.some((action) => typeof action === "object" && action !== null && "type" in action && (action as { type?: string }).type === "move");
  if (hasTimelineMotion) return "move";

  // Canvas's own top-level `camera` is a single {x,y,zoom} stage, not an
  // array (that's `phases[].camera` for a per-phase glide target) — this
  // used to check `Array.isArray(visual.camera)`, which is never true for
  // that shape and left the "zoom" cue unreachable via this path.
  const hasCameraZoom = (visual.camera?.zoom ?? 1) > 1.05;
  const hasMultiplePhases = (visual.phases?.length ?? 0) > 1;
  if (hasCameraZoom || hasMultiplePhases) return "zoom";

  if ((visual.objects?.length ?? 0) > 0) return "highlight";
  return "entrance";
}

export interface SegmentSfxClueCue {
  event: CanvasSoundEvent;
  startSeconds: number;
  /** Trims playback to this long. Without it a clip runs for the whole length
   * of its source file, which is how a half-second typing cue ended up still
   * sounding after the typing had visibly finished. */
  durationSeconds?: number;
  /** 0-1. Lets a cue that fires many times in a row sit far back in the mix. */
  volume?: number;
}

/** Pulls every timeline action that opted into a `sound` cue out of a Canvas
 * scene's timeline, paired with that action's own `startSeconds` — the
 * per-beat replacement for `resolveSegmentSfxCue`'s one whole-scene guess.
 * Returns `undefined` (not an empty array) when the scene has a timeline but
 * nobody annotated any action with `sound`, so the caller can tell "opted
 * out" apart from "opted in with zero cues" and fall back to the old
 * single-cue behavior for scripts that predate this field. */
export function resolveSegmentSfxClueCues(segment: TimedSegment): SegmentSfxClueCue[] | undefined {
  if (segment.type !== "statement") return undefined;

  // TYPING SOUND IS DELIBERATELY OFF (2026-08-11, at the user's request:
  // "remove the keyboard typing sfx, just leave the typing feature").
  //
  // The visual typing feature is unaffected — this only stops sound being
  // attached to it. Nothing here is broken; the machinery is intact and tested
  // (`typingSoundBursts` in typewriter.ts, with its own tests, plus the clip
  // trimming/volume/offset plumbing below and the duration remap in
  // fitSegmentsToNarration). The blocker was never the timing, it was the
  // SOURCE: with public/assets/sfx/ empty this fell back to ElevenLabs
  // generation, which kept producing a typewriter rather than a keyboard.
  //
  // TO TURN IT BACK ON: drop a real keyboard sample at
  // public/assets/sfx/typing.mp3 (a curated file always beats generation, see
  // resolveCanvasSoundCue) and restore the block below, which built one burst
  // per word from the run's own text:
  //
  //   if (segment.visual?.kind === "workspace" && segment.visual.timeline) {
  //     const cues: SegmentSfxClueCue[] = [];
  //     for (const action of segment.visual.timeline) {
  //       if (action.type !== "type") continue;
  //       const pane = segment.visual.panes.find((p) => p.id === action.pane);
  //       if (!pane || pane.type !== "editor") continue;
  //       const lineTexts = pane.lines.map((t) => t.map((tok) => tok.text).join(""));
  //       const run = { fromLine: 1, throughLine: Math.min(action.throughLine, lineTexts.length),
  //                     startSeconds: action.startSeconds, durationSeconds: action.durationSeconds,
  //                     charsPerSecond: action.charsPerSecond };
  //       for (const burst of typingSoundBursts(lineTexts, run)) {
  //         cues.push({ event: "typing", startSeconds: burst.startSeconds,
  //                     durationSeconds: burst.durationSeconds, volume: TYPING_VOLUME });
  //       }
  //     }
  //     return cues.length > 0 ? cues : undefined;
  //   }

  if (segment.visual?.kind !== "canvas" || !segment.visual.timeline) return undefined;

  const cues: SegmentSfxClueCue[] = [];
  for (const action of segment.visual.timeline) {
    const sound = "sound" in action ? action.sound : undefined;
    if (sound) cues.push({ event: sound, startSeconds: action.startSeconds });
  }
  return cues.length > 0 ? cues : undefined;
}

export function resolveSegmentSfxCue(segment: TimedSegment): SegmentSoundCue | undefined {
  if (segment.type === "chapter") {
    return {
      prompt: CHAPTER_TRANSITION_PROMPT,
      durationSeconds: 1,
    };
  }

  if (segment.type === "statement" && segment.visual?.kind === "canvas") {
    return getCanvasSoundCue(inferCanvasCueEvent(segment.visual));
  }

  return undefined;
}

export async function resolveSegmentAudio(
  segments: TimedSegment[],
  options: ResolveAudioOptions = {},
): Promise<TimedSegment[]> {
  const provider = options.provider ?? "elevenlabs";
  const edgeVoice = options.edgeVoice;
  // Sound effects always come from ElevenLabs even when narration uses Edge TTS,
  // since the user explicitly asked for 11Labs-powered cadence/ambient cues.
  // Skipped entirely when the batch has no chapter segment — matters for
  // scene preview, where resolveSegmentAudio is called on a single
  // non-chapter segment and would otherwise pay for (and wait on) a chapter
  // transition SFX it will never use.
  const hasChapter = segments.some((s) => s.type === "chapter");
  const chapterSfx = hasChapter ? await generateSoundEffect(CHAPTER_TRANSITION_PROMPT, 1) : null;

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

  const sfxAssets: (GeneratedSpeech | null)[] = [];
  const sfxClipAssets: (
    | { staticPath: string; startSeconds: number; durationSeconds: number; volume?: number; trimStartSeconds?: number }[]
    | null
  )[] = [];
  for (const segment of segments) {
    if (segment.type === "chapter") {
      sfxAssets.push(chapterSfx);
      sfxClipAssets.push(null);
      continue;
    }

    const clueCues = resolveSegmentSfxClueCues(segment);
    if (clueCues) {
      // Per-action cues opted in — generate each distinct event once (cached
      // by prompt+duration hash inside generateSoundEffect, so a repeated
      // event across actions costs nothing extra) and place every cue at its
      // own action's startSeconds instead of one whoosh under the whole scene.
      const resolvedByEvent = new Map<string, GeneratedSpeech>();
      const clips: {
        staticPath: string;
        startSeconds: number;
        durationSeconds: number;
        volume?: number;
        trimStartSeconds?: number;
      }[] = [];
      let clipIndex = 0;
      for (const clue of clueCues) {
        let asset = resolvedByEvent.get(clue.event);
        if (!asset) {
          asset = await resolveCanvasSoundCue(clue.event);
          resolvedByEvent.set(clue.event, asset);
        }
        const clipDuration =
          clue.durationSeconds !== undefined ? Math.min(clue.durationSeconds, asset.durationSeconds) : asset.durationSeconds;
        // Walk through the source file rather than replaying its opening every
        // time, so a run of keyboard bursts does not audibly loop one sample.
        const slack = Math.max(0, asset.durationSeconds - clipDuration);
        const trimStartSeconds = slack > 0 ? (clipIndex * 0.137) % slack : undefined;
        clipIndex += 1;
        clips.push({
          staticPath: asset.staticFilePath,
          startSeconds: clue.startSeconds,
          // The cue's own length wins when it asks for one, so playback is
          // trimmed to the beat rather than running for the whole source file.
          durationSeconds: clipDuration,
          volume: clue.volume,
          trimStartSeconds,
        });
      }
      sfxAssets.push(null);
      sfxClipAssets.push(clips);
      continue;
    }

    // The whole-scene canvas fallback goes through resolveCanvasSoundCue too
    // (real file first) — resolveSegmentSfxCue itself stays prompt-only
    // (its return shape is asserted directly in resolveAudio.test.ts), so
    // this re-derives the event name via inferCanvasCueEvent rather than
    // routing through it, instead of widening a tested public contract.
    const sfxAsset =
      segment.type === "statement" && segment.visual?.kind === "canvas"
        ? await resolveCanvasSoundCue(inferCanvasCueEvent(segment.visual))
        : null;
    sfxAssets.push(sfxAsset);
    sfxClipAssets.push(null);
  }

  return segments.map((segment, index) => {
    const speech = speeches[index];
    const sfxAsset = sfxAssets[index];
    const sfxClips = sfxClipAssets[index] ?? undefined;

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

      // A merged TacticalBoard passage (see mergeTacticalContinuity.ts)
      // carries every folded-in sub-scene's `timeline` events still relative
      // to that sub-scene's own local zero — shift every event inside each
      // `_boardClipRanges` slice by that clip's real cumulative narration
      // offset now that it's known, same "defer until real duration exists"
      // approach as the Canvas boundary-phase anchoring above. Every action
      // type carries its own `startSeconds`, so one flat map handles move/
      // state/possession/camera/freeze alike.
      if (visual?.kind === "tactical-board" && segment._boardClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._boardClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._boardClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          return { ...action, startSeconds: action.startSeconds + clipOffset };
        });
        visual = { ...visual, timeline };
      }

      // A merged Diagram passage (see mergeDiagramContinuity.ts) — identical
      // shift to the TacticalBoard case above, `_diagramClipRanges` instead
      // of `_boardClipRanges`. Every Diagram timeline action variant
      // (addNode/addEdge/flow/focus/setState/annotate/removeNode/setValue/
      // meter) carries its own `startSeconds`, so the same flat map handles
      // all of them alike.
      // A folded Stage passage (see mergeStageContinuity.ts) — same shift, with
      // `_stageClipRanges`. Every Stage action variant carries its own
      // `startSeconds`, so one flat map handles all of them alike.
      if (visual?.kind === "stage" && segment._stageClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._stageClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._stageClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          // Correct by the DIFFERENCE. mergeStageContinuity already shifted
          // these actions by its own estimate so that a no-audio render of a
          // folded passage is coherent; adding the real offset on top of that
          // would shift them twice.
          const applied = range?.appliedOffsetSeconds ?? 0;
          return { ...action, startSeconds: Math.max(0, action.startSeconds + (clipOffset - applied)) };
        });
        visual = { ...visual, timeline };
      }

      // A folded Spatial passage (see mergeSpatialContinuity.ts) — identical to
      // the Stage case above, including the correct-by-the-difference rule,
      // since mergeSpatialContinuity also pre-shifts by its own estimate so a
      // no-audio preview of a passage stays coherent. Every spatial action
      // variant (enter/exit/travel/camera/orbit/mapAgents/beat/annotate/...)
      // carries its own `startSeconds`, so one flat map handles all of them.
      if (visual?.kind === "spatial" && segment._spatialClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._spatialClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._spatialClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          const applied = range?.appliedOffsetSeconds ?? 0;
          return { ...action, startSeconds: Math.max(0, action.startSeconds + (clipOffset - applied)) };
        });
        visual = { ...visual, timeline };
      }

      // A folded Holdings passage — same correct-by-the-difference rule.
      // A folded Channels passage — same correct-by-the-difference rule.
      // A merged TIMELINE-authored Canvas passage.
      if (visual?.kind === "canvas" && segment._canvasTimelineClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._canvasTimelineClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._canvasTimelineClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          const applied = range?.appliedOffsetSeconds ?? 0;
          return { ...action, startSeconds: Math.max(0, action.startSeconds + (clipOffset - applied)) };
        });
        visual = { ...visual, timeline };
      }

      if (visual?.kind === "channels" && segment._channelsClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._channelsClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._channelsClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          const applied = range?.appliedOffsetSeconds ?? 0;
          return { ...action, startSeconds: Math.max(0, action.startSeconds + (clipOffset - applied)) };
        });
        visual = { ...visual, timeline };
      }

      if (visual?.kind === "holdings" && segment._holdingsClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._holdingsClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._holdingsClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          const applied = range?.appliedOffsetSeconds ?? 0;
          return { ...action, startSeconds: Math.max(0, action.startSeconds + (clipOffset - applied)) };
        });
        visual = { ...visual, timeline };
      }

      if (visual?.kind === "diagram" && segment._diagramClipRanges && visual.timeline) {
        const timeline = visual.timeline.map((action, actionIndex) => {
          const range = segment._diagramClipRanges!.find((r) => actionIndex >= r.from && actionIndex < r.to);
          const clipIndex = range ? segment._diagramClipRanges!.indexOf(range) : 0;
          const clipOffset = narrationClips[clipIndex]?.offsetSeconds ?? 0;
          return { ...action, startSeconds: action.startSeconds + clipOffset };
        });
        visual = { ...visual, timeline };
      }

      return {
        ...segment,
        durationSeconds,
        // The authoritative clock for this passage — the sum of every
        // sub-scene's MEASURED narration, kept separate from `durationSeconds`
        // (which may legitimately exceed it via a visual floor or a declared
        // hold). See narrationFit.ts.
        narrationSeconds: totalSpeechSeconds,
        visual,
        phases,
        narrationClips,
        sfxStaticPath: sfxAsset?.staticFilePath,
        sfxClips,
        // Bookkeeping only mergeCanvasContinuity.ts/mergeTacticalContinuity.ts/
        // this branch needed — already fully applied above (boundary phases/
        // timeline events anchored, captions shifted), so cleared rather than
        // left stale for anything downstream to mistake for still-pending work.
        _canvasClipBoundaries: undefined,
        _canvasCaptionRanges: undefined,
        _boardClipRanges: undefined,
        _spatialClipRanges: undefined,
        _holdingsClipRanges: undefined,
        _channelsClipRanges: undefined,
        _canvasTimelineClipRanges: undefined,
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
      // The real spoken length, before any visual floor or manual override is
      // folded in — this is what narrationFit.ts schedules choreography against.
      narrationSeconds: speech.durationSeconds,
      audioStaticPath: speech.staticFilePath,
      // Real per-word timings when the provider measured them; absent otherwise,
      // which every consumer already treats as "estimate instead".
      wordTimings: speech.wordTimings,
      sfxStaticPath: segment.type === "chapter"
        ? chapterSfx?.staticFilePath
        : sfxAsset?.staticFilePath,
      sfxClips,
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
