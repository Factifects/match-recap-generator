import fs from "node:fs";
import path from "node:path";
import { parseAnalysisScript } from "./script/parseAnalysisScript";
import { parseSceneScript, isSceneScript } from "./script/parseSceneScript";
import { autoFixGeometry } from "./script/validateGeometry";
import { mergeCanvasContinuity } from "./script/mergeCanvasContinuity";
import { resolveSegmentAudio, generateBackgroundMusic, type TtsProvider } from "./audio/resolveAudio";
import { renderVideo, type RenderProgress } from "./render/renderVideo";
import type { TimedSegment, AspectRatio, AudioClipPlacement } from "./model/Segment";

export interface GenerateOptions {
  withAudio: boolean;
  ttsProvider?: TtsProvider;
  edgeVoice?: string;
  aspectRatio?: AspectRatio;
  outputName?: string;
  /** Overrides the render's auto-computed (free-RAM-based) concurrency — see
   * renderVideo.ts's safeConcurrency(). Leave unset to let it size itself to
   * whatever RAM is actually free at render time. */
  concurrency?: number;
  onLog?: (message: string) => void;
  onProgress?: (progress: RenderProgress) => void;
  /** A user-supplied whole-video background music file, already uploaded via
   * POST /uploads/audio before hitting Generate. Takes priority over (and
   * skips entirely) the auto-generated ElevenLabs ambient bed. */
  backgroundMusicPath?: string;
  /** Pre-generation timeline-preview edits (GeneratePage.tsx's `POST /parse`
   * -> reorder/trim -> Generate flow): the exact segment array to render
   * with, already reordered/trimmed by the user, in place of freshly
   * re-parsing `scriptText`. Segments with `manualDurationOverride: true`
   * keep their user-set duration through resolveSegmentAudio; every other
   * segment still gets its duration from the real narration length as
   * usual. Falls back to parsing `scriptText` when absent (e.g. the preview
   * parse never ran or failed). */
  segments?: TimedSegment[];
  /** Sound-effect/music clips placed in the pre-generation timeline preview
   * — carried straight through into the render's TimelinePayload. */
  audioClips?: AudioClipPlacement[];
}

export interface GenerateResult {
  outputPath: string;
  /** Basename (no extension) of the rendered mp4 — also the sidecar JSON's
   * name (see renderAndPersist) that a later timeline-edit pass reloads. */
  outputName: string;
  segmentCount: number;
  totalSeconds: number;
  usedSceneFormat: boolean;
}

/** Everything a render pass (and its sidecar JSON) needs — the exact shape
 * persisted to `output/<outputName>.json` and reloaded by the timeline
 * editor. `audioClips` is the user-placed sound-effect/music-clip layer:
 * each entry has its own position and trimmed length, independent of segment
 * boundaries, so the same uploaded file can be placed more than once. */
export interface TimelinePayload {
  segments: TimedSegment[];
  aspectRatio: AspectRatio;
  backgroundMusicPath?: string;
  audioClips?: AudioClipPlacement[];
}

const OUTPUT_DIR = path.join(process.cwd(), "output");

/** A segment's real floor once real narration resolves is
 * `Math.max(durationSeconds, visualMinDurationSeconds)` — matches the same
 * helper duplicated in the timeline-editor UI (GeneratePage.tsx/Timeline.tsx). */
function effectiveDurationOf(segment: TimedSegment): number {
  return Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0);
}

function cumulativeStarts(segments: TimedSegment[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const segment of segments) {
    starts.push(acc);
    acc += effectiveDurationOf(segment);
  }
  return starts;
}

/** Audio clips placed in the pre-generation timeline preview are positioned
 * against ESTIMATED segment durations (word-count guesses, or a script's
 * authored `Duration:` field) — real narration audio essentially never
 * matches that estimate exactly, so every segment's real start time shifts
 * a little (sometimes a lot, for a multi-phase Canvas/TacticalBoard scene
 * whose floor the estimate undershot) once `resolveSegmentAudio` runs. Left
 * alone, a clip's untouched absolute `startSeconds` silently drifts out of
 * sync with whatever moment in the narration it was actually placed against
 * — this is what "my sfx landed in the wrong place after render" was.
 *
 * Fix: find which segment each clip was positioned relative to (using the
 * OLD/estimated timeline), then re-anchor it to the same relative position
 * within that same segment's NEW/real span — proportionally scaled if the
 * segment's own duration changed, so a clip placed a third of the way into
 * a scene stays a third of the way into that scene even if the scene grew
 * or shrank. Segment count/order is guaranteed identical before and after
 * (resolveSegmentAudio only ever changes each segment's own duration/audio
 * fields, 1:1 by index — see its own `segments.map`), so aligning by index
 * between the two timelines is safe. */
function resyncAudioClipsToRealDurations(
  oldSegments: TimedSegment[],
  newSegments: TimedSegment[],
  audioClips: AudioClipPlacement[],
): AudioClipPlacement[] {
  if (oldSegments.length === 0 || oldSegments.length !== newSegments.length) return audioClips;
  const oldStarts = cumulativeStarts(oldSegments);
  const newStarts = cumulativeStarts(newSegments);
  const newTotal = newStarts[newStarts.length - 1] + effectiveDurationOf(newSegments[newSegments.length - 1]);

  return audioClips.map((clip) => {
    let idx = 0;
    for (let i = 0; i < oldStarts.length; i++) {
      if (oldStarts[i] <= clip.startSeconds) idx = i;
      else break;
    }
    const oldSegStart = oldStarts[idx];
    const oldSegDuration = effectiveDurationOf(oldSegments[idx]);
    const newSegStart = newStarts[idx];
    const newSegDuration = effectiveDurationOf(newSegments[idx]);

    const offsetIntoSegment = clip.startSeconds - oldSegStart;
    const scale = oldSegDuration > 0 ? newSegDuration / oldSegDuration : 1;
    const resyncedStart = newSegStart + offsetIntoSegment * scale;

    // Never let the resync push a clip past the real video's own end —
    // same "clip clips itself" floor as everywhere else this is handled.
    const maxStart = Math.max(0, newTotal - clip.durationSeconds);
    return { ...clip, startSeconds: Math.min(Math.max(0, resyncedStart), maxStart) };
  });
}

/** Renders a timeline and writes a sidecar `<outputName>.json` next to the mp4
 * so a completed render can be reloaded and edited later — the in-memory job
 * tracking in server.ts is deleted right after each render finishes, so this
 * file is the only thing that survives past that point. Shared by both
 * generateVideo (fresh script -> render) and renderEditedTimeline (edited
 * timeline -> re-render), so the two entry points can't drift on output
 * naming or sidecar shape. */
async function renderAndPersist(
  timeline: TimelinePayload,
  outputName: string,
  onProgress?: (progress: RenderProgress) => void,
  concurrency?: number,
): Promise<{ outputPath: string; totalSeconds: number }> {
  const outputPath = path.join(OUTPUT_DIR, `${outputName}.mp4`);
  await renderVideo("AnalysisVideo", { ...timeline }, outputPath, onProgress, concurrency);

  const totalSeconds = timeline.segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${outputName}.json`), JSON.stringify(timeline, null, 2));

  return { outputPath, totalSeconds };
}

function outputNameFor(aspectRatio: AspectRatio, prefix: string): string {
  const orientationSuffix = aspectRatio === "9:16" ? "-9x16" : "-16x9";
  return `${prefix}-${Date.now()}${orientationSuffix}`;
}

export interface RenderTimelineOptions {
  outputName?: string;
  concurrency?: number;
  onProgress?: (progress: RenderProgress) => void;
}

/** Re-renders an already-resolved timeline (segments/audioClips a user edited
 * in the post-generation timeline view — reordered, trimmed, sound placed,
 * etc.) straight to video, skipping script parsing and narration/audio
 * generation entirely since that already happened for these segments in an
 * earlier generateVideo run. Always writes to a new outputName so the
 * original render + its sidecar JSON are left intact. */
export async function renderEditedTimeline(
  timeline: TimelinePayload,
  options: RenderTimelineOptions = {},
): Promise<GenerateResult> {
  const outputName = options.outputName ?? outputNameFor(timeline.aspectRatio, "edited");
  const { outputPath, totalSeconds } = await renderAndPersist(timeline, outputName, options.onProgress, options.concurrency);
  return { outputPath, outputName, segmentCount: timeline.segments.length, totalSeconds, usedSceneFormat: true };
}

/** The one shared pipeline (parse -> optional real narration audio -> render)
 * behind both the CLI and the local generator UI, so the two entry points
 * can never drift out of sync with each other. */
export async function generateVideo(scriptText: string, options: GenerateOptions): Promise<GenerateResult> {
  const log = options.onLog ?? (() => {});
  const usedSceneFormat = isSceneScript(scriptText);
  let segments: TimedSegment[] =
    options.segments ?? (usedSceneFormat ? parseSceneScript(scriptText) : parseAnalysisScript(scriptText));

  log(
    options.segments
      ? `Using ${segments.length} segments from the timeline preview (already reordered/trimmed).`
      : `Parsed ${segments.length} segments as ${usedSceneFormat ? "scene-spec" : "prose+tags"} format.`,
  );

  // Auto-corrects the recurring "LW/RW (or Formation slot order) backwards"
  // mistake instead of blocking generation on it — see validateGeometry.ts.
  // Applied unconditionally (including pre-parsed timeline-preview segments)
  // since it's a no-op when everything's already correct.
  const { segments: geometryFixedSegments, fixes } = autoFixGeometry(segments);
  segments = geometryFixedSegments;
  if (fixes.length > 0) {
    log(`Auto-corrected ${fixes.length} left/right position mistake${fixes.length > 1 ? "s" : ""}:`);
    fixes.forEach((fix) => log(`  - ${fix}`));
  }

  // Folds any `**Continue Canvas:** true` scenes into the continuous camera
  // passage they belong to — must run before the preAudioSegments snapshot
  // below, since resyncAudioClipsToRealDurations requires segment count to
  // already match between the pre- and post-audio arrays (see its own
  // comment). No-op when no script uses the feature.
  const { segments: canvasMergedSegments, notes: canvasMergeNotes } = mergeCanvasContinuity(segments);
  segments = canvasMergedSegments;
  if (canvasMergeNotes.length > 0) {
    log(`Merged continuous Canvas passages (${canvasMergeNotes.length} note${canvasMergeNotes.length > 1 ? "s" : ""}):`);
    canvasMergeNotes.forEach((note) => log(`  - ${note}`));
  }

  let audioClips = options.audioClips;
  let backgroundMusicPath = options.backgroundMusicPath;
  if (options.withAudio) {
    const provider = options.ttsProvider ?? "elevenlabs";
    log(
      provider === "edge"
        ? `Generating narration audio via Edge TTS (free, voice: ${options.edgeVoice ?? "default"})...`
        : "Generating narration audio via ElevenLabs (real API cost applies)...",
    );
    const preAudioSegments = segments;
    segments = await resolveSegmentAudio(segments, { provider, edgeVoice: options.edgeVoice });
    if (audioClips && audioClips.length > 0) {
      audioClips = resyncAudioClipsToRealDurations(preAudioSegments, segments, audioClips);
      log("Re-synced sound effect/music placements to the real narration timing.");
    }
    if (backgroundMusicPath) {
      log("Using your uploaded background music file.");
    } else {
      // Independent of the narration provider above — edge-tts is speech-only, so the
      // ambient bed always goes through ElevenLabs's sound-generation endpoint regardless
      // of whether narration itself used the free edge voice or real ElevenLabs speech.
      log("Generating low ambient background music bed via ElevenLabs (real API cost applies)...");
      backgroundMusicPath = await generateBackgroundMusic("elevenlabs");
    }
  }

  const totalSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  log(
    `Total on-screen time: ${(totalSeconds / 60).toFixed(1)} minutes${
      options.withAudio ? " (from real narration audio)" : " (word-count estimate)"
    }.`,
  );

  const aspectRatio: AspectRatio = options.aspectRatio ?? "16:9";
  const outputName = options.outputName ?? outputNameFor(aspectRatio, "generated");
  log(`Rendering to output/${outputName}.mp4...`);
  const { outputPath, totalSeconds: renderedTotalSeconds } = await renderAndPersist(
    { segments, aspectRatio, backgroundMusicPath, audioClips },
    outputName,
    options.onProgress,
    options.concurrency,
  );
  log("Render complete.");

  return { outputPath, outputName, segmentCount: segments.length, totalSeconds: renderedTotalSeconds, usedSceneFormat };
}
