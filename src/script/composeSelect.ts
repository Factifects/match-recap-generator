import { z } from "zod";
import { CANVAS_ICON_KEYS, type CanvasIconKey } from "../model/visualDefinitions";
import { estimateLabelHalfWidthPercent } from "../video/canvasLayout";
import { flattenTimeline, type TimelineNode, type CanvasAction } from "./timelineIR";

// The SEMANTIC layer for "compare a subject against several real candidates
// and select the one that matches." This is the SECOND rebuild of this
// module (composeCompare.ts -> composeSelect.ts v1 -> this), each rebuild
// driven by a real render exposing what the previous shape couldn't do:
//
//   composeCompare.ts modeled one subject checked against one static
//   validator — SHOWED a result instead of DEMONSTRATING a process.
//
//   composeSelect.ts v1 (candidates carrying an author-declared pass/fail
//   per criterion, laid out as flat rows) fixed that — a real sequential
//   inspect/reject/select process — but a render of it still only produced
//   an "animated infographic": stages appearing and a camera moving between
//   them, with no actual VALUE ever visibly compared against another. The
//   user's own diagnosis, verbatim: "don't visualize the subject, visualize
//   the mechanism" — a candidate's pass/fail must be something the viewer
//   watches get computed from two real numbers meeting, not a label a
//   script author typed in.
//
// This rebuild's actual mechanism: candidates carry REAL field values
// (`fields`, not `outcomes`) — match/fail is computed by the compiler via
// string equality against the criterion's own real value
// (`criteria[].label`), and the choreography makes that comparison
// literally visible: per criterion, per candidate, the subject's own value
// travels down to sit beside that candidate's value, both pulse active,
// resolve into a ✓/✕, and the traveling value returns home — a repeated
// reach-out/compare/resolve/return rhythm, not a table filling itself in.
// Elimination is deliberately deferred to the very end (see resolvePhase)
// so a candidate that fails an early field is still checked on the later
// ones — preserving a narratively important "near miss" instead of
// silently vanishing before the viewer sees it almost matched.
//
// This module still owns NO timing arithmetic — every beat is a
// TimelineNode (sequence/parallel/delay) handed to timelineIR.ts's
// flattenTimeline. That separation is what let this rebuild happen without
// touching timelineIR.ts, composeContinuous.ts, or Canvas.tsx at all (bar
// one small, generically-useful "detail" fontStyle addition) — proof the
// IR itself was never the bottleneck, only how richly one compiler used it.

const criterionSchema = z.object({ id: z.string(), label: z.string() });
const candidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  // Keyed by criterion id — the candidate's REAL value for that field
  // (e.g. "$180.00"), not a pre-decided verdict. A criterion missing here
  // is NOT treated as a silent pass (see resolveOutcome below) — an
  // unmatched/undefined value can never accidentally compare equal.
  fields: z.record(z.string(), z.string()),
});
const actorSchema = z.object({ label: z.string(), icon: z.enum(CANVAS_ICON_KEYS).optional() });

export const selectContractSchema = z.object({
  subject: actorSchema,
  criteria: z.array(criterionSchema).min(1),
  candidates: z.array(candidateSchema).min(1),
  resultLabel: z.string(),
});
export type SelectContractInput = z.infer<typeof selectContractSchema>;

interface FlowObject {
  id: string;
  type: "dot" | "icon" | "label";
  x: number;
  y: number;
  label?: string;
  color?: string;
  icon?: CanvasIconKey;
  radius?: number;
  enter?: "scale" | "slideRight" | "fade";
  opacity?: number;
  idle?: "glow";
  fontStyle?: "default" | "detail";
}
export interface ComposedSelect {
  title?: string;
  objects: FlowObject[];
  arrows: never[];
  timeline: CanvasAction[];
}

// Vertical layout: three stages stacked top to bottom (established subject
// -> live comparison -> result), not composeSelect v1's flat horizontal
// row.
//
// Horizontal layout inside Stage 2 is CONTENT-DERIVED (see buildColumns
// below), not a fixed guess spread across a fixed range — a fixed-guess
// version of this shipped THREE real overlaps in a row during this
// rebuild (subject-vs-field, candidate-label-vs-field, and finally
// field-vs-field/mark bleeding into the NEXT criterion's column once a
// real script had longer values like "INV-3345"), confirmed via actual
// renders each time, not hypothetical. Chaining each column's width from
// `estimateLabelHalfWidthPercent` is the same discipline composeFlow.ts
// and composeSelect v1 already used for exactly this reason — see that
// function's own comment in canvasLayout.ts.
const SUBJECT_Y = 8;
const SUBJECT_RADIUS = 8;
// The first value tried (24) put a criterion's home text overlapping the
// subject icon's OWN caption — confirmed directly via a real render: an
// icon's caption renders below it via a pixel offset, so it needs more
// vertical clearance than a bare percent-space gap suggests. 34 leaves
// real headroom below "Payment"'s own caption.
const FIELD_HOME_Y = 34;
// How far below its own home position a criterion value starts its settle
// (fade + move up) from — small and entirely within Stage 2's own empty
// space, nowhere near the subject's caption band. Replaces an earlier
// "travel FROM the subject's position" version of this beat: that read as
// a nicer "extracting from Payment" flourish, but its diagonal path
// crossed directly through the subject's own caption TEXT for a real,
// visible stretch — confirmed via two separate real renders (a generous
// origin still wasn't clear of the caption's actual text band), and
// exactly the kind of MID-ANIMATION overlap the static
// `checkTimelineFinalOverlap` check can't catch, since it only checks
// where things end up, not what they cross on the way there. Choosing
// guaranteed-correct motion over a nicer one that kept breaking.
const FIELD_SETTLE_DISTANCE = 6;
const CANDIDATES_Y_MIN = 48;
const CANDIDATES_Y_MAX = 82;
const ROW_START_X = 6;
const CANDIDATE_LABEL_GAP = 6;
const COLUMN_GAP = 5;
const MARK_GAP = 2;
// The ✓/✕ mark is a "label" object (literal "✓"/"✕" text), NOT an "icon" —
// this matters structurally, not stylistically. Canvas.tsx renders `icon`
// objects in the camera-transformed layer but `label` objects in a SEPARATE
// un-transformed overlay (so captions don't get magnified by zoom — a
// deliberate, documented choice in that file). That means an icon-type mark
// sitting right next to its paired field VALUE (a label) would visibly
// drift apart from it the instant the camera pans/zooms — confirmed via a
// real render: this is also what caused the subject/criteria misalignment
// this rebuild hit earlier, from the exact same layer mismatch. A
// label-type mark stays in the same layer as everything it needs to stay
// glued to.
const MARK_HALF_WIDTH = 3;
// The traveling value and the candidate's own value are STACKED (same X,
// small Y offset) during a compare beat, not placed side by side — an
// earlier side-by-side version needed 2×(both halves) of horizontal room
// PER column and, chained across 3 real criteria columns plus the mark and
// candidate-label prefix, overflowed past x:100 on a real script
// (confirmed directly, not a guess — `visualSchema.safeParse` rejected it
// outright). Stacking cuts a column's horizontal footprint roughly in half
// since both values now share one center X.
const PAIR_Y_GAP = 6;
// "detail" fontStyle renders at 28px vs. a plain label's 46px (see
// Canvas.tsx) — estimateLabelHalfWidthPercent is calibrated for 46px, so a
// detail-sized value's real half-width is scaled down proportionally
// rather than reusing the 46px estimate unscaled. Both the traveling
// criterion value AND the candidate's own value use this scale now (the
// earlier version kept criteria at full 46px "hero" size, which alone
// nearly doubled every column's footprint) — visual hierarchy during a
// compare beat now comes from the scale-pulse animation, not a bigger
// static font.
const DETAIL_FONT_SCALE = 28 / 46;
function detailHalfWidth(label: string): number {
  return estimateLabelHalfWidthPercent(label) * DETAIL_FONT_SCALE;
}
const RESULT_Y = 90;
export const EJECT_Y = 78; // unused now (subject never travels on eject) — kept exported for any caller still referencing it during the transition.

const NEUTRAL_COLOR = "#c7ccd6";
const SUBJECT_COLOR = "#5b8def";
const SELECTED_COLOR = "#3ecf8e";
const REJECTED_COLOR = "#e5484d";
const EJECT_COLOR = "#8a8f98";

const ENTRANCE_START = 0.3;
const SETTLE_GAP = 0.5;
const EXTRACT_DURATION = 0.6;
const TRAVEL_DOWN_DURATION = 0.5;
const ACTIVATE_DURATION = 0.25;
const RESOLVE_HOLD = 0.25;
const MARK_REVEAL_DURATION = 0.25;
const RETURN_DURATION = 0.45;
const CANDIDATE_GAP = 0.15;
const REJECT_FADE_DURATION = 0.6;
const RESULT_REVEAL_DURATION = 0.4;
const CAMERA_PULL_BACK_LEAD = 3;

function spreadY(index: number, count: number, yMin: number, yMax: number): number {
  if (count === 1) return (yMin + yMax) / 2;
  return yMin + ((yMax - yMin) * index) / (count - 1);
}

/** A criterion the candidate never supplied a field for defaults to a
 * mismatch — never silently equal (an equality check against `undefined`
 * is already false, but this makes the "missing is not a pass" guarantee
 * explicit and independent of how the comparison is implemented). */
function candidateFieldValue(candidate: SelectContractInput["candidates"][number], criterionId: string): string | undefined {
  return candidate.fields[criterionId];
}
function fieldMatches(candidate: SelectContractInput["candidates"][number], criterion: SelectContractInput["criteria"][number]): boolean {
  return candidateFieldValue(candidate, criterion.id) === criterion.label;
}
function candidateFullyMatches(candidate: SelectContractInput["candidates"][number], criteria: SelectContractInput["criteria"]): boolean {
  return criteria.every((c) => fieldMatches(candidate, c));
}

interface ColumnGeometry {
  /** Shared X for BOTH the traveling criterion value (Stage 1 home AND
   * every comparison beat's target — it drops straight down this same
   * vertical line, offset up slightly during a beat by PAIR_Y_GAP, not
   * sideways) and the candidate's own field value directly below it. */
  x: number;
  /** X for the ✓/✕ mark, to the right of the stacked pair. */
  markX: number;
  rightEdge: number;
}

/** Lays out one column per criterion, left to right, each one's width
 * derived from the REAL content that will render in it (both the
 * criterion's own value and every candidate's field value, both at
 * "detail" scale) — chained so column N+1 never starts before column N's
 * real right edge, however wide column N's actual longest value turns out
 * to be. */
function buildColumns(criteria: SelectContractInput["criteria"], candidates: SelectContractInput["candidates"], startX: number): ColumnGeometry[] {
  const columns: ColumnGeometry[] = [];
  let cursor = startX;
  for (const crit of criteria) {
    const travelHalf = detailHalfWidth(crit.label);
    const fieldHalf = Math.max(4, ...candidates.map((c) => detailHalfWidth(candidateFieldValue(c, crit.id) ?? "—")));
    const coreHalf = Math.max(travelHalf, fieldHalf);
    const x = cursor + coreHalf;
    const markX = x + coreHalf + MARK_GAP + MARK_HALF_WIDTH;
    const rightEdge = markX + MARK_HALF_WIDTH;
    columns.push({ x, markX, rightEdge });
    cursor = rightEdge + COLUMN_GAP;
  }
  return columns;
}

function seq(children: TimelineNode[]): TimelineNode {
  return { kind: "sequence", children };
}
function par(children: TimelineNode[]): TimelineNode {
  return { kind: "parallel", children };
}
function act(action: CanvasAction, offsetSeconds?: number): TimelineNode {
  return { kind: "action", action, offsetSeconds };
}
function delay(seconds: number, child: TimelineNode): TimelineNode {
  return { kind: "delay", seconds, child };
}

/** Compiles a declared SelectContractInput into a real `kind: "canvas"`
 * visual — three real stages (establish the subject's fields, a live
 * field-by-field comparison against every candidate, an earned result),
 * built entirely from real value equality, not author-declared verdicts.
 * See this file's header comment for the full design rationale. */
export function composeSelect(contract: SelectContractInput, estimatedDurationSeconds: number): ComposedSelect {
  const candidateCount = contract.candidates.length;
  const candidateRowY = (index: number) => spreadY(index, candidateCount, CANDIDATES_Y_MIN, CANDIDATES_Y_MAX);

  // Content-derived horizontal layout, chained left to right: candidate
  // label column width comes from the longest real candidate label, then
  // each criterion's column width comes from buildColumns (see its own
  // comment) — nothing here is a fixed guess. Candidate labels use
  // "detail" scale too (shrinks the whole row's left prefix, freeing real
  // room for the 3 comparison columns that actually need it).
  const candidateLabelHalf = Math.max(4, ...contract.candidates.map((c) => detailHalfWidth(c.label)));
  const candidateLabelX = ROW_START_X + candidateLabelHalf;
  const columns = buildColumns(contract.criteria, contract.candidates, candidateLabelX + candidateLabelHalf + CANDIDATE_LABEL_GAP);
  const rowRightEdge = columns[columns.length - 1].rightEdge;
  // Subject and result share this centerline — the whole row block
  // (candidate label + every criterion column) balanced under it, derived
  // from the SAME real content instead of an assumed x:50.
  const centerX = (ROW_START_X + rowRightEdge) / 2;

  const objects: FlowObject[] = [];
  const subjectId = "selectSubject";
  objects.push({ id: subjectId, type: contract.subject.icon ? "icon" : "dot", icon: contract.subject.icon, x: centerX, y: SUBJECT_Y, radius: SUBJECT_RADIUS, color: SUBJECT_COLOR, label: contract.subject.label, enter: "scale" });

  // Stage 1 — each criterion's real value settles into its own home slot
  // directly (fade + small scale-in), NOT a travel move from the subject's
  // own position — v1 of this rebuild had the value originate co-located
  // with the subject and glide down, which read as "extracting FROM
  // Payment," but that diagonal path crosses directly through the
  // subject's own CAPTION TEXT for a real, visible stretch (confirmed via
  // TWO real renders, not a guess — the caption's actual text band sits
  // low enough that even a generous clearance origin still overlapped it
  // mid-transit). This home position doubles as the value's RETURN
  // destination throughout Stage 2, and stays the SAME x for the whole
  // scene — it only ever travels straight down and back up FROM HERE, not
  // from the subject.
  contract.criteria.forEach((c, i) => {
    const col = columns[i];
    objects.push({ id: `criterion_${c.id}`, type: "label", x: col.x, y: FIELD_HOME_Y, label: c.label, color: NEUTRAL_COLOR, opacity: 0, fontStyle: "detail" });
  });

  // Stage 2 skeleton — candidate labels only; NO field values or marks
  // exist yet. This is the "matrix is structure, not a pre-filled table"
  // requirement: every cell is built live, during its own comparison beat,
  // never shown before it.
  contract.candidates.forEach((c, i) => {
    objects.push({ id: `candidate_${c.id}`, type: "label", x: candidateLabelX, y: candidateRowY(i), label: c.label, color: NEUTRAL_COLOR, opacity: 0, fontStyle: "detail" });
    contract.criteria.forEach((crit, ci) => {
      const col = columns[ci];
      objects.push({ id: `field_${c.id}_${crit.id}`, type: "label", x: col.x, y: candidateRowY(i), label: candidateFieldValue(c, crit.id) ?? "—", color: NEUTRAL_COLOR, opacity: 0, fontStyle: "detail" });
      objects.push({ id: `mark_${c.id}_${crit.id}`, type: "label", label: fieldMatches(c, crit) ? "✓" : "✕", x: col.markX, y: candidateRowY(i), color: fieldMatches(c, crit) ? SELECTED_COLOR : REJECTED_COLOR, opacity: 0, fontStyle: "detail" });
    });
  });

  const resultId = "selectResult";
  // Same "never appeared before the final beat" guarantee as v1 — the
  // result does not exist in the timeline until resultPhase below.
  objects.push({ id: resultId, type: "label", x: centerX, y: RESULT_Y, label: contract.resultLabel, color: NEUTRAL_COLOR, opacity: 0 });

  // PHASE 1 — establish: subject arrives, then its real field values
  // settle into place at their own home slots, staggered — a fade + a
  // small upward settle (from just below FIELD_HOME_Y, safely clear of the
  // subject's caption band entirely) rather than a long-distance travel.
  const arrivePhase = act({ type: "appear", id: subjectId, startSeconds: 0, sound: "entrance" });
  const extractPhase = par(
    contract.criteria.map((c, i) =>
      seq([
        act({ type: "move", id: `criterion_${c.id}`, startSeconds: 0, durationSeconds: 0.1, to: { x: columns[i].x, y: FIELD_HOME_Y + FIELD_SETTLE_DISTANCE }, opacity: 1, scale: 0.6 }, i * 0.15),
        act({ type: "move", id: `criterion_${c.id}`, startSeconds: 0, durationSeconds: EXTRACT_DURATION, to: { x: columns[i].x, y: FIELD_HOME_Y }, scale: 1.0, sound: "move" }),
      ]),
    ),
  );

  // PHASE 2 — candidate rows populate (labels only), staggered.
  const populatePhase: TimelineNode = {
    kind: "stagger",
    gap: 0.25,
    children: contract.candidates.map((c) => act({ type: "move", id: `candidate_${c.id}`, startSeconds: 0, durationSeconds: 0.1, opacity: 1, sound: "entrance" })),
  };

  // PHASE 3 — the mechanism itself: field-major (criterion-by-criterion,
  // matching "checks the amount... then the account" narration order),
  // and within each criterion, candidate-by-candidate. Every sub-beat is
  // the same reach-out / both-active / resolve / return rhythm, built on
  // the SAME criterion value object each time (it lives at its Stage-1
  // home between beats, exactly like a real repeated lookup would).
  const comparisonPhase = seq(
    contract.criteria.map((crit, ci) => {
      const critId = `criterion_${crit.id}`;
      const col = columns[ci];
      return seq(
        contract.candidates.map((cand, i) => {
          const rowY = candidateRowY(i);
          const fieldId = `field_${cand.id}_${crit.id}`;
          const markId = `mark_${cand.id}_${crit.id}`;
          const matches = fieldMatches(cand, crit);
          const resolveColor = matches ? SELECTED_COLOR : REJECTED_COLOR;
          return delay(
            i === 0 ? 0 : CANDIDATE_GAP,
            seq([
              // Reach out: the subject's real value travels down to sit
              // just ABOVE (not on top of) this candidate's own value —
              // same X, stacked, not side by side.
              act({ type: "move", id: critId, startSeconds: 0, durationSeconds: TRAVEL_DOWN_DURATION, to: { x: col.x, y: rowY - PAIR_Y_GAP }, scale: 1.1, sound: "move" }),
              // Both become active: the candidate's own (previously
              // nonexistent) value appears right there, in visible
              // relationship with the traveling value — this is the
              // literal "$240.00 next to $180.00" moment.
              par([
                act({ type: "move", id: fieldId, startSeconds: 0, durationSeconds: ACTIVATE_DURATION, opacity: 1, scale: 1.15 }),
                act({ type: "move", id: critId, startSeconds: 0, durationSeconds: ACTIVATE_DURATION, scale: 1.2 }),
              ]),
              // Resolve: a real computed ✓/✕ appears, both values flash to
              // match it.
              delay(
                RESOLVE_HOLD,
                par([
                  act({ type: "style", id: fieldId, startSeconds: 0, durationSeconds: MARK_REVEAL_DURATION, color: resolveColor }),
                  act({ type: "appear", id: markId, startSeconds: 0, sound: matches ? "success" : "alert" }),
                  act({ type: "move", id: markId, startSeconds: 0, durationSeconds: MARK_REVEAL_DURATION, opacity: 1, scale: 1.3 }),
                  act({ type: "move", id: markId, startSeconds: 0, durationSeconds: 0.2, scale: 1.0, easing: "spring" }, MARK_REVEAL_DURATION),
                  act({ type: "move", id: fieldId, startSeconds: 0, durationSeconds: 0.2, scale: 1.0, easing: "spring" }, MARK_REVEAL_DURATION),
                ]),
              ),
              // Return: the traveling value goes back home — it's a
              // shared, repeatedly-consulted value, not spent.
              act({ type: "move", id: critId, startSeconds: 0, durationSeconds: RETURN_DURATION, to: { x: col.x, y: FIELD_HOME_Y }, scale: 1.0, sound: "move" }, RESOLVE_HOLD + MARK_REVEAL_DURATION + 0.1),
            ]),
          );
        }),
      );
    }),
  );

  const selected = contract.candidates.find((c) => candidateFullyMatches(c, contract.criteria));

  // PHASE 4 — result: only NOW, with every candidate's real comparison
  // history visible (a "2 of 3 passed" near-miss included), does
  // resolution happen. A rejected candidate's whole row (label + every
  // field value + every mark it accumulated) fades together; the matched
  // candidate's label physically travels down to become the answer.
  const resolveNodes: TimelineNode[] = [];
  contract.candidates.forEach((c) => {
    const fullyMatches = candidateFullyMatches(c, contract.criteria);
    const fieldAndMarkIds = [...contract.criteria.map((crit) => `field_${c.id}_${crit.id}`), ...contract.criteria.map((crit) => `mark_${c.id}_${crit.id}`)];
    const rowIds = [`candidate_${c.id}`, ...fieldAndMarkIds];
    if (fullyMatches) {
      // The winner's own accumulated field values/marks have served their
      // purpose (proving every column passed) — fade them out too, same as
      // a rejected row's, so nothing is left sitting where the winner's
      // LABEL is about to travel next. Confirmed as a real, not
      // hypothetical, bug via `checkTimelineFinalOverlap`: without this,
      // the label's post-resolve position and its own still-visible field
      // values collide once the label moves toward the result.
      resolveNodes.push(par([act({ type: "style", id: `candidate_${c.id}`, startSeconds: 0, durationSeconds: 0.3, color: SELECTED_COLOR, sound: "success" }), act({ type: "move", id: `candidate_${c.id}`, startSeconds: 0, durationSeconds: 0.3, scale: 1.15 }), ...fieldAndMarkIds.map((id) => act({ type: "move", id, startSeconds: 0, durationSeconds: REJECT_FADE_DURATION, opacity: 0 }))]));
      resolveNodes.push(par(fieldAndMarkIds.map((id) => act({ type: "disappear", id, startSeconds: 0, durationSeconds: 0.2 }, REJECT_FADE_DURATION))));
    } else {
      resolveNodes.push(par(rowIds.map((id) => act({ type: "move", id, startSeconds: 0, durationSeconds: REJECT_FADE_DURATION, opacity: 0 }))));
      resolveNodes.push(par(rowIds.map((id) => act({ type: "disappear", id, startSeconds: 0, durationSeconds: 0.2 }, REJECT_FADE_DURATION))));
    }
  });
  if (selected) {
    resolveNodes.push(act({ type: "move", id: `candidate_${selected.id}`, startSeconds: 0, durationSeconds: 0.7, to: { x: centerX, y: RESULT_Y - 6 }, scale: 1.0, sound: "move" }, REJECT_FADE_DURATION));
  } else {
    resolveNodes.push(act({ type: "style", id: subjectId, startSeconds: 0, durationSeconds: 0.3, color: EJECT_COLOR }));
  }
  const resolvePhase = seq(resolveNodes);

  const resultColor = selected ? SELECTED_COLOR : REJECTED_COLOR;
  const revealPhase = par([
    act({ type: "move", id: resultId, startSeconds: 0, durationSeconds: 0.1, opacity: 1 }),
    act({ type: "style", id: resultId, startSeconds: 0, durationSeconds: RESULT_REVEAL_DURATION, color: resultColor, sound: selected ? "success" : "alert" }),
  ]);

  const body = seq([
    arrivePhase,
    delay(SETTLE_GAP, extractPhase),
    delay(SETTLE_GAP, populatePhase),
    delay(SETTLE_GAP, comparisonPhase),
    delay(SETTLE_GAP, resolvePhase),
    delay(0.3, revealPhase),
  ]);

  const { actions: bodyActions, endSeconds } = flattenTimeline(body, ENTRANCE_START);

  // Camera: establish (wide, subject + fields) -> lean into the comparison
  // band for the whole live-comparison phase (one steady framing, not a
  // re-zoom per beat — the traveling value's own motion is what carries
  // attention) -> pull back for the earned, full-pipeline result.
  const comparisonCenterY = (FIELD_HOME_Y + (CANDIDATES_Y_MIN + CANDIDATES_Y_MAX) / 2) / 2;
  // Stays fully neutral (50,50,1), NOT panned toward the subject/criteria —
  // any non-neutral pan here shifts the subject ICON (camera-layer) away
  // from its authored position while the criterion LABELS (fixed,
  // un-transformed overlay layer) stay exactly where authored, breaking
  // their intended visual alignment. Confirmed as the actual cause of a
  // real "Payment" caption / "Acct 4821" overlap via direct render
  // inspection — not a coordinate math bug, a camera/layer mismatch.
  const cameraEstablish: CanvasAction = { type: "camera", startSeconds: 0, x: 50, y: 50, zoom: 1.0 };
  const cameraFocus: CanvasAction = { type: "camera", startSeconds: ENTRANCE_START + SETTLE_GAP + EXTRACT_DURATION + SETTLE_GAP + 0.5, durationSeconds: 1.4, x: centerX, y: comparisonCenterY, zoom: 1.3, easing: "easeInOut" };
  const pullBackAt = Math.max(endSeconds + 0.5, estimatedDurationSeconds - CAMERA_PULL_BACK_LEAD);
  const cameraPullBack: CanvasAction = { type: "camera", startSeconds: pullBackAt, durationSeconds: 2.0, x: centerX, y: 50, zoom: 1.0, easing: "easeInOut" };

  return { title: undefined, objects, arrows: [], timeline: [...bodyActions, cameraEstablish, cameraFocus, cameraPullBack] };
}
