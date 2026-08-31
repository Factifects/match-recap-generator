import type { TimedSegment } from "../model/Segment";
import type { FormationData, CanvasData, TacticalBoardData, PassNetworkData } from "../video/sharedVisualProps";
import { FORMATION_TEMPLATES } from "../video/formations";
import { resolveObjectPosition, estimateObjectBoundingBox, boxesOverlap, estimateLabeledPointOverlaps, isNestedContainment } from "../video/canvasLayout";
import { classifySceneMotion } from "./actionClassifier";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

// This project's established pitch convention: low y = screen-right, high y
// = screen-left (see feedback_formation_slot_order_bug in memory — confirmed
// against a real rendered still, not a guess). Every hand-authored script
// (or one pasted in from an outside tool) is expected to follow this, and
// regularly doesn't — this module catches the common mistake (a label/name
// that says one side while its position says the other) and corrects it
// automatically rather than blocking generation, since a script author
// working outside this repo has no way to know the convention up front.

type Side = "left" | "right";

// Real position codes in this project's own scripts are always uppercase
// (LB, RCB, L8, RW, ...) — requiring that avoids false-positives on ordinary
// words that happen to start with L/R (e.g. "Ref", "Ronaldo").
const SHORT_CODE = /^([LR])[A-Z0-9]{1,3}$/;
const WORD_FORM = /\b(left|right)\b/i;

function detectSide(label: string): Side | null {
  const shortMatch = label.match(SHORT_CODE);
  if (shortMatch) return shortMatch[1] === "L" ? "left" : "right";
  const wordMatch = label.match(WORD_FORM);
  if (wordMatch) return wordMatch[1].toLowerCase() === "left" ? "left" : "right";
  return null;
}

// A band around the pitch's vertical center where a position is genuinely
// ambiguous (a winger cutting inside, a central 8 drifting wide) — auto-
// fixing inside this band risks "fixing" an intentional position, so those
// are left alone entirely (no fix, no warning) rather than guessed at.
const AMBIGUOUS_BAND = 3;

function expectedSideForY(y: number): Side | null {
  if (y < 50 - AMBIGUOUS_BAND) return "right";
  if (y > 50 + AMBIGUOUS_BAND) return "left";
  return null;
}

function flipLabel(label: string, from: Side): string {
  const to: Side = from === "left" ? "right" : "left";
  const shortMatch = label.match(SHORT_CODE);
  if (shortMatch) return (to === "left" ? "L" : "R") + label.slice(1);
  return label.replace(WORD_FORM, (word) => {
    const replacement = to === "left" ? "left" : "right";
    return word[0] === word[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  });
}

function fixLabeledEntries<T extends { x: number; y: number; label: string }>(
  entries: T[],
  sceneLabel: string,
  fixes: string[],
): T[] {
  return entries.map((entry) => {
    const detected = detectSide(entry.label);
    if (!detected) return entry;
    const expected = expectedSideForY(entry.y);
    if (!expected || expected === detected) return entry;
    const fixedLabel = flipLabel(entry.label, detected);
    fixes.push(`${sceneLabel}: relabeled "${entry.label}" -> "${fixedLabel}" (y=${entry.y} renders on the ${expected} side)`);
    return { ...entry, label: fixedLabel };
  });
}

type FormationSide = FormationData["sides"][number];

// Formation scenes have no per-player x/y in the script — position comes
// entirely from array order against FORMATION_TEMPLATES' fixed slots, so the
// fix here is reordering names within a row, not relabeling. Rows are
// recovered by grouping consecutive template slots that share the same x
// (goal-to-goal depth) — formations.ts always writes each row as consecutive
// same-x entries in ascending-y (right-to-left) order, so a row's slots are
// already a reliable right-to-left ordering to sort detected names into.
function fixFormationSide(formationSide: FormationSide, sceneLabel: string, fixes: string[]): FormationSide {
  const template = FORMATION_TEMPLATES[formationSide.formationName];
  if (formationSide.players.length < template.length) return formationSide; // fewer names than slots — nothing safe to reorder

  const rows: number[][] = [];
  let currentRow: number[] = [0];
  for (let i = 1; i < template.length; i++) {
    if (template[i].x === template[i - 1].x) currentRow.push(i);
    else {
      rows.push(currentRow);
      currentRow = [i];
    }
  }
  rows.push(currentRow);

  const nextPlayers = [...formationSide.players];
  const rank = (name: string) => {
    const side = detectSide(name);
    return side === "right" ? -1 : side === "left" ? 1 : 0;
  };

  for (const row of rows) {
    if (row.length < 2) continue; // a lone slot (GK, a single striker) has nothing to reorder against
    const rowHasSignal = row.some((i) => detectSide(formationSide.players[i].name) !== null);
    if (!rowHasSignal) continue;
    const sorted = row.map((i) => formationSide.players[i]).sort((a, b) => rank(a.name) - rank(b.name));
    row.forEach((slotIndex, position) => {
      const newPlayer = sorted[position];
      if (nextPlayers[slotIndex].name !== newPlayer.name) {
        fixes.push(
          `${sceneLabel}: reordered "${formationSide.team} ${formationSide.formationName}" — "${newPlayer.name}" moved into the correct slot`,
        );
      }
      nextPlayers[slotIndex] = newPlayer;
    });
  }

  return { ...formationSide, players: nextPlayers };
}

type CanvasObjectT = CanvasData["objects"][number];
type CanvasTimelineActionT = NonNullable<CanvasData["timeline"]>[number];

// The three checks below exist because of a real, repeated failure mode:
// composeSelect.ts's resolvePhase docked its subject on top of two other
// labels, and composeContinuous.ts's depth gauge was authored `opacity: 0`
// and revealed only via an `appear` action — which does NOT touch opacity —
// so it stayed invisible for its entire scene. Neither bug involved an
// authored (t=0) position or a malformed value; both only existed in how a
// `timeline` moves an object AFTER frame 0, which every check above this
// point is blind to (they only ever call `resolveObjectPosition`, the
// object's OWN authored x/y). Both were only caught by actually rendering
// the scene and looking at real frames — exactly the kind of bug a static
// check should catch BEFORE a render is spent on it, not after. These three
// close that gap generically, for any current or future timeline-driven
// compiler, not just the two instances that happened to surface them.

/** Folds an object's own timeline actions (ignoring camera actions, which
 * target no object) into where it ends up ONCE EVERY ACTION HAS RUN — the
 * state the scene actually settles into and holds for the rest of its
 * duration, not just its authored starting point. Deliberately simpler than
 * Canvas.tsx's own resolveTimelineObject (no easing/interpolation — this only
 * needs the FINAL value each field settles on, not the path there), so it
 * can stay a small, dependency-free static check. */
function resolveTimelineFinalState(object: CanvasObjectT, timeline: CanvasTimelineActionT[] | undefined): { x: number; y: number; opacity: number } {
  const base = resolveObjectPosition(object);
  const state = { x: base.x, y: base.y, opacity: object.opacity ?? 1, visible: (object.opacity ?? 1) !== 0 };
  // `camera` and `focus` are scene-level rather than object-targeted, so they
  // carry no `id` — and neither moves an object, so neither affects the
  // geometry this resolves. (`focus` does scale opacity, but only as a
  // transient attention cue; the settled opacity a geometry check cares about
  // is what the object's own actions leave it at.)
  const actions = (timeline ?? [])
    // Thread actions (emit/gather/braid/cut) address threads, not objects, and
    // carry no `id` at all — same reasoning as camera/focus above.
    .filter((a) => "id" in a && a.id === object.id)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  for (const action of actions) {
    if (action.type === "appear") {
      state.visible = true;
      continue;
    }
    if (action.type === "move") {
      if (action.to?.x !== undefined) state.x = action.to.x;
      if (action.to?.y !== undefined) state.y = action.to.y;
      if (action.opacity !== undefined) {
        state.opacity = action.opacity;
        if (action.opacity > 0) state.visible = true;
      }
    } else if (action.type === "disappear") {
      state.opacity = 0;
      state.visible = false;
    }
  }
  return { x: state.x, y: state.y, opacity: state.visible ? state.opacity : 0 };
}

/** Re-runs the same overlap check `fixCanvasPhaseOverlap` already does on
 * AUTHORED positions, but against every object's TIMELINE-FINAL position
 * instead — the geometry the scene actually rests on once its choreography
 * finishes. Report-only (never auto-nudges): unlike a copy-paste-identical
 * authored position, there's no single authored field to safely correct here
 * — the overlap is an emergent property of wherever each object's own `move`
 * actions happen to land it. */
function checkTimelineFinalOverlap(objects: CanvasObjectT[], timeline: CanvasTimelineActionT[] | undefined, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (!timeline || timeline.length === 0) return;
  const resolved = objects.map((object) => {
    const final = resolveTimelineFinalState(object, timeline);
    return { object, final, box: estimateObjectBoundingBox(object, final.x, final.y) };
  });
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (a.final.opacity === 0 || b.final.opacity === 0) continue;
      if (!boxesOverlap(a.box, b.box)) continue;
      if (isNestedContainment(a.object, a.box, b.object, b.final) || isNestedContainment(b.object, b.box, a.object, a.final)) continue;
      diagnostics.push(
        diagnostic(
          sceneIndex,
          1,
          "hard",
          "overlap",
          `Scene ${sceneIndex + 1}: "${a.object.id}" and "${b.object.id}" overlap once their timeline settles (at (${a.final.x.toFixed(0)},${a.final.y.toFixed(0)}) and (${b.final.x.toFixed(0)},${b.final.y.toFixed(0)})) — not at frame 0, so authored-position checks alone missed it.`,
        ),
      );
    }
  }
}

/** Same fold as `resolveTimelineFinalState`, but at an arbitrary point in
 * time rather than only the end — real linear interpolation between
 * whatever position an object's state had accumulated to BEFORE the
 * currently-active `move` and that move's own target, so a check can ask
 * "where is this object mid-transit," not just "where does it start" or
 * "where does it end up." Deliberately linear even for `path: "arc"` moves
 * (Canvas.tsx's own arc math bows the path OUTWARD from the straight line —
 * a straight-line approximation is if anything the more conservative,
 * closer-together estimate, so it never UNDER-reports a genuine crossing). */
function resolveObjectStateAt(object: CanvasObjectT, timeline: CanvasTimelineActionT[], atSeconds: number): { x: number; y: number; opacity: number } {
  const base = resolveObjectPosition(object);
  const state = { x: base.x, y: base.y, opacity: object.opacity ?? 1, visible: (object.opacity ?? 1) !== 0 };
  const actions = timeline
    .filter((a) => "id" in a && a.id === object.id)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  for (const action of actions) {
    if (atSeconds < action.startSeconds) continue;
    if (action.type === "appear") {
      state.visible = true;
      continue;
    }
    if (action.type === "disappear") {
      state.opacity = 0;
      state.visible = false;
      continue;
    }
    if (action.type === "move") {
      const duration = action.durationSeconds ?? 0.8;
      const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, (atSeconds - action.startSeconds) / duration));
      const fromX = state.x;
      const fromY = state.y;
      const fromOpacity = state.opacity;
      if (action.to?.x !== undefined) state.x = fromX + (action.to.x - fromX) * t;
      if (action.to?.y !== undefined) state.y = fromY + (action.to.y - fromY) * t;
      if (action.opacity !== undefined) {
        state.opacity = fromOpacity + (action.opacity - fromOpacity) * t;
        if (state.opacity > 0) state.visible = true;
      }
    }
  }
  return { x: state.x, y: state.y, opacity: state.visible ? state.opacity : 0 };
}

/** Time-sampled overlap check across a scene's actual MOTION, not just its
 * authored start (`fixCanvasPhaseOverlap`) or its final resting state
 * (`checkTimelineFinalOverlap`). Confirmed as a real, render-caught gap: a
 * CTA scene sent four icons out from nearby points toward four different
 * quadrants via `path: "arc"` moves — the authored start (after the
 * identical-position nudge) was fine, the settled end was fine, but the arcs
 * crossed and visibly collided on screen for several frames in between,
 * which neither existing check has any notion of ("the moment in between"
 * isn't either endpoint). This samples several points across every active
 * `move` instead of only its two ends. */
function checkMotionPathOverlap(objects: CanvasObjectT[], timeline: CanvasTimelineActionT[] | undefined, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (!timeline || timeline.length === 0) return;
  const moveActions = timeline.filter((a) => a.type === "move");
  if (moveActions.length === 0) return;

  // A handful of interior points per move — this is a percent-space
  // bounding-box check, not a frame-accurate render, so it doesn't need
  // (and shouldn't pay for) per-frame sampling.
  const SAMPLES_PER_MOVE = 4;
  const times = new Set<number>();
  for (const action of moveActions) {
    const duration = action.durationSeconds ?? 0.8;
    for (let i = 1; i < SAMPLES_PER_MOVE; i++) {
      times.add(action.startSeconds + (duration * i) / SAMPLES_PER_MOVE);
    }
  }

  const reportedPairs = new Set<string>();
  for (const atSeconds of times) {
    const resolved = objects.map((object) => {
      const state = resolveObjectStateAt(object, timeline, atSeconds);
      return { object, state, box: estimateObjectBoundingBox(object, state.x, state.y) };
    });
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        const pairKey = [a.object.id, b.object.id].sort().join("|");
        if (reportedPairs.has(pairKey)) continue;
        if (a.state.opacity <= 0 || b.state.opacity <= 0) continue;
        if (!boxesOverlap(a.box, b.box)) continue;
        if (isNestedContainment(a.object, a.box, b.object, b.state) || isNestedContainment(b.object, b.box, a.object, a.state)) continue;
        reportedPairs.add(pairKey);
        diagnostics.push(
          diagnostic(
            sceneIndex,
            1,
            "hard",
            "overlap",
            `Scene ${sceneIndex + 1}: "${a.object.id}" and "${b.object.id}" cross paths mid-motion around t=${atSeconds.toFixed(1)}s (at (${a.state.x.toFixed(0)},${a.state.y.toFixed(0)}) and (${b.state.x.toFixed(0)},${b.state.y.toFixed(0)})) — their authored start and settled end don't overlap, but their transit paths do.`,
          ),
        );
      }
    }
  }
}

/** An object authored `opacity: 0` is only ever meant to be a starting point
 * something later reveals — but an `appear` timeline action does NOT do
 * that (it only gates whether the object renders at all; it never touches
 * opacity — see Canvas.tsx's resolveTimelineObject). A compiler that pairs
 * `opacity: 0` with only `appear` and no `move` ever setting a positive
 * opacity produces an object that is permanently, silently invisible for the
 * entire scene — confirmed as a real bug (composeContinuous.ts's depth
 * gauge), not a hypothetical. */
function checkNeverRevealedObjects(objects: CanvasObjectT[], timeline: CanvasTimelineActionT[] | undefined, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (!timeline || timeline.length === 0) return;
  for (const object of objects) {
    if ((object.opacity ?? 1) !== 0) continue;
    const revealed = timeline.some((a) => a.type === "move" && a.id === object.id && a.opacity !== undefined && a.opacity > 0);
    if (!revealed) {
      diagnostics.push(
        diagnostic(
          sceneIndex,
          1,
          "hard",
          "never-visible",
          `Scene ${sceneIndex + 1}: "${object.id}" is authored at opacity:0 but no timeline \`move\` action ever sets its opacity above 0 — an "appear" action alone does not restore opacity, so this object never actually becomes visible.`,
        ),
      );
    }
  }
}

// icon/dot objects render their label BELOW them via a fixed PIXEL offset
// (Canvas.tsx's belowLabel), not a percent-space one — so as an object's
// resolved y approaches the frame's bottom edge, that caption is the first
// thing to clip, even while the icon/dot itself still looks fully on-screen.
// Confirmed as a real bug: composeSelect.ts's eject move (y: 92) clipped its
// subject's "Payment" caption clean off the bottom of a real render. 84 has
// real margin under it (candidate/criterion label ROWS in this project's own
// scripts safely reach y:88 with no caption to clip), while still allowing
// icons to sit convincingly near an edge.
const ICON_CAPTION_SAFE_MAX_Y = 84;

function checkIconCaptionClipping(objects: CanvasObjectT[], timeline: CanvasTimelineActionT[] | undefined, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  for (const object of objects) {
    if (object.type !== "icon" && object.type !== "dot") continue;
    if (!object.label) continue;
    const final = resolveTimelineFinalState(object, timeline);
    if (final.opacity === 0 || final.y <= ICON_CAPTION_SAFE_MAX_Y) continue;
    diagnostics.push(
      diagnostic(
        sceneIndex,
        1,
        "soft",
        "caption-clipping",
        `Scene ${sceneIndex + 1}: "${object.id}" ends up at y=${final.y.toFixed(0)}, close enough to the bottom edge that its caption (a fixed pixel offset below the icon, not a percent one) risks clipping out of frame.`,
      ),
    );
  }
}

// Two objects placed within this many percent of each other on BOTH axes
// are treated as a copy-paste mistake (a clear signature — no real design
// deliberately stacks two objects exactly on top of one another), not an
// intentionally tight layout. Anything looser than this is left alone.
const IDENTICAL_POSITION_TOLERANCE = 1.5;
const NUDGE_OFFSET_PERCENT = 6;

function isNearIdenticalPosition(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < IDENTICAL_POSITION_TOLERANCE && Math.abs(a.y - b.y) < IDENTICAL_POSITION_TOLERANCE;
}

/** Checks one Canvas phase's object list (the top-level `objects`, or one
 * `phases[]` entry) for overlaps, using canvasLayout.ts's shared position/
 * bounding-box logic — the same code the renderer itself uses, so this
 * lint sees exactly what the render will. Mirrors this file's own
 * relabel/reorder philosophy: only the unambiguous case (two objects at the
 * literal same spot) gets auto-corrected — pinned to explicit x/y (winning
 * over any anchor, same "specific beats general" precedence the schema
 * already documents) offset a fixed amount, logged like every other fix
 * here. Every other overlap is a HARD diagnostic (level 1, blocks a full
 * render — see sceneDiagnostics.ts) and left exactly as authored —
 * untangling it would require understanding what the diagram is trying to
 * say, which this pass has no way to know. */
function fixCanvasPhaseOverlap(
  objects: CanvasObjectT[],
  sceneIndex: number,
  phaseLabel: string,
  fixes: string[],
  diagnostics: SceneDiagnostic[],
): CanvasObjectT[] {
  const sceneLabel = `Scene ${sceneIndex + 1}`;
  const resolved = objects.map((object) => {
    const pos = resolveObjectPosition(object);
    return { object, pos, box: estimateObjectBoundingBox(object, pos.x, pos.y) };
  });
  const result = objects.map((object) => ({ ...object }));
  const alreadyNudged = new Set<string>();

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (alreadyNudged.has(b.object.id)) continue;
      // An object authored at `opacity: 0` is declared invisible at its
      // AUTHORED position on purpose — a compiled scene can legitimately
      // start several objects hidden at a shared point (e.g. "these fields
      // extract out of the subject") before a timeline `move` carries each
      // one to its own real resting spot. resolveObjectPosition only ever
      // sees the authored coordinate, not where a timeline eventually
      // takes it, so without this guard every such scene would report a
      // false "overlap" between objects that are never simultaneously
      // visible at that shared point at all. Two GENUINELY visible objects
      // placed at the same spot are still caught — this only exempts pairs
      // where at least one side is provably not on screen there.
      if (a.object.opacity === 0 || b.object.opacity === 0) continue;
      if (isNearIdenticalPosition(a.pos, b.pos)) {
        const target = result.find((o) => o.id === b.object.id);
        if (!target) continue;
        const newX = Math.min(96, b.pos.x + NUDGE_OFFSET_PERCENT);
        const newY = Math.min(96, b.pos.y + NUDGE_OFFSET_PERCENT);
        target.x = newX;
        target.y = newY;
        alreadyNudged.add(b.object.id);
        fixes.push(
          `${sceneLabel}${phaseLabel}: "${b.object.id}" was placed at the same position as "${a.object.id}" — nudged to (${newX.toFixed(0)}, ${newY.toFixed(0)})`,
        );
      } else if (
        boxesOverlap(a.box, b.box) &&
        !isNestedContainment(a.object, a.box, b.object, b.pos) &&
        !isNestedContainment(b.object, b.box, a.object, a.pos)
      ) {
        const message = `${sceneLabel}${phaseLabel}: possible overlap between "${a.object.id}" and "${b.object.id}" — left as authored, not auto-fixed.`;
        console.warn(`[validateGeometry] ${message}`);
        diagnostics.push(diagnostic(sceneIndex, 1, "hard", "overlap", message));
      }
    }
  }

  return result;
}

/** The starkest form of "keyword illustration" (icons dropped in because the
 * narration mentioned the concept, not because a relationship is being
 * shown): 2+ real (non-"label") objects with zero arrows connecting them and
 * zero EXPLANATORY motion — a scene that will just sit there as unrelated
 * icons for its entire duration. Confirmed against a real shipped scene
 * (analyses/reverse-proxy-short-2026-08-07.txt Scene 1: client/proxy/server/
 * URL label, zero arrows, a 9-event timeline that's entirely appears and
 * scale-pops) — this is EXACTLY the case that motivated fixing this check.
 *
 * Originally this only checked "any timeline/phases at all," which Scene 1
 * would have passed (it has 9 timeline events) despite nothing ever actually
 * traveling or changing state — the raw presence of a timeline said nothing
 * about whether it demonstrated anything. Routing through
 * actionClassifier.ts's classifySceneMotion (entrance vs decorative vs
 * explanatory, not just "is there a timeline") is what actually catches it:
 * Scene 1's real explanatoryCount is 0. A scene with arrows, or with any
 * REAL explanatory motion, is left alone even if that motion turns out to be
 * weak — this only catches the case where NOTHING relates the objects to
 * each other at all, not a judgment on whether what's there is good. */
function checkUnconnectedEntities(visual: CanvasData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  const realObjectCount = visual.objects.filter((o) => o.type !== "label").length;
  if (realObjectCount < 2 || (visual.arrows ?? []).length > 0) return;
  const explanatoryCount = visual.timeline ? classifySceneMotion(visual.timeline).explanatoryCount : 0;
  // `phases` (legacy, pre-timeline authoring) has no per-action classifier
  // equivalent — any phase beyond the static first one is treated as real
  // motion here, the same coarse "has more than one snapshot" signal this
  // check always used for that mechanism, since re-arranging every object's
  // position phase-to-phase is itself a real (if unclassified) change.
  const hasPhaseMotion = (visual.phases?.length ?? 0) > 0;
  if (explanatoryCount === 0 && !hasPhaseMotion) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "hard",
        "unconnected-entities",
        `Scene ${sceneIndex + 1}: ${realObjectCount} objects with no arrows/connections drawn between them and no real (explanatory) motion — likely reads as unrelated icons rather than an explanation.`,
      ),
    );
  }
}

// Below this occupied-area ratio (sum of each object's estimated bounding
// box, as a fraction of the full 100x100 canvas — a coarse proxy, not exact,
// since it ignores overlap double-counting) a scene with very few real
// objects reads as mostly empty. Deliberately gated to a LOW object count
// (see call site) — a legitimate multi-object diagram can have a low summed
// area too (icons are inherently small) without being the "one tiny icon
// floating alone" failure this exists to catch; requiring both conditions
// keeps this from firing on a normal, intentionally spacious layout.
const LOW_DENSITY_AREA_RATIO = 0.1;
const LOW_DENSITY_MAX_OBJECTS = 2;
const CANVAS_AREA_PERCENT_SQ = 100 * 100;

function checkLowVisualDensity(visual: CanvasData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  const realObjects = visual.objects.filter((o) => o.type !== "label");
  if (realObjects.length === 0 || realObjects.length > LOW_DENSITY_MAX_OBJECTS) return;
  const occupiedArea = realObjects.reduce((sum, object) => {
    const pos = resolveObjectPosition(object);
    const box = estimateObjectBoundingBox(object, pos.x, pos.y);
    return sum + Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
  }, 0);
  const ratio = occupiedArea / CANVAS_AREA_PERCENT_SQ;
  if (ratio < LOW_DENSITY_AREA_RATIO) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        2,
        "soft",
        "low-density",
        `Scene ${sceneIndex + 1}: only ${realObjects.length} small object(s) occupying roughly ${(ratio * 100).toFixed(1)}% of the canvas — likely reads as mostly empty space.`,
      ),
    );
  }
}

/** Canvas scenes have no left/right convention to get backwards — their
 * recurring mistake class is spatial (objects overlapping), so this is a
 * different kind of check than the label/slot fixes above, but the same
 * "narrow auto-fix, flag the rest" philosophy the whole file follows. */
function fixCanvasOverlap(visual: CanvasData, sceneIndex: number, fixes: string[], diagnostics: SceneDiagnostic[]): CanvasData {
  const fixedObjects = fixCanvasPhaseOverlap(visual.objects, sceneIndex, "", fixes, diagnostics);
  if (!visual.phases) return { ...visual, objects: fixedObjects };
  const fixedPhases = visual.phases.map((phase, index) => ({
    ...phase,
    objects: fixCanvasPhaseOverlap(phase.objects, sceneIndex, ` (phase ${index + 2})`, fixes, diagnostics),
  }));
  return { ...visual, objects: fixedObjects, phases: fixedPhases };
}

/** Formation is deliberately excluded — positions come from a fixed
 * FORMATION_TEMPLATES slot, not free coordinates, so there's nothing
 * meaningful to flag as "overlapping." ShotMap/HeatMap/Zone are excluded
 * too — a tight cluster of shots (or a hot zone) is real data, not a
 * mistake, so blanket overlap-flagging there would misfire on exactly the
 * scenes doing their job correctly. */
function checkPitchOverlaps(visual: TacticalBoardData | PassNetworkData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  const points = visual.kind === "tactical-board" ? visual.players : visual.nodes;
  const overlaps = estimateLabeledPointOverlaps(points);
  for (const { a, b } of overlaps) {
    diagnostics.push(
      diagnostic(sceneIndex, 1, "hard", "overlap", `Scene ${sceneIndex + 1}: possible overlap between "${a}" and "${b}" — left as authored, not auto-fixed.`),
    );
  }
}

/** Runs after parsing, before render — auto-corrects the recurring "LW/RW
 * (or Formation slot order) backwards" mistake instead of blocking
 * generation on it, since a script drafted outside this repo (another tool,
 * a human, an LLM) has no way to know this project's left/right convention
 * up front. Only touches `tactical-board`/`pass-network` labels and
 * `formation` slot order — the three places this mistake has actually shown
 * up. Returns the corrected segments, a human-readable log of what was
 * auto-corrected (`fixes`), and structured, leveled/severed findings for
 * everything that was only flagged, not fixed (`diagnostics` — see
 * sceneDiagnostics.ts; merged with validateScene.ts's own findings by
 * generate.ts/server.ts into one report). */
export function autoFixGeometry(segments: TimedSegment[]): { segments: TimedSegment[]; fixes: string[]; diagnostics: SceneDiagnostic[] } {
  const fixes: string[] = [];
  const diagnostics: SceneDiagnostic[] = [];
  const fixedSegments = segments.map((segment, index) => {
    if (segment.type !== "statement" || !segment.visual) return segment;
    const sceneLabel = `Scene ${index + 1}`;
    const visual = segment.visual;
    if (visual.kind === "tactical-board") {
      const fixedPlayers = fixLabeledEntries(visual.players, sceneLabel, fixes);
      checkPitchOverlaps({ ...visual, players: fixedPlayers }, index, diagnostics);
      return { ...segment, visual: { ...visual, players: fixedPlayers } };
    }
    if (visual.kind === "pass-network") {
      const fixedNodes = fixLabeledEntries(visual.nodes, sceneLabel, fixes);
      checkPitchOverlaps({ ...visual, nodes: fixedNodes }, index, diagnostics);
      return { ...segment, visual: { ...visual, nodes: fixedNodes } };
    }
    if (visual.kind === "formation") {
      return { ...segment, visual: { ...visual, sides: visual.sides.map((side) => fixFormationSide(side, sceneLabel, fixes)) } };
    }
    if (visual.kind === "canvas") {
      checkUnconnectedEntities(visual, index, diagnostics);
      checkLowVisualDensity(visual, index, diagnostics);
      checkTimelineFinalOverlap(visual.objects, visual.timeline, index, diagnostics);
      checkMotionPathOverlap(visual.objects, visual.timeline, index, diagnostics);
      checkNeverRevealedObjects(visual.objects, visual.timeline, index, diagnostics);
      checkIconCaptionClipping(visual.objects, visual.timeline, index, diagnostics);
      return { ...segment, visual: fixCanvasOverlap(visual, index, fixes, diagnostics) };
    }
    return segment;
  });
  return { segments: fixedSegments, fixes, diagnostics };
}
