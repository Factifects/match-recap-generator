import type { TimelineNode, CanvasAction } from "./timelineIR";

// The reusable SEMANTIC BEHAVIOR layer for composeMechanism.ts — what
// happens (a payload traveling, a state changing, a connection opening),
// entirely separate from WHERE it happens (composeMechanism.ts's own DAG
// layout) or WHAT PARTICIPATES (composeMechanism.ts's entity resolution).
// Each function here takes already-resolved positions/colors and a step's
// own data, and returns a self-contained {objects, timeline} fragment built
// on timelineIR.ts's proven sequence/parallel/delay primitives — the same
// composition discipline composeSelect.ts and composeContinuous.ts already
// used, generalized here to work for ANY technical mechanism rather than
// one specific scene shape.
//
// A step's own object ids are namespaced by the caller's `instanceId` (its
// index in the contract's step list) so the same behavior can run twice in
// one scene (e.g. two `send`s between the same two entities) without id
// collisions — this module has no notion of "which step number is this,"
// it just needs a unique seed.
//
// Every position this module computes (an object's own coordinates, or a
// `move` action's travel target) is clamped into [2, 98] before use —
// deliberately NOT relying on composeMechanism.ts's layout to leave
// exactly enough headroom above/below every entity for whatever content
// this module decides to float there. A real bug (confirmed via an actual
// render AND a schema-validation regression test) came from exactly that
// coupling: a layout tight enough to keep several stacked entities from
// overlapping EACH OTHER left one payload's own arrival offset computing
// to a negative y — individually reasonable layout math, individually
// reasonable offset math, but no single guarantee that the two combined
// always stay on-canvas. Clamping at the point of use is the actual
// guarantee: layout only has to guarantee entities don't overlap (a
// achievable, self-contained property), and this module only has to
// guarantee ITS OWN coordinates are always valid (equally self-contained)
// — neither has to reason about the other's constraints to be correct.
function clampY(y: number): number {
  return Math.min(98, Math.max(2, y));
}

export interface FlowObject {
  id: string;
  type: "dot" | "icon" | "label" | "line" | "roundedRectangle";
  x: number;
  y: number;
  label?: string;
  color?: string;
  icon?: string;
  radius?: number;
  width?: number;
  height?: number;
  filled?: boolean;
  rotation?: number;
  enter?: "scale" | "slideRight" | "fade";
  opacity?: number;
  idle?: "none" | "glow" | "pulse" | "spin" | "drift";
  fontStyle?: "default" | "detail";
  draw?: boolean;
}

// Any piece of real, variable-length content (a payload, a SQL query, a
// state description) renders inside its own small container — a
// `roundedRectangle` with its own fitted/wrapped label — rather than as bare
// floating text. A real render showed why: a long payload string ("SELECT *
// FROM users WHERE id=42") has no fixed size, and bare text of unpredictable
// width risks clashing with whatever else sits nearby. A container gives
// every one of these a consistent visual treatment regardless of length,
// and Canvas.tsx's roundedRectangle already auto-fits/wraps its own label
// text to the given width — the same primitive TreemapCard/PackedCirclesCard
// use for exactly this.
//
// Sized from Canvas.tsx's OWN rectangle-label math, not the generic
// `estimateLabelHalfWidthPercent` (that estimate is calibrated for a
// completely different render path — bare `label`-type text at 46px — and
// reusing it here first produced a badly wrong box: too narrow in real
// pixels for its own text to fit on one line at Canvas.tsx's fixed 36px
// rectangle-label font, so a short 14-character payload wrapped into an
// awkward, lopsided 2-line break inside a box that still LOOKED oversized).
// Canvas.tsx renders a rectangle's label via `wrapLabel(label, 36, w*0.9)`
// where `w = (width/100) * canvasWidth(1400) * SIZE_SCALE(0.84)` — working
// that back the other way gives the width (in our percent-of-canvas units)
// that lets `charCount` characters actually fit on ONE line at 36px:
// `percentWidth >= charCount * (36 * AVG_CHAR_WIDTH_RATIO) / (0.9 * 1400 * 0.84)`.
const RECT_LABEL_FONT_PX = 36;
const AVG_CHAR_WIDTH_RATIO = 0.72;
const CANVAS_WIDTH_PX = 1400;
const RECT_SIZE_SCALE = 0.84;
// `width` is authored on a 0-100 (percent) scale, but canvasWidth/SIZE_SCALE
// are raw pixels — the conversion needs an explicit *100 to go from "px
// needed per character" to "percent-of-canvas needed per character". The
// first version of this omitted that *100, undershooting the real box width
// by 100x: confirmed via a real render as short text ("caching result")
// getting force-wrapped onto 2 lines at full 36px font inside a box far too
// short to hold them, spilling both above and below the container.
const PERCENT_WIDTH_PER_CHAR = (RECT_LABEL_FONT_PX * AVG_CHAR_WIDTH_RATIO * 100) / (0.9 * CANVAS_WIDTH_PX * RECT_SIZE_SCALE);
const CONTAINER_MIN_WIDTH = 10;
// Above this, a long payload (e.g. a full SQL query) is left to Canvas.tsx's
// own font-shrink fallback (wrapLabel falls back to a single, smaller,
// letter-spacing-compressed line once even a 2-line wrap can't fit) rather
// than growing the box to swallow the whole frame. Kept comfortably BELOW
// typical entity spacing (confirmed via a real render: at 38, two
// containers — one mid-travel between two entities only ~28 apart, one
// freshly popped at the far entity — were individually well clear of any
// entity but still wide enough to overlap EACH OTHER horizontally, since
// their combined half-widths exceeded the entities' own real distance
// apart). This isn't a Y-axis clearance problem like the earlier ones —
// it's that a container's real width was never checked against how much
// horizontal room actually exists between the two entities it travels
// between.
export const CONTAINER_MAX_WIDTH = 22;
// A FIXED height (whatever text, whatever width) was the root of two
// separate real bugs: too tall for genuinely single-line text (wasted
// space, and made columns feel more cramped than they needed to be), and
// too SHORT the moment text that fit within a narrower `containerWidth`
// forced a real 2-line wrap (confirmed twice via real renders: "caching
// result" and later "join #general" both spilling text above/below their
// box once they wrapped). Sizing height from whether the text ACTUALLY
// wraps — using the same wrap logic Canvas.tsx's own `wrapLabel` uses,
// not a guess — is what actually closes this class of bug for any future
// text length, not just the specific strings that happened to break so far.
const CONTAINER_HEIGHT_1LINE = 8;
export const CONTAINER_HEIGHT_2LINE = 14;
const CONTAINER_RADIUS = 2;
function containerWidth(text: string): number {
  return Math.min(CONTAINER_MAX_WIDTH, Math.max(CONTAINER_MIN_WIDTH, text.length * PERCENT_WIDTH_PER_CHAR + 3));
}

/** Mirrors Canvas.tsx's own `wrapLabel(text, 36, widthPx)` decision (see
 * that function for the source of truth) closely enough to know whether
 * THIS text, in a container of THIS width, will render as one line or
 * two — a single word never wraps (wrapLabel's own `words.length > 1`
 * guard falls straight to its single-line-shrink fallback instead), and
 * anything that would need MORE than 2 lines also falls to that same
 * single-line fallback (wrapLabel's own `maxLines` cap), so the real
 * answer is always exactly 1 or 2. */
function estimateLineCount(text: string, widthPercent: number): 1 | 2 {
  const maxWidthPx = (widthPercent * 0.9 * CANVAS_WIDTH_PX * RECT_SIZE_SCALE) / 100;
  const naturalWidthPx = text.length * RECT_LABEL_FONT_PX * AVG_CHAR_WIDTH_RATIO;
  if (naturalWidthPx <= maxWidthPx) return 1;
  const words = text.split(" ");
  if (words.length <= 1) return 1;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / (RECT_LABEL_FONT_PX * AVG_CHAR_WIDTH_RATIO)));
  let lines = 1;
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines++;
      current = word;
    }
  }
  return lines <= 2 ? (lines as 1 | 2) : 1;
}

function containerHeight(text: string, widthPercent: number): number {
  return estimateLineCount(text, widthPercent) === 1 ? CONTAINER_HEIGHT_1LINE : CONTAINER_HEIGHT_2LINE;
}

export interface BehaviorResult {
  objects: FlowObject[];
  timeline: TimelineNode;
}

export type SendVerb = "request" | "response" | "query" | "broadcast" | "event";

const VERB_COLOR: Record<SendVerb, string> = {
  request: "#5b8def",
  response: "#3ecf8e",
  query: "#e0a020",
  broadcast: "#b596ff",
  event: "#e0a020",
};

const TRAVEL_DURATION = 0.9;
const ENTRY_POP_DURATION = 0.2;
const PULSE_UP_DURATION = 0.22;
const PULSE_DOWN_DURATION = 0.28;
const HOLD_BEFORE_FADE = 0.3;
const FADE_DURATION = 0.35;
// The payload never travels to the entity's own exact (x,y) — landing there
// means its container renders directly on top of the entity's icon glyph
// for the whole hold-before-fade, confirmed as a real, genuinely bad-looking
// bug via a real render (a request's payload text sitting smeared across
// the API icon). It travels to a point offset above the row instead, so the
// container stays legible and the icon stays clean; the entity's own
// arrival pulse (a separate action, unaffected by this) is what actually
// signals "received." Large enough to clear both the icon's own radius AND
// the container's own height, not just a bare line of text.
//
// ORIGIN and ARRIVAL are deliberately DIFFERENT offsets, not the same
// value used both ways — a `stream` step routinely has one entity acting
// as both a destination (a message arriving) and a source (the next
// message departing) with overlapping timing, and giving both ends the
// same offset means an outbound message's pop-in point is EXACTLY where
// an inbound message's held arrival sits, so they visibly overlap
// whenever their lifetimes overlap (confirmed via a real render: "join
// #general" departing the client collided with "Amara joined" arriving at
// the same client). Origin sits closer to the entity (just enough to
// clear the icon's own radius + half the container — this is close to
// its own achievable minimum, can't shrink further without re-overlapping
// the icon itself), arrival sits further out. The GAP between the two
// must clear a full CONTAINER_HEIGHT (two containers, one at each offset,
// centered on the same entity, would otherwise still touch even with
// "different" offsets if the difference is smaller than their combined
// half-heights) — confirmed directly: a first attempt at 32 vs 18 (a
// 14-unit gap) still visibly overlapped, since CONTAINER_HEIGHT(12)'s two
// halves alone need 12 of that 14, leaving almost no real clearance once
// real text rendering is accounted for. This file's own entity-layout
// counterpart (composeMechanism.ts's ENTITY_Y_MIN/MAX) is deliberately
// NOT derived from this constant — the two concerns are fully decoupled
// (see that file's own comment) specifically so this number can be
// widened freely, like this, without needing to re-derive entity spacing
// every time.
const ORIGIN_Y_OFFSET = 18;
export const ARRIVAL_Y_OFFSET = 38;

function act(action: CanvasAction, offsetSeconds?: number): TimelineNode {
  return { kind: "action", action, offsetSeconds };
}
function par(children: TimelineNode[]): TimelineNode {
  return { kind: "parallel", children };
}
function seq(children: TimelineNode[]): TimelineNode {
  return { kind: "sequence", children };
}
function delay(seconds: number, child: TimelineNode): TimelineNode {
  return { kind: "delay", seconds, child };
}

/** `send` — the single most-used behavior: a real payload (its own
 * contained text, e.g. "GET /user/42" or "SELECT amount FROM ...") travels
 * from one entity to another, arrives (a real reactive pulse on the target —
 * the same idiom `composeFlow.ts`'s `pushEdgeTimeline` already proved
 * correct), then fades. Covers send/receive/request/response/query/
 * broadcast/event — `verb` only changes the payload's container color,
 * never the choreography shape. Payload objects are a `roundedRectangle`
 * container (see containerWidth above) so real, variable-length content
 * stays legible and contained in transit, never bare floating text that
 * could clash with whatever else is nearby. */
export function sendBehavior(
  instanceId: string,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  toEntityId: string,
  payload: string,
  verb: SendVerb,
): BehaviorResult {
  const id = `payload_${instanceId}`;
  const color = VERB_COLOR[verb];
  const width = containerWidth(payload);
  const height = containerHeight(payload, width);
  const objects: FlowObject[] = [{ id, type: "roundedRectangle", x: fromPos.x, y: clampY(fromPos.y - ORIGIN_Y_OFFSET), width, height, radius: CONTAINER_RADIUS, label: payload, color, filled: true, opacity: 0 }];

  const timeline = seq([
    // Entry: the payload pops into existence at its origin — a real object
    // being created (a request being formed), not a teleport.
    act({ type: "move", id, startSeconds: 0, durationSeconds: ENTRY_POP_DURATION, opacity: 1, scale: 0.7, sound: "entrance" }),
    act({ type: "move", id, startSeconds: 0, durationSeconds: ENTRY_POP_DURATION, scale: 1.0, easing: "spring" }, ENTRY_POP_DURATION),
    // Travel: the payload itself crosses the relationship — this is the
    // actual demonstrated event, not a line quietly appearing. Arrives just
    // above the target entity, never coincident with it (see
    // ARRIVAL_Y_OFFSET above).
    act({ type: "move", id, startSeconds: 0, durationSeconds: TRAVEL_DURATION, to: { x: toPos.x, y: clampY(toPos.y - ARRIVAL_Y_OFFSET) }, path: "arc", sound: "move" }, ENTRY_POP_DURATION * 2),
    // Arrival: the target entity visibly reacts — proof the payload was
    // actually received, not just that it moved somewhere near it.
    par([
      act({ type: "move", id: toEntityId, startSeconds: 0, durationSeconds: PULSE_UP_DURATION, scale: 1.15, sound: "highlight" }),
      act({ type: "move", id: toEntityId, startSeconds: 0, durationSeconds: PULSE_DOWN_DURATION, scale: 1.0, easing: "spring" }, PULSE_UP_DURATION),
    ]),
    // The payload has done its job (been received) — it fades rather than
    // sitting on top of the entity it just arrived at forever. `disappear`
    // only needs a tiny buffer AFTER the fade (which already finished, by
    // sequence chaining, at cursor+0) — NOT another full HOLD_BEFORE_FADE +
    // FADE_DURATION on top, which was dead air with nothing changing
    // on-screen (confirmed via a real render: ~0.65s of every send was
    // just an already-invisible object waiting to be told to disappear).
    act({ type: "move", id, startSeconds: 0, durationSeconds: FADE_DURATION, opacity: 0 }, HOLD_BEFORE_FADE),
    act({ type: "disappear", id, startSeconds: 0, durationSeconds: 0.2 }, 0.05),
  ]);

  return { objects, timeline };
}

const TRANSFORM_COLOR = "#e0a020";
const TRANSFORM_REVERT_DELAY = 0.9;
// ABOVE the entity, not below — below is where the entity's OWN caption
// ("API") already renders, and a real render showed "validating" landing
// directly on top of it, both bold text fighting for the same band. Above
// is clear open space, same side payload arrivals already use.
const STATE_LABEL_Y_OFFSET = 20;

/** `transform` — a REAL, visible state change AT one entity: it changes
 * color (processing) and a small state caption appears naming what's
 * happening ("validating…", "looking up…"), holds, then both revert. This
 * is what makes an operation implied only by an arrow (e.g. "the API
 * validates the request") into its own visible beat with its own duration —
 * directly satisfies narration alignment (a step exists for it), and covers
 * resolve/compare/filter, all of which are fundamentally "this entity did
 * something to its own state," not a transport. Same contained-text
 * treatment as a payload — a `roundedRectangle`, not bare text. */
export function transformBehavior(instanceId: string, entityId: string, entityPos: { x: number; y: number }, entityHomeColor: string, state: string): BehaviorResult {
  const labelId = `state_${instanceId}`;
  const stateWidth = containerWidth(state);
  const objects: FlowObject[] = [
    {
      id: labelId,
      type: "roundedRectangle",
      x: entityPos.x,
      y: clampY(entityPos.y - STATE_LABEL_Y_OFFSET),
      width: stateWidth,
      height: containerHeight(state, stateWidth),
      radius: CONTAINER_RADIUS,
      label: state,
      color: TRANSFORM_COLOR,
      filled: true,
      opacity: 0,
    },
  ];

  const timeline = seq([
    par([
      act({ type: "style", id: entityId, startSeconds: 0, durationSeconds: 0.3, color: TRANSFORM_COLOR, sound: "highlight" }),
      act({ type: "move", id: labelId, startSeconds: 0, durationSeconds: 0.3, opacity: 1 }),
    ]),
    // Both reverts happen TOGETHER after one real hold — an earlier version
    // gave each its own TRANSFORM_REVERT_DELAY-sized offset as a SEQUENCE
    // child, which (confirmed via a real render) chains additively rather
    // than running in parallel, silently doubling the hold to 1.8s. `delay`
    // + `par` is the correct "wait once, then do both at once" shape.
    delay(
      TRANSFORM_REVERT_DELAY,
      par([act({ type: "style", id: entityId, startSeconds: 0, durationSeconds: 0.3, color: entityHomeColor }), act({ type: "move", id: labelId, startSeconds: 0, durationSeconds: 0.3, opacity: 0 })]),
    ),
    act({ type: "disappear", id: labelId, startSeconds: 0, durationSeconds: 0.2 }, 0.05),
  ]);

  return { objects, timeline };
}

const BRANCH_CONDITION_Y_OFFSET = 20;
export const BRANCH_OUTCOME_Y_OFFSET = 32;
const BRANCH_OUTCOME_X_SPREAD = 20;
const BRANCH_DECIDE_COLOR = "#b596ff";
const BRANCH_TAKEN_COLOR = "#3ecf8e";
const BRANCH_NOT_TAKEN_COLOR = "#4a4f5c";

export interface BranchOutcomeMeta {
  label: string;
  taken: boolean;
}

/** `branch` — a REAL decision, animated: the entity visibly "thinks" (pulse
 * + a condition caption, e.g. "in cache?"), then EVERY candidate outcome
 * appears together as its own container — a genuine fork, not a single path
 * narrated as if it were the only option — before the taken one highlights
 * and survives while every other one visibly greys out and fades. That
 * elimination treatment is deliberately the SAME idiom `composeSelect.ts`
 * already proved reads clearly (a real, visible rejection, not a silent
 * choice), reused here rather than invented fresh. This function only
 * covers the decision+fork beat itself — the taken outcome's own nested
 * steps (e.g. a cache miss's fall-through to the database) are compiled and
 * sequenced separately by composeMechanism.ts, right after this beat, using
 * the exact same step-compiling machinery as top-level steps. */
export function branchBehavior(instanceId: string, atEntityId: string, atPos: { x: number; y: number }, atHomeColor: string, condition: string, outcomes: BranchOutcomeMeta[]): BehaviorResult {
  const conditionId = `condition_${instanceId}`;
  const conditionWidth = containerWidth(condition);
  const objects: FlowObject[] = [
    {
      id: conditionId,
      type: "roundedRectangle",
      x: atPos.x,
      y: clampY(atPos.y - BRANCH_CONDITION_Y_OFFSET),
      width: conditionWidth,
      height: containerHeight(condition, conditionWidth),
      radius: CONTAINER_RADIUS,
      label: condition,
      color: BRANCH_DECIDE_COLOR,
      filled: true,
      opacity: 0,
    },
  ];
  const outcomeIds = outcomes.map((_, i) => `outcome_${instanceId}_${i}`);
  outcomes.forEach((o, i) => {
    const dx = (i - (outcomes.length - 1) / 2) * BRANCH_OUTCOME_X_SPREAD;
    const outcomeWidth = containerWidth(o.label);
    objects.push({
      id: outcomeIds[i],
      type: "roundedRectangle",
      x: atPos.x + dx,
      y: clampY(atPos.y - BRANCH_OUTCOME_Y_OFFSET),
      width: outcomeWidth,
      height: containerHeight(o.label, outcomeWidth),
      radius: CONTAINER_RADIUS,
      label: o.label,
      color: "#c7ccd6",
      filled: true,
      opacity: 0,
    });
  });

  const timeline = seq([
    // Decision: the entity itself visibly "thinks."
    par([
      act({ type: "move", id: atEntityId, startSeconds: 0, durationSeconds: 0.2, scale: 1.12, sound: "highlight" }),
      act({ type: "move", id: conditionId, startSeconds: 0, durationSeconds: 0.3, opacity: 1 }),
    ]),
    act({ type: "move", id: atEntityId, startSeconds: 0, durationSeconds: 0.25, scale: 1.0, easing: "spring" }, 0.2),
    // Fork: every real candidate outcome appears together.
    delay(0.35, par(outcomeIds.map((id) => act({ type: "move", id, startSeconds: 0, durationSeconds: 0.25, opacity: 1, scale: 0.8 })))),
    delay(0.25, par(outcomeIds.map((id) => act({ type: "move", id, startSeconds: 0, durationSeconds: 0.2, scale: 1.0, easing: "spring" })))),
    // Resolve: the taken outcome highlights and holds; every other one
    // visibly greys out — a real elimination, not a silent pick.
    delay(
      0.7,
      par(
        outcomes.map((o, i) =>
          o.taken
            ? seq([act({ type: "style", id: outcomeIds[i], startSeconds: 0, durationSeconds: 0.25, color: BRANCH_TAKEN_COLOR, sound: "success" }), act({ type: "move", id: outcomeIds[i], startSeconds: 0, durationSeconds: 0.25, scale: 1.15 })])
            : act({ type: "style", id: outcomeIds[i], startSeconds: 0, durationSeconds: 0.3, color: BRANCH_NOT_TAKEN_COLOR }),
        ),
      ),
    ),
    delay(0.6, par([...outcomeIds.map((id) => act({ type: "move", id, startSeconds: 0, durationSeconds: 0.3, opacity: 0 })), act({ type: "move", id: conditionId, startSeconds: 0, durationSeconds: 0.3, opacity: 0 })])),
    delay(0.35, par([...outcomeIds.map((id) => act({ type: "disappear", id, startSeconds: 0, durationSeconds: 0.2 })), act({ type: "disappear", id: conditionId, startSeconds: 0, durationSeconds: 0.2 })])),
    act({ type: "style", id: atEntityId, startSeconds: 0, durationSeconds: 0.2, color: atHomeColor }, 0.05),
  ]);

  return { objects, timeline };
}

const FANOUT_STAGGER_GAP = 0.3;
// Comfortably clears CONTAINER_HEIGHT (12) so two stacked arrivals never
// touch even before either has faded.
// A bounded set of landing lanes (cycled through by index), NOT a linearly
// growing offset — the first version pushed each successive source's
// landing point further and further from the aggregation point
// (`i * gap`), which for 3+ sources eventually goes negative once the
// available vertical budget shrinks (confirmed directly: raising
// ARRIVAL_Y_OFFSET elsewhere made a 3-source GraphQL fan-in's topmost
// landing point compute to a negative y — a schema-invalid coordinate,
// caught by this project's own regression test). Cycling through a FIXED,
// small set of lanes keeps the total spread bounded regardless of how
// many sources converge, which linear growth structurally cannot
// guarantee. Shared with `streamBehavior`'s own same-direction lane
// cycling below — same underlying problem (several things converging on
// one point over time), same fix.
const CONVERGE_LANE_OFFSETS = [0, 18, -18];

export interface FanoutTarget {
  toEntityId: string;
  toPos: { x: number; y: number };
  payload: string;
}

/** `fanout` — one entity dispatches to SEVERAL entities in parallel
 * (staggered slightly so each arrival is still individually readable), each
 * getting its own real, distinct payload — the actual visualization of
 * GraphQL field selection: a query fans out into separate field requests to
 * separate resolvers, not one request that happens to have a compound
 * label. Built directly from `sendBehavior` (same travel/arrive/fade beat,
 * just several running concurrently) rather than a new choreography —
 * fan-out is a PARALLEL composition of the same primitive, not a different
 * one. */
export function fanoutBehavior(instanceId: string, fromPos: { x: number; y: number }, targets: FanoutTarget[], verb: SendVerb): BehaviorResult {
  const objects: FlowObject[] = [];
  const children: TimelineNode[] = [];
  targets.forEach((t, i) => {
    const result = sendBehavior(`${instanceId}_${i}`, fromPos, t.toPos, t.toEntityId, t.payload, verb);
    objects.push(...result.objects);
    children.push(result.timeline);
  });
  return { objects, timeline: { kind: "stagger", gap: FANOUT_STAGGER_GAP, children } };
}

export interface AggregateSource {
  fromEntityId: string;
  fromPos: { x: number; y: number };
  payload: string;
}

/** `aggregate` — the reverse of fanout: several entities' own resolved
 * values visibly CONVERGE on one point (each is its own real
 * `sendBehavior` leg, staggered), and only once they've all arrived does a
 * single real merged payload appear there and briefly hold — the actual
 * demonstration of "aggregation" (GraphQL merging User/Avatar/Posts into
 * one response), not a label that just says "merged." The merged payload
 * fades afterward like any other payload — a following `send` step (e.g.
 * the merged response continuing on to the client) creates its own fresh
 * payload object rather than this one lingering. */
export function aggregateBehavior(instanceId: string, sources: AggregateSource[], intoEntityId: string, intoPos: { x: number; y: number }, resultPayload: string): BehaviorResult {
  const objects: FlowObject[] = [];
  const convergeChildren: TimelineNode[] = [];
  sources.forEach((s, i) => {
    // Every source's own container LANDS at a slightly different spot
    // above the aggregation point, not the exact same coordinates — unlike
    // `fanout` (whose targets are naturally different entities at
    // different positions), every aggregate source converges on the SAME
    // point, so without this every container arrives stacked exactly on
    // top of the others whenever two arrivals overlap in time (confirmed
    // via a real render). Staying on the aggregation entity's own x
    // (± the lane's own small nudge) rather than spreading widely
    // sideways — a first version spread sideways more aggressively and
    // fixed the payloads colliding with EACH OTHER but then drifted far
    // enough to collide with a NEIGHBORING entity's column instead (also
    // confirmed via a real render, e.g. a 3-way GraphQL fan-in where
    // entity columns sit close together).
    const laneOffset = CONVERGE_LANE_OFFSETS[i % CONVERGE_LANE_OFFSETS.length];
    const landingPos = { x: intoPos.x + laneOffset / 3, y: intoPos.y + laneOffset };
    const result = sendBehavior(`${instanceId}_s${i}`, s.fromPos, landingPos, intoEntityId, s.payload, "response");
    objects.push(...result.objects);
    convergeChildren.push(result.timeline);
  });
  const convergePhase: TimelineNode = { kind: "stagger", gap: FANOUT_STAGGER_GAP, children: convergeChildren };

  const mergedId = `merged_${instanceId}`;
  const mergedWidth = containerWidth(resultPayload);
  objects.push({
    id: mergedId,
    type: "roundedRectangle",
    x: intoPos.x,
    y: clampY(intoPos.y - ARRIVAL_Y_OFFSET),
    width: mergedWidth,
    height: containerHeight(resultPayload, mergedWidth),
    radius: CONTAINER_RADIUS,
    label: resultPayload,
    color: VERB_COLOR.response,
    filled: true,
    opacity: 0,
  });
  const mergeBeat: TimelineNode = seq([
    par([
      act({ type: "move", id: intoEntityId, startSeconds: 0, durationSeconds: 0.2, scale: 1.2, sound: "success" }),
      act({ type: "move", id: mergedId, startSeconds: 0, durationSeconds: 0.3, opacity: 1, scale: 0.7 }),
    ]),
    act({ type: "move", id: mergedId, startSeconds: 0, durationSeconds: 0.2, scale: 1.0, easing: "spring" }, 0.2),
    act({ type: "move", id: intoEntityId, startSeconds: 0, durationSeconds: 0.25, scale: 1.0, easing: "spring" }, 0.2),
    act({ type: "move", id: mergedId, startSeconds: 0, durationSeconds: FADE_DURATION, opacity: 0 }, HOLD_BEFORE_FADE),
    act({ type: "disappear", id: mergedId, startSeconds: 0, durationSeconds: 0.2 }, 0.05),
  ]);

  return { objects, timeline: seq([convergePhase, delay(0.3, mergeBeat)]) };
}

const CONNECTION_COLOR = "#3ecf8e";

/** A stable id derived from the two endpoints (not the caller's
 * instanceId) — `connect` and a LATER `disconnect`/`stream` step for the
 * same pair need to reference the exact same persistent line object, and
 * they're separate steps with different instanceIds. Order-independent
 * (sorted) so `connect(a,b)` and `disconnect(b,a)` still resolve to the
 * same connection. */
export function connectionId(a: string, b: string): string {
  return `connection_${[a, b].sort().join("_")}`;
}

/** `connect` — a REAL persistent link: a self-drawing line between the two
 * entities that then stays visibly alive (continuous glow) for as long as
 * it's connected — this is what makes a WebSocket read as fundamentally
 * different from a REST request/response pair, not just "the same arrows,
 * narrated differently." A WebSocket scene that never actually shows a
 * persistent connection object is a failure per this project's own
 * mechanism-fidelity standard. */
export function connectBehavior(a: string, aPos: { x: number; y: number }, b: string, bPos: { x: number; y: number }): BehaviorResult {
  const id = connectionId(a, b);
  const dx = bPos.x - aPos.x;
  const dy = bPos.y - aPos.y;
  const width = Math.sqrt(dx * dx + dy * dy);
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  // No `opacity: 0` alongside `appear` — a real render elsewhere in this
  // project confirmed that combination leaves an object stuck invisible
  // forever (the "appear" flag flips true but authored opacity:0 never
  // gets un-set). `appear` alone is the reveal.
  const objects: FlowObject[] = [{ id, type: "line", x: aPos.x, y: aPos.y, width, rotation, color: CONNECTION_COLOR, draw: true, idle: "glow" }];
  const timeline: TimelineNode = act({ type: "appear", id, startSeconds: 0, sound: "entrance" });
  return { objects, timeline };
}

/** `disconnect` — the connection visibly closes (fades, stops glowing)
 * rather than just being abandoned on screen once the scene moves on. */
export function disconnectBehavior(a: string, b: string): BehaviorResult {
  const id = connectionId(a, b);
  const timeline: TimelineNode = seq([act({ type: "move", id, startSeconds: 0, durationSeconds: 0.4, opacity: 0, sound: "alert" }), act({ type: "disappear", id, startSeconds: 0, durationSeconds: 0.2 }, 0.05)]);
  return { objects: [], timeline };
}

export interface StreamEvent {
  direction: "aToB" | "bToA";
  payload: string;
  /** Seconds from the START of this stream step (not the whole scene) —
   * composeMechanism.ts places the step, this places events within it.
   * Keep consecutive events (regardless of direction) at least ~1.5s
   * apart: each event's own TRAVEL phase runs roughly
   * [atSeconds+0.4, atSeconds+1.3], and two entities close enough together
   * that their containers can span most of the gap between them (a
   * realistic 2-entity WebSocket scene) will show a real, if brief,
   * mid-transit crossing if two events' travel windows overlap — confirmed
   * via an actual render. Lane-cycling (this file's own
   * CONVERGE_LANE_OFFSETS) only separates two containers that are BOTH
   * held stationary at the same endpoint at the same time; it does nothing
   * for one container passing THROUGH the region another is occupying
   * mid-flight, which is a path-crossing problem, not a landing-spot
   * problem — this pacing guidance is the actual mitigation until this
   * engine can path-plan around that instead. */
  atSeconds: number;
}

/** `stream` — multiple real events flowing in BOTH directions over an
 * already-open connection, each its own `sendBehavior` leg anchored at its
 * own authored time rather than chained one-after-another. This is the
 * direct generalization of `composeContinuous.ts`'s proven "authored event
 * list over time" capability (that file simulates a queue from
 * arrival/departure timestamps; this reuses the same "events happen at
 * real, specific times, not just in sequence" idea for a stream of
 * messages) — a single request/response pair is explicitly NOT what this
 * models; a stream step with only one event isn't demonstrating a stream. */
// Consecutive same-direction stream events cycle through the same bounded
// `CONVERGE_LANE_OFFSETS` set defined above (never all 0, the plain
// arrival point) — two messages heading the SAME way (e.g. two
// server→client pushes) land at the exact same spot by default, and a
// real render showed exactly what that causes: the second message's
// container fading in on top of the first's still mid-fade-out, a
// visibly broken overlap, whenever the authored gap between them is
// shorter than one message's own full travel+hold+fade lifetime (~2.5s).
// This isn't solved by telling script authors to space events out more —
// the compiler shouldn't silently break on realistically-paced chat
// traffic. Cycling lanes per direction (not globally) means aToB and bToA
// each get their own independent rotation, since a message crossing IN
// ONE direction never visually competes with one crossing the other way.
export function streamBehavior(instanceId: string, a: string, aPos: { x: number; y: number }, b: string, bPos: { x: number; y: number }, events: StreamEvent[]): BehaviorResult {
  const objects: FlowObject[] = [];
  const children: TimelineNode[] = [];
  const laneCounts: Record<StreamEvent["direction"], number> = { aToB: 0, bToA: 0 };
  events.forEach((e, i) => {
    const fromPos = e.direction === "aToB" ? aPos : bPos;
    const toId = e.direction === "aToB" ? b : a;
    const toBase = e.direction === "aToB" ? bPos : aPos;
    const lane = laneCounts[e.direction]++;
    const toPos = { x: toBase.x, y: toBase.y + CONVERGE_LANE_OFFSETS[lane % CONVERGE_LANE_OFFSETS.length] };
    const result = sendBehavior(`${instanceId}_e${i}`, fromPos, toPos, toId, e.payload, "event");
    objects.push(...result.objects);
    children.push(delay(e.atSeconds, result.timeline));
  });
  return { objects, timeline: par(children) };
}
