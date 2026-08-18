import type { TimedSegment, Visual } from "../model/Segment";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

// Advisory checks for the `stage` medium — the Shorts doctrine's rules turned
// into things a machine can actually catch.
//
// The rule this file exists for is "every 1-3 seconds should contain at least
// one meaningful visual event." That is the one principle in the whole Shorts
// doctrine that is genuinely mechanical: everything else ("does the animation
// demonstrate the mechanism?", "would a viewer keep watching?") needs a human
// looking at real frames. Dead air does not — it is a measurable gap between
// timestamps, and leaving it to authorial vigilance is exactly how a scene
// ships with eight seconds of a static frame under live narration.
//
// EVERYTHING HERE IS SOFT. It reports and never blocks: the standing rule on
// this project is that diagnostics are advisory, the author renders and looks.
// A validator that refuses to generate because it disagrees about pacing is
// worse than no validator, because the next person deletes it.

type StageVisual = Extract<Visual, { kind: "stage" }>;
type StageAction = NonNullable<StageVisual["timeline"]>[number];

/** The doctrine's own number. Beyond this with nothing happening, the viewer
 * has finished reading the frame and has nothing left to do. */
const MAX_DEAD_GAP_SECONDS = 3;
/** A Short has no runway. If nothing has moved by here, the hook has already
 * been spent on a static picture. */
const MAX_OPENING_SILENCE_SECONDS = 1.2;
/** Past this length, a scene whose composition never changes is a still image
 * with narration over it, whatever else is moving inside it. */
const STATIC_COMPOSITION_LIMIT_SECONDS = 6;
/** A headline covering more of the scene than this has stopped being a beat and
 * become the banner the medium deliberately has no `title` field for. */
const BANNER_FRACTION = 0.6;

function isStageSegment(segment: TimedSegment): segment is TimedSegment & { visual: StageVisual } {
  return segment.type === "statement" && segment.visual?.kind === "stage";
}

/** When each action actually puts something on screen. `enter`/`compose`/
 * `flow` and friends all count — the question is not what KIND of event it is,
 * only whether the frame changed. */
function eventTimes(timeline: StageAction[]): number[] {
  return timeline.map((action) => action.startSeconds).sort((a, b) => a - b);
}

export function diagnoseStageScenes(segments: TimedSegment[]): SceneDiagnostic[] {
  const found: SceneDiagnostic[] = [];
  let firstStageIndex = -1;

  segments.forEach((segment, sceneIndex) => {
    if (!isStageSegment(segment)) return;
    if (firstStageIndex < 0) firstStageIndex = sceneIndex;

    const visual = segment.visual;
    const timeline = visual.timeline ?? [];
    const duration = segment.narrationSeconds ?? segment.durationSeconds ?? 0;

    if (timeline.length === 0) {
      found.push(
        diagnostic(
          sceneIndex,
          3,
          "soft",
          "static-stage",
          "Stage scene has no timeline at all, so nothing ever happens — the composition is a still image for the whole scene.",
        ),
      );
      return;
    }

    const times = eventTimes(timeline);

    // --- opening silence --------------------------------------------------
    if (times[0] > MAX_OPENING_SILENCE_SECONDS) {
      found.push(
        diagnostic(
          sceneIndex,
          3,
          "soft",
          "late-open",
          `First visual event is at ${times[0].toFixed(1)}s. A Short has no runway — something should move inside the first ${MAX_OPENING_SILENCE_SECONDS}s or the hook is spent on a static frame.`,
        ),
      );
    }

    // --- dead gaps --------------------------------------------------------
    const boundary = duration > 0 ? [...times, duration] : times;
    for (let i = 1; i < boundary.length; i++) {
      const gap = boundary[i] - boundary[i - 1];
      if (gap <= MAX_DEAD_GAP_SECONDS) continue;
      const tail = i === boundary.length - 1 && duration > 0;
      found.push(
        diagnostic(
          sceneIndex,
          3,
          "soft",
          "dead-time",
          tail
            ? `${gap.toFixed(1)}s of nothing between the last visual event (${boundary[i - 1].toFixed(1)}s) and the end of the narration. The scene finishes on a frozen frame.`
            : `${gap.toFixed(1)}s gap with no visual event (${boundary[i - 1].toFixed(1)}s -> ${boundary[i].toFixed(1)}s). Every 1-3s should carry at least one meaningful event.`,
        ),
      );
    }

    // --- composition never evolves ---------------------------------------
    const composes = timeline.filter((a) => a.type === "compose");
    if (duration > STATIC_COMPOSITION_LIMIT_SECONDS && composes.length === 0) {
      found.push(
        diagnostic(
          sceneIndex,
          2,
          "soft",
          "static-composition",
          `${duration.toFixed(1)}s scene with no \`compose\` — objects never move, grow or recede, so the frame is one fixed arrangement. That is the vertical-flowchart failure this medium exists to replace.`,
        ),
      );
    }

    // --- packets must name what is in flight ------------------------------
    for (const action of timeline) {
      if (action.type !== "flow") continue;
      if (action.label || action.magnitude) continue;
      found.push(
        diagnostic(
          sceneIndex,
          4,
          "soft",
          "unlabelled-packet",
          `A \`flow\` along ${action.path.join(" -> ")} has no label. An unlabelled packet is a generic dot on a line — name the real thing in flight ("GET /orders", "200 OK", "SELECT ...").`,
        ),
      );
    }

    // --- exactly one thing on screen --------------------------------------
    // The rule the first Stage render broke, and the reason two Shorts about
    // completely different mechanisms looked like the same video: every scene
    // rendered its whole cast at equal visual weight. A scene with several
    // objects is fine — a scene where none of them is clearly THE subject is
    // not, because the viewer has to decode the frame before understanding
    // the point.
    const cast = visual.objects.length;
    const declaresSubject =
      visual.objects.some((o) => o.emphasis === "lead") ||
      timeline.some((a) => a.type === "focus" && a.ids.length > 0) ||
      timeline.some((a) => a.type === "compose" && Object.values(a.emphasis ?? {}).includes("lead"));
    if (cast > 2 && !declaresSubject) {
      found.push(
        diagnostic(
          sceneIndex,
          2,
          "soft",
          "no-subject",
          `${cast} objects on stage and none is ever the subject — no \`emphasis: "lead"\` and no \`focus\`. Every object renders at equal weight, so the frame reads as a wiring diagram rather than as one thing being explained.`,
        ),
      );
    }
    if (cast > 5) {
      found.push(
        diagnostic(
          sceneIndex,
          2,
          "soft",
          "crowded-stage",
          `${cast} objects in one scene. Prefer one big idea over many small ones — if the viewer has to decode the whole screen before understanding the point, the composition has failed. Split across scenes or introduce them progressively with \`enter\`.`,
        ),
      );
    }

    // --- lifecycle integrity ----------------------------------------------
    // An entity with a declared lifecycle must actually walk it. A cache that
    // reaches `hit` without ever passing through `filling` is not a shortcut in
    // the animation — it is a scene asserting something that never happened,
    // which is the exact failure "entities have states" exists to prevent.
    for (const object of visual.objects) {
      if (!object.states || object.states.length === 0) continue;
      const declared = object.states;
      let at = 0;
      for (const action of timeline.filter((a) => a.type === "phase" && a.id === object.id).sort((a, b) => a.startSeconds - b.startSeconds)) {
        const to = (action as { to: string }).to;
        const next = declared.indexOf(to);
        if (next === -1) {
          found.push(
            diagnostic(
              sceneIndex,
              4,
              "soft",
              "undeclared-state",
              `\`${object.id}\` moves to state "${to}", which is not in its declared lifecycle [${declared.join(" -> ")}].`,
            ),
          );
          continue;
        }
        if (next > at + 1) {
          found.push(
            diagnostic(
              sceneIndex,
              4,
              "soft",
              "skipped-state",
              `\`${object.id}\` jumps from "${declared[at]}" to "${to}", skipping ${declared.slice(at + 1, next).join(", ")}. The skipped steps are the mechanism — showing the outcome without them asserts something the scene never demonstrated.`,
            ),
          );
        }
        at = next;
      }
    }

    // --- a headline is a beat, not a banner -------------------------------
    if (duration > 0) {
      for (const action of timeline) {
        if (action.type !== "beat") continue;
        const held = action.durationSeconds ?? 1.8;
        if (held < duration * BANNER_FRACTION) continue;
        found.push(
          diagnostic(
            sceneIndex,
            2,
            "soft",
            "permanent-headline",
            `Beat "${action.text}" holds for ${held.toFixed(1)}s of a ${duration.toFixed(1)}s scene. Text that stays that long stops being information and becomes furniture — land it, then clear it.`,
          ),
        );
      }
    }
  });

  // --- the video must open on a mystery, not an explanation ---------------
  if (firstStageIndex >= 0) {
    const first = segments[firstStageIndex];
    if (isStageSegment(first)) {
      const act = first.visual.act;
      if (act && act !== "strange") {
        found.push(
          diagnostic(
            firstStageIndex,
            4,
            "soft",
            "no-opening-mystery",
            `First stage scene declares \`act: "${act}"\`. Every video opens on something strange, unfair, broken or counterintuitive and only then reveals the mechanism — starting on "${act}" means starting by explaining.`,
          ),
        );
      }
    }
  }

  return found;
}
