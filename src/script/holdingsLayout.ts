// Data and geometry for the `holdings` medium.
//
// THE THESIS THIS MEDIUM EXISTS TO DEMONSTRATE
//
// A service used by millions of people at once does not work by keeping one
// enormous live picture of the world somewhere. There is no such picture. There
// are millions of small, partial, slightly-disagreeing views, each held by one
// participant, each covering almost nothing.
//
// Every previous attempt at this subject started by drawing the complete
// picture — a city, seen from above — and then tried to explain scale by moving
// a camera around inside it. That is the opposite of the lesson, and it is why
// those attempts kept failing: the visual asserted the existence of the very
// thing the episode says does not exist.
//
// So this module builds the OTHER side of that claim, and builds it as data
// rather than as art direction:
//
//   - a pane is everything one device holds, and it is deliberately small
//     enough for a viewer to count
//   - panes overlap partially and disagree slightly, because they were filled
//     at different moments
//   - the complete picture is never assembled anywhere, and `assemblyAttempt`
//     proves it is not assemblable: it returns the real gaps and the real
//     conflicts in the population
//   - when one thing changes, `affectedBy` returns the genuinely small subset
//     that has to care
//
// Nothing here is drawn. The renderer may only show what these functions
// compute, so the episode's claims are properties of the data on screen rather
// than assertions the narrator makes over a picture.

/** Ids of the things a device can hold a reading for. Deliberately opaque
 * labels: the moment these become street names the medium starts pretending to
 * be a map again, which is exactly the failure this replaces. */
export const UNIVERSE_SIZE = 48;

export function segmentId(index: number): string {
  return `S${String(index).padStart(2, "0")}`;
}

export type RecordKind = "segment" | "route" | "place";

export interface HeldRecord {
  kind: RecordKind;
  /** Which thing in the universe this is a reading of. */
  ref: string;
  /** A segment reading: the speed this device believes, in km/h. */
  value?: number;
  /** Seconds ago this reading was taken — why two devices disagree. */
  ageSeconds?: number;
}

export interface Pane {
  id: string;
  label: string;
  records: HeldRecord[];
}

function rand(i: number, seed: number): number {
  const v = Math.sin((i + 1) * 91.7 + seed * 47.3) * 29417.531;
  return v - Math.floor(v);
}

/** The true speed of each segment — the thing no single device knows. Every
 * pane's reading is this value plus the error of having been taken a moment
 * ago, which is where disagreement comes from. It is never drawn on its own:
 * the episode's whole point is that this row exists nowhere in the system. */
export function truth(seed = 1): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < UNIVERSE_SIZE; i++) {
    map.set(segmentId(i), Math.round(18 + rand(i * 3 + 11, seed) * 44));
  }
  return map;
}

const MIN_RECORDS = 3;
const MAX_RECORDS = 6;

/** A deterministic population of devices.
 *
 * Each pane holds a short CONTIGUOUS-ish window of the universe rather than a
 * uniform random sample: real devices hold the piece of the world they are
 * standing in, so neighbours overlap heavily and strangers not at all. That is
 * what makes the wall's partial overlap legible instead of looking like noise —
 * and it is what leaves genuine gaps, since no window is guaranteed to cover
 * every id. */
export function buildPanes(count: number, seed = 1): Pane[] {
  const trueSpeeds = truth(seed);
  const panes: Pane[] = [];
  for (let k = 0; k < count; k++) {
    const size = MIN_RECORDS + Math.floor(rand(k * 5 + 2, seed) * (MAX_RECORDS - MIN_RECORDS + 1));
    const start = Math.floor(rand(k * 7 + 3, seed) * UNIVERSE_SIZE);
    const records: HeldRecord[] = [];
    for (let r = 0; r < size; r++) {
      // A window with an occasional skip — a device does not hold a perfectly
      // tidy run, and a skipped id is how a hole gets into the population.
      const step = rand(k * 13 + r * 3 + 5, seed) < 0.22 ? 2 : 1;
      const index = (start + r * step) % UNIVERSE_SIZE;
      const ref = segmentId(index);
      if (records.some((rec) => rec.ref === ref)) continue;
      const ageSeconds = Math.round(rand(k * 17 + r * 7 + 9, seed) * 40);
      // The reading drifts from the truth in proportion to how old it is. Two
      // devices disagreeing is therefore a consequence of WHEN they looked,
      // not a random jitter sprinkled on for texture.
      const drift = Math.round((rand(k * 23 + r * 11 + 13, seed) - 0.5) * (4 + ageSeconds * 0.55));
      records.push({ kind: "segment", ref, value: Math.max(5, (trueSpeeds.get(ref) ?? 30) + drift), ageSeconds });
    }
    panes.push({ id: `p${k}`, label: `DEVICE ${k + 1}`, records });
  }
  return panes;
}

export interface AssemblyReport {
  /** Ids nobody in this population holds — the picture cannot be completed. */
  gaps: string[];
  /** Ids at least two devices hold with DIFFERENT values, and by how much they
   * disagree — the picture cannot even be made consistent. */
  conflicts: { ref: string; values: number[]; spread: number }[];
  /** Ids exactly one device holds — no second opinion exists. */
  singletons: string[];
  coverage: number;
}

/** What actually happens if you try to lay every device's holdings into one
 * complete picture. Both failure modes are computed from the population, so the
 * "assembly fails" beat cannot be faked by the renderer: if a future population
 * genuinely did tile perfectly, this would report it. */
export function assemblyAttempt(panes: readonly Pane[]): AssemblyReport {
  const byRef = new Map<string, number[]>();
  for (const pane of panes) {
    for (const record of pane.records) {
      if (record.value === undefined) continue;
      const bucket = byRef.get(record.ref) ?? [];
      bucket.push(record.value);
      byRef.set(record.ref, bucket);
    }
  }
  const gaps: string[] = [];
  const singletons: string[] = [];
  const conflicts: { ref: string; values: number[]; spread: number }[] = [];
  for (let i = 0; i < UNIVERSE_SIZE; i++) {
    const ref = segmentId(i);
    const values = byRef.get(ref);
    if (!values || values.length === 0) {
      gaps.push(ref);
      continue;
    }
    if (values.length === 1) singletons.push(ref);
    const spread = Math.max(...values) - Math.min(...values);
    if (values.length > 1 && spread > 0) conflicts.push({ ref, values, spread });
  }
  return { gaps, conflicts, singletons, coverage: (UNIVERSE_SIZE - gaps.length) / UNIVERSE_SIZE };
}

export interface Agreement {
  ref: string;
  readings: { paneId: string; value: number; ageSeconds: number }[];
  agreed: number;
  discarded: string[];
}

/** How a pile of partial readings becomes one usable answer.
 *
 * NOT a stylistic choice — it is the mechanism the episode is teaching, and
 * different systems genuinely use different ones. A clock takes the MIDDLE of
 * what its peers report, because the outliers are noise. A router takes the
 * CHEAPEST path its neighbours advertise, because the outliers are just longer
 * routes and there is nothing to average. Rendering one as the other would be a
 * confident lie about how the system works, so the rule is declared per scene
 * rather than baked in. */
export type AgreeRule = "median" | "min" | "max";

/** How many partial readings become one usable answer.
 *
 * `median` is never a mean, and that choice is itself the teaching point for a
 * subject that uses it: one device stuck at a red light reports 4 km/h, and a
 * mean would let it drag the answer down. `min`/`max` are for systems that
 * SELECT rather than average — a router keeps the cheapest advertised path and
 * simply does not use the others.
 *
 * Whatever the rule, the readings it sets aside are returned, so the visual can
 * show them being set aside rather than quietly vanishing. */
export function agree(panes: readonly Pane[], ref: string, rule: AgreeRule = "median"): Agreement {
  const readings = panes
    .flatMap((pane) => pane.records.filter((r) => r.ref === ref && r.value !== undefined).map((r) => ({ paneId: pane.id, value: r.value!, ageSeconds: r.ageSeconds ?? 0 })))
    .sort((a, b) => a.value - b.value);
  if (readings.length === 0) return { ref, readings, agreed: 0, discarded: [] };

  if (rule === "min" || rule === "max") {
    const agreed = rule === "min" ? readings[0].value : readings[readings.length - 1].value;
    // Everything that was not chosen is discarded — a selection rule sets aside
    // every other candidate, not merely the odd ones out.
    const winner = rule === "min" ? readings[0].paneId : readings[readings.length - 1].paneId;
    return { ref, readings, agreed, discarded: readings.filter((r) => r.paneId !== winner).map((r) => r.paneId) };
  }

  const mid = Math.floor(readings.length / 2);
  const agreed = readings.length % 2 === 1 ? readings[mid].value : Math.round((readings[mid - 1].value + readings[mid].value) / 2);
  const discarded = readings.filter((r) => Math.abs(r.value - agreed) > 12).map((r) => r.paneId);
  return { ref, readings, agreed, discarded };
}

/** Who has to care when one thing changes. The count is the argument: a change
 * is local because almost nobody was holding the thing that changed. */
export function affectedBy(panes: readonly Pane[], ref: string): { paneIds: string[]; fraction: number } {
  const paneIds = panes.filter((pane) => pane.records.some((record) => record.ref === ref)).map((pane) => pane.id);
  return { paneIds, fraction: panes.length === 0 ? 0 : paneIds.length / panes.length };
}

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

export type PaneDetail = "full" | "compact" | "dense";

export interface PaneBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  detail: PaneDetail;
}

/** Below these the pane can no longer carry what it claims to carry, so the
 * renderer must stop drawing it. Driven by measurable box size rather than by
 * an authored per-scene state, so a wall can never be caught drawing labels too
 * small to read — the failure mode of the medium this replaces. */
const FULL_MIN_WIDTH = 260;
const FULL_MIN_HEIGHT = 200;
const COMPACT_MIN_WIDTH = 118;
const COMPACT_MIN_HEIGHT = 94;

/** Arranges `count` panes inside a rect: a grid whose column count is chosen so
 * the cells stay as close to the pane's natural 4:3 as the rect allows.
 *
 * The gutters are load-bearing, not styling. Panes must never touch: the whole
 * argument of the medium is that these are separate holdings that do not form a
 * continuous surface, and a wall drawn without gaps would read as exactly the
 * single complete picture the episode says does not exist. */
/** A pane never grows past this, however few of them there are.
 *
 * Found by rendering: a single inspected device stretched to fill a 1920-wide
 * frame, which turned five modest rows into five enormous coloured slabs and
 * made the one shot whose job is "this is a small amount of information" read
 * as the opposite. A holding is meant to look small. */
const MAX_PANE_WIDTH = 620;
const MAX_PANE_HEIGHT = 430;

export function packWall(
  count: number,
  rect: { x: number; y: number; width: number; height: number },
  gutterRatio = 0.14,
): PaneBox[] {
  if (count <= 0) return [];
  const aspect = rect.width / Math.max(1, rect.height);
  // Columns that best preserve a 4:3 cell for this count in this rect.
  let bestCols = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellAspect = (rect.width / cols) / (rect.height / rows);
    const score = Math.abs(Math.log(cellAspect / (4 / 3))) + Math.abs(Math.log((cols / rows) / Math.max(0.2, aspect))) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  const cols = bestCols;
  const rows = Math.ceil(count / cols);
  const cellW = rect.width / cols;
  const cellH = rect.height / rows;
  const gutter = Math.min(cellW, cellH) * gutterRatio;
  const paneW = Math.max(1, Math.min(cellW - gutter, MAX_PANE_WIDTH));
  const paneH = Math.max(1, Math.min(cellH - gutter, MAX_PANE_HEIGHT));
  const detail: PaneDetail =
    paneW >= FULL_MIN_WIDTH && paneH >= FULL_MIN_HEIGHT ? "full" : paneW >= COMPACT_MIN_WIDTH && paneH >= COMPACT_MIN_HEIGHT ? "compact" : "dense";

  const boxes: PaneBox[] = [];
  for (let k = 0; k < count; k++) {
    const col = k % cols;
    const row = Math.floor(k / cols);
    // The last row is centred, so a wall of 7 in a grid of 3 does not sit with
    // a ragged hole on one side.
    const inLastRow = row === rows - 1;
    const lastRowCount = count - cols * (rows - 1);
    const offset = inLastRow && lastRowCount < cols ? ((cols - lastRowCount) * cellW) / 2 : 0;
    boxes.push({
      id: `slot${k}`,
      x: rect.x + offset + col * cellW + (cellW - paneW) / 2,
      y: rect.y + row * cellH + (cellH - paneH) / 2,
      width: paneW,
      height: paneH,
      detail,
    });
  }
  return boxes;
}

/** Where a pane goes while it is the SUBJECT of a beat.
 *
 * `inspect` and `compare` originally did nothing but dim the rest of the wall,
 * which works only in the one case where the wall is small enough that the
 * subject is already readable. Inspecting device 5 of a hundred and fifty left
 * the viewer staring at a dimmed field around a card too small to read a single
 * row of — the beat named a subject the frame never actually showed.
 *
 * So a staged pane travels out of its slot to a reading-sized box at the centre
 * of the frame. One subject takes the middle; two sit side by side with a real
 * gap, which is what lets a viewer compare them row by row.
 *
 * Returned in the same order as `indexes`, and the boxes are guaranteed not to
 * overlap each other or leave the frame. */
export function stagePlacement(
  slots: readonly PaneBox[],
  indexes: readonly number[],
  frame: { x: number; y: number; width: number; height: number },
  progress: number,
): PaneBox[] {
  const staged = indexes.filter((index) => slots[index] !== undefined);
  if (staged.length === 0) return [];
  const t = Math.max(0, Math.min(1, progress));
  // PORTRAIT STACKS, LANDSCAPE SITS SIDE BY SIDE. Two subjects squeezed into
  // half a 9:16 frame each are two unreadable columns; the doctrine's rule that
  // portrait is a separate composition rather than a squeezed landscape applies
  // as much to a pair of cards as to a diagram.
  const stackVertically = frame.height > frame.width;
  const count = Math.min(2, staged.length);
  const gap = (stackVertically ? frame.height : frame.width) * 0.045;
  const maxW = stackVertically
    ? Math.min(MAX_PANE_WIDTH, frame.width * 0.9)
    : Math.min(MAX_PANE_WIDTH, (frame.width * 0.82 - gap * (count - 1)) / count);
  const maxH = stackVertically
    ? Math.min(MAX_PANE_HEIGHT, (frame.height * 0.8 - gap * (count - 1)) / count)
    : Math.min(MAX_PANE_HEIGHT, frame.height * 0.78);
  const spanW = stackVertically ? maxW : count * maxW + (count - 1) * gap;
  const spanH = stackVertically ? count * maxH + (count - 1) * gap : maxH;
  const startX = frame.x + (frame.width - spanW) / 2;
  const startY = frame.y + (frame.height - spanH) / 2;

  return staged.map((index, position) => {
    const slot = slots[index];
    const wanted = {
      x: startX + (stackVertically ? 0 : position * (maxW + gap)),
      y: startY + (stackVertically ? position * (maxH + gap) : 0),
      width: maxW,
      height: maxH,
    };
    return {
      id: slot.id,
      x: slot.x + (wanted.x - slot.x) * t,
      y: slot.y + (wanted.y - slot.y) * t,
      width: slot.width + (wanted.width - slot.width) * t,
      height: slot.height + (wanted.height - slot.height) * t,
      // A staged pane earns full detail as it arrives: the whole point of
      // staging it is that its rows become readable.
      detail: t > 0.45 ? "full" : slot.detail,
    };
  });
}

/** Ids two participants both hold. The overlap beat's actual content — drawn
 * rather than asserted, so "they share a couple, at the edges" is checkable
 * against the frame. */
export function sharedRefs(a: Pane, b: Pane): string[] {
  const inA = new Set(a.records.map((r) => r.ref));
  return b.records.filter((r) => inA.has(r.ref)).map((r) => r.ref);
}

export interface RowGeometry {
  pad: number;
  headerHeight: number;
  rowHeight: number;
  rowGap: number;
  /** Top y of each row, in the same space as the box. */
  tops: number[];
}

/** Where a pane's rows sit inside it.
 *
 * Pulled out of the renderer because two things now need the SAME answer: the
 * card drawing its rows, and the comparison overlay drawing a link between the
 * row two participants disagree about. Row geometry computed twice is row
 * geometry that will eventually disagree with itself, and the link would then
 * point at the wrong line.
 *
 * The gap between rows is solved for rather than added afterwards, which is what
 * stops the last row of a full card being clipped by its own bottom edge. */
export function rowLayout(box: { width: number; height: number }, detail: PaneDetail, rowCount: number): RowGeometry {
  const pad = Math.max(4, box.width * 0.055);
  const headerHeight = detail === "full" ? Math.max(16, box.height * 0.15) : detail === "compact" ? Math.max(8, box.height * 0.14) : 0;
  const bodyHeight = box.height - headerHeight - pad * (detail === "dense" ? 1 : 1.6);
  const GAP_RATIO = 0.22;
  const rowHeight = rowCount > 0 ? Math.min(bodyHeight / (rowCount * (1 + GAP_RATIO)), box.height * 0.2) : 0;
  const rowGap = rowHeight * GAP_RATIO;
  const tops = Array.from({ length: rowCount }, (_, index) => headerHeight + pad * 0.6 + index * (rowHeight + rowGap));
  return { pad, headerHeight, rowHeight, rowGap, tops };
}

/** Rough on-screen width of a line of display text, in px.
 *
 * Deliberately an OVER-estimate. Its only job is to size the plate drawn behind
 * a caption, and a plate one character too wide costs nothing while a plate one
 * character too narrow puts the end of the sentence back on top of whatever it
 * was meant to be protected from. */
export function estimateTextWidthPx(text: string, fontSize: number, tracking = 0): number {
  const AVERAGE_ADVANCE = 0.63;
  return text.length * (fontSize * AVERAGE_ADVANCE + tracking);
}

/** Centres `count` fixed-width items in a row with a guaranteed gap between
 * them, returning each item's centre x.
 *
 * Exists because of a rendered bug: the reconciliation beat laid its reading
 * chips out by dividing a span between them, so a long list packed them closer
 * than their own width and every chip clipped its neighbour's second digit —
 * "4 4 4 5 5 53" where seventeen two-digit readings should have been. Any row
 * of fixed-size things needs its spacing derived FROM that size, never from the
 * space available, and a shared helper with a no-overlap test is how that stops
 * being rediscovered. */
export function spreadRow(count: number, itemWidth: number, gap: number, centerX: number): number[] {
  if (count <= 0) return [];
  const pitch = itemWidth + gap;
  const rowWidth = count * itemWidth + (count - 1) * gap;
  const startX = centerX - rowWidth / 2 + itemWidth / 2;
  return Array.from({ length: count }, (_, index) => startX + index * pitch);
}

/** Where a pane sits mid-assembly: its wall slot, moved toward the single
 * shared frame the assembly is trying to build, by `progress`.
 *
 * The offsets are NOT tidy. Each pane's holdings cover a different window of the
 * universe, so the place it would have to sit is decided by what it holds — and
 * because those windows overlap and skip, panes end up landing on top of each
 * other and leaving holes. The mess is the demonstration; do not clean it up. */
export function assemblyPlacement(
  pane: Pane,
  slot: PaneBox,
  target: { x: number; y: number; width: number; height: number },
  progress: number,
): { x: number; y: number; width: number; height: number } {
  const firstIndex = pane.records.length > 0 ? Number(pane.records[0].ref.slice(1)) : 0;
  const span = Math.max(1, pane.records.length);
  const columns = 8;
  const cellW = target.width / columns;
  const cellH = target.height / Math.ceil(UNIVERSE_SIZE / columns);
  const col = firstIndex % columns;
  const row = Math.floor(firstIndex / columns);
  // WIDTH IS CAPPED AT ROUGHLY ONE CELL. Letting a pane span one cell per row
  // it holds was truer to "this is where its pieces would go" and much worse to
  // look at: rendered, the panes became long thin strips and the pile stopped
  // reading as devices landing on each other at all. A pane keeps its card
  // shape and lands on the cell of the FIRST piece it holds, so an overlap is
  // legible as two cards in one place.
  const wanted = {
    x: target.x + col * cellW,
    y: target.y + row * cellH,
    width: cellW * Math.min(1.55, 0.92 + span * 0.1),
    height: cellH * 0.86,
  };
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: slot.x + (wanted.x - slot.x) * t,
    y: slot.y + (wanted.y - slot.y) * t,
    width: slot.width + (wanted.width - slot.width) * t,
    height: slot.height + (wanted.height - slot.height) * t,
  };
}
