import fs from "node:fs";
import path from "node:path";
import { parseAnalysisScript } from "./script/parseAnalysisScript";
import { parseSceneScript, isSceneScript } from "./script/parseSceneScript";
import { autoFixGeometry } from "./script/validateGeometry";
import { diagnoseScenes } from "./script/validateScene";
import { diagnoseNarrationSync } from "./script/validateNarrationSync";
import { fitSegmentsToNarration, describeFitOutcomes } from "./script/fitSegmentsToNarration";
import { resolveDiagramBrands } from "./script/resolveDiagramBrands";
import { hasHardFailures, sortDiagnostics, type SceneDiagnostic } from "./script/sceneDiagnostics";
import { mergeCanvasContinuity } from "./script/mergeCanvasContinuity";
import { mergeTacticalContinuity } from "./script/mergeTacticalContinuity";
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
  /** Opts INTO aborting the run when a hard scene issue is found. Off by
   * default: diagnostics are reported but never block, so an author can always
   * render and look at the result. The CLI exposes it as `--strict`. */
  strict?: boolean;
  /** Deprecated no-op, kept so older callers/sidecars don't break. Blocking is
   * now opt-in via `strict` rather than opt-out via `force`. */
  force?: boolean;
}

export interface GenerateResult {
  outputPath: string;
  /** Basename (no extension) of the rendered mp4 — also the sidecar JSON's
   * name (see renderAndPersist) that a later timeline-edit pass reloads. */
  outputName: string;
  segmentCount: number;
  totalSeconds: number;
  usedSceneFormat: boolean;
  /** The final (post-audio, authoritative) diagnostics report — present even
   * on a successful render (soft findings never block, but are still worth
   * surfacing). Empty for renderEditedTimeline, which skips validation
   * entirely (its segments already went through this once, in the
   * generateVideo run that produced them). */
  diagnostics: SceneDiagnostic[];
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
 * between the two timelines is safe.
 *
 * `durationSeconds` needs the same resync, not just `startSeconds` — a
 * background-music clip is seeded by "Add background music" to fill the
 * rest of the (then-estimated) video (see GeneratePage.tsx), so its old end
 * sits at (or right at) the OLD total duration. Leaving its duration
 * untouched while only shifting its start meant real narration running
 * LONGER than the estimate left the music stopping dead at the old
 * estimated total while narration kept going well past it — exactly the
 * "background music cuts out partway through" bug this fixes. Any clip
 * whose old end already reached the old timeline's own end is treated as
 * "meant to reach the end" and stretched/shrunk to reach the NEW total
 * instead; anything else (a one-off sfx ending well before the old video's
 * own end) keeps scaling by the same anchor-segment ratio as its start. */
function resyncAudioClipsToRealDurations(
  oldSegments: TimedSegment[],
  newSegments: TimedSegment[],
  audioClips: AudioClipPlacement[],
): AudioClipPlacement[] {
  if (oldSegments.length === 0 || oldSegments.length !== newSegments.length) return audioClips;
  const oldStarts = cumulativeStarts(oldSegments);
  const newStarts = cumulativeStarts(newSegments);
  const oldTotal = oldStarts[oldStarts.length - 1] + effectiveDurationOf(oldSegments[oldSegments.length - 1]);
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

    const oldEnd = clip.startSeconds + clip.durationSeconds;
    const reachedOldEnd = oldTotal - oldEnd < 0.5;
    const resyncedDuration = reachedOldEnd ? Math.max(0, newTotal - resyncedStart) : clip.durationSeconds * scale;

    // Never let the resync push a clip past the real video's own end —
    // same "clip clips itself" floor as everywhere else this is handled.
    const maxStart = Math.max(0, newTotal - resyncedDuration);
    return {
      ...clip,
      startSeconds: Math.min(Math.max(0, resyncedStart), maxStart),
      durationSeconds: resyncedDuration,
    };
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
 * original render + its sidecar JSON are left intact. No validation gate
 * here — these segments already passed through generateVideo once to reach
 * this point, and re-validating an already-edited timeline (whose durations
 * a user may have deliberately overridden) risks flagging edits the user
 * made on purpose. */
export async function renderEditedTimeline(
  timeline: TimelinePayload,
  options: RenderTimelineOptions = {},
): Promise<GenerateResult> {
  const outputName = options.outputName ?? outputNameFor(timeline.aspectRatio, "edited");
  const { outputPath, totalSeconds } = await renderAndPersist(timeline, outputName, options.onProgress, options.concurrency);
  return { outputPath, outputName, segmentCount: timeline.segments.length, totalSeconds, usedSceneFormat: true, diagnostics: [] };
}

/** Human-readable report, same convention as every other `log()` call in
 * this pipeline — reuses each SceneDiagnostic's own `message` (already
 * scene-numbered and self-explanatory), just tags severity/level so the
 * hard failures that actually block generation are easy to pick out of a
 * longer soft-warning list. */
function logDiagnostics(log: (message: string) => void, diagnostics: SceneDiagnostic[], heading: string): void {
  if (diagnostics.length === 0) {
    log(`${heading} none.`);
    return;
  }
  log(heading);
  for (const d of sortDiagnostics(diagnostics)) {
    log(`  [${d.severity === "hard" ? "HARD" : "soft"} L${d.level} ${d.category}] ${d.message}`);
  }
}

/** Aborts generation before further cost is spent, UNLESS `force` is set —
 * the gate sits at two points in generateVideo: right after parsing/merging
 * (before any audio is generated at all) and again after real narration
 * resolves (before the render itself, since real duration can newly cross
 * the low-richness scene-length threshold an estimate didn't). Both calls
 * share this one function so the error format and force-override behavior
 * can never drift between them. */
export function runEnforcementGate(diagnostics: SceneDiagnostic[], strict: boolean | undefined, stage: string): void {
  // ADVISORY BY DEFAULT. Findings are always reported; they only abort the run
  // when a caller explicitly opts into `strict`.
  //
  // This started as a hard gate, which was right when every scene was
  // hand-placed Canvas coordinates and a bad script reliably produced a broken
  // render. It stopped being right for two reasons. First, the structural media
  // (`diagram`, `workspace`) make the geometry failures it guards against
  // unrepresentable rather than merely detectable — there is nothing left for
  // it to catch there. Second, and more importantly, it was blocking the author
  // from looking at their own render, which is the single most valuable thing
  // they can do; a checker that prevents you from seeing the thing it is
  // complaining about costs more than it saves.
  if (!strict || !hasHardFailures(diagnostics)) return;
  const hard = sortDiagnostics(diagnostics).filter((d) => d.severity === "hard");
  const lines = hard.map((d) => `  - ${d.message}`).join("\n");
  throw new Error(
    `Generation blocked ${stage} by --strict — ${hard.length} scene issue${hard.length > 1 ? "s" : ""}:\n${lines}`,
  );
}

interface ResolvedSegments {
  segments: TimedSegment[];
  usedSceneFormat: boolean;
  /** Geometry-layer findings (overlaps, unconnected entities, low density —
   * see validateGeometry.ts) — independent of narration duration, so
   * computed once here rather than re-run pre- and post-audio the way
   * validateScene.ts's duration-dependent checks are. */
  geometryDiagnostics: SceneDiagnostic[];
}

/** The parse -> auto-fix -> merge sequence shared by generateVideo AND
 * previewScene — extracted so scene-level preview can never drift from what
 * a full render actually does. Selecting a scene by index AFTER this
 * resolves (not against the raw `### SCENE N` markers) is deliberate: a
 * merged Canvas/TacticalBoard continuity passage is one segment in the
 * array that actually renders, so "preview scene 5" means exactly what
 * full-render's scene 5 will look like. */
function resolveSegments(scriptText: string, presetSegments: TimedSegment[] | undefined, log: (message: string) => void): ResolvedSegments {
  const usedSceneFormat = isSceneScript(scriptText);
  let segments: TimedSegment[] = presetSegments ?? (usedSceneFormat ? parseSceneScript(scriptText) : parseAnalysisScript(scriptText));

  log(
    presetSegments
      ? `Using ${segments.length} segments from the timeline preview (already reordered/trimmed).`
      : `Parsed ${segments.length} segments as ${usedSceneFormat ? "scene-spec" : "prose+tags"} format.`,
  );

  // Auto-corrects the recurring "LW/RW (or Formation slot order) backwards"
  // mistake instead of blocking generation on it — see validateGeometry.ts.
  // Applied unconditionally (including pre-parsed timeline-preview segments)
  // since it's a no-op when everything's already correct.
  const { segments: geometryFixedSegments, fixes, diagnostics: geometryDiagnostics } = autoFixGeometry(segments);
  segments = geometryFixedSegments;
  if (fixes.length > 0) {
    log(`Auto-corrected ${fixes.length} left/right position mistake${fixes.length > 1 ? "s" : ""}:`);
    fixes.forEach((fix) => log(`  - ${fix}`));
  }

  // Folds any `**Continue Canvas:** true` scenes into the continuous camera
  // passage they belong to — must run before generateVideo's own
  // preAudioSegments snapshot, since resyncAudioClipsToRealDurations
  // requires segment count to already match between the pre- and post-audio
  // arrays (see its own comment). No-op when no script uses the feature.
  const { segments: canvasMergedSegments, notes: canvasMergeNotes } = mergeCanvasContinuity(segments);
  segments = canvasMergedSegments;
  if (canvasMergeNotes.length > 0) {
    log(`Merged continuous Canvas passages (${canvasMergeNotes.length} note${canvasMergeNotes.length > 1 ? "s" : ""}):`);
    canvasMergeNotes.forEach((note) => log(`  - ${note}`));
  }

  // Same idea as the Canvas merge above, for `**Continue Board:** true`
  // TacticalBoard scenes — folds a run of them into one continuous
  // timeline-authored board instead of a fresh cut per scene.
  const { segments: boardMergedSegments, notes: boardMergeNotes } = mergeTacticalContinuity(segments);
  segments = boardMergedSegments;
  if (boardMergeNotes.length > 0) {
    log(`Merged continuous TacticalBoard passages (${boardMergeNotes.length} note${boardMergeNotes.length > 1 ? "s" : ""}):`);
    boardMergeNotes.forEach((note) => log(`  - ${note}`));
  }

  return { segments, usedSceneFormat, geometryDiagnostics };
}

/** The one shared pipeline (parse -> optional real narration audio -> render)
 * behind both the CLI and the local generator UI, so the two entry points
 * can never drift out of sync with each other. */
export async function generateVideo(scriptText: string, options: GenerateOptions): Promise<GenerateResult> {
  const log = options.onLog ?? (() => {});
  const resolved = resolveSegments(scriptText, options.segments, log);
  let segments = resolved.segments;
  const { usedSceneFormat, geometryDiagnostics } = resolved;

  // Pull real brand marks for any technology a diagram names. The only
  // network step besides TTS, done once here and cached to disk — see
  // brandRegistry.ts. Anything that can't be fetched simply keeps no logo and
  // that node falls back to its shape, so this can never fail generation.
  const brands = await resolveDiagramBrands(segments);
  segments = brands.segments;
  if (brands.resolved.length > 0) log(`Resolved ${brands.resolved.length} brand mark(s): ${brands.resolved.map((b) => b.title).join(", ")}.`);
  if (brands.unresolved.length > 0) log(`No brand mark for ${brands.unresolved.join(", ")} — those nodes fall back to their shape.`);

  const preAudioDiagnostics = [...geometryDiagnostics, ...diagnoseScenes(segments)];
  logDiagnostics(log, preAudioDiagnostics, "Scene diagnostics (pre-audio estimate):");
  runEnforcementGate(preAudioDiagnostics, options.strict, "before narration/audio generation");

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

    // Narration is the clock (see CLAUDE.md). Every compiler authored its
    // choreography against the script's ESTIMATED `Duration:`; now that real
    // TTS durations exist, re-time each scene's visual beats onto them. Runs
    // BEFORE the audio-clip resync below, so that resync sees each segment's
    // final on-screen length rather than the pre-fit one.
    const { segments: fittedSegments, outcomes } = fitSegmentsToNarration(segments);
    segments = fittedSegments;
    const fitNotes = describeFitOutcomes(outcomes);
    if (fitNotes.length > 0) {
      log(`Fitted visual choreography to real narration timing (${fitNotes.length} scene${fitNotes.length > 1 ? "s" : ""} re-timed):`);
      fitNotes.forEach((note) => log(note));
    }

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

  // Re-run the duration-dependent checks (dead-time, richness's length
  // threshold) now that real narration length is known instead of an
  // estimate — geometry findings don't need re-checking, positions/overlaps
  // never change here. A scene whose ESTIMATED duration ducked under the
  // low-richness length threshold but whose REAL narration runs longer can
  // newly hard-fail here even after passing the pre-audio gate; this is the
  // authoritative pass, and it's still before the render itself.
  // diagnoseNarrationSync only reports for segments carrying a measured
  // `narrationSeconds`, so it self-skips entirely on an estimate-only
  // (no --audio) run rather than judging a real timeline against a guess.
  const finalDiagnostics = [...geometryDiagnostics, ...diagnoseScenes(segments), ...diagnoseNarrationSync(segments)];
  logDiagnostics(log, finalDiagnostics, "Final scene diagnostics (real narration timing):");
  runEnforcementGate(finalDiagnostics, options.strict, "before render");

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

  return {
    outputPath,
    outputName,
    segmentCount: segments.length,
    totalSeconds: renderedTotalSeconds,
    usedSceneFormat,
    diagnostics: finalDiagnostics,
  };
}

export interface PreviewSceneOptions {
  /** 0-based index into the fully-resolved segment array (post-merge) —
   * matches array position, the same convention SceneDiagnostic.sceneIndex
   * uses, NOT the script's raw `### SCENE N` numbering (see resolveSegments'
   * own comment on why). Callers presenting a 1-based scene list to a human
   * should subtract 1 before calling this. */
  sceneIndex: number;
  withAudio: boolean;
  ttsProvider?: TtsProvider;
  edgeVoice?: string;
  aspectRatio?: AspectRatio;
  outputName?: string;
  /** Same purpose as GenerateOptions.segments — a caller that already has
   * pre-generation timeline-preview edits (reordered/trimmed segments, see
   * GeneratePage.tsx's preTimeline state) should pass those through so
   * `sceneIndex` means the same scene the UI is actually showing, instead
   * of index-ing into a fresh re-parse of `scriptText` in its original
   * order. Falls back to parsing `scriptText` when absent, same as
   * GenerateOptions.segments does. */
  segments?: TimedSegment[];
  onLog?: (message: string) => void;
  onProgress?: (progress: RenderProgress) => void;
}

export interface PreviewSceneResult {
  outputPath: string;
  outputName: string;
  sceneLabel: string;
  /** How many scenes the FULL script resolves to — lets a caller validate
   * `sceneIndex` was in range, or build a "scene N of M" label. */
  totalScenes: number;
}

/** Renders exactly ONE scene (by index, after the same parse/merge pipeline
 * generateVideo uses — see resolveSegments) instead of the whole video —
 * the actual "Scene 03, click, see just that scene in seconds" loop this
 * whole validation pass exists to enable. Reuses the existing AnalysisVideo
 * composition and renderAndPersist call unchanged: that composition already
 * handles a 1-length segment array correctly (a TransitionSeries with one
 * Sequence and no Transition), so no new Remotion composition or render path
 * was needed for this.
 *
 * Deliberately runs NO validation/enforcement gate — the entire point of a
 * scene preview is the fast iteration loop for FIXING whatever validation
 * flagged, so it must never itself be blocked by the same checks. Skips
 * background-music generation and audioClips entirely (irrelevant to
 * previewing one scene in isolation). */
export async function previewScene(scriptText: string, options: PreviewSceneOptions): Promise<PreviewSceneResult> {
  const log = options.onLog ?? (() => {});
  const { segments } = resolveSegments(scriptText, options.segments, log);
  if (options.sceneIndex < 0 || options.sceneIndex >= segments.length) {
    throw new Error(`Scene ${options.sceneIndex + 1} doesn't exist — this script resolves to ${segments.length} scene(s) after merges.`);
  }

  // Brand marks resolve here too. Without this a scene preview renders every
  // branded node as an empty box, which makes the preview lie about the thing
  // it exists to show.
  const previewBrands = await resolveDiagramBrands([segments[options.sceneIndex]]);
  if (previewBrands.resolved.length > 0) log(`Resolved ${previewBrands.resolved.length} brand mark(s).`);
  if (previewBrands.unresolved.length > 0) log(`No brand mark for ${previewBrands.unresolved.join(", ")} — falling back to shape.`);

  let segment = previewBrands.segments[0];
  if (options.withAudio) {
    const provider = options.ttsProvider ?? "elevenlabs";
    log(provider === "edge" ? `Generating narration audio via Edge TTS (voice: ${options.edgeVoice ?? "default"})...` : "Generating narration audio via ElevenLabs...");
    const [resolvedSegment] = await resolveSegmentAudio([segment], { provider, edgeVoice: options.edgeVoice });
    // Same narration-fit pass as the full render — a scene preview that skipped
    // it would show timing the real render will not reproduce, which defeats
    // the point of previewing.
    const [fittedSegment] = fitSegmentsToNarration([resolvedSegment]).segments;
    segment = fittedSegment;
  }

  const aspectRatio: AspectRatio = options.aspectRatio ?? "16:9";
  const outputName = options.outputName ?? outputNameFor(aspectRatio, `scene-${options.sceneIndex + 1}-preview`);
  log(`Rendering scene ${options.sceneIndex + 1} of ${segments.length} to output/${outputName}.mp4...`);
  const { outputPath } = await renderAndPersist({ segments: [segment], aspectRatio }, outputName, options.onProgress);
  log("Scene preview complete.");

  return { outputPath, outputName, sceneLabel: `Scene ${options.sceneIndex + 1}`, totalScenes: segments.length };
}
