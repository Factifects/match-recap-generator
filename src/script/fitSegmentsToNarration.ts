// Segment-level application of the narration temporal spine — the step that
// actually makes the pipeline
//
//   script -> scene composition -> initial visual timeline -> resolveSegmentAudio()
//     -> REAL narrationSeconds -> narrationFit() -> validateNarrationSync() -> render
//
// rather than the old "compose an arbitrary animation length, then attach audio
// underneath it".
//
// Three things have to move together or the scene desynchronizes internally,
// which is why this is one step and not a call to fitTimelineToNarration
// sprinkled at each call site:
//
//   1. the Canvas `timeline` itself
//   2. every OTHER time-carrying field placed against that timeline — on-screen
//      caption `phases[].startSeconds` and the generated per-beat
//      `sfxClips[].startSeconds` (an sfx cue is placed at the authored start of
//      the action it punctuates, so re-timing actions without re-timing cues
//      would slide every sound off its beat)
//   3. the segment's own on-screen length, INCLUDING `visualMinDurationSeconds`
//
// (3) is the one that is easy to miss and fatal to omit. `visualMinDurationSeconds`
// is what parseSceneScript sets to the authored choreography's end, and
// everything downstream takes `max(durationSeconds, visualMinDurationSeconds)`
// as the real on-screen length. Fitting the timeline while leaving that floor at
// its pre-fit value would reproduce the exact 49s-vs-44s tail this subsystem
// exists to remove.

import type { TimedSegment } from "../model/Segment";
import { fitTimelineToNarration, type FitReport } from "./narrationFit";

/** Absolute floor on a rendered scene, matching parseSceneScript's own
 * MIN_REAL_AUDIO_FLOOR_SECONDS — a one-second scene is a flash regardless of
 * how brief its narration is. Counts as declared padding, not a dead tail. */
const MIN_SCENE_SECONDS = 2;

/** A short, DECLARED hold after narration ends, before the scene cuts.
 *
 * The first version of this file set `durationSeconds` to exactly
 * `narrationSeconds`, which was too literal a reading of "narration is the
 * clock" and produced two audible/visible faults:
 *
 *   1. The last visual beat landed on the final syllable and cut instantly —
 *      every scene ended without a breath.
 *   2. AnalysisVideo crossfades scenes over TRANSITION_FRAMES (15 = 0.5s), and
 *      the incoming scene's narration starts at its own frame 0 — i.e. while
 *      the outgoing scene is still fading. With zero slack, one scene's last
 *      word ran directly into the next scene's first word.
 *
 * So the VISUAL timeline is still fitted to end with the narration (no
 * unexplained animation, which is the thing the spine exists to prevent), but
 * the SCENE holds its final state briefly afterwards. The doctrine explicitly
 * allows declared padding — an intro, an outro, a deliberate hold — and forbids
 * only unexplained leftover activity. Sized to cover the crossfade with a
 * little over, so the last beat reads before the cut. */
const SCENE_SETTLE_SECONDS = 0.7;

export interface SegmentFitOutcome {
  sceneIndex: number;
  report: FitReport;
}

export interface FitSegmentsResult {
  segments: TimedSegment[];
  outcomes: SegmentFitOutcome[];
}

/** Re-times every compiled Canvas scene onto its real narration duration.
 *
 * Skips, deliberately:
 *  - segments with no measured narration (`narrationSeconds` unset) — an
 *    estimate-only render has no authoritative clock to fit to, and fitting a
 *    timeline to a word-count guess would be the same mistake in a new place;
 *  - `manualDurationOverride` segments — the user picked that length by hand in
 *    the timeline preview, and this must not silently overrule them;
 *  - anything that is not a Canvas scene with a real `timeline` (a static Data
 *    block or a phases-only merged passage has no choreography to fit). */
export function fitSegmentsToNarration(segments: TimedSegment[]): FitSegmentsResult {
  const outcomes: SegmentFitOutcome[] = [];

  const fitted = segments.map((segment, sceneIndex) => {
    const narrationSeconds = segment.narrationSeconds;
    if (!narrationSeconds || narrationSeconds <= 0) return segment;
    if (segment.manualDurationOverride) return segment;
    if (segment.type !== "statement") return segment;
    // Both timeline-carrying media go through the same fit — a second medium
    // with its own unsynchronized clock is exactly what the spine exists to
    // prevent (see CLAUDE.md's standing constraint).
    const visual = segment.visual;
    if (
      visual?.kind !== "canvas" &&
      visual?.kind !== "workspace" &&
      visual?.kind !== "diagram" &&
      visual?.kind !== "stage" &&
      visual?.kind !== "spatial" &&
      visual?.kind !== "holdings" &&
      visual?.kind !== "channels"
    ) {
      return segment;
    }
    if (!visual.timeline || visual.timeline.length === 0) return segment;

    // A FOLDED PASSAGE IS FITTED PER SUB-SCENE, NOT AS ONE BLOCK.
    //
    // A merged passage (see the merge*Continuity passes) plays several narration
    // clips back to back, each starting at a fixed measured offset — that offset
    // is a hard fact about the audio, not something the fitter may slide. Fitting
    // the passage as one window would let compression in the second sub-scene
    // drag the third sub-scene's choreography off the sentence it illustrates,
    // which is the exact desync the spine exists to remove, reintroduced at
    // passage scale. Each clip boundary is therefore an anchor, and the windows
    // between them are fitted independently.
    //
    // resolveSegmentAudio has already placed each clip's actions at that clip's
    // real offset, so authored and narration time agree AT the boundaries and
    // differ only inside them — which is what an anchor is for.
    const anchors = segment.narrationClips
      ?.slice(1)
      .map((clip) => clip.offsetSeconds)
      .filter((offset): offset is number => offset !== undefined && offset > 0)
      .map((offset) => ({ authoredSeconds: offset, narrationSeconds: offset }));

    // Every timeline-carrying medium goes through the SAME fit — a second
    // medium running on its own unsynchronized clock is exactly what the
    // narration spine exists to prevent. The per-kind branches look redundant
    // but are load-bearing: each one NARROWS `visual` to a single kind so its
    // own action union survives the round trip. Widening to the shared
    // `{startSeconds, durationSeconds}` shape would compile, and would quietly
    // strip every medium-specific field on the way back out.
    const fittedVisual = (() => {
      switch (visual.kind) {
        case "canvas": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "workspace": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "diagram": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "stage": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "spatial": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "holdings": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
        case "channels": {
          const result = fitTimelineToNarration(visual.timeline!, { narrationSeconds, anchors });
          return { visual: { ...visual, timeline: result.actions }, result };
        }
      }
    })();

    const result = fittedVisual.result;
    outcomes.push({ sceneIndex, report: result.report });
    if (!result.report.changed) return segment;

    const tailHold = segment.tailHoldSeconds ?? 0;
    const durationSeconds = Math.max(MIN_SCENE_SECONDS, narrationSeconds + tailHold + SCENE_SETTLE_SECONDS);

    return {
      ...segment,
      visual: fittedVisual.visual,
      phases: segment.phases?.map((phase) => ({ ...phase, startSeconds: result.remapSeconds(phase.startSeconds ?? 0) })),
      // A clip's LENGTH has to be remapped along with its start, not just its
      // position. Keyboard bursts are placed on the authored timeline and then
      // this fit compresses or stretches that timeline onto the real narration;
      // remapping only the starts pulled the bursts closer together while
      // leaving them their original length, so they overlapped back into the
      // continuous drone the bursts existed to remove. Measured on a real
      // render: bursts at 10.03s and 10.22s both still 0.42s long.
      sfxClips: segment.sfxClips?.map((clip) => {
        const startSeconds = result.remapSeconds(clip.startSeconds);
        const endSeconds = result.remapSeconds(clip.startSeconds + clip.durationSeconds);
        return { ...clip, startSeconds, durationSeconds: Math.max(0.05, endSeconds - startSeconds) };
      }),
      durationSeconds,
      // The authored-choreography floor is now the FITTED choreography's own
      // end — see this file's header for why leaving it stale reintroduces the
      // original bug.
      visualMinDurationSeconds: Math.min(result.report.fittedEndSeconds, durationSeconds),
    };
  });

  return { segments: fitted, outcomes };
}

/** One human-readable line per scene the fitter actually changed, for the
 * generation log — silent about scenes that were already in sync. */
export function describeFitOutcomes(outcomes: SegmentFitOutcome[]): string[] {
  return outcomes
    .filter((outcome) => outcome.report.changed)
    .map(({ sceneIndex, report }) => {
      const direction = report.authoredEndSeconds > report.narrationSeconds ? "compressed" : "expanded";
      const notes: string[] = [];
      if (report.overflowSeconds > 0.05) notes.push(`${report.overflowSeconds.toFixed(1)}s could not be absorbed without breaking legibility`);
      if (report.uncoveredSeconds > 0.05) notes.push(`${report.uncoveredSeconds.toFixed(1)}s of narration has thin visual content`);
      const suffix = notes.length > 0 ? ` — ${notes.join("; ")}` : "";
      return `  - Scene ${sceneIndex + 1}: ${direction} ${report.authoredEndSeconds.toFixed(1)}s of choreography across ${report.beatCount} beat(s) into ${report.narrationSeconds.toFixed(1)}s of narration${suffix}`;
    });
}
