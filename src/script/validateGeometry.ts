import type { TimedSegment } from "../model/Segment";
import type { FormationData, CanvasData } from "../video/sharedVisualProps";
import { FORMATION_TEMPLATES } from "../video/formations";
import { resolveObjectPosition, estimateObjectBoundingBox, boxesOverlap } from "../video/canvasLayout";

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
 * here. Every other overlap is flagged via console.warn and left exactly as
 * authored — untangling it would require understanding what the diagram is
 * trying to say, which this pass has no way to know. */
function fixCanvasPhaseOverlap(objects: CanvasObjectT[], sceneLabel: string, phaseLabel: string, fixes: string[]): CanvasObjectT[] {
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
      } else if (boxesOverlap(a.box, b.box)) {
        console.warn(
          `[validateGeometry] ${sceneLabel}${phaseLabel}: possible overlap between "${a.object.id}" and "${b.object.id}" — left as authored, not auto-fixed.`,
        );
      }
    }
  }

  return result;
}

/** Canvas scenes have no left/right convention to get backwards — their
 * recurring mistake class is spatial (objects overlapping), so this is a
 * different kind of check than the label/slot fixes above, but the same
 * "narrow auto-fix, flag the rest" philosophy the whole file follows. */
function fixCanvasOverlap(visual: CanvasData, sceneLabel: string, fixes: string[]): CanvasData {
  const fixedObjects = fixCanvasPhaseOverlap(visual.objects, sceneLabel, "", fixes);
  if (!visual.phases) return { ...visual, objects: fixedObjects };
  const fixedPhases = visual.phases.map((phase, index) => ({
    ...phase,
    objects: fixCanvasPhaseOverlap(phase.objects, sceneLabel, ` (phase ${index + 2})`, fixes),
  }));
  return { ...visual, objects: fixedObjects, phases: fixedPhases };
}

/** Runs after parsing, before render — auto-corrects the recurring "LW/RW
 * (or Formation slot order) backwards" mistake instead of blocking
 * generation on it, since a script drafted outside this repo (another tool,
 * a human, an LLM) has no way to know this project's left/right convention
 * up front. Only touches `tactical-board`/`pass-network` labels and
 * `formation` slot order — the three places this mistake has actually shown
 * up. Returns the corrected segments plus a human-readable log of what
 * changed, so nothing is silently rewritten. */
export function autoFixGeometry(segments: TimedSegment[]): { segments: TimedSegment[]; fixes: string[] } {
  const fixes: string[] = [];
  const fixedSegments = segments.map((segment, index) => {
    if (segment.type !== "statement" || !segment.visual) return segment;
    const sceneLabel = `Scene ${index + 1}`;
    const visual = segment.visual;
    if (visual.kind === "tactical-board") {
      return { ...segment, visual: { ...visual, players: fixLabeledEntries(visual.players, sceneLabel, fixes) } };
    }
    if (visual.kind === "pass-network") {
      return { ...segment, visual: { ...visual, nodes: fixLabeledEntries(visual.nodes, sceneLabel, fixes) } };
    }
    if (visual.kind === "formation") {
      return { ...segment, visual: { ...visual, sides: visual.sides.map((side) => fixFormationSide(side, sceneLabel, fixes)) } };
    }
    if (visual.kind === "canvas") {
      return { ...segment, visual: fixCanvasOverlap(visual, sceneLabel, fixes) };
    }
    return segment;
  });
  return { segments: fixedSegments, fixes };
}
