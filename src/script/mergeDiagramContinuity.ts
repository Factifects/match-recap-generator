import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

type DiagramVisual = Extract<Visual, { kind: "diagram" }>;

function isTimelineDiagramSegment(segment: TimedSegment): segment is TimedSegment & { visual: DiagramVisual } {
  return segment.type === "statement" && segment.visual?.kind === "diagram" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

/** Folds `next` (a scene whose `**Continue Diagram:** true` field was set)
 * into `accumulator` (the scene it continues from — itself possibly already
 * the result of an earlier fold in a longer chain). Mirrors
 * mergeTacticalContinuity.ts's `foldBoardScene` almost exactly — Diagram's
 * `timeline` is the same shape as TacticalBoard's (a flat array of events
 * each with its own absolute `startSeconds`), so the same "concatenate
 * un-shifted, let resolveSegmentAudio patch every event's `startSeconds`
 * once next's real cumulative narration offset is known" approach applies
 * unchanged (see `_diagramClipRanges`).
 *
 * `nodes`/`edges` are UNIONED, first declaration wins — a continuing scene
 * is expected to introduce new nodes/edges via its own `timeline`
 * (`addNode`/`addEdge`) rather than redeclaring ones the passage already
 * has; if it redeclares an existing id anyway (a script author copy-pasting
 * the previous scene's Data as a starting point, say), the EARLIER
 * declaration wins, exactly like TacticalBoard's player union — continuity
 * means the passage's own established structure is never silently reset by
 * a later sub-scene's snapshot. Any state change belongs in `setState`
 * timeline events instead, same as changing a TacticalBoard player's
 * position belongs in the timeline, not in a re-authored roster. `title`/
 * `direction`/`background` all take the accumulator's own (first scene's)
 * value — one passage, one title, for the whole continuous canvas. */
function foldDiagramScene(
  accumulator: TimedSegment & { visual: DiagramVisual },
  next: TimedSegment & { visual: DiagramVisual },
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];
  const mergedTimeline = [...accTimeline, ...nextTimeline];

  const existingNodeIds = new Set(accVisual.nodes.map((n) => n.id));
  const mergedNodes = [...accVisual.nodes, ...nextVisual.nodes.filter((n) => !existingNodeIds.has(n.id))];

  const accEdges = accVisual.edges ?? [];
  const existingEdgeKeys = new Set(accEdges.map((e) => edgeKey(e.from, e.to)));
  const mergedEdges = [...accEdges, ...(nextVisual.edges ?? []).filter((e) => !existingEdgeKeys.has(edgeKey(e.from, e.to)))];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold ? [{ from: 0, to: accTimeline.length }] : (accumulator._diagramClipRanges ?? [{ from: 0, to: accTimeline.length }]);
  const diagramClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: DiagramVisual = {
    ...accVisual,
    nodes: mergedNodes,
    edges: mergedEdges,
    timeline: mergedTimeline,
  };

  const result: TimedSegment & { visual: DiagramVisual } = {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    // Pre-audio placeholder — resolveSegmentAudio overwrites this with the
    // sum of each clip's real measured duration once TTS has run.
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _diagramClipRanges: diagramClipRanges,
  };
  return result;
}

/** Post-parse pass (mirrors mergeTacticalContinuity.ts's shape — pure
 * `TimedSegment[] -> TimedSegment[]` transform plus a human-readable log,
 * run alongside it in generate.ts's pipeline, before real narration audio
 * is generated) that folds a run of consecutive `Scene Type: Diagram`
 * scenes marked with `**Continue Diagram:** true` into one continuous
 * structure: one persistent set of nodes/edges that keeps building and one
 * unbroken timeline (the diagram keeps growing/reacting across what used to
 * be scene cuts, instead of resetting to a fresh diagram), while each
 * original scene's narration stays its own audio cue (see
 * resolveSegmentAudio's `narrationClips` handling) — this is the general-
 * purpose "cumulative canvas" primitive for the Diagram medium, usable by
 * any topic's script, not something built for one specific video.
 *
 * Only diagrams authored with `timeline` (not a static snapshot) can
 * continue — a `continuesDiagramFrom` set on a scene whose predecessor (or
 * itself) isn't a timeline Diagram is left alone and logged as a note, not
 * an error, since a script author may have set the field on a scene later
 * changed to a different Scene Type. */
export function mergeDiagramContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesDiagramFrom) {
      if (accumulator && isTimelineDiagramSegment(accumulator) && isTimelineDiagramSegment(segment)) {
        accumulator = foldDiagramScene(accumulator, segment);
        notes.push(`${sceneLabel}: folded into the continuous Diagram passage starting at scene ${merged.length + 1}`);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Diagram: true" set, but this scene or its predecessor isn't a timeline-authored Diagram — rendered as its own independent scene instead.`,
      );
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
