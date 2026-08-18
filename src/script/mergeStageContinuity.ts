import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

// Cross-scene continuity for the `stage` medium — the cumulative-canvas
// primitive, mirroring mergeDiagramContinuity.ts.
//
// WHY THIS MATTERS MORE HERE THAN ANYWHERE ELSE
//
// The Shorts doctrine's object-persistence rule is explicit: an entity that
// already exists and is needed elsewhere should be MOVED or transformed, never
// destroyed and recreated as an identical copy in a new spot. One system
// evolving, not a slideshow of unrelated illustrations.
//
// Without this pass, that rule is unenforceable across a scene boundary. Every
// Stage scene re-declares its whole world from scratch, so the server in scene
// 3 is a different object from the identically-labelled server in scene 2 — it
// pops into existence at whatever region the new scene names, with no memory of
// where it was or what state it was in. That is exactly the slideshow the
// doctrine rejects, and it is what every proof Short built so far does.
//
// With `**Continue Stage:** true`, consecutive scenes fold into one continuous
// passage: one persistent entity set, one unbroken timeline. Objects keep their
// positions and accumulated state across what used to be a cut, so a `compose`
// in the next scene MOVES the thing the viewer is already watching. Each
// original scene keeps its own narration clip (see resolveSegmentAudio's
// `narrationClips` handling), so the audio is still authored per scene.

type StageVisual = Extract<Visual, { kind: "stage" }>;

function isTimelineStageSegment(segment: TimedSegment): segment is TimedSegment & { visual: StageVisual } {
  return segment.type === "statement" && segment.visual?.kind === "stage" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

/** Folds `next` into `accumulator`.
 *
 * `objects`/`packets`/`edges` are UNIONED, FIRST DECLARATION WINS. That
 * direction is deliberate and is the whole point: a continuing scene is
 * expected to move and restate entities through its own `timeline`, not to
 * redeclare them. If it redeclares one anyway — a script author copy-pasting
 * the previous scene's Data as a starting point, which is exactly how these
 * scripts get written — the EARLIER declaration wins, so the passage's
 * established world is never silently reset by a later snapshot. Any change of
 * position or state belongs in `compose`/`setState`/`transform`.
 *
 * Scene-level presentation (`world`, `energy`, `backdrop`, `composition`,
 * `act`) takes the first scene's value: one passage, one visual world. */
function foldStageScene(
  accumulator: TimedSegment & { visual: StageVisual },
  next: TimedSegment & { visual: StageVisual },
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];

  // SHIFT AT MERGE TIME, by the running estimate.
  //
  // Concatenating unshifted and leaving all the offsetting to
  // resolveSegmentAudio looks tidy but is broken for any render without
  // `--audio`: every folded scene's events then fire at their own local times,
  // so a four-scene passage plays everything on top of itself in the first
  // fifteen seconds and freezes for the remaining forty. That is not a
  // theoretical edge case — it is the default way scenes get previewed.
  //
  // So the estimate is applied here and RECORDED. resolveSegmentAudio corrects
  // by the difference between the real offset and this applied one, rather than
  // adding a second shift on top of it.
  const appliedOffset = accumulator.durationSeconds;
  const shiftedNext = nextTimeline.map((action) => ({ ...action, startSeconds: action.startSeconds + appliedOffset }));
  const mergedTimeline = [...accTimeline, ...shiftedNext];

  const existingObjectIds = new Set(accVisual.objects.map((o) => o.id));
  const mergedObjects = [...accVisual.objects, ...nextVisual.objects.filter((o) => !existingObjectIds.has(o.id))];

  const accPackets = accVisual.packets ?? [];
  const existingPacketIds = new Set(accPackets.map((p) => p.id));
  const mergedPackets = [...accPackets, ...(nextVisual.packets ?? []).filter((p) => !existingPacketIds.has(p.id))];

  const accEdges = accVisual.edges ?? [];
  const existingEdgeKeys = new Set(accEdges.map((e) => edgeKey(e.from, e.to)));
  const mergedEdges = [...accEdges, ...(nextVisual.edges ?? []).filter((e) => !existingEdgeKeys.has(edgeKey(e.from, e.to)))];

  // Timeline events are concatenated UNSHIFTED; resolveSegmentAudio patches
  // every event's `startSeconds` once each clip's real narration offset is
  // known. Same contract as the diagram medium's `_diagramClipRanges`.
  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold
    ? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]
    : (accumulator._stageClipRanges ?? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]);
  const stageClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length, appliedOffsetSeconds: appliedOffset }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: StageVisual = {
    ...accVisual,
    objects: mergedObjects,
    packets: mergedPackets.length > 0 ? mergedPackets : undefined,
    edges: mergedEdges,
    timeline: mergedTimeline,
  };

  const result: TimedSegment & { visual: StageVisual } = {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    // Pre-audio placeholder — resolveSegmentAudio overwrites this with the sum
    // of each clip's real measured duration once TTS has run.
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _stageClipRanges: stageClipRanges,
  };
  return result;
}

/** Post-parse pass folding a run of consecutive `Scene Type: Stage` scenes
 * marked `**Continue Stage:** true` into one continuous passage. Pure
 * `TimedSegment[] -> TimedSegment[]` plus a human-readable log, run alongside
 * the other continuity passes in generate.ts before narration audio exists.
 *
 * Only stages authored with a `timeline` can continue — a `continuesStageFrom`
 * on a scene whose predecessor (or itself) isn't a timeline Stage is left alone
 * and logged as a note rather than an error, since an author may have set the
 * field on a scene later changed to a different Scene Type. */
export function mergeStageContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesStageFrom) {
      if (accumulator && isTimelineStageSegment(accumulator) && isTimelineStageSegment(segment)) {
        accumulator = foldStageScene(accumulator, segment);
        notes.push(`${sceneLabel}: folded into the continuous Stage passage starting at scene ${merged.length + 1}`);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Stage: true" set, but this scene or its predecessor isn't a timeline-authored Stage — rendered as its own independent scene instead.`,
      );
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
