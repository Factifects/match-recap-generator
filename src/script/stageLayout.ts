// The layout engine behind the `stage` medium — the Techijest Shorts visual
// language.
//
// WHY THIS EXISTS RATHER THAN MORE DIAGRAM
//
// `diagramLayout.ts` is a layered (simplified Sugiyama) layout: longest-path
// layering along ONE flow axis, declaration order within a layer. That is the
// right shape for a KodeKloud-register architecture build, and it is exactly
// wrong for a Short. `direction: "vertical"` there does not mean "compose for
// portrait" — it means "one column, top to bottom", so every 9:16 scene it
// produces is a vertical flowchart BY CONSTRUCTION. No script can opt out; the
// most recent Short (retry-storm-diagram-story) is two boxes in a column,
// re-declared from scratch in all four scenes.
//
// Two further properties of that engine are disqualifying for Shorts, both
// structural rather than cosmetic:
//   - layout is computed ONCE, so no node can ever move, grow or recede. "The
//     server expands to occupy the screen while the browser recedes and the
//     database moves forward" is not expressible at all.
//   - there is no camera, so there is nothing for "push in / pull back / pan"
//     to compile to.
//
// WHAT THIS DOES INSTEAD
//
// A stage is a 2D ENVIRONMENT, not a pipeline. Objects are placed into named
// regions of a 3x3 grid (`top-left` .. `bottom-right`), and the whole layout is
// a pure function of a COMPOSITION — a placement/emphasis snapshot. A scene
// declares several compositions across its timeline and the renderer tweens
// every box between consecutive layouts, re-routing connectors from the tweened
// boxes each frame. That is what makes the frame reorganise as the explanation
// develops instead of sitting still.
//
// Crucially this keeps the correctness guarantees that made the structural
// media worth having in the first place, none of which free-x/y Canvas has:
//   - a label can never overflow its box, because boxes are sized to their own
//     text before anything is placed;
//   - nothing lands off-canvas, because placement clamps into the safe area as
//     its final step;
//   - nothing overlaps, because separation runs to convergence after placement;
//   - a connector can never start underneath its own object, because every edge
//     is clipped to both boundaries rather than drawn centre-to-centre.
//
// Deliberately NOT a force-directed layout: those produce organic blobs that
// drift between frames. Region anchors are stable, so an object placed in
// `center` is in the same place in every scene that puts it there — which is
// what lets a viewer learn the stage across a series.

export type StageRegion =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export const STAGE_REGIONS: StageRegion[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** Visual weight, not size-in-isolation. `lead` is the object currently being
 * explained and should dominate; `recede` is still-relevant context the viewer
 * must be able to see but must not read as the subject. This is the geometric
 * half of the highlight-and-dim mechanic — the renderer also dims a `recede`
 * object, but a purely opacity-based version reads as "faded out", whereas
 * genuinely shrinking it reads as "further away". */
export type StageEmphasis = "lead" | "normal" | "recede";

export type StageAccent = "neutral" | "primary" | "warn" | "success" | "danger" | "profile";

/** What the object IS. Kept to silhouettes a viewer can recognise WITHOUT a
 * label — the standing rule from the diagram medium's own shape work is that a
 * shape must be recognisable, not merely distinct (a hexagon and a diamond were
 * geometrically different and meant nothing). Everything here is either a
 * real-world object with a universal outline (browser window, database
 * cylinder, rack, queue slots, person) or an explicitly generic card (`note`).
 * The richer semantic object set the Shorts doctrine asks for — tokens, locks,
 * SQL tables, containers/pods, code blocks — is deliberately NOT here yet; that
 * is its own build, not something to half-do inside the layout engine. */
export type StageObjectKind =
  // people & devices — where a request starts
  | "client"
  | "browser"
  | "phone"
  | "tv"
  | "laptop"
  // network & routing
  | "cdn"
  | "gateway"
  | "loadBalancer"
  // compute
  | "server"
  | "service"
  | "container"
  | "worker"
  | "function"
  // state
  | "database"
  | "cache"
  | "storage"
  | "table"
  | "queue"
  // media & data
  | "stream"
  | "code"
  // security
  | "token"
  | "lock"
  // structure
  | "region"
  | "note"
  // encodings & maps — shapes whose INTERNAL structure is the subject
  | "qr"
  | "hexmap"
  // quantities
  | "clock"
  | "road"
  | "money"
  // typography
  | "phrase"
  // environments
  | "app"
  | "context"
  // symbols
  | "incognito"
  | "phonebook"
  // tracking and personalisation
  | "map"
  | "pin"
  | "cookie"
  | "profile"
  | "prediction"
  // reference frames
  | "vector"
  | "globe"
  | "compass"
  | "bars"
  | "browserWindow"
  | "memory";

/** Kinds that exist to CONTAIN other objects rather than to be a thing
 * themselves. A region is drawn as a quiet dashed frame behind its children,
 * never as another competing box — nesting should read as depth, not as more
 * boxes. */
export const CONTAINER_KINDS: StageObjectKind[] = ["region", "map"];

/** Which half of a SPLIT stage an object lives in.
 *
 * A split stage is the only way to express "both approaches perform the same
 * operation at the same time" — without it, a comparison degenerates into two
 * boxes side by side with a label, which asserts a difference instead of
 * demonstrating one. `a` and `b` are deliberately neutral names: the panes are
 * before/after, with/without, polling/websockets, whatever the scene declares. */
export type StagePane = "a" | "b";

export interface StageUiRow {
  id: string;
  kind: "button" | "input" | "text" | "row" | "error" | "success";
  label: string;
  sub?: string;
  value?: string;
  icon?: "none" | "car";
  hidden?: boolean;
}

/** The content vocabulary a product screen is built from. Structural twins of
 * the authored schema, so the renderer can draw a real form, a real month grid
 * and a real seat map rather than a row of generic rectangles. */
export type StageAppBlock =
  | { kind: "heading"; text: string }
  | { kind: "fields"; items: { id: string; label: string; value: string }[] }
  | { kind: "calendar"; month: string; startDay?: number; days: number[]; selected?: number; requested?: number }
  | { kind: "cards"; items: { id: string; title: string; sub?: string; value?: string; badge?: string }[] }
  | { kind: "seatmap"; rows: number; cols: number; selected?: string }
  | { kind: "summary"; items: { label: string; value?: string; state?: "plain" | "good" | "bad" }[] }
  | { kind: "status"; label: string; state?: "processing" | "approved" | "failed" }
  | { kind: "confirmation"; title: string; route?: string; date?: string; reference?: string }
  | { kind: "button"; id: string; label: string };

/** HOW TALL A BLOCK RENDERS, in the same units AppSurface draws it.
 *
 * Lives here rather than in the renderer because the LAYOUT has to know it: an
 * application that always filled the safe area left half a portrait frame empty
 * under three rows of content, and the only way to size a window to its content
 * is to measure the content before placing the window. AppSurface imports this
 * so the two can never disagree about how tall a calendar is. */
export function appBlockHeight(block: StageAppBlock, px: number): number {
  switch (block.kind) {
    case "heading":
      return px * 2;
    case "fields":
      return px * 4.2;
    case "calendar":
      return px * 7.2;
    case "cards":
      return block.items.length * px * 3.4;
    case "seatmap":
      return px * 1.4 + block.rows * px * 1.6;
    case "summary":
      return block.items.length * px * 2.1 + px;
    case "status":
      return px * 3.4;
    case "confirmation":
      return px * 9;
    case "button":
      return px * 3.6;
    default:
      return px * 2;
  }
}

/** The height the TALLEST screen needs, so the shell stays put while the
 * content inside it changes. A window that resized on every navigation would
 * read as the whole product jumping rather than the page turning. */
export function appContentHeight(app: StageApp, px: number): number {
  const chrome = px * 3.2;
  const pad = px * 1.2;
  let tallest = 0;
  for (const screen of Object.values(app.screens ?? {})) {
    let h = pad + (screen.title ? px * 2.4 : 0);
    for (const block of screen.blocks ?? []) h += px * 1.1 + appBlockHeight(block, px);
    tallest = Math.max(tallest, h + pad);
  }
  return chrome + tallest;
}

/** A whole product: shell, screens, and which screen is showing. */
/** Everything a model has been given, in arrival order. */
export interface StageContext {
  label: string;
  entries: { id: string; source: "user" | "page" | "tool" | "model"; text: string; hidden?: boolean }[];
  chosen?: string;
}

export interface StageApp {
  brand: string;
  mark?: "wing" | "orbit" | "spark" | "layers" | "pulse" | "incognito";
  nav: string[];
  account?: string;
  screens: Record<string, { title?: string; blocks: StageAppBlock[] }>;
  screen: string;
  overlay?: string;
}

export interface StageUi {
  chrome: "browser" | "app" | "phone";
  map?: boolean;
  url?: string;
  rows: StageUiRow[];
}

export interface StageObjectInput {
  id: string;
  kind: StageObjectKind;
  label?: string;
  sublabel?: string;
  /** Home region — where this object sits until a composition moves it. */
  at: StageRegion;
  emphasis?: StageEmphasis;
  accent?: StageAccent;
  /** Drawn as a dark anchor rather than a tinted outline, so a light
   * composition has somewhere for the eye to land. Light theme only. */
  surface?: "default" | "dark";
  /** `bars` only — the options being compared. */
  series?: { label: string; value: number; accent?: StageAccent }[];
  /** `browserWindow` — tab labels, and the work the page turns out to be doing. */
  tabs?: string[];
  workloads?: { label: string; accent?: StageAccent }[];
  /** `memory` — total blocks, and what is currently allocated. */
  capacity?: number;
  regions?: { label: string; blocks: number; state: "active" | "reusable" | "reclaimable" }[];
  /** `vector` only — see the schema. "world" holds its direction while its host
   * turns; "body" turns with it. */
  frame?: "world" | "body";
  /** `vector` only — degrees clockwise from straight up. */
  dir?: number;
  /** `vector` only — the object this direction is drawn from. */
  attachTo?: string;
  /** Nests this object INSIDE another (which should be a `region`). The parent
   * is sized from its children and drawn behind them, so "this service lives in
   * eu-west-1" is expressed structurally instead of by putting two boxes near
   * each other and hoping the viewer infers it. One level of nesting only —
   * deeper hierarchies stop being legible at phone size, which is the whole
   * constraint this medium is designed around. */
  parent?: string;
  /** Draws N stacked copies instead of one box. Identical is the POINT: a fleet
   * of twelve services must look like twelve of the same thing, which is what
   * hand-placed icons kept getting wrong by picking a different colour each
   * time. Costs nothing in layout — the stack occupies one box. */
  replicas?: number;
  /** Which half of a split stage this belongs to. Ignored when the scene is
   * not split. */
  pane?: StagePane;
  /** A real interface surface — see the schema's `ui`. */
  ui?: StageUi;
  /** Real source lines, for a `code` object. */
  code?: string[];
  /** Declared lifecycle, in order. */
  states?: string[];
  /** Resolved brand mark, path relative to public/ (see brandRegistry.ts). */
  brand?: string;
  logoPath?: string;
  /** Resolved path to a REAL encoded QR image (assets/qrRegistry.ts). Without
   * it a `qr` object falls back to a drawn grid, which reads correctly as a
   * shape but encodes nothing and cannot be scanned. */
  qrPath?: string;
  /** How a `hexmap` is tiled and what it is showing. */
  hex?: { mode?: "grid" | "neighbours"; cols?: number };
  app?: StageApp;
  context?: StageContext;
  logoHex?: string;
  logoMonochrome?: boolean;
}

export interface StageEdgeInput {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
  kind?: "request" | "response" | "data" | "dependency";
}

/** A placement snapshot. Everything is a partial override of the objects' own
 * declared `at`/`emphasis`, so a composition only states what CHANGED — which
 * is what keeps a four-act Short readable as four short deltas rather than four
 * full re-declarations of the world. */
export interface StageComposition {
  place?: Partial<Record<string, StageRegion>>;
  emphasis?: Partial<Record<string, StageEmphasis>>;
  /** Objects not yet introduced, or deliberately removed from the frame.
   * Hidden objects are still laid out (so they animate back to a stable place
   * when they return) but are skipped by separation, so they never push a
   * visible object around from off-screen. */
  hidden?: string[];
}

/** Kinds whose label belongs INSIDE the shape, because the shape is a card and
 * a card is a thing you write on. Every other kind is a real-world silhouette —
 * a phone, a cylinder, a padlock, a rack — whose recognisability depends on its
 * outline and proportions, so its label is a CAPTION UNDERNEATH it instead.
 *
 * This is not a styling preference. Growing a box until its label fits inside
 * destroys the very thing that makes the object identifiable: a phone widened
 * to fit "Their phone" is no longer phone-shaped, it is a rectangle, and every
 * kind converges on the same rectangle as labels get longer. Captioning below
 * keeps the silhouette exact at any label length. */
const LABEL_INSIDE_KINDS = new Set<StageObjectKind>(["service", "note", "code", "table", "region", "browser", "gateway", "phrase", "app", "context"]);
/** A UI surface always keeps its text inside its own chrome, whatever kind it
 * is drawn as — an interface with a caption underneath reads as a screenshot of
 * an app rather than as the app. */
function keepsLabelInside(object: { kind: StageObjectKind; ui?: StageUi }): boolean {
  return !!object.ui || LABEL_INSIDE_KINDS.has(object.kind);
}

export interface StageBox {
  id: string;
  kind: StageObjectKind;
  label?: string;
  sublabel?: string;
  accent: StageAccent;
  emphasis: StageEmphasis;
  replicas: number;
  pane?: StagePane;
  ui?: StageUi;
  code?: string[];
  states?: string[];
  /** True when this kind's label renders as a caption beneath the silhouette
   * rather than inside it. */
  captionBelow: boolean;
  /** Height reserved under the silhouette for that caption, in pixels. Part of
   * the box's SEPARATION footprint but not of its drawn shape. */
  captionHeight: number;
  /** Width the caption needs — a long caption under a narrow phone still has to
   * be kept clear of its neighbours. */
  captionWidth: number;
  parentId?: string;
  /** Drawn as a dark anchor instead of a tinted outline (light theme only). */
  surface?: "default" | "dark";
  series?: { label: string; value: number; accent?: StageAccent }[];
  tabs?: string[];
  workloads?: { label: string; accent?: StageAccent }[];
  capacity?: number;
  regions?: { label: string; blocks: number; state: "active" | "reusable" | "reclaimable" }[];
  frame?: "world" | "body";
  dir?: number;
  attachTo?: string;
  /** The region this object declared. Kept on the box so a NESTED object can
   * be placed where it said it lives inside its parent, instead of being
   * grid-packed in declaration order. */
  homeRegion: StageRegion;
  /** True for a `region` — the renderer draws it as a quiet frame behind its
   * children rather than as a solid object. */
  isContainer: boolean;
  brand?: string;
  logoPath?: string;
  /** Resolved path to a REAL encoded QR image (assets/qrRegistry.ts). Without
   * it a `qr` object falls back to a drawn grid, which reads correctly as a
   * shape but encodes nothing and cannot be scanned. */
  qrPath?: string;
  /** How a `hexmap` is tiled and what it is showing. */
  hex?: { mode?: "grid" | "neighbours"; cols?: number };
  app?: StageApp;
  context?: StageContext;
  logoHex?: string;
  logoMonochrome?: boolean;
  hidden: boolean;
  /** Centre and size, in PIXELS at the real composition size. Pixels rather
   * than percent because a stage is laid out against both 16:9 and 9:16 frames
   * and every readability floor (minimum type size, minimum touch-sized box) is
   * a pixel quantity — expressing those in percent-of-width means they mean two
   * different things in the two orientations, which is the bug that made
   * "responsive" layouts illegible on a phone. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageRoutedEdge {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
  kind: "request" | "response" | "data" | "dependency";
  /** Boundary-to-boundary, in pixels. Never centre-to-centre. */
  points: { x: number; y: number }[];
  /** Quadratic bezier control point, currently always the midpoint (i.e. a
   * straight line). Kept as a control point rather than hard-coding straight
   * segments so the renderer and `pointOnStageEdge` share ONE path definition;
   * a packet evaluating different geometry from the line it is drawn on is the
   * classic way travelling tokens drift off their own route. */
  control: { x: number; y: number };
}

export interface StageLayout {
  boxes: StageBox[];
  edges: StageRoutedEdge[];
}

export interface StageLayoutOptions {
  /** Real composition size in pixels. */
  frame: { width: number; height: number };
  /** Splits the stage into two independent halves, each laid out in its own
   * safe area. Both halves run the SAME layout code, so a comparison is
   * genuinely like-for-like rather than two hand-placed arrangements that
   * happen to sit beside each other. */
  split?: { orientation: "vertical" | "horizontal" };
  /** Safe area in pixels. Defaults reserve a top band for beat text and a
   * bottom band for the caption/word-caption overlay, which is why a stage
   * never collides with either. */
  safeArea?: { x: number; y: number; width: number; height: number };
}

/** Region anchors as fractions of the safe area. Deliberately inset from the
 * true corners (0.22/0.78 rather than 0/1): an object is CENTRE-anchored, so a
 * corner region anchored at the literal corner would need half the box clamped
 * back in every single time, and clamping is a correctness backstop, not a
 * layout strategy. */
const REGION_ANCHORS: Record<StageRegion, { fx: number; fy: number }> = {
  "top-left": { fx: 0.2, fy: 0.14 },
  top: { fx: 0.5, fy: 0.1 },
  "top-right": { fx: 0.8, fy: 0.14 },
  left: { fx: 0.15, fy: 0.5 },
  center: { fx: 0.5, fy: 0.5 },
  right: { fx: 0.85, fy: 0.5 },
  "bottom-left": { fx: 0.2, fy: 0.86 },
  bottom: { fx: 0.5, fy: 0.9 },
  "bottom-right": { fx: 0.8, fy: 0.86 },
};

const EMPHASIS_SCALE: Record<StageEmphasis, number> = {
  lead: 1.5,
  normal: 1,
  recede: 0.68,
};

/** Base box size as a fraction of the frame's SHORTER side. Using the shorter
 * side (1080 in both 1920x1080 and 1080x1920) means an object is the same
 * physical size in both orientations rather than silently shrinking in
 * portrait — the difference between a genuine recomposition and a squeeze. */
const BASE_WIDTH_UNITS = 0.27;
const BASE_HEIGHT_UNITS = 0.17;

/** Per-kind size multipliers, so a database does not render the same shape as a
 * browser window. Widths only where the silhouette is genuinely wider. */
const KIND_SIZE: Partial<Record<StageObjectKind, { w?: number; h?: number }>> = {
  browser: { w: 1.18, h: 1.05 },
  server: { w: 0.82, h: 1.35 },
  database: { w: 0.86 },
  cache: { w: 0.86 },
  storage: { w: 0.92, h: 1.05 },
  queue: { w: 1.2, h: 0.78 },
  client: { w: 0.8 },
  note: { w: 1.05, h: 0.7 },
  phone: { w: 0.44, h: 1.5 },
  tv: { w: 1.15, h: 1.0 },
  laptop: { w: 1.15, h: 0.92 },
  cdn: { w: 0.9, h: 1.0 },
  loadBalancer: { w: 1.0, h: 0.95 },
  container: { w: 0.95, h: 0.95 },
  worker: { w: 0.8, h: 0.95 },
  function: { w: 0.85, h: 0.8 },
  table: { w: 1.15, h: 1.05 },
  stream: { w: 1.1, h: 0.85 },
  code: { w: 1.25, h: 1.1 },
  token: { w: 0.9, h: 0.62 },
  lock: { w: 0.62, h: 0.95 },
  qr: { w: 1.0, h: 1.59 },
  // A map wants room: wide, and tall enough to read as territory.
  hexmap: { w: 1.55, h: 2.2 },
  // Deliberately compact: these appear in groups, and two of them shoulder to
  // shoulder with no gap read as one object.
  clock: { w: 0.62, h: 0.95 },
  road: { w: 0.72, h: 0.95 },
  money: { w: 0.8, h: 0.62 },
  // Wide and generous: a phrase is read, not glanced at.
  phrase: { w: 2.6, h: 1.5 },
  // An application is the WORLD of its scene, not an object in it.
  app: { w: 3.3, h: 4.6 },
  context: { w: 3.1, h: 3.6 },
  incognito: { w: 0.85, h: 0.8 },
  phonebook: { w: 1.5, h: 1.15 },
  map: { w: 2.4, h: 2.2 },
  pin: { w: 0.42, h: 0.62 },
  cookie: { w: 0.7, h: 0.7 },
  profile: { w: 1.5, h: 1.7 },
  prediction: { w: 1.15, h: 1.1 },
  // Long and thin: a vector is read by its direction, not its bulk.
  vector: { w: 0.45, h: 0.95 },
  bars: { w: 2.0, h: 1.25 },
  // Both signature objects want real width on a 16:9 canvas.
  // Wide enough to hold the window AND the work it sheds, so the layout can
  // keep other objects clear of both.
  browserWindow: { w: 2.3, h: 2.0 },
  memory: { w: 1.9, h: 1.85 },
  // A planet and a dial are both round: square footprints.
  globe: { w: 1.5, h: 1.5 },
  compass: { w: 1.2, h: 1.2 },
};

/** Readability floors in px at a 1080-short-side frame. Text is NOT derived
 * purely from box height — a small box shrinking its label below this is the
 * failure that made sparse diagrams unreadable on a phone; the box grows to fit
 * the text instead of the text shrinking to fit the box. */
export const STAGE_MIN_LABEL_PX = 30;
/** Code has its own readability floor — smaller than a label (it is a block,
 * not a headline) but still a hard minimum, because unreadable code on screen
 * is worse than no code. */
export const CODE_MIN_PX = 24;
export const CODE_LINE_HEIGHT = 1.5;
/** Monospace advance width at 1em. */
export const CODE_CHAR_ADVANCE = 0.6;
export const STAGE_MIN_SUBLABEL_PX = 22;
/** Approximate advance width of the display face at 1em, used to size a box to
 * its own text. Intentionally generous — over-estimating widths costs a little
 * whitespace, under-estimating costs a clipped label. */
const CHAR_ADVANCE = 0.58;
const LABEL_PADDING_X = 34;

function unitOf(frame: { width: number; height: number }): number {
  return Math.min(frame.width, frame.height);
}

/** The frame ONE PANE of a split stage is laid out against.
 *
 * Sizing has to follow the pane, not the whole canvas. Every size in this file
 * derives from `unitOf(frame)`, so a browser sized for a 1080-wide canvas and
 * then placed in a 540-wide half runs off both edges — which is precisely what
 * the first split-screen render did, on both sides at once. */
export function stagePaneFrame(
  frame: { width: number; height: number },
  orientation: "vertical" | "horizontal",
): { width: number; height: number } {
  return orientation === "vertical"
    ? { width: frame.width / 2, height: frame.height }
    : { width: frame.width, height: frame.height / 2 };
}

/** The unit a pane's contents are sized and lettered against — exported so the
 * renderer letters them at the same scale the layout assumed. */
export function stagePaneUnit(
  frame: { width: number; height: number },
  orientation: "vertical" | "horizontal",
): number {
  return unitOf(stagePaneFrame(frame, orientation));
}

export function stageLabelPx(box: { height: number }, unit: number): number {
  return Math.max(STAGE_MIN_LABEL_PX * (unit / 1080), box.height * 0.2);
}

export function stageSublabelPx(box: { height: number }, unit: number): number {
  return Math.max(STAGE_MIN_SUBLABEL_PX * (unit / 1080), box.height * 0.14);
}

interface SizedBox {
  width: number;
  height: number;
  captionBelow: boolean;
  captionHeight: number;
  captionWidth: number;
}

function sizeOf(object: StageObjectInput, emphasis: StageEmphasis, unit: number): SizedBox {
  const kind = KIND_SIZE[object.kind] ?? {};
  const scale = EMPHASIS_SCALE[emphasis];
  let baseW = BASE_WIDTH_UNITS * unit * (kind.w ?? 1) * scale;
  let baseH = BASE_HEIGHT_UNITS * unit * (kind.h ?? 1) * scale;

  // A UI surface is sized to hold its own rows at a readable size. An
  // interface squeezed into a generic card is not an interface, it is a
  // picture of one.
  if (object.ui && object.ui.rows.length > 0) {
    const rowPx = Math.max(26 * (unit / 1080), unit * 0.028);
    const longest = Math.max(...object.ui.rows.map((r) => r.label.length), (object.ui.url ?? "").length);
    baseW = Math.max(baseW, longest * rowPx * 0.56 + rowPx * 4);
    baseH = Math.max(baseH, object.ui.rows.length * rowPx * 2.1 + rowPx * 3.4);

    // A PHONE HAS TO BE PHONE-SHAPED. Sizing from the rows alone made it as
    // wide as its longest line and only as tall as its content, which is a
    // squat card — and a card is not what anyone has ever held. So the width is
    // capped and the height is driven from it, which also forces short row
    // labels: a line that does not fit a handset does not belong on one.
    if (object.ui.chrome === "phone") {
      // The cap has to follow EMPHASIS, or a lead phone — the only thing in its
      // scene — sits at the same size as one sharing the frame with three other
      // objects, surrounded by black doing nothing. A phone that is the whole
      // subject should own the frame.
      // A FLOOR as well as a ceiling. Capping alone did nothing once the rows
      // were short enough to fit easily — the handset simply stayed small and
      // sat in a frame of black. A phone that is the subject of its scene has a
      // minimum size regardless of how little text it happens to carry.
      const capUnits = emphasis === "lead" ? 0.58 : emphasis === "recede" ? 0.32 : 0.44;
      const minUnits = emphasis === "lead" ? 0.5 : emphasis === "recede" ? 0.26 : 0.36;
      baseW = Math.min(Math.max(baseW, unit * minUnits), unit * capUnits);
      // A real handset is about twice as tall as it is wide; with a map panel
      // filling the top half it needs more again, or the sheet underneath has
      // nowhere to go.
      baseH = Math.max(baseH, baseW * (object.ui.map ? 2.35 : 2.1));
    }
  }

  // A code pane is sized to its own SOURCE — longest line and line count —
  // rather than to the generic card size. Code that has to shrink to fit a box
  // chosen for something else is unreadable on a phone, which defeats the point
  // of treating code as a first-class medium rather than an illustration of one.
  if (object.code && object.code.length > 0 && object.kind === "phrase") {
    // Display type, sized to be read from across a room, and the box grows to
    // whatever the longest line needs.
    const px = Math.max(38 * (unit / 1080), unit * 0.044);
    const longest = Math.max(...object.code.map((l) => l.length));
    baseW = Math.max(baseW, Math.min(unit * 1.7, longest * px * 0.5 + px * 1.2));
    baseH = Math.max(baseH, object.code.length * px * 1.5 + px);
  } else if (object.code && object.code.length > 0) {
    const codePx = Math.max(CODE_MIN_PX * (unit / 1080), unit * 0.026);
    const longest = Math.max(...object.code.map((l) => l.length));
    baseW = Math.max(baseW, longest * codePx * CODE_CHAR_ADVANCE + codePx * 5.5);
    baseH = Math.max(baseH, object.code.length * codePx * CODE_LINE_HEIGHT + codePx * 3.2);
  }

  // Grow to fit the object's own text at the size it will actually render, so
  // a label can never overflow. Solved against the rendered label size, which
  // itself depends on height — one fixed-point step is enough because the label
  // floor dominates whenever the box is small.
  const labelPx = Math.max(STAGE_MIN_LABEL_PX * (unit / 1080), baseH * 0.2);
  const subPx = Math.max(STAGE_MIN_SUBLABEL_PX * (unit / 1080), baseH * 0.14);
  const labelWidth = (object.label?.length ?? 0) * labelPx * CHAR_ADVANCE;
  const subWidth = (object.sublabel?.length ?? 0) * subPx * CHAR_ADVANCE;
  const needed = Math.max(labelWidth, subWidth) + LABEL_PADDING_X * 2;

  const captionBelow = !keepsLabelInside(object);
  if (captionBelow) {
    // The silhouette keeps its authored proportions exactly; the text lives
    // beneath it and only ever affects the SEPARATION footprint.
    const lines = (object.label ? 1 : 0) + (object.sublabel ? 1 : 0);
    return {
      width: baseW,
      height: baseH,
      captionBelow: true,
      captionHeight: lines === 0 ? 0 : labelPx * 1.15 + (object.sublabel ? subPx * 1.25 : 0),
      captionWidth: Math.max(labelWidth, subWidth),
    };
  }

  return { width: Math.max(baseW, needed), height: baseH, captionBelow: false, captionHeight: 0, captionWidth: 0 };
}

/** Pushes overlapping boxes apart along whichever axis they overlap LEAST,
 * which is what preserves the author's intent: two objects the author put
 * side by side separate horizontally and stay side by side, rather than one
 * being ejected vertically into a region that means something else.
 *
 * Runs to convergence (or an iteration ceiling) rather than a fixed small
 * number of passes — a fixed pass count silently leaves overlaps in dense
 * compositions, which is precisely the class of bug this medium exists to make
 * unrepresentable rather than merely unlikely. */
function separate(boxes: StageBox[], gutter: number, bounds: { x: number; y: number; width: number; height: number }): void {
  const movable = boxes.filter((b) => !b.hidden);
  for (let iteration = 0; iteration < 240; iteration++) {
    let moved = false;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i];
        const b = movable[j];
        // Footprint, not silhouette: a narrow phone with a long caption under
        // it occupies the caption's width too, and ignoring that is how three
        // objects ended up with their labels stacked on top of each other.
        const aw = Math.max(a.width, a.captionWidth);
        const bw = Math.max(b.width, b.captionWidth);
        const ah = a.height + a.captionHeight;
        const bh = b.height + b.captionHeight;
        const overlapX = (aw + bw) / 2 + gutter - Math.abs(a.x - b.x);
        const overlapY = (ah + bh) / 2 + gutter - Math.abs(a.y - b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        if (overlapX < overlapY) {
          const push = (overlapX / 2) * (a.x <= b.x ? -1 : 1);
          a.x += push;
          b.x -= push;
        } else {
          const push = (overlapY / 2) * (a.y <= b.y ? -1 : 1);
          a.y += push;
          b.y -= push;
        }
      }
    }
    // Clamp inside the loop, not after it: clamping once at the end can shove a
    // box back into the neighbour it was just separated from.
    for (const box of movable) {
      const w = Math.max(box.width, box.captionWidth);
      const h = box.height + box.captionHeight;
      box.x = Math.min(Math.max(box.x, bounds.x + w / 2), bounds.x + bounds.width - w / 2);
      box.y = Math.min(Math.max(box.y, bounds.y + h / 2), bounds.y + bounds.height - h / 2 + box.captionHeight / 2);
    }
    if (!moved) break;
  }
}

/** Where a ray from a box's centre toward `toward` leaves the box. This is what
 * makes a connector start ON the silhouette instead of underneath it. */
function boundaryPoint(box: { x: number; y: number; width: number; height: number }, toward: { x: number; y: number }): { x: number; y: number } {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const scale = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: box.x + dx * scale, y: box.y + dy * scale };
}

/** Routes every edge boundary-to-boundary, fanning multiple edges out across
 * each object's face.
 *
 * The fan matters: routing each edge in isolation collapses N connectors
 * between the same two regions into one overlapping bracket that reads as a
 * single thick line, which is a real bug this codebase has already hit once on
 * the diagram side. Each edge is offset perpendicular to its own run by its
 * index among the edges sharing that object, so N edges read as N. */
export function routeStageEdges(boxes: StageBox[], edges: StageEdgeInput[], unit: number): StageRoutedEdge[] {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const incident = new Map<string, StageEdgeInput[]>();
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id)!.push(edge);
    }
  }

  const spread = unit * 0.055;
  const routed: StageRoutedEdge[] = [];

  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    // Unit normal to the run — the direction ports fan along.
    const nx = -dy / length;
    const ny = dx / length;

    const fanOffset = (id: string): number => {
      const siblings = incident.get(id) ?? [];
      const index = siblings.indexOf(edge);
      const count = siblings.length;
      if (count <= 1) return 0;
      return (index - (count - 1) / 2) * spread;
    };

    const offsetA = fanOffset(edge.from);
    const offsetB = fanOffset(edge.to);

    // Aim each endpoint at the OTHER box's already-offset port, so a fanned
    // connector still points where it visually lands rather than skewing.
    const aimForA = { x: b.x + nx * offsetB, y: b.y + ny * offsetB };
    const aimForB = { x: a.x + nx * offsetA, y: a.y + ny * offsetA };
    const start = boundaryPoint(a, aimForA);
    const end = boundaryPoint(b, aimForB);

    const p0 = { x: start.x + nx * offsetA, y: start.y + ny * offsetA };
    const p1 = { x: end.x + nx * offsetB, y: end.y + ny * offsetB };
    // Routes run STRAIGHT. Bowed connectors were tried and rejected: they read
    // as decorative swoops rather than as wiring, and they made a technical
    // diagram look softer and less precise, not less generic. The control point
    // stays the exact midpoint so the bezier degenerates to a straight line —
    // keeping one path evaluator for both the drawn route and the packet
    // travelling it, which is what guarantees a packet can never drift off its
    // own line.
    const bow = 0;
    routed.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      style: edge.style ?? "solid",
      kind: edge.kind ?? "request",
      points: [p0, p1],
      control: { x: (p0.x + p1.x) / 2 + nx * bow, y: (p0.y + p1.y) / 2 + ny * bow },
    });
  }

  return routed;
}

/** `full` is a POSTER composition — the system runs nearly edge to edge and
 * fills the frame. That is the default register for a Short, and it is the
 * correction to this project's long-standing "diagram floating in a centred
 * rectangle" formula: reserving a wide inset on all four sides is what made
 * every scene read as an illustration ABOUT a system rather than the system
 * itself. `inset` keeps generous margins, for a scene where a large headline or
 * a caption has to share the frame.
 *
 * Both still reserve the bottom band in portrait — that is where the word
 * captions live, and an object under a caption is simply unreadable. Full-bleed
 * means using the WIDTH and the vertical space above the captions, never
 * running the system underneath them. */
export function defaultSafeArea(
  frame: { width: number; height: number },
  composition: "full" | "inset" = "full",
): { x: number; y: number; width: number; height: number } {
  const portrait = frame.height > frame.width;
  const full = composition === "full";
  const top = frame.height * (portrait ? (full ? 0.075 : 0.14) : full ? 0.06 : 0.12);
  const bottom = frame.height * (portrait ? (full ? 0.17 : 0.2) : full ? 0.07 : 0.12);
  const side = frame.width * (portrait ? (full ? 0.03 : 0.06) : full ? 0.035 : 0.07);
  return { x: side, y: top, width: frame.width - side * 2, height: frame.height - top - bottom };
}

/** Lays the stage out for ONE composition. Pure: same inputs, same geometry,
 * every time — which is what lets the renderer compute two compositions and
 * tween between them without anything drifting. */
/** Divides a safe area into the two pane areas of a split stage. */
export function paneAreas(
  safe: { x: number; y: number; width: number; height: number },
  orientation: "vertical" | "horizontal",
): { a: typeof safe; b: typeof safe } {
  // A gutter down the middle, so the two systems read as separate worlds rather
  // than one crowded one. The divider is drawn in that gutter.
  const gutter = orientation === "vertical" ? safe.width * 0.05 : safe.height * 0.06;
  if (orientation === "vertical") {
    const half = (safe.width - gutter) / 2;
    return {
      a: { ...safe, width: half },
      b: { ...safe, x: safe.x + half + gutter, width: half },
    };
  }
  const half = (safe.height - gutter) / 2;
  return {
    a: { ...safe, height: half },
    b: { ...safe, y: safe.y + half + gutter, height: half },
  };
}

export function layoutStage(
  objects: StageObjectInput[],
  edges: StageEdgeInput[],
  composition: StageComposition,
  options: StageLayoutOptions,
): StageLayout {
  const { frame } = options;

  // A SPLIT stage is two independent layouts, not one layout with a line drawn
  // down it. Running the same engine twice is what guarantees the two halves
  // are directly comparable — same sizing rules, same separation, same fill —
  // which is the entire point of putting them side by side.
  if (options.split) {
    const safeAll = options.safeArea ?? defaultSafeArea(frame);
    const areas = paneAreas(safeAll, options.split.orientation);
    const inPane = (pane: StagePane) => objects.filter((o) => (o.pane ?? "a") === pane);
    const paneOf = (pane: StagePane) =>
      layoutStage(inPane(pane), edges, composition, {
        ...options,
        split: undefined,
        frame: stagePaneFrame(frame, options.split!.orientation),
        safeArea: areas[pane],
      });
    const a = paneOf("a");
    const b = paneOf("b");
    return { boxes: [...a.boxes, ...b.boxes], edges: [...a.edges, ...b.edges] };
  }

  const unit = unitOf(frame);
  const safe = options.safeArea ?? defaultSafeArea(frame);
  const hidden = new Set(composition.hidden ?? []);

  const boxes: StageBox[] = objects.map((object) => {
    const region = composition.place?.[object.id] ?? object.at;
    const emphasis = composition.emphasis?.[object.id] ?? object.emphasis ?? "normal";
    const anchor = REGION_ANCHORS[region] ?? REGION_ANCHORS.center;
    // AN APPLICATION IS THE ENVIRONMENT, so it fills the safe area exactly
    // rather than being sized like an object and scaled by emphasis. Sized the
    // ordinary way it overflowed the frame at `lead` and left the shell cut off
    // at both edges — and an environment cannot be emphasised against itself.
    const sized =
      object.kind === "app" && object.app
        ? {
            // As tall as its content needs, never taller than the frame. An
            // environment owns the width; letting it own the height as well
            // left products floating in half a screen of nothing.
            width: safe.width,
            height: Math.min(safe.height, Math.max(unit * 0.5, appContentHeight(object.app, Math.max(22, unit * 0.026)))),
            captionBelow: false,
            captionHeight: 0,
            captionWidth: 0,
          }
        : object.kind === "app" || object.kind === "context"
          ? { width: safe.width, height: safe.height, captionBelow: false, captionHeight: 0, captionWidth: 0 }
          : sizeOf(object, emphasis, unit);
    return {
      id: object.id,
      kind: object.kind,
      label: object.label,
      sublabel: object.sublabel,
      accent: object.accent ?? "neutral",
      emphasis,
      replicas: Math.max(1, object.replicas ?? 1),
      pane: object.pane,
      ui: object.ui,
      code: object.code,
      states: object.states,
      parentId: object.parent,
      isContainer: CONTAINER_KINDS.includes(object.kind),
      brand: object.brand,
      logoPath: object.logoPath,
      qrPath: object.qrPath,
      hex: object.hex,
      app: object.app,
      context: object.context,
      logoHex: object.logoHex,
      logoMonochrome: object.logoMonochrome,
      hidden: hidden.has(object.id),
      x: object.kind === "app" || object.kind === "context" ? safe.x + safe.width / 2 : safe.x + safe.width * anchor.fx,
      y: object.kind === "app" || object.kind === "context" ? safe.y + safe.height / 2 : safe.y + safe.height * anchor.fy,
      width: sized.width,
      height: sized.height,
      captionBelow: sized.captionBelow,
      captionHeight: sized.captionHeight,
      captionWidth: sized.captionWidth,
      homeRegion: region,
      surface: object.surface,
      series: object.series,
      tabs: object.tabs,
      workloads: object.workloads,
      capacity: object.capacity,
      regions: object.regions,
      frame: object.frame,
      dir: object.dir,
      attachTo: object.attachTo,
    };
  });

  // Objects sharing a region are pre-spread along the frame's LONG axis before
  // separation runs, so they land as a deliberate stack rather than wherever
  // the separation pass happens to eject them.
  const portrait = frame.height > frame.width;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const childrenOf = new Map<string, StageBox[]>();
  for (const box of boxes) {
    if (!box.parentId || !byId.has(box.parentId)) continue;
    if (!childrenOf.has(box.parentId)) childrenOf.set(box.parentId, []);
    childrenOf.get(box.parentId)!.push(box);
  }

  // A container is sized from its children BEFORE anything is placed, exactly
  // like the diagram medium's bottom-up sizing — that is what guarantees a
  // child can never overflow the region it is declared to live in.
  for (const [parentId, kids] of childrenOf) {
    const parent = byId.get(parentId)!;
    const padding = unit * 0.035;
    const header = unit * 0.055;
    const inner = unit * 0.022;
    const acrossRow = Math.min(kids.length, kids.length > 3 ? 2 : kids.length);
    const rows = Math.ceil(kids.length / acrossRow);
    const cellW = Math.max(...kids.map((k) => k.width));
    const cellH = Math.max(...kids.map((k) => k.height));
    parent.width = Math.max(parent.width, acrossRow * cellW + (acrossRow - 1) * inner + padding * 2);
    parent.height = Math.max(parent.height, rows * cellH + (rows - 1) * inner + padding * 2 + header);
    // Growing to fit the children must never grow PAST THE FRAME. A container
    // at `lead` emphasis is already scaled up, and adding child-driven width on
    // top of that pushed a map off both edges of a portrait canvas with its own
    // title clipped in half. The safe area is the hard ceiling; if the children
    // genuinely do not fit inside it they get scaled down to, not the container
    // scaled up past it.
    // Not merely inside the safe area — visibly inside it. A container sized
    // to the safe area exactly runs to within a hair of the canvas edge, and
    // with its own content drawn right up to its border it reads as a frame
    // that has been cut off rather than one that fits. Leaving a real margin is
    // the difference between "large" and "overflowing".
    const CONTAINER_MAX_FRACTION = 0.9;
    parent.width = Math.min(parent.width, safe.width * CONTAINER_MAX_FRACTION);
    parent.height = Math.min(parent.height, safe.height * CONTAINER_MAX_FRACTION);
  }

  // Only top-level objects compete for regions; children ride their parent.
  const byRegion = new Map<string, StageBox[]>();
  boxes.forEach((box, index) => {
    if (box.parentId && byId.has(box.parentId)) return;
    if (isDerivedVector(box)) return;
    const region = composition.place?.[objects[index].id] ?? objects[index].at;
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(box);
  });
  const gutter = unit * 0.045;
  for (const group of byRegion.values()) {
    if (group.length < 2) continue;
    const visible = group.filter((b) => !b.hidden);
    if (visible.length < 2) continue;
    const extent = visible.reduce((sum, b) => sum + (portrait ? b.height : b.width) + gutter, -gutter);
    let cursor = -extent / 2;
    for (const box of visible) {
      const size = portrait ? box.height : box.width;
      if (portrait) box.y += cursor + size / 2;
      else box.x += cursor + size / 2;
      cursor += size + gutter;
    }
  }

  // Separation and fitting act on TOP-LEVEL boxes only; children are placed
  // relative to their parent afterwards, so a nested object cannot be shoved
  // out of the container it belongs to.
  const topLevel = boxes.filter((b) => !b.parentId || !byId.has(b.parentId));
  packRows(topLevel, gutter, safe);
  separate(topLevel.filter((b) => !isDerivedVector(b)), gutter, safe);
  fitToSafeArea(topLevel, safe);
  placeChildren(childrenOf, byId, unit);

  return { boxes, edges: routeStageEdges(boxes, edges, unit) };
}


/** Ceiling on how far a sparse stage may be magnified to fill the frame.
 * Uncapped, a two-object scene inflates until each box is a huge empty
 * rectangle with a small label floating in it — worse than honest whitespace,
 * and the exact failure the diagram engine already learned the hard way. The
 * fix for a thin scene is more demonstration, not a bigger box. */
/** Scaled by how much is actually on stage.
 *
 * A flat cap cannot serve both cases. Set low, a three-object composition
 * strands in the middle of a 16:9 frame with dead space either side; set high,
 * a SINGLE object inflates into a huge empty rectangle with a small label
 * floating in it — and it also erases the headroom a camera push-in needs,
 * because content that already fills the frame cannot be zoomed into without
 * cropping. Sparse scenes therefore stay modest and busy ones are allowed to
 * fill: the fix for a thin scene is more demonstration, not a bigger box. */
function maxFillScale(visibleCount: number): number {
  if (visibleCount <= 1) return 1.45;
  if (visibleCount === 2) return 1.85;
  return 2.2;
}
/** Below this much of the safe area used, the composition reads as stranded in
 * the middle of the frame with dead space around it. */
const FILL_TARGET = 0.94;

/** Scales and re-centres the whole composition to actually FILL the frame.
 *
 * Without this the region anchors alone decide the extent, so a scene whose
 * objects all sit in the middle band leaves the top and bottom of a 9:16 frame
 * empty — a small diagram stranded in a large black rectangle, which is the
 * single most persistent complaint against this project's output. Scaling the
 * whole composition uniformly (rather than nudging objects outward) preserves
 * every spatial relationship the author expressed: what was left of something
 * stays left of it, just bigger.
 *
 * Runs AFTER separation, so it can never reintroduce an overlap — a uniform
 * scale about a common origin preserves the sign of every gap, and gaps only
 * grow when the scale is >= 1. */

/** Which horizontal band a region belongs to. Regions carry both a row and a
 * column; only the row matters for vertical packing. */
const REGION_ROW: Record<string, number> = {
  top: 0,
  "top-left": 0,
  "top-right": 0,
  left: 1,
  center: 1,
  right: 1,
  bottom: 2,
  "bottom-left": 2,
  "bottom-right": 2,
};

/** Collapses the dead space BETWEEN rows before the frame is filled.
 *
 * Region anchors are absolute fractions of the safe area — `top` is 10% down,
 * `bottom` is 90% down — so any scene using both already spans nearly the whole
 * height no matter how small its objects are. `fitToSafeArea` then measures that
 * full-height bounding box, concludes the composition already fills the frame,
 * and scales by 1. The result is the failure this engine kept producing: two or
 * three small cards stranded in a column with enormous voids between them, which
 * reads as a broken render rather than as a composition.
 *
 * The emptiness is INTERIOR — between the rows — so no amount of scaling the
 * outer box can reach it. It has to be removed before the fit runs. Rows are
 * packed against each other with a single gutter and centred; the fit step then
 * has real room to grow into and the objects come out large.
 *
 * Only vertical: horizontal arrangement within a row is a relationship the
 * author expressed (this is left of that) and must survive untouched. */
/** A vector bound to a host is DERIVED geometry: the renderer recomputes where
 * it sits from its host's position and its own reference frame every frame. Its
 * laid-out coordinates are therefore meaningless, and letting them take part in
 * placement is actively harmful — it would claim a region of its own, shove the
 * object it describes out of the way, and stretch the bounding box the fill
 * step measures. It still has to be SCALED with everything else, so it is
 * excluded from placement decisions rather than from the layout. */
function isDerivedVector(box: StageBox): boolean {
  return box.kind === "vector" && !!box.attachTo;
}

/** Where a box actually OCCUPIES space, which for a derived vector is not where
 * it was laid out.
 *
 * The renderer positions a bound vector from its host and its reference frame
 * every frame, so its laid-out coordinates are a placeholder. Anything that
 * measures the composition — the fill step, and the camera that auto-frames on
 * it — has to use the real extent instead, or they disagree with the renderer:
 * the camera once re-centred a scene on the placeholder position and pushed the
 * arrow it was supposed to be framing clean off the canvas.
 *
 * A world-framed vector holds a fixed bearing, so its extent is exact. A
 * body-framed one turns with its host and can end up anywhere on the circle it
 * sweeps, so the whole circle is the only honest bound. */
export function boxExtent(
  box: StageBox,
  byId: Map<string, StageBox>,
  includeCaption = false,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const capW = includeCaption ? Math.max(box.width, box.captionWidth) : box.width;
  const capH = includeCaption ? box.captionHeight : 0;
  if (!isDerivedVector(box)) {
    return {
      minX: box.x - capW / 2,
      maxX: box.x + capW / 2,
      minY: box.y - box.height / 2,
      maxY: box.y + box.height / 2 + capH,
    };
  }
  const host = byId.get(box.attachTo!);
  if (!host) return { minX: box.x, maxX: box.x, minY: box.y, maxY: box.y };
  // Matches what the renderer actually draws: the arrow's centre sits half its
  // own height beyond the host's edge, and it extends another half-height to
  // its tip. Under-reserving here is what let a caption get clamped back onto
  // the arrowhead it was naming.
  const reach = Math.max(host.width, host.height) / 2 + box.height;
  // A caption past the tip needs BOTH its half-width along the direction and a
  // line of height clear of the arrowhead.
  const padX = includeCaption ? box.captionWidth / 2 + box.captionHeight : 0;
  const padY = includeCaption ? box.captionHeight * 1.6 : 0;
  if (box.frame !== "body") {
    const a = ((box.dir ?? 0) - 90) * (Math.PI / 180);
    const tipX = host.x + Math.cos(a) * (reach + padX);
    const tipY = host.y + Math.sin(a) * (reach + padY);
    return {
      minX: Math.min(host.x, tipX),
      maxX: Math.max(host.x, tipX),
      minY: Math.min(host.y, tipY),
      maxY: Math.max(host.y, tipY),
    };
  }
  const r = reach + Math.max(padX, padY);
  return { minX: host.x - r, maxX: host.x + r, minY: host.y - r, maxY: host.y + r };
}

function packRows(boxes: StageBox[], gutter: number, safe: { y: number; height: number }): void {
  const visible = boxes.filter((b) => !b.hidden && !isDerivedVector(b));
  if (visible.length < 2) return;

  const rows = new Map<number, StageBox[]>();
  for (const box of visible) {
    const row = REGION_ROW[box.homeRegion] ?? 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(box);
  }
  // One row has no gaps to close, and packing it would only re-centre a
  // composition the author may have deliberately placed high or low.
  if (rows.size < 2) return;

  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  // A row is as tall as its tallest member, caption included — the caption is
  // part of the footprint, and ignoring it is what let labels collide with the
  // row beneath.
  const heights = ordered.map(([, group]) => Math.max(...group.map((b) => b.height + b.captionHeight)));
  const total = heights.reduce((sum, h) => sum + h, 0) + gutter * (ordered.length - 1);

  let cursor = safe.y + (safe.height - total) / 2;
  ordered.forEach(([, group], index) => {
    const rowHeight = heights[index];
    const centre = cursor + rowHeight / 2;
    for (const box of group) {
      // Centred on the row by the SHAPE, not by the shape-plus-caption, so a
      // captioned object and an uncaptioned one in the same row still line up
      // along their silhouettes the way the eye expects.
      box.y = centre - box.captionHeight / 2;
    }
    cursor += rowHeight + gutter;
  });
}

function fitToSafeArea(boxes: StageBox[], safe: { x: number; y: number; width: number; height: number }): void {
  const visible = boxes.filter((b) => !b.hidden);
  if (visible.length === 0) return;

  // A derived vector has no meaningful laid-out position — the renderer works
  // out where it sits from its host and its frame every frame — but it is still
  // drawn, so it still has to be IN SHOT. And because a body-framed vector
  // swings all the way round its host as that host turns, the only bound that
  // holds for every frame is the whole circle it can sweep. Measuring its
  // authored coordinates instead would fit a composition that is correct on
  // frame one and hangs off the edge by frame sixty.
  const byIdLocal = new Map(boxes.map((b) => [b.id, b]));
  const bounds = visible.map((b) => boxExtent(b, byIdLocal, true));
  const minX = Math.min(...bounds.map((b) => b.minX));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const minY = Math.min(...bounds.map((b) => b.minY));
  const maxY = Math.max(...bounds.map((b) => b.maxY));
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW <= 0 || contentH <= 0) return;

  const scale = Math.min(maxFillScale(visible.length), (safe.width * FILL_TARGET) / contentW, (safe.height * FILL_TARGET) / contentH);
  // Normally only ever grow: `separate` has already guaranteed the placed boxes
  // fit, so a scale below 1 would just shrink type for no reason.
  //
  // DERIVED VECTORS BREAK THAT GUARANTEE. They are positioned by the renderer
  // from their host rather than by `separate`, so they can legitimately reach
  // outside the safe area — and the "only grow" rule then left an arrowhead and
  // its label hanging off the edge with nothing able to pull them back. When
  // the content genuinely does not fit, shrinking is the correct answer, with a
  // floor so a busy scene degrades into smaller type rather than nothing.
  const hasDerived = boxes.some(isDerivedVector);
  const applied = hasDerived ? Math.max(0.62, scale) : Math.max(1, scale);

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const targetX = safe.x + safe.width / 2;
  const targetY = safe.y + safe.height / 2;

  for (const box of boxes) {
    box.x = targetX + (box.x - centreX) * applied;
    box.y = targetY + (box.y - centreY) * applied;
    box.width *= applied;
    box.height *= applied;
    box.captionHeight *= applied;
    box.captionWidth *= applied;
  }

  // Final containment pass. The scale is chosen to fit, but a HIDDEN box can
  // sit outside the visible bbox and would otherwise be flung further out.
  for (const box of boxes) {
    // SIZE before position. A box wider than the safe area makes the clamp
    // below meaningless — its lower bound lands to the RIGHT of its upper
    // bound, so `min(max(...))` returns whichever nonsense the inverted range
    // yields and the box keeps its oversized width regardless. Anything drawn
    // from that width then runs off the canvas: a phrase's underline rule
    // spanned the entire frame this way. Nothing may be larger than the space
    // it has to live in.
    box.width = Math.min(box.width, safe.width);
    box.height = Math.min(box.height, safe.height);
    box.captionWidth = Math.min(box.captionWidth, safe.width);
    box.x = Math.min(Math.max(box.x, safe.x + box.width / 2), safe.x + safe.width - box.width / 2);
    box.y = Math.min(Math.max(box.y, safe.y + box.height / 2), safe.y + safe.height - box.height / 2);
  }
}

/** The tightest bounding box around everything currently on stage. The camera
 * uses it to guarantee it never frames live content out of shot. */
export function contentBounds(boxes: StageBox[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const visible = boxes.filter((b) => !b.hidden);
  if (visible.length === 0) return null;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const extents = visible.map((b) => boxExtent(b, byId));
  return {
    minX: Math.min(...extents.map((e) => e.minX)),
    maxX: Math.max(...extents.map((e) => e.maxX)),
    minY: Math.min(...extents.map((e) => e.minY)),
    maxY: Math.max(...extents.map((e) => e.maxY)),
  };
}

/** Resolves a requested camera into one that CANNOT crop live content.
 *
 * A push-in that pushes a still-relevant object out of shot is not a camera
 * move, it is a bug — the standing rule is never to zoom while other relevant
 * objects are elsewhere in the frame. So the requested zoom is capped at
 * whatever still contains everything visible, and the focus point is clamped
 * so the viewport stays over the content. An author who genuinely wants a
 * tight close-up gets one by first clearing the stage (`compose` with
 * `hidden`, or `exit`), which is the honest way to say "nothing else matters
 * right now". */
export function resolveCamera(
  boxes: StageBox[],
  focus: { x: number; y: number },
  requestedZoom: number,
  frame: { width: number; height: number },
): { x: number; y: number; zoom: number } {
  const bounds = contentBounds(boxes);
  if (!bounds) return { x: focus.x, y: focus.y, zoom: requestedZoom };

  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  // A little breathing room so a box does not graze the edge of frame.
  const margin = 1.04;
  const maxZoom = Math.min(frame.width / (contentW * margin), frame.height / (contentH * margin));
  const zoom = Math.max(0.6, Math.min(requestedZoom, Math.max(1, maxZoom)));

  const halfW = frame.width / (2 * zoom);
  const halfH = frame.height / (2 * zoom);
  const clamp = (value: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(value, lo), hi));

  return {
    x: clamp(focus.x, bounds.minX + halfW, bounds.maxX - halfW),
    y: clamp(focus.y, bounds.minY + halfH, bounds.maxY - halfH),
    zoom,
  };
}

/** Packs each container's children inside it, in reading order. Runs after the
 * containers themselves have been placed and scaled, so children inherit their
 * parent's final position and the fit-to-frame scale without a second pass. */
function placeChildren(childrenOf: Map<string, StageBox[]>, byId: Map<string, StageBox>, unit: number): void {
  for (const [parentId, kids] of childrenOf) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const padding = parent.width * 0.06;
    const header = parent.height * 0.2;
    const inner = unit * 0.018;

    // If the children declared DIFFERENT regions, they are describing a spatial
    // arrangement inside their parent and it has to survive. Three pins on a
    // map at top-left, centre and bottom-right mean three places in a city;
    // grid-packing them put all three in a neat row, which says the opposite —
    // the whole point of that scene is that the visits are scattered.
    const distinct = new Set(kids.map((k) => k.homeRegion));
    if (distinct.size > 1) {
      const innerX = parent.x - parent.width / 2 + padding;
      const innerY = parent.y - parent.height / 2 + padding + header;
      const innerW = parent.width - padding * 2;
      const innerH = parent.height - padding * 2 - header;
      // Cap a nested child so it cannot swallow the region it lives in.
      const maxW = innerW * 0.42;
      const maxH = innerH * 0.42;
      const seen = new Map<StageRegion, number>();
      for (const kid of kids) {
        const anchor = REGION_ANCHORS[kid.homeRegion] ?? REGION_ANCHORS.center;
        kid.width = Math.min(kid.width, maxW);
        kid.height = Math.min(kid.height, maxH);
        // Two children genuinely sharing a region still must not stack.
        const n = seen.get(kid.homeRegion) ?? 0;
        seen.set(kid.homeRegion, n + 1);
        const nudge = n === 0 ? 0 : (n % 2 === 1 ? 1 : -1) * Math.ceil(n / 2) * (kid.width + inner);
        const cx = innerX + innerW * anchor.fx + nudge;
        const cy = innerY + innerH * anchor.fy;
        // Never outside the parent, whatever the anchor and nudge worked out to.
        kid.x = Math.max(innerX + kid.width / 2, Math.min(innerX + innerW - kid.width / 2, cx));
        kid.y = Math.max(innerY + kid.height / 2, Math.min(innerY + innerH - kid.height / 2, cy));
      }
      continue;
    }

    const acrossRow = Math.min(kids.length, kids.length > 3 ? 2 : kids.length);
    const rows = Math.ceil(kids.length / acrossRow);

    const availW = parent.width - padding * 2;
    const availH = parent.height - padding * 2 - header;
    const cellW = (availW - (acrossRow - 1) * inner) / acrossRow;
    const cellH = (availH - (rows - 1) * inner) / rows;

    kids.forEach((kid, index) => {
      const col = index % acrossRow;
      const row = Math.floor(index / acrossRow);
      // Shrink to the cell rather than overflowing it. A child that does not
      // fit its region is a layout failure, not something to let spill.
      kid.width = Math.min(kid.width, cellW);
      kid.height = Math.min(kid.height, cellH);
      kid.x = parent.x - parent.width / 2 + padding + col * (cellW + inner) + cellW / 2;
      kid.y = parent.y - parent.height / 2 + padding + header + row * (cellH + inner) + cellH / 2;
    });
  }
}

/** Position along a routed edge at parameter `t` (0-1) — how a travelling
 * packet knows where it is. It follows the REAL connector rather than an
 * author-guessed tween, so it can never drift off the line or stop inside a
 * box. */
export function pointOnStageEdge(edge: StageRoutedEdge, t: number): { x: number; y: number } {
  const pts = edge.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const u = Math.max(0, Math.min(1, t));
  // Evaluates the SAME quadratic bezier the renderer draws, so a packet can
  // never drift off its own route — the failure mode whenever a travelling
  // token is tweened independently of the curve underneath it.
  const [p0, p1] = pts;
  const c = edge.control ?? { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const inv = 1 - u;
  return {
    x: inv * inv * p0.x + 2 * inv * u * c.x + u * u * p1.x,
    y: inv * inv * p0.y + 2 * inv * u * c.y + u * u * p1.y,
  };
}

/** Tangent direction at `t` — what points a packet along its own curve and
 * aims the comet trail behind it. */
export function tangentOnStageEdge(edge: StageRoutedEdge, t: number): { x: number; y: number } {
  const [p0, p1] = edge.points;
  const c = edge.control ?? { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const u = Math.max(0, Math.min(1, t));
  const dx = 2 * (1 - u) * (c.x - p0.x) + 2 * u * (p1.x - c.x);
  const dy = 2 * (1 - u) * (c.y - p0.y) + 2 * u * (p1.y - c.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Linear blend between two layouts of the SAME object set. The renderer calls
 * this per frame with the eased progress between consecutive compositions —
 * boxes tween, then connectors are re-routed FROM the tweened boxes rather than
 * being tweened themselves. Routing the tween (instead of tweening the route)
 * is what keeps a connector glued to both silhouettes for the whole move; a
 * tweened polyline detaches from its own endpoints mid-flight. */
export function blendLayouts(from: StageLayout, to: StageLayout, t: number, edges: StageEdgeInput[], unit: number): StageLayout {
  // Exact at the endpoints, not merely close. `a + (b - a) * 1` is not
  // guaranteed to be `b` in floating point, and a layout that lands a fraction
  // of a pixel off its own keyframe means a "settled" stage keeps re-routing
  // its connectors every frame. Short-circuiting also skips the whole blend on
  // static frames, which is most of them.
  if (t <= 0) return from;
  if (t >= 1) return to;
  const clamped = Math.max(0, Math.min(1, t));
  const toById = new Map(to.boxes.map((b) => [b.id, b]));
  const boxes: StageBox[] = from.boxes.map((a) => {
    const b = toById.get(a.id);
    if (!b) return a;
    return {
      ...b,
      x: a.x + (b.x - a.x) * clamped,
      y: a.y + (b.y - a.y) * clamped,
      width: a.width + (b.width - a.width) * clamped,
      height: a.height + (b.height - a.height) * clamped,
      // Hidden is a discrete state, not a tweenable one — an object is present
      // for the whole move if it is present at EITHER end, so it visibly
      // travels in or out rather than popping at the boundary.
      hidden: a.hidden && b.hidden,
    };
  });
  return { boxes, edges: routeStageEdges(boxes, edges, unit) };
}
