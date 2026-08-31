import type { TimedSegment, Visual } from "../model/Segment";
import { derive, deriveWithout, firstConfidentAt, silentChannels, type Mark } from "./channelLayout";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

// Advisory checks for the `channels` medium.
//
// Same discipline as validateHoldings: the medium computes its own conclusions,
// so the new way to be wrong is a narration that claims something the traces do
// not support. This medium has one failure that matters more than all the
// others put together —
//
//   AN EPISODE WHOSE POINT IS AN EMPTY CHANNEL, WITH MARKS ON THAT CHANNEL.
//
// The renderer does not special-case the microphone; it draws what is there. So
// a script that puts a single trace on the channel it is calling empty will
// produce a frame that quietly contradicts the narrator, and nothing else in
// the pipeline would notice.
//
// Every finding is ADVISORY and must never block a render.

type ChannelsVisual = Extract<Visual, { kind: "channels" }>;

function isChannelsScene(segment: TimedSegment): segment is TimedSegment & { visual: ChannelsVisual } {
  return segment.type === "statement" && segment.visual?.kind === "channels";
}

/** Margin the medium treats as "safely ahead" — matches channelLayout's own
 * default so a diagnostic can never disagree with what gets drawn. */
const CONFIDENT_MARGIN = 2;

export function diagnoseChannelsScenes(segments: readonly TimedSegment[]): SceneDiagnostic[] {
  const found: SceneDiagnostic[] = [];

  segments.forEach((segment, index) => {
    if (!isChannelsScene(segment)) return;
    const visual = segment.visual;
    const marks = (visual.marks ?? []) as Mark[];
    const channelIds = new Set(visual.channels.map((c) => c.id));
    const window = visual.window ?? { from: 7, to: 23 };
    const silent = silentChannels(visual.channels, marks);
    const inference = derive(marks);

    // A trace on a channel that does not exist is drawn nowhere at all.
    for (const mark of marks) {
      if (!channelIds.has(mark.channel)) {
        found.push(diagnostic(index, 4, "hard", "channels-unknown-channel", `A trace at ${mark.at} names channel "${mark.channel}", which this scene does not declare — it will not be drawn anywhere.`));
      }
      if (mark.at < window.from || mark.at > window.to) {
        found.push(
          diagnostic(index, 3, "soft", "channels-outside-window", `A trace at ${mark.at} falls outside the day (${window.from}–${window.to}) — it will be clamped to the edge of the axis, under no moment at all.`),
        );
      }
    }

    for (const action of visual.timeline ?? []) {
      switch (action.type) {
        case "focus": {
          if (!channelIds.has(action.channel)) {
            found.push(diagnostic(index, 4, "hard", "channels-focus-unknown", `"focus" names channel "${action.channel}", which this scene does not declare.`));
          }
          break;
        }
        case "mute": {
          if (!channelIds.has(action.channel)) {
            found.push(diagnostic(index, 4, "hard", "channels-mute-unknown", `"mute" names channel "${action.channel}", which this scene does not declare.`));
            break;
          }
          const onIt = marks.filter((m) => m.channel === action.channel).length;
          if (onIt === 0) {
            found.push(
              diagnostic(index, 3, "soft", "channels-mute-empty", `"mute" switches off "${action.channel}", which has no traces on it — nothing will visibly change, so the beat demonstrates nothing.`),
            );
            break;
          }
          // The closing beat's actual claim, checked: does the conclusion
          // survive, and does it genuinely arrive later?
          const without = deriveWithout(marks, action.channel);
          if (without.winner !== inference.winner) {
            found.push(
              diagnostic(
                index,
                3,
                "soft",
                "channels-mute-changes-answer",
                `Switching off "${action.channel}" changes the conclusion from "${inference.winner}" to "${without.winner ?? "nothing"}" — a beat saying it still works without that channel would be false of these traces.`,
              ),
            );
          } else {
            const before = firstConfidentAt(marks, CONFIDENT_MARGIN);
            const after = firstConfidentAt(
              marks.filter((m) => m.channel !== action.channel),
              CONFIDENT_MARGIN,
            );
            if (before !== null && after !== null && after - before < 0.25) {
              found.push(
                diagnostic(
                  index,
                  2,
                  "soft",
                  "channels-mute-no-delay",
                  `Switching off "${action.channel}" delays the conclusion by only ${(after - before).toFixed(2)}h — the readout will show that, so a narration promising a meaningful delay will not match.`,
                ),
              );
            }
          }
          break;
        }
        case "converge": {
          if (!inference.winner) {
            found.push(diagnostic(index, 4, "hard", "channels-no-conclusion", `"converge" has nothing to gather — no trace supports any conclusion, so no marks will move.`));
          } else if (inference.margin <= 0) {
            found.push(
              diagnostic(index, 3, "soft", "channels-tied-conclusion", `"converge" resolves to "${inference.winner}", but "${inference.runnerUp}" is tied with it — the frame will pick one arbitrarily.`),
            );
          }
          break;
        }
        case "readout": {
          if (action.show === "silent" && silent.length === 0) {
            // THE ONE THAT MATTERS. An episode arguing that a channel recorded
            // nothing, over a frame showing that it did.
            found.push(
              diagnostic(
                index,
                4,
                "soft",
                "channels-nothing-silent",
                `"readout: silent" claims a channel recorded nothing, but every declared channel has at least one trace on it. If this is the empty-microphone beat, the frame will contradict the narration.`,
              ),
            );
          }
          if (action.show === "delay" && !(visual.timeline ?? []).some((a) => a.type === "mute")) {
            found.push(diagnostic(index, 3, "soft", "channels-delay-without-mute", `"readout: delay" has nothing to compare against — no channel has been muted, so there is no delay to report.`));
          }
          if (action.show === "confidentAt" && firstConfidentAt(marks, CONFIDENT_MARGIN) === null) {
            found.push(
              diagnostic(index, 3, "soft", "channels-never-confident", `"readout: confidentAt" has no answer — no conclusion ever gets ${CONFIDENT_MARGIN} clear of its rival, so nothing will be shown.`),
            );
          }
          break;
        }
        default:
          break;
      }
    }
  });

  return found;
}
