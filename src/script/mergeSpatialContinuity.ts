import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

// Cross-scene continuity for the `spatial` medium — the cumulative-canvas
// primitive, mirroring mergeStageContinuity.ts.
//
// WHY THIS MEDIUM NEEDED IT MOST, AND HAD IT LAST
//
// Canvas, TacticalBoard, Diagram and Stage all had a continuity pass. Spatial —
// the only medium with a real camera that occupies a position and travels, real
// volumetric bodies, and objects whose representation changes with distance
// (see LivingMap.tsx) — had none. So the one medium built to hold a world that
// keeps existing was the one medium whose world could not survive a narration
// boundary, and an author who wanted a second beat about the same world had two
// options: put the whole video in one enormous scene, or abandon the world and
// draw the next idea as a flat Stage scene. Scripts took the second option,
// which is why the Maps episode declares a living map in scene 2 and then
// re-invents its four regions as flat cards in scene 3.
//
// With `**Continue Spatial:** true`, consecutive scenes fold into one passage:
// one persistent object set, one unbroken timeline, one camera. Each original
// scene keeps its own narration clip (see resolveSegmentAudio's `narrationClips`
// handling), so the audio is still authored and measured per scene.
//
// WHAT CONTINUITY MEANS HERE, CONCRETELY
//
// Most of it falls out of concatenating the timelines, because SpatialStage
// resolves every piece of state by scanning the timeline from zero up to the
// current time: an object's accumulated `travel`/`orbit`/`spin` transforms, a
// livingMap's agent count, its revealed regions, its road states, and — the one
// that matters most — the camera pose, which simply holds wherever the last
// camera action left it. A continuing scene that authors no camera action
// therefore inherits the previous scene's framing instead of snapping to a
// default, which is exactly the behaviour a continuous passage wants.
//
// Two things do NOT fall out for free, and are handled below: initial
// visibility (see `synthesizeEntrances`) and the sticky auto-fit (see the note
// emitted in `foldSpatialScene`).

type SpatialVisual = Extract<Visual, { kind: "spatial" }>;
type SpatialAction = NonNullable<SpatialVisual["timeline"]>[number];
type SpatialObject = SpatialVisual["objects"][number];

function isTimelineSpatialSegment(segment: TimedSegment): segment is TimedSegment & { visual: SpatialVisual } {
  return segment.type === "statement" && segment.visual?.kind === "spatial" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

function hasEntrance(timeline: readonly SpatialAction[], id: string): boolean {
  return timeline.some((action) => action.type === "enter" && "id" in action && action.id === id);
}

/** Objects a continuing scene declares for the first time, that never `enter`.
 *
 * THIS IS THE ONE THING A MECHANICAL COPY OF THE STAGE PASS WOULD GET WRONG.
 * SpatialStage decides an object's initial visibility once, for the whole
 * timeline: an object is hidden at t=0 only if SOME `enter` action somewhere in
 * the timeline names it, and otherwise it is on screen from the first frame.
 * Unfolded, that is right — "no entrance" means "already here when my scene
 * starts". Folded, "my scene" is no longer the start of anything, so an object
 * declared by the fourth sub-scene would be standing in the world forty seconds
 * before the narration ever mentions it, in every shot leading up to it.
 *
 * So the author's intent — present from the top of MY scene — is made true in
 * passage time by synthesizing the entrance they didn't have to write. An
 * object that authors its own `enter` is left alone; its entrance is already a
 * decision, and this must not add a second one. */
function synthesizeEntrances(newObjects: SpatialObject[], nextTimeline: readonly SpatialAction[], atSeconds: number): SpatialAction[] {
  return newObjects
    .filter((object) => !hasEntrance(nextTimeline, object.id))
    .map((object) => ({ type: "enter", id: object.id, startSeconds: atSeconds, durationSeconds: 0.7 }) as SpatialAction);
}

/** Folds `next` into `accumulator`.
 *
 * `objects` are UNIONED, FIRST DECLARATION WINS — same contract as every other
 * continuity pass, and for the same reason: a continuing scene is expected to
 * MOVE and restate what the viewer is already watching through its own
 * `timeline`, not to redeclare it. A redeclaration (a script author copy-pasting
 * the previous scene's Data as a starting point, which is exactly how these
 * scripts get written) must never silently reset an established world — so the
 * earlier declaration wins and the redeclaration is reported, not applied.
 *
 * `theme` takes the first scene's value: one passage, one world, one lighting. */
function foldSpatialScene(
  accumulator: TimedSegment & { visual: SpatialVisual },
  next: TimedSegment & { visual: SpatialVisual },
  sceneLabel: string,
  notes: string[],
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];

  // SHIFT AT MERGE TIME, by the running estimate, and RECORD what was applied —
  // same contract as mergeStageContinuity. Concatenating un-shifted and leaving
  // every offset to resolveSegmentAudio reads tidier but is broken for any
  // render without `--audio`: each folded scene's events would fire at their own
  // local times, so a four-scene passage plays everything on top of itself in
  // the first fifteen seconds and then freezes. resolveSegmentAudio corrects by
  // the DIFFERENCE between the real offset and this applied one.
  const appliedOffset = accumulator.durationSeconds;

  const existingObjectIds = new Set(accVisual.objects.map((o) => o.id));
  const newObjects = nextVisual.objects.filter((o) => !existingObjectIds.has(o.id));

  for (const redeclared of nextVisual.objects.filter((o) => existingObjectIds.has(o.id))) {
    const established = accVisual.objects.find((o) => o.id === redeclared.id)!;
    if (established.kind !== redeclared.kind) {
      // The dangerous one: the id resolves to the ESTABLISHED body, so every
      // kind-specific action this scene aims at it (a `mapAgents` at something
      // that is no longer a livingMap, say) silently does nothing.
      notes.push(
        `${sceneLabel}: redeclares "${redeclared.id}" as a ${redeclared.kind}, but the passage already has it as a ${established.kind} — the established object wins, so any ${redeclared.kind}-specific action aimed at it will do nothing. Give the new body its own id, or transform the existing one.`,
      );
    } else if (redeclared.label !== established.label || JSON.stringify(redeclared.at) !== JSON.stringify(established.at)) {
      notes.push(
        `${sceneLabel}: redeclares "${redeclared.id}" at a different position/label — ignored, the passage keeps the object where the world left it. Move it with a "travel" action instead.`,
      );
    }
  }

  const synthesized = synthesizeEntrances(newObjects, nextTimeline, appliedOffset);
  if (synthesized.length > 0) {
    notes.push(
      `${sceneLabel}: ${synthesized.length} new object(s) (${synthesized.map((a) => ("id" in a ? a.id : "?")).join(", ")}) declared without an "enter" — entering them at the start of this scene's narration rather than at the start of the passage.`,
    );
  }
  if (!nextTimeline.some((action) => action.type === "camera")) {
    // Not a fault — inheriting the shot is usually the point. But SpatialStage's
    // auto-framing only applies while NO camera action has ever set a distance,
    // so once the passage has authored one, a later scene that adds objects is
    // framed by the earlier shot and will not widen to fit them.
    notes.push(`${sceneLabel}: no camera action — inherits the passage's current shot (auto-framing no longer applies once a distance has been authored).`);
  }

  const shiftedNext = [...synthesized, ...nextTimeline.map((action) => ({ ...action, startSeconds: action.startSeconds + appliedOffset }))];
  const mergedTimeline = [...accTimeline, ...shiftedNext];
  const mergedObjects = [...accVisual.objects, ...newObjects];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold
    ? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]
    : (accumulator._spatialClipRanges ?? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]);
  const spatialClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length, appliedOffsetSeconds: appliedOffset }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: SpatialVisual = {
    ...accVisual,
    objects: mergedObjects,
    timeline: mergedTimeline,
  };

  const result: TimedSegment & { visual: SpatialVisual } = {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    // Pre-audio placeholder — resolveSegmentAudio overwrites this with the sum
    // of each clip's real measured duration once TTS has run.
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _spatialClipRanges: spatialClipRanges,
  };
  return result;
}

/** Post-parse pass folding a run of consecutive `Scene Type: Spatial` scenes
 * marked `**Continue Spatial:** true` into one continuous passage. Pure
 * `TimedSegment[] -> TimedSegment[]` plus a human-readable log, run alongside
 * the other continuity passes in generate.ts before narration audio exists.
 *
 * Only spatial scenes authored with a `timeline` can continue — a
 * `continuesSpatialFrom` on a scene whose predecessor (or itself) isn't a
 * timeline Spatial scene is left alone and logged as a note rather than an
 * error, since an author may have set the field on a scene later changed to a
 * different Scene Type. */
export function mergeSpatialContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesSpatialFrom) {
      if (accumulator && isTimelineSpatialSegment(accumulator) && isTimelineSpatialSegment(segment)) {
        notes.push(`${sceneLabel}: folded into the continuous Spatial passage starting at scene ${merged.length + 1}`);
        accumulator = foldSpatialScene(accumulator, segment, sceneLabel, notes);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Spatial: true" set, but this scene or its predecessor isn't a timeline-authored Spatial scene — rendered as its own independent scene instead.`,
      );
    }

    // The other side of the schema's empty-`objects` allowance (see
    // visualDefinitions.ts): a scene that declares no objects AND continues
    // nothing has no world to be in. The schema can't tell those two cases
    // apart; this pass can, because continuation is exactly what it knows.
    if (isTimelineSpatialSegment(segment) && segment.visual.objects.length === 0 && !segment.continuesSpatialFrom) {
      notes.push(`${sceneLabel}: a Spatial scene with no objects that doesn't continue a passage — its timeline has nothing to act on. Declare its world, or mark it "Continue Spatial: true".`);
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
