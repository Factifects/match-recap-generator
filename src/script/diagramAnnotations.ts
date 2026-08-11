// When a diagram's annotations are on screen, and where they sit.
//
// Split out of DiagramCard for the same reason diagramLayout is: these are the
// two decisions that produced a real rendered defect, they are pure functions
// of the timeline and the layout, and a drawing file is a bad place to keep
// something that needs regression tests.
//
// The defect, from a scene explaining process / thread / core: every annotation
// in the scene was still on screen at the end, printed across each other. "CORE:
// what actually executes. 2 cores = 2 threads in the same instant." ran straight
// through "THREAD: a separate line of execution, inside that process" from
// sixteen seconds earlier, and — being a single unwrapped line wider than the
// frame — hung off both edges as well.
//
// Two independent causes, so two independent guarantees:
//   - `resolveAnnotations` gives every note an END, inferred from signals the
//     script already contains, so notes stop accumulating;
//   - `placeAnnotations` resolves the geometry rather than hoping, so even if a
//     script somehow keeps several notes alive at once they stack instead of
//     overprinting, and none of them can leave the frame.

/** The subset of a diagram timeline this module cares about. Structural typing
 * keeps it decoupled from the renderer's own action union. */
export interface AnnotationTimelineAction {
  type: string;
  startSeconds: number;
  durationSeconds?: number;
  target?: string;
  text?: string;
  ids?: string[];
}

export interface LiveAnnotation {
  target: string;
  text: string;
  opacity: number;
}

/** How long an annotation takes to fade once its beat ends. */
export const ANNOTATION_FADE_SECONDS = 0.35;

/** Annotations wrap inside this width rather than running as one long line.
 * Percent of frame width. */
const MAX_WIDTH_PCT = 34;
/** Average glyph advance as a fraction of font size, for Inter at this weight.
 * Only ever used to decide line breaks and stacking, never to draw — an
 * estimate is enough to guarantee boxes cannot overlap, and it needs no
 * measurement pass. */
const CHAR_RATIO = 0.52;
export const ANNOTATION_LINE_HEIGHT = 1.28;
/** Keeps an annotation clear of the frame edge, of its own node, and of the
 * note above it. */
const MARGIN_PCT = 3;
const GAP_PCT = 1.1;

function ease(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function fadeIn(atSeconds: number, start: number, duration: number | undefined): number {
  if (!duration || duration <= 0) return atSeconds >= start ? 1 : 0;
  return ease((atSeconds - start) / duration);
}

/** Which annotations are visible at `atSeconds`, and how strongly.
 *
 * An annotation belongs to the beat it was spoken in and has to leave with it.
 * Nothing in the authored data says "stop showing this", so its end is inferred
 * from two signals that are already there:
 *
 *   - the same node being annotated again, and
 *   - a `focus: []`, which is how every script already says "this beat is over,
 *     return the diagram to rest".
 *
 * A script that never releases focus still accumulates notes; that case is
 * caught geometrically by `placeAnnotations` instead. */
export function resolveAnnotations(timeline: readonly AnnotationTimelineAction[], atSeconds: number): LiveAnnotation[] {
  const ordered = [...timeline].sort((a, b) => a.startSeconds - b.startSeconds);
  const notes: { target: string; text: string; startSeconds: number; durationSeconds?: number; endSeconds?: number }[] = [];

  const end = (at: number, target?: string) => {
    for (const note of notes) {
      if (note.endSeconds !== undefined) continue;
      if (target !== undefined && note.target !== target) continue;
      note.endSeconds = at;
    }
  };

  for (const action of ordered) {
    if (atSeconds < action.startSeconds) continue;
    if (action.type === "annotate") {
      if (action.target === undefined || action.text === undefined) continue;
      // Re-annotating a node supersedes its previous note.
      end(action.startSeconds, action.target);
      notes.push({ target: action.target, text: action.text, startSeconds: action.startSeconds, durationSeconds: action.durationSeconds });
      continue;
    }
    // Releasing focus ends the beat, and the beat's note goes with it.
    if (action.type === "focus" && (action.ids?.length ?? 0) === 0) end(action.startSeconds);
  }

  const live: LiveAnnotation[] = [];
  for (const note of notes) {
    const out =
      note.endSeconds === undefined ? 1 : 1 - Math.max(0, Math.min(1, (atSeconds - note.endSeconds) / ANNOTATION_FADE_SECONDS));
    const opacity = fadeIn(atSeconds, note.startSeconds, note.durationSeconds) * out;
    if (opacity > 0.01) live.push({ target: note.target, text: note.text, opacity });
  }
  return live;
}

export interface AnnotationTarget {
  x: number;
  y: number;
  height: number;
}

/** A box in canvas percent. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacedAnnotation extends Rect {
  text: string;
  opacity: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** Slides a text box along the vertical axis until it clears everything it
 * would otherwise sit on top of.
 *
 * Text in a diagram has to dodge more than other text: an edge label printed
 * over a node's caption ("reads and writes" across "shared memory") and a note
 * printed across two connectors are the same defect as two notes overlapping,
 * and none of them can be fixed by choosing a nicer anchor point. Everything
 * already on the frame — node boxes, drawn connectors, text placed earlier —
 * goes in as an obstacle, and the box moves until it is clear of all of them.
 *
 * Greedy and bounded: each pass jumps the box just past the first obstacle it
 * hits, which terminates because the box only ever moves one way. */
function nudgeClear(box: Rect, obstacles: readonly Rect[], direction: 1 | -1, gap: number): Rect {
  let current = { ...box };
  for (let pass = 0; pass < obstacles.length + 1; pass++) {
    const hit = obstacles.find((obstacle) => intersects(current, obstacle));
    if (!hit) return current;
    current = { ...current, top: direction === 1 ? hit.top + hit.height + gap : hit.top - current.height - gap };
  }
  return current;
}

/** Places a box below its anchor if it fits there, above it otherwise — so a
 * note under the bottom row of a diagram flips up rather than sliding off the
 * frame, and a box that fits neither way still lands inside the frame. */
function placeClear(box: Rect, obstacles: readonly Rect[], gap: number): Rect {
  const down = nudgeClear(box, obstacles, 1, gap);
  if (down.top + down.height <= 100 - MARGIN_PCT) return down;
  const up = nudgeClear(box, obstacles, -1, gap);
  if (up.top >= MARGIN_PCT) return up;
  return { ...down, top: Math.max(MARGIN_PCT, Math.min(down.top, 100 - MARGIN_PCT - down.height)) };
}

/** Places every live annotation so that none can overlap another and none can
 * leave the frame — resolved here rather than trusted to come out right, the
 * same bargain diagramLayout makes for nodes.
 *
 * Each note starts centred under the node it belongs to, is clamped inside the
 * frame, and is then pushed below anything already placed that it would have
 * collided with. If the resulting stack runs off the bottom the whole stack
 * slides up together, which preserves the spacing it just established. */
export function placeAnnotations(
  annotations: readonly LiveAnnotation[],
  targetOf: (id: string) => AnnotationTarget | undefined,
  fontSizePx: number,
  frameWidth: number,
  frameHeight: number,
  obstacles: readonly Rect[] = [],
): PlacedAnnotation[] {
  const charPx = fontSizePx * CHAR_RATIO;
  const maxWidthPx = (MAX_WIDTH_PCT / 100) * frameWidth;
  const charsPerLine = Math.max(8, Math.floor(maxWidthPx / charPx));

  const candidates: PlacedAnnotation[] = [];
  for (const annotation of annotations) {
    const target = targetOf(annotation.target);
    if (!target) continue;
    const lines = Math.max(1, Math.ceil(annotation.text.length / charsPerLine));
    const widthPx = lines > 1 ? maxWidthPx : Math.min(maxWidthPx, annotation.text.length * charPx);
    const width = (widthPx / frameWidth) * 100;
    const height = ((lines * fontSizePx * ANNOTATION_LINE_HEIGHT) / frameHeight) * 100;
    candidates.push({
      text: annotation.text,
      opacity: annotation.opacity,
      left: Math.min(Math.max(target.x - width / 2, MARGIN_PCT), Math.max(MARGIN_PCT, 100 - MARGIN_PCT - width)),
      top: target.y + target.height / 2 + GAP_PCT,
      width,
      height,
    });
  }
  candidates.sort((a, b) => a.top - b.top);

  const placed: PlacedAnnotation[] = [];
  for (const candidate of candidates) {
    const clear = placeClear(candidate, [...obstacles, ...placed], GAP_PCT);
    placed.push({ ...candidate, top: clear.top });
  }
  return placed;
}

export interface EdgeLabelInput {
  text: string;
  /** The connector's own polyline, in canvas percent. */
  points: readonly { x: number; y: number }[];
}

export interface PlacedEdgeLabel extends Rect {
  text: string;
}

/** Places each connector's label ON its own connector — deliberately.
 *
 * A label riding its line is the whole point of edge labels: it is how a flow
 * gets named ("buy", "runs", "reads and writes"). So this does NOT push a label
 * away from the diagram to guarantee clearance; a chip floating in space near
 * two lines is worse than one sitting on the line it belongs to, because it
 * stops saying which connector it describes.
 *
 * What it does fix is the anchor. The label goes on the LONGEST STRAIGHT RUN of
 * the polyline rather than at its parametric midpoint — the midpoint of an
 * elbow frequently lands on the short turn right next to a node, which is how
 * "reads and writes" ended up printed across the "shared memory" caption. The
 * longest run is the stretch of connector that is actually out in open space.
 *
 * Labels are still resolved against EACH OTHER, since two chips overprinting is
 * unreadable either way, and clamped into the frame. */
export function placeEdgeLabels(
  labels: readonly EdgeLabelInput[],
  fontSizePx: number,
  frameWidth: number,
  frameHeight: number,
): PlacedEdgeLabel[] {
  const charPx = fontSizePx * CHAR_RATIO;
  const height = ((fontSizePx * 1.5) / frameHeight) * 100;

  const placed: PlacedEdgeLabel[] = [];
  for (const label of labels) {
    if (label.points.length < 2) continue;
    let best = { midX: label.points[0].x, midY: label.points[0].y, length: -1 };
    for (let i = 0; i < label.points.length - 1; i++) {
      const a = label.points[i];
      const b = label.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > best.length) best = { midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, length };
    }
    const width = ((label.text.length * charPx + fontSizePx) / frameWidth) * 100;
    const candidate: PlacedEdgeLabel = {
      text: label.text,
      width,
      height,
      left: Math.min(Math.max(best.midX - width / 2, MARGIN_PCT), Math.max(MARGIN_PCT, 100 - MARGIN_PCT - width)),
      // Sits above its own line, which is the convention the chips already used.
      top: best.midY - height - GAP_PCT * 0.4,
    };
    // Only against other labels — a chip must stay on its own connector.
    const clear = nudgeClear(candidate, placed, -1, GAP_PCT * 0.5);
    placed.push({ ...candidate, top: Math.max(MARGIN_PCT, clear.top) });
  }
  return placed;
}

/** Every connector segment as a thin box, so text can be kept off the wires.
 * A label lying across two connectors reads as a collision even though no two
 * pieces of text overlap. */
export function connectorObstacles(
  edges: readonly { points: readonly { x: number; y: number }[] }[],
  thickness = 1.4,
): Rect[] {
  const rects: Rect[] = [];
  for (const edge of edges) {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = edge.points[i];
      const b = edge.points[i + 1];
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      rects.push({
        left,
        top: top - thickness / 2,
        width: Math.max(Math.abs(b.x - a.x), 0.1),
        height: Math.abs(b.y - a.y) + thickness,
      });
    }
  }
  return rects;
}
