import type { TimedSegment, Visual } from "../model/Segment";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";
import { suggestProfile, repetitionWarning, DEFAULT_AVOID } from "./visualStrategy";

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

type ReferencePopulation = "object" | "packet";

interface StageReference {
  id: string;
  population: ReferencePopulation;
  /** Where the name was written, so a report points at the actual mistake
   * rather than just at the scene. */
  field: string;
}

/** Every id an action names, and which population that id has to come from.
 *
 * The renderer resolves ids through map lookups and silently does nothing when
 * one misses — `const p = livePackets.get(action.id); if (!p) break;`. That is
 * right at render time, where a typo must never take a whole video down, but
 * it hides the mistake in the worst possible way: the beat still spends its
 * seconds, the narration still says the request travels, and the frame simply
 * sits there. Nothing failed, so nothing is reported, and the author is left
 * watching a render wondering which part they broke. Resolving the names
 * statically is the only place that mistake is visible before it costs a
 * render. */
function referencesIn(action: StageAction): StageReference[] {
  const objects = (field: string, ...ids: (string | undefined)[]): StageReference[] =>
    ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, population: "object", field }));
  const packets = (field: string, ...ids: (string | undefined)[]): StageReference[] =>
    ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, population: "packet", field }));

  switch (action.type) {
    // Acts on an entity standing on the stage.
    case "enter":
    case "exit":
    case "setState":
    case "pop":
    case "count":
    case "meter":
    case "highlightLine":
    case "transform":
    case "expand":
    case "collapse":
    case "phase":
    case "accumulate":
    case "degrade":
    case "click":
    case "uiState":
    case "occlude":
    case "scan":
    case "spotlight":
      return objects(action.type, action.id);
    case "connect":
      return objects("connect", action.from, action.to);
    case "compose":
      return objects("compose", ...Object.keys(action.place ?? {}), ...Object.keys(action.emphasis ?? {}), ...(action.hidden ?? []));
    case "camera":
      return objects("camera.focus", action.focus);
    case "flow":
      return objects("flow.path", ...action.path);
    case "focus":
      return objects("focus.ids", ...action.ids);
    case "annotate":
      return objects("annotate.target", action.target);
    case "perspective":
      return objects("perspective.focus", action.focus);
    // Acts on a travelling packet, and often on the entity it moves between.
    case "mutate":
    case "consume":
      return packets(action.type, action.id);
    case "send":
      return [...packets("send", action.id), ...objects("send.path", ...action.path)];
    case "loop":
      return [...packets("loop", action.id), ...objects("loop.path", ...action.path)];
    case "emit":
      return [...packets("emit", action.id), ...objects("emit.from", action.from)];
    case "detach":
      return [...packets("detach", action.id), ...objects("detach.from", action.from)];
    case "absorb":
      return [...packets("absorb", action.id), ...objects("absorb.into", action.into)];
    case "split":
      return packets("split", action.id, ...action.into);
    case "merge":
      return packets("merge", ...action.ids, action.into);
    case "collide":
      return [...packets("collide", ...action.ids), ...objects("collide.at", action.at)];
    // Names nothing: beat, shake, react, timeLapse.
    default:
      return [];
  }
}

/** THE SURFACE THE VIEWER IS LOOKING AT.
 *
 * Deliberately not the same axis as `strategy`. A strategy is what the scene is
 * DOING (revealing, comparing, transforming); a medium is what is physically on
 * screen while it does it. The two came apart badly once and cost a whole
 * script: four scenes declared four different strategies, every check passed,
 * and all four were the same monospace pane being retyped. A viewer does not
 * perceive strategy. They perceive surfaces, and four code panes in a row is
 * four code panes in a row however differently the compiler labelled them. */
type SceneMedium = "ui" | "code" | "split" | "map" | "entities" | "text";

const MEDIUM_LABEL: Record<SceneMedium, string> = {
  ui: "a simulated interface",
  code: "a code pane",
  split: "a divided frame",
  map: "a map of a place",
  entities: "objects on a stage",
  text: "typography alone",
};

/** How much of the frame's attention an object commands. Emphasis is the only
 * signal available without running the layout engine, and it is the one the
 * author actually declared, so a `lead` code pane beside a `recede` server
 * classifies as code rather than as a tie. */
const EMPHASIS_WEIGHT: Record<string, number> = { lead: 2.5, normal: 1, recede: 0.35 };

/** The dominant medium of one scene.
 *
 * Kept deliberately COARSE. It would be easy to add "packets in motion" or
 * "character" as media and end up with a classifier that finds variety
 * everywhere — two scenes labelled differently that look identical to a viewer
 * would pass a check whose entire job is to catch monotony. Every distinction
 * here is one somebody would notice with the sound off. */
function mediumOf(visual: StageVisual): SceneMedium {
  // A divided frame reads as a divided frame before it reads as anything
  // inside it, whatever the halves are made of.
  if (visual.splitScreen) return "split";
  const objects = visual.objects;
  if (objects.length === 0) return "text";

  // A MAP is its own surface. Territory with streets and tiles on it is not
  // "objects on a stage" to anyone watching, and lumping the two together made
  // the check report monotony across scenes that look nothing alike.
  if (objects.some((object) => object.kind === "hexmap")) return "map";

  let ui = 0;
  let code = 0;
  let text = 0;
  let entities = 0;
  for (const object of objects) {
    const weight = EMPHASIS_WEIGHT[object.emphasis ?? "normal"] ?? 1;
    // `kind: "code"` counts even with no `code` array: a continuing scene
    // inherits its lines, and `transform` with `toCode` fills the pane at
    // runtime. Judging by the declaration alone would miss exactly the scenes
    // that caused this check to exist.
    if (object.ui) ui += weight;
    else if (object.kind === "phrase") text += weight;
    else if (object.kind === "code" || (object.code?.length ?? 0) > 0) code += weight;
    else entities += weight;
  }
  if (text > ui && text > code && text > entities) return "text";
  if (ui >= code && ui > entities) return "ui";
  if (code > ui && code > entities) return "code";
  return "entities";
}

/** THE MEDIUM ROTATION CHECK — run on the AUTHORED scenes, before continuity
 * merging folds a passage into one segment.
 *
 * Deliberately separate from `diagnoseStageScenes`, which runs after the merge.
 * A `Continue Stage:` passage becomes ONE segment whose objects are the union
 * of every scene in it, and at that point both the count of scenes and which
 * surface each one showed are gone — the script this check was built for
 * collapsed from four scenes to two segments and slipped straight under the
 * threshold. Scene numbers here are the ones in the script file, which is also
 * the thing an author would edit in response.
 */
export function diagnoseSceneMedia(segments: TimedSegment[]): SceneDiagnostic[] {
  const found: SceneDiagnostic[] = [];
  // --- the medium has to change, not only the strategy ---------------------
  //
  // The check the URL-tracking script needed and did not have. Its four scenes
  // declared `reveal`, then `splitting`+`transformation`, then
  // `transformation`+`perspective`, then `absence`+`beforeAfter` — genuine
  // variety by every measure the compiler had — while showing one code pane
  // being retyped four times. It passed, and it was unwatchable.
  //
  // Reported per video rather than per scene because monotony is a property of
  // the sequence: no single scene here is wrong, and telling an author that
  // scene 3 is "too code-like" would be both false and unhelpful. What they
  // need to see is the whole run at once.
  const mediumSequence = segments
    .map((segment, index) => ({ index, segment }))
    .filter(({ segment }) => isStageSegment(segment))
    .map(({ index, segment }) => ({ index, medium: mediumOf((segment as TimedSegment & { visual: StageVisual }).visual) }));

  if (mediumSequence.length >= 3) {
    const distinct = new Set(mediumSequence.map((s) => s.medium));
    const run = mediumSequence.map((s) => s.medium).join(" -> ");
    if (distinct.size === 1) {
      const only = mediumSequence[0].medium;
      found.push(
        diagnostic(
          mediumSequence[0].index,
          2,
          "soft",
          "single-medium-video",
          `All ${mediumSequence.length} scenes are ${MEDIUM_LABEL[only]} (${run}). Whatever strategies they declare, the viewer watches one surface for the whole Short. Lead with the medium the topic is actually experienced in, and cut to another to explain what it just did.`,
        ),
      );
    } else {
      // Three in a row is monotonous even when the video varies elsewhere.
      for (let i = 2; i < mediumSequence.length; i++) {
        const [a, b, c] = [mediumSequence[i - 2], mediumSequence[i - 1], mediumSequence[i]];
        if (a.medium !== c.medium || b.medium !== c.medium) continue;
        found.push(
          diagnostic(
            c.index,
            2,
            "soft",
            "repeated-medium",
            `Three scenes running are ${MEDIUM_LABEL[c.medium]} (${run}). The strategy may be changing underneath, but nothing the viewer can see is.`,
          ),
        );
      }
    }
  }

  return found;
}

export function diagnoseStageScenes(segments: TimedSegment[], scriptName?: string): SceneDiagnostic[] {
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
    // A UI-DOMINANT scene is exempt. Its frame evolves through the interface —
    // rows appearing, values changing, a tap landing — and demanding a
    // `compose` there produces exactly the note this rule exists to prevent:
    // an object rescaled or shuffled for no reason, which on a phone reads as
    // the camera fidgeting rather than as the app doing anything.
    const uiDominant =
      visual.objects.every((object) => object.ui || object.kind === "phrase") &&
      visual.objects.some((object) => object.ui || object.kind === "phrase");
    if (!uiDominant && duration > STATIC_COMPOSITION_LIMIT_SECONDS && composes.length === 0) {
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

    // --- names that resolve to nothing ------------------------------------
    //
    // The one class of finding in this file that is not a matter of taste: an
    // id matching no declared object or packet is simply a defect, and the
    // renderer's own tolerance of it is what makes it invisible. Still soft,
    // like everything else here — reported loudly, never blocking.
    const objectIds = new Set(visual.objects.map((object) => object.id));
    const packetIds = new Set((visual.packets ?? []).map((packet) => packet.id));
    const objectsById = new Map(visual.objects.map((object) => [object.id, object]));

    // Grouped by the missing name rather than reported per use: one mistyped
    // id is one mistake, and repeating it six times buries every other finding
    // in the scene underneath it.
    const unresolved = new Map<string, { id: string; population: ReferencePopulation; fields: Set<string> }>();
    const noteUnresolved = (reference: StageReference) => {
      const known = reference.population === "object" ? objectIds : packetIds;
      if (known.has(reference.id)) return;
      const key = `${reference.population} ${reference.id}`;
      const entry = unresolved.get(key) ?? { id: reference.id, population: reference.population, fields: new Set<string>() };
      entry.fields.add(reference.field);
      unresolved.set(key, entry);
    };

    for (const action of timeline) for (const reference of referencesIn(action)) noteUnresolved(reference);
    for (const edge of visual.edges ?? []) {
      noteUnresolved({ id: edge.from, population: "object", field: "edges.from" });
      noteUnresolved({ id: edge.to, population: "object", field: "edges.to" });
    }
    for (const packet of visual.packets ?? []) {
      if (packet.at) noteUnresolved({ id: packet.at, population: "object", field: `packets.${packet.id}.at` });
    }

    for (const entry of unresolved.values()) {
      const declared = entry.population === "object" ? [...objectIds] : [...packetIds];
      const fields = [...entry.fields].sort().join(", ");
      found.push(
        diagnostic(
          sceneIndex,
          1,
          "soft",
          "unresolved-id",
          `\`${entry.id}\` is named by ${fields}, but this scene declares no ${entry.population} with that id, so ${entry.fields.size === 1 ? "that beat does" : "those beats do"} nothing at all — the seconds still pass under the narration with the frame unchanged. Declared ${entry.population}s: ${declared.length > 0 ? declared.map((id) => `\`${id}\``).join(", ") : "none"}.`,
        ),
      );
    }

    // --- rows and lines inside an object ----------------------------------
    // The same silence one level down. A `click` on a row the UI does not have
    // is a click the viewer never sees, and a `highlightLine` past the end of
    // the snippet lights up nothing.
    for (const action of timeline) {
      const rowRef =
        action.type === "click" || action.type === "uiState"
          ? { id: action.id, row: action.row, field: action.type }
          : action.type === "detach" && action.row
            ? { id: action.from, row: action.row, field: "detach.row" }
            : undefined;
      if (!rowRef) continue;
      const target = objectsById.get(rowRef.id);
      if (!target) continue; // already reported above as an unresolved id
      if (!target.ui) {
        found.push(
          diagnostic(
            sceneIndex,
            1,
            "soft",
            "row-without-ui",
            `\`${rowRef.field}\` acts on row "${rowRef.row}" of \`${rowRef.id}\`, but that object declares no \`ui\` surface, so there is no row to press or reveal.`,
          ),
        );
        continue;
      }
      if (!target.ui.rows.some((row) => row.id === rowRef.row)) {
        found.push(
          diagnostic(
            sceneIndex,
            1,
            "soft",
            "unknown-ui-row",
            `\`${rowRef.id}\` has no UI row "${rowRef.row}" — it declares ${target.ui.rows.map((row) => `\`${row.id}\``).join(", ")} — so this \`${rowRef.field}\` does nothing.`,
          ),
        );
      }
    }

    // A code object's contents are not fixed for the scene: `transform` with
    // `toCode` swaps the whole snippet, which is how a scene walks a URL down
    // to its bare address or steps a file through an edit. So "line 4" has to
    // be judged against whatever the object is showing AT THAT MOMENT, not
    // against what it was declared with — checking the declaration would report
    // every scene that transforms its code, which is most of the good ones.
    const codeAt = (id: string, seconds: number): string[] | undefined => {
      const swaps = timeline
        .filter((a): a is Extract<StageAction, { type: "transform" }> => a.type === "transform" && a.id === id && !!a.toCode)
        .filter((a) => a.startSeconds <= seconds)
        .sort((a, b) => a.startSeconds - b.startSeconds);
      return swaps.length > 0 ? swaps[swaps.length - 1].toCode : objectsById.get(id)?.code;
    };

    for (const action of timeline) {
      const lineRef =
        action.type === "highlightLine"
          ? { id: action.id, lines: action.lines, field: "highlightLine" }
          : action.type === "detach" && action.line !== undefined
            ? { id: action.from, lines: [action.line], field: "detach.line" }
            : undefined;
      if (!lineRef || lineRef.lines.length === 0) continue;
      const target = objectsById.get(lineRef.id);
      if (!target) continue;
      const available = codeAt(lineRef.id, action.startSeconds)?.length ?? 0;
      if (available === 0) {
        found.push(
          diagnostic(
            sceneIndex,
            1,
            "soft",
            "line-without-code",
            `\`${lineRef.field}\` addresses line ${lineRef.lines.join(", ")} of \`${lineRef.id}\`, but that object carries no \`code\`, so there is no line to lift or light up.`,
          ),
        );
        continue;
      }
      const beyond = lineRef.lines.filter((line) => line > available);
      if (beyond.length > 0) {
        found.push(
          diagnostic(
            sceneIndex,
            1,
            "soft",
            "line-out-of-range",
            `\`${lineRef.field}\` addresses line ${beyond.join(", ")} of \`${lineRef.id}\`, which has ${available} line(s).`,
          ),
        );
      }
    }

    // --- a mechanic declared on one side only ------------------------------
    // Both of these need two halves to work, and each half sits silently inert
    // without the other.
    if (!visual.splitScreen) {
      const paned = visual.objects.filter((object) => object.pane);
      if (paned.length > 0) {
        found.push(
          diagnostic(
            sceneIndex,
            1,
            "soft",
            "pane-without-split",
            `${paned.length} object(s) declare a \`pane\` but the scene has no \`splitScreen\`, so the layout ignores it and everything lands in one undivided frame.`,
          ),
        );
      }
    } else if (!visual.objects.some((object) => object.pane === "b")) {
      found.push(
        diagnostic(
          sceneIndex,
          2,
          "soft",
          "empty-split-pane",
          "`splitScreen` divides the stage but nothing is placed in pane `b`, so half the frame stays empty. A split earns its place only when both sides run the same operation at once and the difference emerges from watching.",
        ),
      );
    }

    if (timeline.some((action) => action.type === "react") && !visual.mascot) {
      found.push(
        diagnostic(
          sceneIndex,
          1,
          "soft",
          "react-without-mascot",
          "The timeline has `react` beats but the scene declares no `mascot`, so there is no face on screen to react and those beats pass invisibly.",
        ),
      );
    }

    // --- THE REMOVE-ALL-ARROWS TEST ---------------------------------------
    //
    // "If I remove all the arrows and connector lines from this scene, does the
    // explanation still work?" That question is mechanically checkable, which
    // makes it the single most valuable check in this file: a scene whose only
    // mechanisms are `edges` and `flow` has NOTHING left when the lines go, so
    // it is a diagram being animated rather than a system behaving.
    //
    // The goal is not to eliminate arrows. It is to eliminate DEPENDENCE on
    // them, so the bar is one non-connector mechanism, not zero connectors.
    const NON_CONNECTOR = new Set([
      "transform", "collide", "split", "merge", "phase", "expand", "collapse",
      "absorb", "emit", "count", "meter", "setState", "pop", "shake",
      "highlightLine", "compose",
    ]);
    const carriesItself = timeline.some((a) => NON_CONNECTOR.has(a.type));
    const leansOnLines = (visual.edges?.length ?? 0) > 0 || timeline.some((a) => a.type === "flow" || a.type === "connect");
    if (leansOnLines && !carriesItself) {
      found.push(
        diagnostic(
          sceneIndex,
          3,
          "soft",
          "connector-dependent",
          "Remove the connectors from this scene and nothing is left: it only draws edges and sends things along them. A relationship can be carried by movement, transformation, collision, state change, accumulation or absence — the line should be the exception, not the default representation.",
        ),
      );
    }

    // --- a declared strategy ----------------------------------------------
    // A scene that never states what KIND of explanation it is falls back to
    // the house default (component, line, component, travelling dot), which is
    // the repetition the strategy vocabulary exists to break.
    const CONNECTOR_LEGITIMATE = new Set(["topology", "dependency", "lineage"]);
    if (!visual.strategy || visual.strategy.length === 0) {
      found.push(
        diagnostic(sceneIndex, 4, "soft", "no-strategy", "No `strategy` declared, so nothing states how this concept should be shown rather than merely diagrammed."),
      );
    } else if ((visual.edges?.length ?? 0) > 0 && !visual.strategy.some((st) => CONNECTOR_LEGITIMATE.has(st))) {
      found.push(
        diagnostic(
          sceneIndex,
          3,
          "soft",
          "unjustified-connectors",
          `This scene draws ${visual.edges!.length} connector(s) but its strategy is [${visual.strategy.join(", ")}] — none of which is about a connection itself. Persistent lines are honest for topology, dependency or lineage; otherwise carry the relationship some other way.`,
        ),
      );
    }

    // --- a declared strategy the scene never performs ----------------------
    // Declaring `comparison` and then not splitting the stage, or `absence` and
    // then animating the thing that is supposed to stay dark, is worse than
    // declaring nothing: it reads as an intention the render silently dropped.
    const has = (t: string) => timeline.some((a) => a.type === t);
    const REQUIRES: Record<string, { ok: () => boolean; how: string }> = {
      comparison: { ok: () => !!visual.splitScreen, how: "needs `splitScreen` so both systems perform the same operation at once" },
      beforeAfter: { ok: () => !!visual.splitScreen, how: "needs `splitScreen` to hold the two states" },
      uiInteraction: { ok: () => visual.objects.some((o) => o.ui), how: "needs an object carrying a `ui` surface" },
      transformation: { ok: () => has("transform"), how: "needs a `transform`" },
      stateChange: { ok: () => has("phase") || has("setState"), how: "needs `phase` or `setState`" },
      competition: { ok: () => has("collide"), how: "needs a `collide`" },
      splitting: { ok: () => has("split"), how: "needs a `split`" },
      merging: { ok: () => has("merge"), how: "needs a `merge`" },
      accumulation: { ok: () => has("accumulate"), how: "needs an `accumulate`" },
      failure: { ok: () => has("degrade"), how: "needs a `degrade`" },
      loop: { ok: () => has("loop"), how: "needs a `loop`" },
      expansion: { ok: () => has("expand"), how: "needs an `expand`" },
      zoom: { ok: () => has("camera"), how: "needs a `camera` move" },
      codeExecution: { ok: () => has("highlightLine"), how: "needs `highlightLine` on a code object" },
    };
    for (const declared of visual.strategy ?? []) {
      const rule = REQUIRES[declared];
      if (rule && !rule.ok()) {
        found.push(
          diagnostic(sceneIndex, 4, "soft", "unperformed-strategy", `Declares strategy "${declared}" but ${rule.how}.`),
        );
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

  // --- the VIDEO-level plan ----------------------------------------------
  // A profile declared before any scene is written is what stops each scene
  // being planned in isolation and all of them independently reaching for the
  // house default.
  const profile = segments.find((s) => s.type === "statement" && s.strategyProfile)?.strategyProfile;
  const stageIndexes = segments.map((s, i) => ({ s, i })).filter(({ s }) => isStageSegment(s));

  if (stageIndexes.length > 0 && !profile) {
    const narration = segments.map((s) => s.narrationText ?? s.text).join(" ");
    const suggestion = suggestProfile(narration);
    found.push(
      diagnostic(
        stageIndexes[0].i,
        4,
        "soft",
        "no-strategy-profile",
        `No \`Strategy Profile\` declared for this video. Suggested from the narration${suggestion.matched ? ` (matched "${suggestion.matched}")` : " (no known concept shape matched)"}: primary "${suggestion.profile.primary}", secondary [${suggestion.profile.secondary.join(", ")}]. This is a suggestion from a lookup table, not an analysis — decide it deliberately.`,
      ),
    );
  }

  if (profile) {
    const allowed = new Set([profile.primary, ...profile.secondary]);
    const avoid = profile.avoid.length > 0 ? profile.avoid : DEFAULT_AVOID;
    let primaryUsed = false;
    for (const { s: segment, i } of stageIndexes) {
      const declared = (segment as TimedSegment & { visual: StageVisual }).visual.strategy ?? [];
      if (declared.includes(profile.primary as (typeof declared)[number])) primaryUsed = true;
      const strays = declared.filter((d) => !allowed.has(d));
      if (strays.length > 0) {
        found.push(
          diagnostic(
            i,
            4,
            "soft",
            "off-profile-strategy",
            `Uses [${strays.join(", ")}], which the video's Strategy Profile does not list. Either the scene is off-plan or the profile needs widening — both are worth deciding on purpose.`,
          ),
        );
      }
    }
    if (!primaryUsed) {
      found.push(
        diagnostic(
          stageIndexes[0].i,
          4,
          "soft",
          "unused-primary",
          `The video declares "${profile.primary}" as its primary strategy but no scene uses it, so nothing carries the grammar the video was planned around.`,
        ),
      );
    }
    const clash = repetitionWarning(scriptName ?? "", profile.primary);
    if (clash) found.push(diagnostic(stageIndexes[0].i, 2, "soft", "repeated-across-videos", clash));
    void avoid;
  }

  // --- the same grammar three scenes running ------------------------------
  // A video that leans on one strategy scene after scene develops exactly the
  // recognisable-but-boring template this vocabulary exists to prevent. The
  // visual language should evolve WITH the explanation, not sit still under it.
  const strategySequence = segments
    .map((segment, index) => ({ index, segment }))
    .filter(({ segment }) => isStageSegment(segment))
    .map(({ index, segment }) => ({ index, primary: (segment as TimedSegment & { visual: StageVisual }).visual.strategy?.[0] }));
  for (let i = 2; i < strategySequence.length; i++) {
    const [a, b, c] = [strategySequence[i - 2], strategySequence[i - 1], strategySequence[i]];
    if (!c.primary || a.primary !== c.primary || b.primary !== c.primary) continue;
    found.push(
      diagnostic(
        c.index,
        2,
        "soft",
        "repeated-strategy",
        `Three scenes running lead with "${c.primary}". One primary strategy for a video does not mean one strategy per scene — vary the grammar as the explanation develops.`,
      ),
    );
  }

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
