// The narration-synchronization checks (see CLAUDE.md, "Narration is the
// timeline authority"). These are the timing counterpart to validateGeometry.ts's
// static geometry checks — same discipline, applied to time instead of space:
// a bug caught in a render becomes a permanent automated check, not a one-off
// fix.
//
// The flagship check here is `narration-overrun`. Nothing in the pipeline
// previously caught the actual production failure — narration ending at ~44s
// while the visual kept working until ~49s — because validateScene.ts's
// existing dead-time check measures the opposite direction (animation ending
// early inside a long scene) and the scene's own duration had already been
// stretched to match the animation, leaving zero measured dead time. A scene
// could be maximally desynchronized from its narration and report perfectly
// clean.
//
// Everything here needs the segment's REAL narration length, so it only runs
// post-TTS (`segment.narrationSeconds`). On an estimate-only render (no
// --audio) every check no-ops rather than validating a real timeline against a
// word-count guess.

import type { TimedSegment } from "../model/Segment";
import type { CanvasData } from "../video/sharedVisualProps";
import { deriveBeats, FIT_TOLERANCE_SECONDS, type CanvasTimelineAction } from "./narrationFit";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

/** Visual activity extending further than this past the end of narration is a
 * generation failure, not a rounding artifact. Anything beyond
 * OVERRUN_HARD_SECONDS blocks the render (overridable with --force) — the
 * user's own framing is that a narrator who stops while the animation carries
 * on reads as broken however good the animation is. */
const OVERRUN_SOFT_SECONDS = 0.6;
const OVERRUN_HARD_SECONDS = 1.5;

/** A narration beat with no visual event under it at all. Short connective
 * clauses legitimately pass without their own beat, so only a reasonably long
 * unvisualized stretch is worth reporting. */
const UNVISUALIZED_BEAT_MIN_SECONDS = 2.5;

/** Actions that actually demonstrate something, as opposed to putting an
 * object on screen. An `appear` under a narration beat does not mean that beat
 * was visualized — that is the "an icon appearing is not a visualization" rule
 * from the doctrine, enforced. */
function isMeaningful(action: CanvasTimelineAction): boolean {
  return action.type === "move" || action.type === "style" || action.type === "camera";
}

function actionEnd(action: CanvasTimelineAction): number {
  return action.startSeconds + ("durationSeconds" in action ? (action.durationSeconds ?? 0) : 0);
}

export interface NarrationBeat {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

/** Splits a scene's narration into beats with real time windows.
 *
 * A merged Canvas passage already carries per-sub-scene clips with MEASURED
 * durations, so those are used directly — real boundaries, not inferred ones.
 * Everything else is split by sentence and apportioned by word count across the
 * real narration duration. That apportioning is an approximation (the TTS
 * providers here return a single duration per utterance, not word timings), and
 * it is only ever used to ask the coarse question "did this stretch of speech
 * have any visual event under it" — never to place a visual. */
export function deriveNarrationBeats(segment: TimedSegment, narrationSeconds: number): NarrationBeat[] {
  if (segment.narrationClips && segment.narrationClips.length > 0) {
    return segment.narrationClips
      .filter((clip) => clip.offsetSeconds !== undefined && clip.durationSeconds !== undefined)
      .map((clip) => ({
        text: clip.text,
        startSeconds: clip.offsetSeconds!,
        endSeconds: clip.offsetSeconds! + clip.durationSeconds!,
      }));
  }

  const text = (segment.narrationText ?? segment.text ?? "").trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return [];

  const wordCounts = sentences.map((s) => Math.max(1, s.trim().split(/\s+/).length));
  const totalWords = wordCounts.reduce((sum, n) => sum + n, 0);
  const beats: NarrationBeat[] = [];
  let cursor = 0;
  sentences.forEach((sentence, index) => {
    const span = (wordCounts[index] / totalWords) * narrationSeconds;
    beats.push({ text: sentence.trim(), startSeconds: cursor, endSeconds: cursor + span });
    cursor += span;
  });
  return beats;
}

function checkDurationAlignment(
  visual: CanvasData,
  segment: TimedSegment,
  sceneIndex: number,
  narrationSeconds: number,
  diagnostics: SceneDiagnostic[],
): void {
  const actions = visual.timeline ?? [];
  if (actions.length === 0) return;

  const visualEnd = actions.reduce((end, a) => Math.max(end, actionEnd(a)), 0);
  const declaredHold = segment.tailHoldSeconds ?? 0;
  const overrun = visualEnd - (narrationSeconds + declaredHold);

  if (overrun > OVERRUN_SOFT_SECONDS) {
    const holdNote = declaredHold > 0 ? ` (plus a declared ${declaredHold.toFixed(1)}s hold)` : "";
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        overrun > OVERRUN_HARD_SECONDS ? "hard" : "soft",
        "narration-overrun",
        `Scene ${sceneIndex + 1}: NARRATION_VISUAL_DESYNC — narration ends at ${narrationSeconds.toFixed(1)}s${holdNote} but visual choreography runs to ${visualEnd.toFixed(1)}s, leaving ${overrun.toFixed(1)}s of unexplained animation after the narrator stops.`,
      ),
    );
  }

  // The inverse: the narrator keeps talking over a scene that has stopped
  // doing anything. Measured from the last MEANINGFUL action, so a trailing
  // decorative pulse doesn't mask it.
  const lastMeaningfulEnd = actions.filter(isMeaningful).reduce((end, a) => Math.max(end, actionEnd(a)), 0);
  const silentTail = narrationSeconds - lastMeaningfulEnd;
  if (lastMeaningfulEnd > 0 && silentTail > UNVISUALIZED_BEAT_MIN_SECONDS) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "soft",
        "narration-uncovered",
        `Scene ${sceneIndex + 1}: last meaningful visual event ends at ${lastMeaningfulEnd.toFixed(1)}s but narration continues to ${narrationSeconds.toFixed(1)}s — ${silentTail.toFixed(1)}s of speech with a static frame under it.`,
      ),
    );
  }
}

function checkBeatCoverage(
  visual: CanvasData,
  segment: TimedSegment,
  sceneIndex: number,
  narrationSeconds: number,
  diagnostics: SceneDiagnostic[],
): void {
  const actions = visual.timeline ?? [];
  if (actions.length === 0) return;

  // 2. Narration beats with no meaningful visual representation.
  const narrationBeats = deriveNarrationBeats(segment, narrationSeconds);
  const meaningful = actions.filter(isMeaningful);
  const unvisualized = narrationBeats.filter((beat) => {
    if (beat.endSeconds - beat.startSeconds < UNVISUALIZED_BEAT_MIN_SECONDS) return false;
    return !meaningful.some((action) => action.startSeconds < beat.endSeconds && actionEnd(action) > beat.startSeconds);
  });
  for (const beat of unvisualized) {
    const excerpt = beat.text.length > 70 ? `${beat.text.slice(0, 67)}...` : beat.text;
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "soft",
        "narration-beat-unvisualized",
        `Scene ${sceneIndex + 1}: nothing demonstrates anything between ${beat.startSeconds.toFixed(1)}s and ${beat.endSeconds.toFixed(1)}s, while the narrator says "${excerpt}".`,
      ),
    );
  }

  // 3. Visual beats with no narration to relate to.
  const orphanBeats = deriveBeats(actions).filter((beat) => beat.startSeconds > narrationSeconds + FIT_TOLERANCE_SECONDS);
  if (orphanBeats.length > 0) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "soft",
        "visual-beat-unnarrated",
        `Scene ${sceneIndex + 1}: ${orphanBeats.length} visual beat(s) start after narration has already ended (first at ${orphanBeats[0].startSeconds.toFixed(1)}s vs narration ${narrationSeconds.toFixed(1)}s) — no narration beat motivates them.`,
      ),
    );
  }
}

/** Reports how a scene's visual choreography relates to its REAL narration.
 * No-ops for any segment without measured narration audio. */
export function diagnoseNarrationSync(segments: TimedSegment[]): SceneDiagnostic[] {
  const diagnostics: SceneDiagnostic[] = [];
  segments.forEach((segment, index) => {
    if (segment.type !== "statement" || segment.visual?.kind !== "canvas") return;
    const narrationSeconds = segment.narrationSeconds;
    if (!narrationSeconds || narrationSeconds <= 0) return;
    checkDurationAlignment(segment.visual, segment, index, narrationSeconds, diagnostics);
    checkBeatCoverage(segment.visual, segment, index, narrationSeconds, diagnostics);
  });
  return diagnostics;
}
