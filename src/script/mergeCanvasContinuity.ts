import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

type CanvasVisual = Extract<Visual, { kind: "canvas" }>;
type CanvasPhase = NonNullable<CanvasVisual["phases"]>[number];
type Caption = { caption: string; startSeconds?: number };

function isCanvasSegment(segment: TimedSegment): segment is TimedSegment & { visual: CanvasVisual } {
  return segment.type === "statement" && segment.visual?.kind === "canvas";
}

function isTimelineCanvasSegment(segment: TimedSegment): segment is TimedSegment & { visual: CanvasVisual } {
  return isCanvasSegment(segment) && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

/** Folds a TIMELINE-authored Canvas scene, rather than a phases-authored one.
 *
 * The phases path below predates the timeline engine and was the only one that
 * existed, which had a real consequence: a Canvas passage authored as a
 * timeline could not continue at all, so a journey with ten narration beats
 * became ten cuts. That is the exact failure this pass exists to prevent, and
 * it was only ever prevented for the older authoring style.
 *
 * Same contract as every other medium's timeline fold: objects, arrows and
 * threads UNIONED with first-declaration-wins, the timeline shifted by the
 * running estimate at merge time and the shift RECORDED so resolveSegmentAudio
 * corrects by the difference instead of shifting twice. */
function foldTimelineCanvasScene(
  accumulator: TimedSegment & { visual: CanvasVisual },
  next: TimedSegment & { visual: CanvasVisual },
  sceneLabel: string,
  notes: string[],
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;
  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];
  const appliedOffset = accumulator.durationSeconds;

  const existingObjectIds = new Set(accVisual.objects.map((o) => o.id));
  const newObjects = nextVisual.objects.filter((o) => !existingObjectIds.has(o.id));
  if (nextVisual.objects.length > newObjects.length) {
    notes.push(`${sceneLabel}: redeclares ${nextVisual.objects.length - newObjects.length} object(s) the passage already has — ignored, so the world the viewer is watching is never silently reset.`);
  }

  const existingThreadIds = new Set((accVisual.threads ?? []).map((t) => t.id));
  const newThreads = (nextVisual.threads ?? []).filter((t) => !existingThreadIds.has(t.id));

  // An arrow's `to` may be an id or a literal point, so the key has to cope
  // with both rather than assuming a string.
  const arrowKey = (a: { from: string; to: string | { x: number; y: number } }) =>
    `${a.from}->${typeof a.to === "string" ? a.to : `${a.to.x},${a.to.y}`}`;
  const existingArrowKeys = new Set((accVisual.arrows ?? []).map(arrowKey));
  const newArrows = (nextVisual.arrows ?? []).filter((a) => !existingArrowKeys.has(arrowKey(a)));

  const shiftedNext = nextTimeline.map((action) => ({ ...action, startSeconds: action.startSeconds + appliedOffset }));
  const mergedTimeline = [...accTimeline, ...shiftedNext];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold
    ? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]
    : (accumulator._canvasTimelineClipRanges ?? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]);
  const clipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length, appliedOffsetSeconds: appliedOffset }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: CanvasVisual = {
    ...accVisual,
    objects: [...accVisual.objects, ...newObjects],
    arrows: [...(accVisual.arrows ?? []), ...newArrows],
    threads: [...(accVisual.threads ?? []), ...newThreads],
    timeline: mergedTimeline,
  };

  return {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _canvasTimelineClipRanges: clipRanges,
  } as TimedSegment & { visual: CanvasVisual };
}

/** Resolves every caption's `startSeconds` to an absolute value within `[0,
 * totalDurationSeconds)` — same even-split-with-explicit-override rule
 * `PhaseCaptionOverlay.tsx`'s `resolvePhaseStartFrames` already implements
 * (seconds instead of frames, no fps needed for pure arithmetic). Doing this
 * once, per sub-scene, at merge time — rather than leaving any caption's
 * `startSeconds` unset — is what stops a sub-scene's own "spread evenly
 * across my own duration" captions from silently spreading across the whole
 * merged passage's duration once concatenated with another sub-scene's. */
function resolveAbsoluteCaptionSeconds(captions: Caption[], totalDurationSeconds: number): Required<Caption>[] {
  return captions.map((caption, index) => ({
    caption: caption.caption,
    startSeconds: caption.startSeconds ?? (index / captions.length) * totalDurationSeconds,
  }));
}

/** Folds `next` (a scene whose `**Continue Canvas:** true` field was set) into
 * `accumulator` (the scene it continues from — itself possibly already the
 * result of an earlier fold in a longer chain). `next`'s own top-level
 * `{objects, arrows, camera}` becomes one new "boundary" phase appended to
 * the accumulator's Canvas `phases`, followed by `next`'s own internal
 * `Data.phases` (if it authored any) as ordinary follow-on phases — the same
 * flattening a single scene's own multi-phase Canvas already expects, just
 * fed more phases than one scene used to contribute. The boundary phase's
 * index is recorded in `_canvasClipBoundaries` (one per narration clip after
 * the first) so resolveSegmentAudio can anchor it to `next`'s real narration
 * offset once that's known; `_canvasCaptionRanges` records the same thing for
 * scene-level on-screen captions, one `[from, to)` slice of the merged
 * `phases` array per narration clip (including the first — an already-first
 * scene's own captions still need their `startSeconds` finalized to absolute
 * seconds even though they'll never need shifting). */
function foldCanvasScene(
  accumulator: TimedSegment & { visual: CanvasVisual },
  next: TimedSegment & { visual: CanvasVisual },
): TimedSegment {
  const accVisual = accumulator.visual as CanvasVisual;
  const existingPhases = accVisual.phases ?? [];
  const isFirstFold = !accumulator.narrationClips;

  const boundaryPhase: CanvasPhase = {
    objects: next.visual.objects,
    arrows: next.visual.arrows,
    camera: next.visual.camera,
  };
  const boundaryIndex = existingPhases.length;
  const ownPhases = next.visual.phases ?? [];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];
  const boundaries = [...(accumulator._canvasClipBoundaries ?? []), boundaryIndex];

  // On the first fold, accumulator's own captions haven't been resolved to
  // absolute seconds yet (nothing needed that before now) — do it here,
  // against accumulator's own pre-audio duration estimate. On later folds in
  // the same chain, accumulator's captions (and their ranges) are already
  // fully resolved by a previous call, so they're carried through unchanged.
  const baseCaptions = isFirstFold && accumulator.phases ? resolveAbsoluteCaptionSeconds(accumulator.phases, accumulator.durationSeconds) : accumulator.phases;
  const baseCaptionRanges =
    isFirstFold
      ? [{ from: 0, to: baseCaptions?.length ?? 0 }]
      : (accumulator._canvasCaptionRanges ?? [{ from: 0, to: accumulator.phases?.length ?? 0 }]);

  const nextCaptions = next.phases ? resolveAbsoluteCaptionSeconds(next.phases, next.durationSeconds) : undefined;
  const phasesSoFar = baseCaptions?.length ?? 0;
  const captionRanges = [...baseCaptionRanges, { from: phasesSoFar, to: phasesSoFar + (nextCaptions?.length ?? 0) }];
  const phases = nextCaptions ? [...(baseCaptions ?? []), ...nextCaptions] : baseCaptions;

  const mergedVisual: CanvasVisual = { ...accVisual, phases: [...existingPhases, boundaryPhase, ...ownPhases] };

  // Built as an explicitly-typed local (not returned as a fresh object
  // literal) so TS checks it against the narrowed `TimedSegment & {visual:
  // CanvasVisual}` intersection instead of excess-property-checking a
  // literal directly against the full TimedSegment union, which loses the
  // "this is definitely the statement/canvas branch" information `...
  // accumulator` already carries.
  const result: TimedSegment & { visual: CanvasVisual } = {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    // Pre-audio placeholder — resolveSegmentAudio overwrites this with the
    // sum of each clip's real measured duration once TTS has run.
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _canvasClipBoundaries: boundaries,
    _canvasCaptionRanges: captionRanges,
    phases,
  };
  return result;
}

/** Post-parse pass (mirrors autoFixGeometry's shape — pure `TimedSegment[] ->
 * TimedSegment[]` transform plus a human-readable log, run right after it in
 * generate.ts's pipeline, before real narration audio is generated) that
 * folds a run of consecutive `Scene Type: Canvas` scenes marked with
 * `**Continue Canvas:** true` into one combined segment: one continuous
 * camera/object space (the camera glides/pans between what used to be scene
 * boundaries instead of cutting), while each original scene's narration stays
 * its own audio cue (see resolveSegmentAudio's `narrationClips` handling).
 *
 * `continuesCanvasFrom` on a scene whose predecessor (or itself) isn't a
 * Canvas visual is left alone — logged as a note, not an error, since a
 * script author may have set the field on a scene that was later changed to
 * a different Scene Type. */
export function mergeCanvasContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesCanvasFrom) {
      if (accumulator && isTimelineCanvasSegment(accumulator) && isTimelineCanvasSegment(segment)) {
        notes.push(`${sceneLabel}: folded into the continuous Canvas passage starting at scene ${merged.length + 1}`);
        accumulator = foldTimelineCanvasScene(accumulator, segment, sceneLabel, notes);
        continue;
      }
      if (accumulator && isCanvasSegment(accumulator) && isCanvasSegment(segment)) {
        accumulator = foldCanvasScene(accumulator, segment);
        notes.push(`${sceneLabel}: folded into the continuous Canvas passage starting at scene ${merged.length + 1}`);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Canvas: true" set, but this scene or its predecessor isn't a Canvas visual — rendered as its own independent scene instead.`,
      );
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
