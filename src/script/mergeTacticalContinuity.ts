import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

type BoardVisual = Extract<Visual, { kind: "tactical-board" }>;

function isTimelineBoardSegment(segment: TimedSegment): segment is TimedSegment & { visual: BoardVisual } {
  return segment.type === "statement" && segment.visual?.kind === "tactical-board" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

/** Folds `next` (a scene whose `**Continue Board:** true` field was set) into
 * `accumulator` (the scene it continues from — itself possibly already the
 * result of an earlier fold in a longer chain). `next`'s own `timeline`
 * events are appended to the accumulator's, UNSHIFTED — every event keeps
 * `startSeconds` relative to `next`'s own local zero until
 * resolveSegmentAudio knows `next`'s real cumulative narration offset (see
 * `_boardClipRanges`), same deferred-patch approach `mergeCanvasContinuity.ts`
 * uses for Canvas's boundary phases rather than guessing with pre-audio
 * word-count estimates. Players are unioned by `id` (first occurrence wins
 * position — a player introduced earlier keeps gliding from wherever the
 * timeline last left them, never resets); `ball`/`highlightZone` take the
 * first/most-recent definition respectively, since continuity means the ball
 * is wherever the timeline left it, not reset to a later sub-scene's own
 * opening snapshot. */
function foldBoardScene(
  accumulator: TimedSegment & { visual: BoardVisual },
  next: TimedSegment & { visual: BoardVisual },
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];
  const mergedTimeline = [...accTimeline, ...nextTimeline];

  const existingIds = new Set(accVisual.players.map((p) => p.id));
  const mergedPlayers = [...accVisual.players, ...nextVisual.players.filter((p) => !existingIds.has(p.id))];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold ? [{ from: 0, to: accTimeline.length }] : (accumulator._boardClipRanges ?? [{ from: 0, to: accTimeline.length }]);
  const boardClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  // tacticalObjects/annotations are concatenated as-authored, NOT time-shifted
  // like `timeline` — a future script that puts a `tacticalObjects` entry on
  // a folded-in sub-scene will see its appear/disappearSeconds read against
  // the WHOLE merged passage's timeline rather than that sub-scene's own
  // local zero. Neither field is exercised by any Continue Board scene today
  // (both stay empty), so this is a documented gap, not a silent one.
  const mergedVisual: BoardVisual = {
    ...accVisual,
    players: mergedPlayers,
    timeline: mergedTimeline,
    ball: accVisual.ball ?? nextVisual.ball,
    highlightZone: nextVisual.highlightZone ?? accVisual.highlightZone,
    tacticalObjects: [...(accVisual.tacticalObjects ?? []), ...(nextVisual.tacticalObjects ?? [])],
    annotations: [...(accVisual.annotations ?? []), ...(nextVisual.annotations ?? [])],
  };

  const result: TimedSegment & { visual: BoardVisual } = {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    // Pre-audio placeholder — resolveSegmentAudio overwrites this with the
    // sum of each clip's real measured duration once TTS has run.
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _boardClipRanges: boardClipRanges,
  };
  return result;
}

/** Post-parse pass (mirrors mergeCanvasContinuity.ts's shape — pure
 * `TimedSegment[] -> TimedSegment[]` transform plus a human-readable log, run
 * alongside it in generate.ts's pipeline, before real narration audio is
 * generated) that folds a run of consecutive `Scene Type: TacticalBoard`
 * scenes marked with `**Continue Board:** true` into one continuous board:
 * one unbroken pitch/roster/ball (the camera pans and the timeline keeps
 * playing across what used to be scene cuts, instead of resetting to a fresh
 * board), while each original scene's narration stays its own audio cue (see
 * resolveSegmentAudio's `narrationClips` handling).
 *
 * Only boards authored with `timeline` (not `phases`) can continue — a
 * `phases`-based board, or `continuesBoardFrom` set on a scene whose
 * predecessor (or itself) isn't a timeline TacticalBoard, is left alone and
 * logged as a note, not an error, since a script author may have set the
 * field on a scene later changed to a different Scene Type or authoring
 * style. */
export function mergeTacticalContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesBoardFrom) {
      if (accumulator && isTimelineBoardSegment(accumulator) && isTimelineBoardSegment(segment)) {
        accumulator = foldBoardScene(accumulator, segment);
        notes.push(`${sceneLabel}: folded into the continuous TacticalBoard passage starting at scene ${merged.length + 1}`);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Board: true" set, but this scene or its predecessor isn't a timeline-authored TacticalBoard — rendered as its own independent scene instead.`,
      );
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
