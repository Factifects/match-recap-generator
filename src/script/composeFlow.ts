import type { CanvasIconKey } from "../model/visualDefinitions";
import type { SceneContract, ContractEdge } from "./sceneContract";
import { STATE_VERBS, PULSE_VERBS } from "./sceneContract";

// Turns a declared SceneContract (entities + a flow of verbed edges) into a
// real Canvas visual — composition and connection are solved BEFORE
// animation, and every entity is placed and connected by construction, so
// "unconnected entities floating in space" (the exact failure the reverse-
// proxy Scene 1 shipped with — zero arrows, five appear events, nothing
// ever travels) is structurally impossible for a compiled scene. This is
// the "make good scenes the default, not something authoring has to
// remember" half of the fix — validateScene.ts's realization checker is the
// half that catches it when a HAND-authored Canvas scene skips this anyway.
//
// Scope, honestly: this handles the two topologies actually observed across
// analyses/*.txt — a single chain (optionally there-and-back, e.g. Scene 2
// of reverse-proxy-short: client->proxy->server->proxy->client, the one
// real example already proven good) and a one-to-many fan-out (e.g.
// api-gateway-short's gateway->{4 services}). A contract outside those two
// shapes (many-to-one convergence, a cycle across 3+ distinct nodes) falls
// back to one independent token per edge rather than guessing at a topology
// it doesn't understand — plainer than a hand-tuned scene, but never wrong.

// These three are typed against what visualSchema.safeParse ACCEPTS (zod's
// input side — every `.default(...)` field genuinely optional), not what it
// PRODUCES (CanvasData's own type is zod's output side, where every
// defaulted field becomes required) — the exact same relationship
// resolveDataVisual already has with a hand-authored **Data:** JSON blob:
// this module builds a candidate object and lets the same safeParse call
// fill in every default and reject anything malformed, it doesn't need to
// duplicate the schema's own defaults by hand.
type SoundCue = "entrance" | "move" | "zoom" | "click" | "highlight" | "success" | "alert" | "typing";
type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "emphasized" | "easeOutBack" | "anticipate" | "spring";

interface FlowObject {
  id: string;
  type: "dot" | "icon";
  x: number;
  y: number;
  label?: string;
  color?: string;
  icon?: CanvasIconKey;
  radius?: number;
  enter?: "scale";
  opacity?: number;
  idle?: "glow";
}

interface FlowArrow {
  from: string;
  to: string;
  style?: "solid" | "dashed";
  flow?: boolean;
  revealAtSeconds?: number;
}

interface FlowTimelineAction {
  type: "appear" | "move" | "style" | "disappear" | "camera";
  id?: string;
  startSeconds: number;
  durationSeconds?: number;
  to?: { x: number; y: number };
  scale?: number;
  opacity?: number;
  color?: string;
  sound?: SoundCue;
  easing?: Easing;
  x?: number;
  y?: number;
  zoom?: number;
}

const ROW_Y = 46;
const ROW_X_MIN = 15;
const ROW_X_MAX = 85;
// A dead-flat, perfectly horizontal row read as a spec diagram, not a
// motion graphic (confirmed directly against real rendered frames — three
// icons on a ruler-straight line with a thin static connector). A gentle
// parabolic arc gives the row real composition without pretending to be
// anything other than what it is: `arcDirection` alternates per scene
// (keyed off a hash of the entity ids) so consecutive scenes in the same
// video don't all bow the same way and start looking like one repeated
// template again.
const ROW_ARC_AMPLITUDE = 9;
const FAN_TARGET_X = 84;
const FAN_Y_SPAN: [number, number] = [18, 72];
// Bumped from 9 — the original size read as timid against how much empty
// canvas surrounded it in the actual render. Bigger nodes with real
// continuous motion (idle glow, camera push-in below) is the fix, not a
// framing box around them (see feedback_mature_motion_design_direction:
// boxes only when the box IS the concept).
const NODE_RADIUS = 13;
const FAN_NODE_RADIUS = 10;
// First entity = the requester (blue), last = the thing ultimately being
// protected/reached (muted gray), everything between = whatever the scene
// is actually about (green) — matches the color convention already used
// consistently by hand-authored scripts (client #5b8def, hero/gateway
// #3ecf8e, backend #8a8f98), not an arbitrary new palette.
const COLOR_FIRST = "#5b8def";
const COLOR_MIDDLE = "#3ecf8e";
const COLOR_LAST = "#8a8f98";
const COLOR_REJECT = "#e5484d";
const COLOR_CHECK = "#e0a020";
const TOKEN_COLOR = "#3ecf8e";

const ENTRANCE_START = 0.3;
const ENTRANCE_STAGGER = 0.3;
const SETTLE_AFTER_ENTRANCE = 1.2;
const TOKEN_FADE_DURATION = 0.2;
const STEP_DURATION = 0.8;
const PULSE_UP_DURATION = 0.25;
const PULSE_DOWN_DURATION = 0.3;
const CHECK_FLASH_DURATION = 0.35;
const END_BUFFER = 1.5;
const MIN_SCENE_SECONDS = 6;

/** Every id mentioned anywhere (declared Entities first, then any bare id
 * used only in Flow edges), deduped, in first-mention order — an edge is
 * free to reference an entity the author didn't bother declaring, same
 * graceful-degradation posture as the rest of this parser. */
function allEntityIds(contract: SceneContract): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const e of contract.entities) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      ids.push(e.id);
    }
  }
  for (const edge of contract.edges) {
    for (const id of [edge.from, edge.to]) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

function labelFromId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function resolveEntityMeta(id: string, contract: SceneContract): { icon?: CanvasIconKey; label: string } {
  const declared = contract.entities.find((e) => e.id === id);
  return { icon: declared?.icon, label: declared?.label ?? labelFromId(id) };
}

/** True when every edge chains onto the previous one (edges[i].to ===
 * edges[i+1].from) — the single-token walk case (a straight chain, or a
 * there-and-back chain like client->proxy->server->proxy->client, which is
 * exactly this shape: to/from keep matching all the way through). */
function isSinglePath(edges: ContractEdge[]): boolean {
  for (let i = 1; i < edges.length; i++) {
    if (edges[i - 1].to !== edges[i].from) return false;
  }
  return true;
}

/** One-to-many fan-out: 2+ edges sharing the same `from`, none of those
 * targets appearing as a `from` anywhere else (leaf targets) — the
 * api-gateway-short shape (gateway -> 4 services). Returns null when the
 * edge set doesn't match this shape. */
function detectFanOut(edges: ContractEdge[]): { source: string; targets: string[] } | null {
  if (edges.length < 2) return null;
  const source = edges[0].from;
  if (!edges.every((e) => e.from === source)) return null;
  const targets = edges.map((e) => e.to);
  if (new Set(targets).size !== targets.length) return null;
  if (targets.some((t) => edges.some((e) => e.from === t))) return null;
  return { source, targets };
}

interface Layout {
  positions: Record<string, { x: number; y: number }>;
  order: string[];
  /** true for a row/chain layout, false for a fan — buildNodes uses this to
   * pick node size and which nodes get continuous idle motion; the
   * composeFlow camera choreography uses it to decide whether a push-in
   * along the row makes sense (it doesn't for a fan, whose targets spread
   * vertically instead). */
  isRow: boolean;
}

/** Deterministic per-scene direction (not per-render-frame randomness — the
 * same contract must always compile to the same output) so an arc bows
 * upward in one scene and downward in the next rather than every single
 * scene in a video bowing identically, which would just be a new flavor of
 * "every scene looks the same." Seeded from the entity ids themselves, not
 * a counter passed in from outside — composeFlow has no notion of "which
 * scene number is this" and shouldn't need one just for this. */
function arcDirection(ids: string[]): 1 | -1 {
  const seed = ids.join("|");
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return sum % 2 === 0 ? 1 : -1;
}

/** A gentle parabolic arc instead of a dead-flat row — confirmed directly
 * against a real render that a perfectly horizontal line of icons connected
 * by a straight line reads as a spec diagram, not a motion graphic. The
 * apex sits at the row's midpoint; nodes at either end stay near ROW_Y so
 * the arc reads as a deliberate curve, not a diagonal tilt. */
function layoutRow(ids: string[]): Layout {
  const positions: Record<string, { x: number; y: number }> = {};
  const direction = arcDirection(ids);
  ids.forEach((id, i) => {
    const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
    const x = ids.length === 1 ? (ROW_X_MIN + ROW_X_MAX) / 2 : ROW_X_MIN + (ROW_X_MAX - ROW_X_MIN) * t;
    // Parabola in t centered at 0.5, zero at the ends (t=0/1), peak at the
    // middle — `4*t*(1-t)` is exactly that shape, scaled by amplitude.
    const arcOffset = direction * ROW_ARC_AMPLITUDE * 4 * t * (1 - t);
    positions[id] = { x, y: ROW_Y - arcOffset };
  });
  return { positions, order: ids, isRow: true };
}

function layoutFan(source: string, targets: string[]): Layout {
  const positions: Record<string, { x: number; y: number }> = { [source]: { x: ROW_X_MIN, y: ROW_Y } };
  const [yMin, yMax] = FAN_Y_SPAN;
  targets.forEach((id, i) => {
    const y = targets.length === 1 ? ROW_Y : yMin + ((yMax - yMin) * i) / (targets.length - 1);
    positions[id] = { x: FAN_TARGET_X, y };
  });
  return { positions, order: [source, ...targets], isRow: false };
}

function colorForIndex(index: number, count: number): string {
  if (index === 0) return COLOR_FIRST;
  if (index === count - 1) return COLOR_LAST;
  return COLOR_MIDDLE;
}

function buildNodes(contract: SceneContract, layout: Layout): FlowObject[] {
  const radius = layout.isRow ? NODE_RADIUS : FAN_NODE_RADIUS;
  return layout.order.map((id, i) => {
    const meta = resolveEntityMeta(id, contract);
    const pos = layout.positions[id];
    const isInterior = i > 0 && i < layout.order.length - 1;
    const base = {
      id,
      x: pos.x,
      y: pos.y,
      label: meta.label,
      color: colorForIndex(i, layout.order.length),
      radius,
      enter: "scale" as const,
      // A continuous ambient glow on whatever's IN BETWEEN the ends — the
      // thing the scene is actually about — so the scene still feels alive
      // during the (real, but brief) moments nothing is actively
      // transporting. The end nodes (source/final destination) stay still;
      // glowing everything would just be uniform background noise again.
      idle: isInterior ? ("glow" as const) : undefined,
    };
    return meta.icon ? ({ ...base, type: "icon" as const, icon: meta.icon }) : ({ ...base, type: "dot" as const });
  });
}

/** A plain, always-visible connector for every DISTINCT pair of entities an
 * edge actually relates — guarantees a relationship is drawn even before
 * any token ever moves, which is the direct fix for Scene 1's actual bug
 * (zero arrows). Derived from the contract's own edges, not from layout
 * adjacency — a fan-out's baseline connectors are source->target1,
 * source->target2, ..., NOT target1->target2 (which layout-order adjacency
 * would wrongly produce, since targets sit next to each other in the fan
 * layout but have no relationship to each other at all). A there-and-back
 * path (client->proxy, ..., proxy->client) collapses to ONE connector per
 * pair — two overlapping arrows for the same link would just be visual
 * noise, not a second relationship. Deliberately not `flow: true` (animated
 * dashes) — this is the static "these are connected" baseline; the moving
 * token (see buildTimeline) is what demonstrates the transport itself,
 * matching the one real proven-good example (Scene 2) using a moving dot
 * rather than an animated arrow for that job. */
function buildBaselineArrows(contract: SceneContract): FlowArrow[] {
  const seenPairs = new Set<string>();
  const arrows: FlowArrow[] = [];
  contract.edges.forEach((edge, i) => {
    const pairKey = [edge.from, edge.to].sort().join("|");
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);
    // `style: "dashed"` + `flow: true` — Canvas.tsx animates a flow arrow's
    // dash pattern continuously (see its own FLOW_SPEED_PX_PER_FRAME), so
    // the connector itself visibly moves for the ENTIRE scene, not just the
    // instant a token happens to be crossing it. A solid static line (the
    // original choice here) sat dead on screen once its one-time draw-in
    // finished — confirmed directly against a real render as reading like a
    // spec diagram, not a motion graphic. This is the fix.
    arrows.push({ from: edge.from, to: edge.to, style: "dashed" as const, flow: true, revealAtSeconds: ENTRANCE_START + (i + 1) * 0.3 });
  });
  return arrows;
}

interface TimelineBuildResult {
  objects: FlowObject[];
  timeline: FlowTimelineAction[];
}

/** Every entity's own assigned color, keyed by id — needed so a momentary
 * state signal (a check flash) has a real color to revert TO, not just a
 * color to flash to. */
function buildNodeColors(layout: Layout): Record<string, string> {
  const colors: Record<string, string> = {};
  layout.order.forEach((id, i) => (colors[id] = colorForIndex(i, layout.order.length)));
  return colors;
}

/** One edge's full treatment, keyed off its verb category — shared by both
 * the single-path and independent-token builders so a `blocks`/`checks`/
 * `stores` edge behaves identically regardless of which topology it's
 * embedded in. `tokenId` is either the one shared walking token (single
 * path) or that edge's own independent token (fan-out) — either way this
 * function only ever moves/styles/disappears that one id, plus pulses the
 * target node it's reacting to.
 *
 * Every branch below is deliberately built from actions the classifier
 * (actionClassifier.ts) marks EXPLANATORY for a real reason (a genuine
 * transport, or a genuine color/state change) — not shaped to satisfy the
 * classifier, the classifier is shaped to recognize exactly this class of
 * real event. Returns the timeline for this edge and the frame the NEXT
 * edge (if chained) should start from. */
function pushEdgeTimeline(
  edge: ContractEdge,
  tokenId: string,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  nodeColors: Record<string, string>,
  startAt: number,
): { timeline: FlowTimelineAction[]; endAt: number } {
  const timeline: FlowTimelineAction[] = [];
  let t = startAt;

  if (PULSE_VERBS.has(edge.verb)) {
    // "checks"/"validates" — a momentary state signal AT the target, no
    // travel: a real color change (explanatory) that reverts (another real
    // color change), not a scale-pop, since there's no arrival to react to.
    timeline.push({ type: "style", id: edge.to, startSeconds: t, durationSeconds: CHECK_FLASH_DURATION, color: COLOR_CHECK, sound: "highlight" });
    t += CHECK_FLASH_DURATION + 0.2;
    timeline.push({ type: "style", id: edge.to, startSeconds: t, durationSeconds: CHECK_FLASH_DURATION, color: nodeColors[edge.to] ?? COLOR_MIDDLE });
    t += CHECK_FLASH_DURATION;
    return { timeline, endAt: t };
  }

  if (edge.verb === "blocks" || edge.verb === "rejects") {
    // Travels PART of the way then gets turned back — a real transport that
    // terminates short, distinct from a normal arrival.
    const partial = { x: fromPos.x + (toPos.x - fromPos.x) * 0.55, y: fromPos.y + (toPos.y - fromPos.y) * 0.55 };
    timeline.push({ type: "move", id: tokenId, startSeconds: t, durationSeconds: STEP_DURATION, to: partial, sound: "move" });
    t += STEP_DURATION + 0.1;
    timeline.push({ type: "style", id: tokenId, startSeconds: t, durationSeconds: CHECK_FLASH_DURATION, color: COLOR_REJECT, sound: "alert" });
    t += CHECK_FLASH_DURATION + 0.2;
    timeline.push({ type: "disappear", id: tokenId, startSeconds: t, durationSeconds: 0.3 });
    t += 0.3;
    return { timeline, endAt: t };
  }

  // request/forwards/routes/returns/responds (real transport) and
  // stores/transforms/accumulates (transport THEN absorbed) share the same
  // travel-and-arrive base.
  timeline.push({ type: "move", id: tokenId, startSeconds: t, durationSeconds: STEP_DURATION, to: { x: toPos.x, y: toPos.y }, sound: "move" });
  t += STEP_DURATION + 0.1;
  // Arrival pulse on the target node — the scale-up/scale-down pair, the
  // one place this idiom is used CORRECTLY (a reaction to something
  // arriving, not decoration filling time).
  timeline.push({ type: "move", id: edge.to, startSeconds: t, durationSeconds: PULSE_UP_DURATION, scale: 1.15, sound: "highlight" });
  timeline.push({ type: "move", id: edge.to, startSeconds: t + PULSE_UP_DURATION, durationSeconds: PULSE_DOWN_DURATION, scale: 1.0, easing: "spring" });
  if (STATE_VERBS.has(edge.verb)) {
    // Absorbed into the target — a real state change on the target (stays
    // changed, doesn't revert, unlike the momentary check flash above) and
    // the token itself is consumed rather than continuing to travel.
    timeline.push({ type: "style", id: edge.to, startSeconds: t, durationSeconds: 0.3, color: COLOR_MIDDLE, sound: "success" });
    timeline.push({ type: "disappear", id: tokenId, startSeconds: t + 0.35, durationSeconds: 0.3 });
    t += 0.65;
  } else {
    t += PULSE_UP_DURATION + PULSE_DOWN_DURATION;
  }
  return { timeline, endAt: t };
}

/** True for a verb whose token pushEdgeTimeline ITSELF already disappears —
 * a blocked/rejected request doesn't proceed, and an absorbed (stored/
 * transformed) one doesn't keep traveling either. This must match
 * pushEdgeTimeline's actual disappear behavior exactly, not just "isn't a
 * transport verb": the previous `!TRANSPORT_VERBS.has(verb)` definition
 * wrongly counted a PULSE_VERBS edge (checks/validates) as "consuming" the
 * token too — but pushEdgeTimeline's PULSE_VERBS branch never references
 * the token at all (see its own comment: "no travel expected"), so a chain
 * ending in `-validates->` or `-checks->` left the token permanently
 * sitting, un-cleaned-up, wherever the PREVIOUS transport edge left it —
 * confirmed directly via a real render (analyses/payment-account-matching:
 * Scene 4's `bank -request-> processor; processor -validates-> order` and
 * Scene 10's equivalent) and via `validateGeometry.ts`'s
 * checkTimelineFinalOverlap, not a guess. */
function consumesToken(verb: ContractEdge["verb"]): boolean {
  return STATE_VERBS.has(verb) || verb === "blocks" || verb === "rejects";
}

/** One shared token walking every edge in sequence — correct for a single
 * path (including there-and-back: the token just keeps walking the same
 * two links in reverse), since to/from chain onto each other by
 * definition. */
function buildSinglePathTimeline(contract: SceneContract, layout: Layout, startAt: number, stepGap: number): TimelineBuildResult {
  const timeline: FlowTimelineAction[] = [];
  const nodeColors = buildNodeColors(layout);
  const tokenId = "flowToken";
  // A PULSE_VERBS edge (checks/validates) never references the token at all
  // (see pushEdgeTimeline's own PULSE_VERBS branch — it only ever touches
  // `edge.to`) — a path made ENTIRELY of those (the single-edge "checks"
  // case is the most common shape) has nothing for a token to do, so it
  // must not exist at all, or it ships as a permanently invisible
  // (opacity: 0, never faded in) object. Only create it when at least one
  // edge actually transports something.
  const needsToken = contract.edges.some((edge) => !PULSE_VERBS.has(edge.verb));
  const objects: FlowObject[] = [];

  let t = startAt;
  if (needsToken) {
    const first = layout.positions[contract.edges[0].from];
    objects.push({ id: tokenId, type: "dot", x: first.x, y: first.y, color: TOKEN_COLOR, opacity: 0 });
    timeline.push({ type: "style", id: tokenId, startSeconds: t, durationSeconds: TOKEN_FADE_DURATION, color: TOKEN_COLOR });
    timeline.push({ type: "move", id: tokenId, startSeconds: t, durationSeconds: TOKEN_FADE_DURATION, opacity: 1 });
    t += 0.1;
  }

  let tokenConsumed = false;
  let lastActionEnd = t;
  for (const edge of contract.edges) {
    const fromPos = layout.positions[edge.from];
    const toPos = layout.positions[edge.to];
    const result = pushEdgeTimeline(edge, tokenId, fromPos, toPos, nodeColors, t);
    timeline.push(...result.timeline);
    lastActionEnd = result.endAt;
    t = result.endAt + stepGap;
    if (consumesToken(edge.verb)) {
      tokenConsumed = true;
      break;
    }
  }
  // A plain transport verb (request/forwards/routes/returns/responds) never
  // consumes the token — it just leaves it sitting exactly on whatever node
  // it last arrived at, forever, since nothing else in this sequence ever
  // moves or removes it again. For a chain that doesn't happen to end on a
  // STATE_VERB/blocks/rejects (which already fade the token via
  // pushEdgeTimeline), that means a real render bug: a there-and-back path
  // (e.g. client->api->client) leaves a permanent second dot exactly
  // coincident with the origin node for the rest of the scene — confirmed
  // directly via `validateGeometry.ts`'s checkTimelineFinalOverlap, not a
  // guess. The token exists to show motion IN TRANSIT; once the journey is
  // over it has no reason to persist as a redundant marker on top of
  // wherever it ended up.
  if (needsToken && !tokenConsumed) {
    timeline.push({ type: "disappear", id: tokenId, startSeconds: lastActionEnd, durationSeconds: 0.3 });
  }

  return { objects, timeline };
}

/** One independent token per outgoing edge, staggered — used for a fan-out
 * (and as the honest fallback for any topology that isn't a single path):
 * each edge gets exactly the same treatment a single-path edge would, just
 * without chaining into the next one. */
function buildIndependentTokensTimeline(contract: SceneContract, layout: Layout, startAt: number, stepGap: number): TimelineBuildResult {
  const objects: FlowObject[] = [];
  const timeline: FlowTimelineAction[] = [];
  const nodeColors = buildNodeColors(layout);
  contract.edges.forEach((edge, i) => {
    const tokenId = `flowToken${i}`;
    const fromPos = layout.positions[edge.from];
    const toPos = layout.positions[edge.to];
    const t = startAt + i * stepGap;
    if (!PULSE_VERBS.has(edge.verb)) {
      objects.push({ id: tokenId, type: "dot", x: fromPos.x, y: fromPos.y, color: TOKEN_COLOR, opacity: 0 });
      timeline.push({ type: "move", id: tokenId, startSeconds: t, durationSeconds: TOKEN_FADE_DURATION, opacity: 1 });
    }
    const result = pushEdgeTimeline(edge, tokenId, fromPos, toPos, nodeColors, t + 0.1);
    timeline.push(...result.timeline);
    // Same fix as buildSinglePathTimeline's own end-of-sequence cleanup: a
    // plain transport verb never consumes its token, so without this it sits
    // permanently coincident with `edge.to` for the rest of the scene — a
    // real overlap on every fan-out edge that isn't a blocks/rejects/
    // STATE_VERB, not just the there-and-back case.
    if (!PULSE_VERBS.has(edge.verb) && !consumesToken(edge.verb)) {
      timeline.push({ type: "disappear", id: tokenId, startSeconds: result.endAt, durationSeconds: 0.3 });
    }
  });
  return { objects, timeline };
}

export interface ComposedFlow {
  title?: string;
  objects: FlowObject[];
  arrows: FlowArrow[];
  timeline: FlowTimelineAction[];
}

/** Compiles a declared SceneContract into a real `kind: "canvas"` visual —
 * the caller (parseSceneScript.ts's Flow scene type) still runs this
 * through `visualSchema.safeParse` exactly like a hand-authored Data block,
 * so every zod default (rotation/scale/opacity/enter/exit/easing/etc.)
 * gets applied the normal way rather than being hand-duplicated here.
 * `title` is always left unset — the Thesis is documentation/validation
 * material, not on-screen text; Canvas's own `title` renders as a large
 * heading, which a full sentence is the wrong shape for. */
export function composeFlow(contract: SceneContract, estimatedDurationSeconds: number): ComposedFlow {
  const ids = allEntityIds(contract);
  const fan = detectFanOut(contract.edges);
  const layout = fan ? layoutFan(fan.source, fan.targets) : layoutRow(ids);

  const nodes = buildNodes(contract, layout);
  const arrows = buildBaselineArrows(contract);

  const usableSeconds = Math.max(MIN_SCENE_SECONDS, estimatedDurationSeconds) - ENTRANCE_START - SETTLE_AFTER_ENTRANCE - END_BUFFER;
  const stepGap = contract.edges.length > 0 ? Math.max(0.6, usableSeconds / contract.edges.length) : 0;
  const startAt = ENTRANCE_START + layout.order.length * ENTRANCE_STAGGER + SETTLE_AFTER_ENTRANCE;

  const built =
    contract.edges.length === 0
      ? { objects: [], timeline: [] }
      : isSinglePath(contract.edges)
        ? buildSinglePathTimeline(contract, layout, startAt, stepGap)
        : buildIndependentTokensTimeline(contract, layout, startAt, stepGap);

  // A camera push-in timed to the action starting — Canvas fully supports
  // pan/zoom (see camera actions elsewhere in this project's real scripts)
  // and composeFlow was emitting NONE of it, leaving every compiled scene
  // sitting at a flat, static zoom for its entire duration regardless of
  // what's happening. Centered on the layout's own centroid so it reads as
  // "the camera leans into the action," not an arbitrary zoom.
  const centroidX = layout.order.reduce((sum, id) => sum + layout.positions[id].x, 0) / layout.order.length;
  const centroidY = layout.order.reduce((sum, id) => sum + layout.positions[id].y, 0) / layout.order.length;
  const cameraTimeline: FlowTimelineAction[] = [
    { type: "camera", startSeconds: startAt - 0.5, durationSeconds: 1.6, x: centroidX, y: centroidY, zoom: 1.18, easing: "easeInOut" },
  ];

  const entranceTimeline: FlowTimelineAction[] = layout.order.map((id, i) => ({
    type: "appear",
    id,
    startSeconds: ENTRANCE_START + i * ENTRANCE_STAGGER,
  }));

  return {
    title: undefined,
    objects: [...nodes, ...built.objects],
    arrows,
    timeline: [...entranceTimeline, ...cameraTimeline, ...built.timeline],
  };
}
