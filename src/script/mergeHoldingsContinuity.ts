import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

// Cross-scene continuity for the `holdings` medium — mirroring
// mergeSpatialContinuity.ts.
//
// This medium needs it more plainly than most: its entire argument is that ONE
// population of devices is being examined from several angles — inspected,
// compared, assembled, reconciled, disturbed. Cut between those and they become
// five unrelated illustrations of five unrelated walls, which would quietly
// destroy the claim, because the viewer's reason to believe "almost nobody had
// to change anything" is that they watched the same wall the whole time.
//
// Simpler than the other passes for one reason: a holdings scene declares no
// objects at all. The population is generated from `seed` by holdingsLayout, so
// there is nothing to union and nothing that can be silently redeclared — the
// only things to fold are the timeline and the scene-level settings.

type HoldingsVisual = Extract<Visual, { kind: "holdings" }>;

function isTimelineHoldingsSegment(segment: TimedSegment): segment is TimedSegment & { visual: HoldingsVisual } {
  return segment.type === "statement" && segment.visual?.kind === "holdings" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

/** Folds `next` into `accumulator`.
 *
 * `seed`/`subject`/`holds`/`theme` all take the FIRST scene's value. That is
 * the whole point of the pass: a later scene that names a different seed would
 * swap every device's holdings mid-passage, so the wall the viewer had been
 * reading would silently become a different wall while looking identical. A
 * mismatch is reported rather than applied. */
function foldHoldingsScene(
  accumulator: TimedSegment & { visual: HoldingsVisual },
  next: TimedSegment & { visual: HoldingsVisual },
  sceneLabel: string,
  notes: string[],
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];

  if (nextVisual.seed !== undefined && accVisual.seed !== undefined && nextVisual.seed !== accVisual.seed) {
    notes.push(
      `${sceneLabel}: declares seed ${nextVisual.seed} but the passage was built with seed ${accVisual.seed} — keeping the passage's population, since changing it here would replace every device's holdings without the change being visible.`,
    );
  }
  if (nextVisual.subject && accVisual.subject && nextVisual.subject !== accVisual.subject) {
    notes.push(`${sceneLabel}: renames the subject to "${nextVisual.subject}" — ignored; one passage, one thing being counted.`);
  }

  // Shift at merge time by the running estimate and RECORD it, so a no-audio
  // preview of a folded passage still plays in sequence; resolveSegmentAudio
  // corrects by the difference once real clip offsets exist.
  const appliedOffset = accumulator.durationSeconds;
  const shiftedNext = nextTimeline.map((action) => ({ ...action, startSeconds: action.startSeconds + appliedOffset }));
  const mergedTimeline = [...accTimeline, ...shiftedNext];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold
    ? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]
    : (accumulator._holdingsClipRanges ?? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]);
  const holdingsClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length, appliedOffsetSeconds: appliedOffset }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: HoldingsVisual = { ...accVisual, timeline: mergedTimeline };

  return {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _holdingsClipRanges: holdingsClipRanges,
  } as TimedSegment & { visual: HoldingsVisual };
}

/** Post-parse pass folding a run of consecutive `Scene Type: Holdings` scenes
 * marked `**Continue Holdings:** true` into one continuous passage. */
export function mergeHoldingsContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesHoldingsFrom) {
      if (accumulator && isTimelineHoldingsSegment(accumulator) && isTimelineHoldingsSegment(segment)) {
        notes.push(`${sceneLabel}: folded into the continuous Holdings passage starting at scene ${merged.length + 1}`);
        accumulator = foldHoldingsScene(accumulator, segment, sceneLabel, notes);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Holdings: true" set, but this scene or its predecessor isn't a timeline-authored Holdings scene — rendered as its own independent scene instead.`,
      );
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
