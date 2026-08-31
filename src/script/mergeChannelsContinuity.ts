import type { TimedSegment, Visual } from "../model/Segment";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";

// Cross-scene continuity for the `channels` medium.
//
// This medium needs it more plainly than any other: the whole video is ONE day.
// The strip, the channels and every trace on them are the same objects from the
// first scene to the last — what changes per scene is only what the playhead is
// doing, what is focused, and what has been switched off. Without folding, each
// scene would rebuild the day from scratch and the viewer would be watching six
// different Tuesdays.
//
// So `moments`, `channels` and `marks` are UNIONED with first-declaration-wins,
// and a continuing scene is expected to declare none of them — just its own
// timeline. Same contract as every other continuity pass in this directory.

type ChannelsVisual = Extract<Visual, { kind: "channels" }>;

function isTimelineChannelsSegment(segment: TimedSegment): segment is TimedSegment & { visual: ChannelsVisual } {
  return segment.type === "statement" && segment.visual?.kind === "channels" && !!segment.visual.timeline && segment.visual.timeline.length > 0;
}

/** Folds `next` into `accumulator`.
 *
 * `moments`, `channels` and `marks` are UNIONED, FIRST DECLARATION WINS. A
 * continuing scene is expected to declare none of them and carry only its own
 * timeline — the day already exists. If it redeclares something anyway (an
 * author copy-pasting the previous scene's Data as a starting point, which is
 * exactly how these get written), the established day wins, because a later
 * scene silently replacing a trace would change what the viewer had already
 * been shown while looking identical.
 *
 * `window`/`theme`/`title`/`signalLabels` take the first scene's value: one
 * passage, one day, one clock. A different `window` is reported rather than
 * applied — it would rescale every mark's position mid-video, which is the one
 * thing this medium can never do, since the whole argument rests on a trace
 * sitting under the moment that produced it.
 */
function foldChannelsScene(
  accumulator: TimedSegment & { visual: ChannelsVisual },
  next: TimedSegment & { visual: ChannelsVisual },
  sceneLabel: string,
  notes: string[],
): TimedSegment {
  const accVisual = accumulator.visual;
  const nextVisual = next.visual;

  const accTimeline = accVisual.timeline ?? [];
  const nextTimeline = nextVisual.timeline ?? [];

  if (nextVisual.window && accVisual.window && (nextVisual.window.from !== accVisual.window.from || nextVisual.window.to !== accVisual.window.to)) {
    notes.push(
      `${sceneLabel}: declares a different time window — keeping the passage's, since rescaling the axis mid-video would slide every trace out from under the moment that produced it.`,
    );
  }

  const existingChannelIds = new Set(accVisual.channels.map((c) => c.id));
  const newChannels = nextVisual.channels.filter((c) => !existingChannelIds.has(c.id));
  if (nextVisual.channels.length > newChannels.length) {
    notes.push(`${sceneLabel}: redeclares ${nextVisual.channels.length - newChannels.length} channel(s) the day already has — ignored, the passage keeps the ones the viewer has been reading.`);
  }

  const markKey = (m: { at: number; channel: string }) => `${m.channel}@${m.at}`;
  const existingMarkKeys = new Set((accVisual.marks ?? []).map(markKey));
  const newMarks = (nextVisual.marks ?? []).filter((m) => !existingMarkKeys.has(markKey(m)));

  const momentKey = (m: { at: number; label: string }) => `${m.at}:${m.label}`;
  const existingMomentKeys = new Set((accVisual.moments ?? []).map(momentKey));
  const newMoments = (nextVisual.moments ?? []).filter((m) => !existingMomentKeys.has(momentKey(m)));

  // Shift at merge time by the running estimate and RECORD it, so a no-audio
  // preview of a folded passage still plays in sequence; resolveSegmentAudio
  // corrects by the difference once real clip offsets exist.
  const appliedOffset = accumulator.durationSeconds;
  const shiftedNext = nextTimeline.map((action) => ({ ...action, startSeconds: action.startSeconds + appliedOffset }));
  const mergedTimeline = [...accTimeline, ...shiftedNext];

  const isFirstFold = !accumulator.narrationClips;
  const baseRanges = isFirstFold
    ? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]
    : (accumulator._channelsClipRanges ?? [{ from: 0, to: accTimeline.length, appliedOffsetSeconds: 0 }]);
  const channelsClipRanges = [...baseRanges, { from: accTimeline.length, to: mergedTimeline.length, appliedOffsetSeconds: appliedOffset }];

  const narrationClips = [
    ...(accumulator.narrationClips ?? [{ text: accumulator.narrationText ?? accumulator.text }]),
    { text: next.narrationText ?? next.text },
  ];

  const mergedVisual: ChannelsVisual = {
    ...accVisual,
    channels: [...accVisual.channels, ...newChannels],
    marks: [...(accVisual.marks ?? []), ...newMarks],
    moments: [...(accVisual.moments ?? []), ...newMoments],
    timeline: mergedTimeline,
  };

  return {
    ...accumulator,
    text: `${accumulator.text} ${next.text}`.trim(),
    visual: mergedVisual,
    durationSeconds: accumulator.durationSeconds + next.durationSeconds,
    visualMinDurationSeconds: computeVisualMinDurationSeconds(mergedVisual),
    narrationClips,
    _channelsClipRanges: channelsClipRanges,
  } as TimedSegment & { visual: ChannelsVisual };
}

/** Post-parse pass folding a run of consecutive `Scene Type: Channels` scenes
 * marked `**Continue Channels:** true` into one continuous passage. */
export function mergeChannelsContinuity(segments: TimedSegment[]): { segments: TimedSegment[]; notes: string[] } {
  const notes: string[] = [];
  const merged: TimedSegment[] = [];
  let accumulator: TimedSegment | undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const sceneLabel = `Scene ${i + 1}`;

    if (segment.continuesChannelsFrom) {
      if (accumulator && isTimelineChannelsSegment(accumulator) && isTimelineChannelsSegment(segment)) {
        notes.push(`${sceneLabel}: folded into the continuous Channels passage starting at scene ${merged.length + 1}`);
        accumulator = foldChannelsScene(accumulator, segment, sceneLabel, notes);
        continue;
      }
      notes.push(
        `${sceneLabel}: "Continue Channels: true" set, but this scene or its predecessor isn't a timeline-authored Channels scene — rendered as its own independent scene instead.`,
      );
    }

    // The other side of the schema's empty-`channels` allowance: a scene with
    // no channels that continues nothing has no day to be part of.
    if (isTimelineChannelsSegment(segment) && segment.visual.channels.length === 0 && !segment.continuesChannelsFrom) {
      notes.push(`${sceneLabel}: a Channels scene with no channels that doesn't continue a passage — there is no day for its timeline to act on. Declare one, or mark it "Continue Channels: true".`);
    }

    if (accumulator) merged.push(accumulator);
    accumulator = segment;
  }
  if (accumulator) merged.push(accumulator);

  return { segments: merged, notes };
}
