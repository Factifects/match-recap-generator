import { z } from "zod";
import { CANVAS_ICON_KEYS, type CanvasIconKey } from "../model/visualDefinitions";
import { estimateLabelHalfWidthPercent } from "../video/canvasLayout";
import { flattenTimeline, type CanvasAction, type TimelineNode } from "./timelineIR";
import {
  sendBehavior,
  transformBehavior,
  branchBehavior,
  fanoutBehavior,
  aggregateBehavior,
  connectBehavior,
  disconnectBehavior,
  streamBehavior,
  ARRIVAL_Y_OFFSET,
  CONTAINER_HEIGHT_2LINE,
  type FlowObject,
  type SendVerb,
} from "./mechanismBehaviors";

// The THIRD Timeline IR proof point, and the first built from a genuinely
// REUSABLE step vocabulary rather than one bespoke choreography per scene
// shape. `composeSelect.ts` proved a resolve-then-reveal process;
// `composeContinuous.ts` proved a data-driven continuous process; this
// proves a NAMED-MECHANISM process — "the client sends a request, the API
// validates it, queries the database..." — where every verb in the
// narration corresponds to its own step, and every step is a real,
// demonstrated event (a payload traveling, a state visibly changing), never
// a line quietly appearing between two icons.
//
// composeFlow.ts's `ContractEdge` model (one verb, three verb CATEGORIES
// that all reduce to the same "token moves/pulses/absorbs" choreography)
// cannot express this — see mechanismBehaviors.ts's own header for why the
// step vocabulary here is deliberately small (send/transform now; connect/
// disconnect/stream/fanout/aggregate/branch added in later phases, once
// each one's own proof mechanism actually needs it — not designed ahead of
// that need).
//
// Scope of this file, honestly: `send` and `transform` only, proven against
// the REST+Database mechanism first. Extended incrementally, one real
// mechanism at a time (Cache branch, GraphQL fanout/aggregate, WebSocket
// connect/stream), per this phase's own build-sequence discipline.

const entitySchema = z.object({ id: z.string(), label: z.string(), icon: z.enum(CANVAS_ICON_KEYS).optional() });

const sendStepSchema = z.object({
  kind: z.literal("send"),
  from: z.string(),
  to: z.string(),
  // The real thing that travels — a request path, a SQL query, a JSON
  // payload, a result row. This is what makes a `send` a demonstrated
  // event instead of a generic arrow: the viewer reads the actual content
  // crossing the relationship.
  payload: z.string(),
  verb: z.enum(["request", "response", "query", "broadcast", "event"]).default("request"),
});

const transformStepSchema = z.object({
  kind: z.literal("transform"),
  entity: z.string(),
  // What the entity is doing to its own state right now — "validating",
  // "looking up", "hashing the key" — rendered as its own visible beat.
  state: z.string(),
});

// Recursive: an outcome's own `steps` can contain further sends/transforms/
// branches — exactly what a cache miss needs (query -> lookup -> populate ->
// respond, all nested inside the "miss" outcome). Declared as an explicit
// interface (not z.infer) because zod can't infer through its own `z.lazy`
// circularity — the standard pattern for a self-referential zod schema.
export interface SendStep {
  kind: "send";
  from: string;
  to: string;
  payload: string;
  verb: "request" | "response" | "query" | "broadcast" | "event";
}
export interface TransformStep {
  kind: "transform";
  entity: string;
  state: string;
}
export interface BranchStep {
  kind: "branch";
  at: string;
  condition: string;
  outcomes: { label: string; steps: MechanismStep[] }[];
  // Which outcome actually happens in THIS walkthrough — matches one
  // outcome's `label`. Authored, like `composeContinuous.ts`'s arrival/
  // departure arrays: this is a scripted example run, not computed data —
  // there's no real request coming through to decide it live.
  taken: string;
}
export interface FanoutStep {
  kind: "fanout";
  from: string;
  // Each target gets its OWN real payload — GraphQL field selection means
  // separate resolvers get separate field requests, not one broadcast
  // request with a compound label.
  targets: { to: string; payload: string }[];
  verb: "request" | "response" | "query" | "broadcast" | "event";
}
export interface AggregateStep {
  kind: "aggregate";
  // Each source's own real resolved value — what actually converges and
  // merges, not a label that just asserts merging happened.
  sources: { from: string; payload: string }[];
  into: string;
  resultPayload: string;
}
export interface ConnectStep {
  kind: "connect";
  a: string;
  b: string;
}
export interface DisconnectStep {
  kind: "disconnect";
  a: string;
  b: string;
}
export interface StreamStep {
  kind: "stream";
  a: string;
  b: string;
  // A stream with only one event isn't demonstrating a stream — enforced
  // by the schema's own .min(2) below, not just a naming convention.
  events: { direction: "aToB" | "bToA"; payload: string; atSeconds: number }[];
}
export type MechanismStep = SendStep | TransformStep | BranchStep | FanoutStep | AggregateStep | ConnectStep | DisconnectStep | StreamStep;

// `branchStepSchema` itself stays a PLAIN z.object (not wrapped in z.lazy) —
// `z.discriminatedUnion` needs to introspect each member's literal `kind`
// field directly at schema-construction time, which it can't do through a
// ZodLazy wrapper. Only the actually-recursive part (`outcomes[].steps`,
// which needs `mechanismStepSchema` before that binding exists yet — a
// temporal-dead-zone hazard) is individually wrapped in `z.lazy`, deferring
// that one reference until parse time instead of module-evaluation time.
const branchStepSchema = z.object({
  kind: z.literal("branch"),
  at: z.string(),
  condition: z.string(),
  outcomes: z
    .array(
      z.object({
        label: z.string(),
        steps: z.array(z.lazy((): z.ZodType<MechanismStep> => mechanismStepSchema)),
      }),
    )
    .min(2),
  // Which outcome actually happens in this walkthrough — matches one
  // outcome's `label`.
  taken: z.string(),
});

const fanoutStepSchema = z.object({
  kind: z.literal("fanout"),
  from: z.string(),
  targets: z.array(z.object({ to: z.string(), payload: z.string() })).min(2),
  verb: z.enum(["request", "response", "query", "broadcast", "event"]).default("request"),
});

const aggregateStepSchema = z.object({
  kind: z.literal("aggregate"),
  sources: z.array(z.object({ from: z.string(), payload: z.string() })).min(2),
  into: z.string(),
  resultPayload: z.string(),
});

const connectStepSchema = z.object({ kind: z.literal("connect"), a: z.string(), b: z.string() });
const disconnectStepSchema = z.object({ kind: z.literal("disconnect"), a: z.string(), b: z.string() });
const streamStepSchema = z.object({
  kind: z.literal("stream"),
  a: z.string(),
  b: z.string(),
  events: z
    .array(
      z.object({
        direction: z.enum(["aToB", "bToA"]),
        payload: z.string(),
        atSeconds: z.number().nonnegative(),
      }),
    )
    .min(2),
});

const mechanismStepSchema: z.ZodType<MechanismStep> = z.discriminatedUnion("kind", [
  sendStepSchema,
  transformStepSchema,
  branchStepSchema,
  fanoutStepSchema,
  aggregateStepSchema,
  connectStepSchema,
  disconnectStepSchema,
  streamStepSchema,
]);

export const mechanismContractSchema = z.object({
  entities: z.array(entitySchema).min(2),
  steps: z.array(mechanismStepSchema).min(1),
});
export type MechanismContractInput = z.infer<typeof mechanismContractSchema>;

interface FlowArrow {
  from: string;
  to: string;
  style?: "solid" | "dashed";
  flow?: boolean;
  revealAtSeconds?: number;
}

export interface ComposedMechanism {
  title?: string;
  objects: FlowObject[];
  arrows: FlowArrow[];
  timeline: CanvasAction[];
}

const X_MIN = 15;
const ENTITY_COLUMN_GAP = 6;
const Y_MIN = 25;
const Y_MAX = 75;
const ENTITY_RADIUS = 11;
// An entity's own caption sits below it — same estimate
// canvasLayout.ts's `estimateObjectBoundingBox` uses for an icon's label.
const ENTITY_CAPTION_HEIGHT = 4;
// The IDEAL vertical gap between two entities stacked in the same hop
// column — enough room for a payload/state container to float above the
// LOWER entity without crowding the UPPER entity's own caption. Derived
// from mechanismBehaviors.ts's own ARRIVAL_Y_OFFSET/CONTAINER_HEIGHT
// rather than a second, independently-guessed number, so the two files
// can't silently drift out of sync (confirmed as a real bug once already:
// a fanout target's payload landing on the next entity's caption because
// the column gap was tuned only for icon+caption).
const MIN_ENTITY_Y_GAP = ARRIVAL_Y_OFFSET + CONTAINER_HEIGHT_2LINE / 2 + ENTITY_RADIUS + ENTITY_CAPTION_HEIGHT + 2;
// The ABSOLUTE floor — two entities' own icon+caption footprints never
// overlapping — independent of whether there's also room for the ideal
// gap above. Entities visibly overlapping is a worse, more obvious
// failure than a payload arriving with tighter-than-ideal clearance near
// a densely packed column, so this floor can never be traded away for
// the ideal ABOVE, only for the fittable space (below).
const ENTITY_ONLY_MIN_GAP = ENTITY_RADIUS * 2 + ENTITY_CAPTION_HEIGHT + 2;
// Entity CENTERS only need to stay clear of the canvas edge by their own
// icon+caption footprint — genuinely payload-agnostic. An earlier version
// of this range also tried to reserve headroom for whatever content might
// float above/below an entity (ARRIVAL_Y_OFFSET-aware), which coupled
// this file's layout to mechanismBehaviors.ts's own offset constants
// tightly enough that tightening one to fix a cross-direction stream
// collision (see ARRIVAL_Y_OFFSET's own comment) immediately broke THIS
// file's entity spacing for a 3-way stack, in the other direction, twice.
// The two concerns are now fully decoupled: this file only has to
// guarantee entities don't overlap EACH OTHER; mechanismBehaviors.ts's
// own `clampY` (see its header comment) is independently responsible for
// keeping every payload/state/condition coordinate on-canvas regardless
// of how tightly entities end up packed. Neither file needs to reason
// about the other's constraints to be correct.
const ENTITY_Y_MIN = ENTITY_RADIUS + 2;
const ENTITY_Y_MAX = 100 - ENTITY_RADIUS - ENTITY_CAPTION_HEIGHT - 2;
const FIRST_ENTITY_COLOR = "#5b8def";
const OTHER_ENTITY_COLOR = "#8a8f98";

const ENTRANCE_START = 0.3;
const ENTRANCE_STAGGER = 0.25;
const SETTLE_GAP = 0.6;
const STEP_GAP = 0.35;

/** Every `from`/`to` pair a step touches, for layout purposes only — not a
 * semantic graph. `transform` contributes no edge (it's a self-change). A
 * `branch` recurses into EVERY outcome (not just the taken one) — even the
 * outcome that doesn't play still needs its entities placed somewhere
 * sensible, since its own preview container briefly renders during the fork
 * beat. Extended further as later phases add connect/stream/fanout/
 * aggregate, each of which DOES relate two or more entities too. */
function collectEdges(steps: MechanismStep[]): [string, string][] {
  const edges: [string, string][] = [];
  for (const step of steps) {
    if (step.kind === "send") edges.push([step.from, step.to]);
    else if (step.kind === "branch") {
      for (const outcome of step.outcomes) edges.push(...collectEdges(outcome.steps));
    } else if (step.kind === "fanout") {
      for (const t of step.targets) edges.push([step.from, t.to]);
    } else if (step.kind === "aggregate") {
      for (const s of step.sources) edges.push([s.from, step.into]);
    } else if (step.kind === "connect" || step.kind === "disconnect" || step.kind === "stream") {
      edges.push([step.a, step.b]);
    }
  }
  return edges;
}

/** A faint, always-visible dashed connector for every distinct entity pair
 * a step relates — same rationale as `composeFlow.ts`'s own
 * `buildBaselineArrows`: a relationship should read as real even in the
 * moments nothing is actively transiting it, not just while a payload
 * happens to be mid-flight. */
function collectConnectedPairs(steps: MechanismStep[]): Set<string> {
  const pairs = new Set<string>();
  for (const step of steps) {
    if (step.kind === "connect") pairs.add([step.a, step.b].sort().join("|"));
    else if (step.kind === "branch") {
      for (const outcome of step.outcomes) for (const p of collectConnectedPairs(outcome.steps)) pairs.add(p);
    }
  }
  return pairs;
}

function buildBaselineArrows(steps: MechanismStep[]): FlowArrow[] {
  // A pair with an explicit `connect` step gets the real persistent
  // connection LINE (mechanismBehaviors.ts's connectBehavior) instead —
  // drawing a second, generic dashed baseline arrow on top of it would be
  // redundant clutter, not a second real signal.
  const connectedPairs = collectConnectedPairs(steps);
  const seenPairs = new Set<string>();
  const arrows: FlowArrow[] = [];
  let i = 0;
  for (const [a, b] of collectEdges(steps)) {
    const pairKey = [a, b].sort().join("|");
    if (seenPairs.has(pairKey) || connectedPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    arrows.push({ from: a, to: b, style: "dashed", flow: true, revealAtSeconds: ENTRANCE_START + (i + 1) * 0.3 });
    i++;
  }
  return arrows;
}

interface Layout {
  positions: Record<string, { x: number; y: number }>;
  order: string[];
}

/** Places every entity by its hop-distance (BFS, edges treated as
 * undirected — a response traveling back is still the same relationship)
 * from the first declared entity, left to right — the DAG generalization of
 * `composeFlow.ts`'s row/fan layouts, content-derived from the contract's
 * own steps rather than hand-positioned per mechanism. Entities at the same
 * hop distance (e.g. a branch's two outcome targets, once branch exists)
 * spread vertically. An entity never touched by any edge (declared but
 * unused) is appended at the far right rather than dropped — same
 * graceful-degradation posture as the rest of this project. */
function layoutEntities(entities: MechanismContractInput["entities"], steps: MechanismStep[]): Layout {
  const ids = entities.map((e) => e.id);
  const edges = collectEdges(steps);
  const adjacency = new Map<string, Set<string>>();
  for (const id of ids) adjacency.set(id, new Set());
  for (const [a, b] of edges) {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
    if (!adjacency.has(a)) adjacency.set(a, new Set([b]));
    if (!adjacency.has(b)) adjacency.set(b, new Set([a]));
  }

  const hop = new Map<string, number>();
  const root = ids[0];
  hop.set(root, 0);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentHop = hop.get(current)!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!hop.has(neighbor)) {
        hop.set(neighbor, currentHop + 1);
        queue.push(neighbor);
      }
    }
  }
  const maxHop = Math.max(0, ...[...hop.values()]);
  // Anything unreached (declared but never referenced by a step) sits one
  // hop past everything else, in first-declared order.
  let nextUnreachedHop = maxHop + 1;
  for (const id of ids) {
    if (!hop.has(id)) hop.set(id, nextUnreachedHop++);
  }
  const finalMaxHop = Math.max(...[...hop.values()]);

  const buckets = new Map<number, string[]>();
  for (const id of ids) {
    const h = hop.get(id)!;
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h)!.push(id);
  }
  const labelById = new Map(entities.map((e) => [e.id, e.label]));

  // X is chained left-to-right by REAL content width (each column's half-
  // width is the widest entity caption in that hop bucket, or the icon
  // radius, whichever is larger) — a fixed even division of X_MIN..X_MAX
  // overlapped a real caption in testing the moment one entity's label was
  // longer than the others (same class of bug composeSelect.ts's rebuild
  // hit and fixed the same way: estimateLabelHalfWidthPercent, chained).
  const positions: Record<string, { x: number; y: number }> = {};
  let cursor = X_MIN;
  for (let h = 0; h <= finalMaxHop; h++) {
    const bucketIds = buckets.get(h) ?? [];
    if (bucketIds.length === 0) continue;
    const columnHalfWidth = Math.max(ENTITY_RADIUS, ...bucketIds.map((id) => estimateLabelHalfWidthPercent(labelById.get(id) ?? id)));
    const x = cursor + columnHalfWidth;
    // A single vertical column genuinely cannot fit 3+ entities without
    // SOMETHING colliding — confirmed directly via a real render (a
    // GraphQL 3-resolver fan-out): each entity needs enough clearance for
    // its own icon+caption AND for a payload popping in/arriving just
    // above it, and those two requirements stacked twice (for 3 entities)
    // structurally exceed the usable canvas height regardless of how the
    // gap is tuned — every tuning attempt just moved WHICH pair collided,
    // not whether anything did. Splitting 3+ into two rows (row B offset
    // sideways from row A) makes each row's own vertical stack only 1-2
    // items deep, which comfortably fits — this is a real layout-grammar
    // fix (arrange in a shape that fits, don't keep shrinking content into
    // a shape that structurally can't), not another offset tweak. Full
    // grid/hierarchy composition is the larger, separate
    // responsive-layout mandate; this is the minimal version of that idea
    // needed to unblock a same-hop bucket of exactly this size.
    const rowA = bucketIds.length >= 3 ? bucketIds.slice(0, Math.ceil(bucketIds.length / 2)) : bucketIds;
    const rowB = bucketIds.length >= 3 ? bucketIds.slice(Math.ceil(bucketIds.length / 2)) : [];
    const rowBOffsetX = rowB.length > 0 ? columnHalfWidth * 2 + 4 : 0;
    const centerY = (ENTITY_Y_MIN + ENTITY_Y_MAX) / 2;
    const placeRow = (rowIds: string[], rowX: number) => {
      if (rowIds.length === 0) return;
      const nominalStep = rowIds.length === 1 ? 0 : (Y_MAX - Y_MIN) / (rowIds.length - 1);
      const fittableStep = rowIds.length === 1 ? Infinity : (ENTITY_Y_MAX - ENTITY_Y_MIN) / (rowIds.length - 1);
      const step = Math.max(nominalStep, ENTITY_ONLY_MIN_GAP, Math.min(MIN_ENTITY_Y_GAP, fittableStep));
      // Defensive clamp, same rationale as the Y clamp above — a bucket at
      // the far right of the canvas (the common case: this row-split only
      // triggers for 3+ same-hop entities, usually the LAST/rightmost hop
      // in a fan-out) pushing row B's sideways offset past x:100 is a real,
      // confirmed failure (a schema-invalid x — caught by this project's
      // own regression test before it ever reached a render), not a
      // hypothetical one.
      const clampedRowX = Math.min(97, Math.max(3, rowX));
      rowIds.forEach((id, i) => {
        const raw = rowIds.length === 1 ? centerY : centerY + (i - (rowIds.length - 1) / 2) * step;
        const y = Math.min(ENTITY_Y_MAX, Math.max(ENTITY_Y_MIN, raw));
        positions[id] = { x: clampedRowX, y };
      });
    };
    placeRow(rowA, x);
    placeRow(rowB, x + rowBOffsetX);
    cursor = x + columnHalfWidth + rowBOffsetX + ENTITY_COLUMN_GAP;
  }

  return { positions, order: ids };
}

function act(action: CanvasAction, offsetSeconds?: number): TimelineNode {
  return { kind: "action", action, offsetSeconds };
}
function seq(children: TimelineNode[]): TimelineNode {
  return { kind: "sequence", children };
}
function par(children: TimelineNode[]): TimelineNode {
  return { kind: "parallel", children };
}
function delay(seconds: number, child: TimelineNode): TimelineNode {
  return { kind: "delay", seconds, child };
}

/** Walks a step list (either the contract's top-level steps, OR a branch
 * outcome's own nested steps) and compiles each into its own real
 * choreography beat via mechanismBehaviors.ts, chained in declared order.
 * Recursive: a `branch` step compiles its own decision+fork beat THEN
 * recursively compiles the TAKEN outcome's nested steps right after it,
 * using this same function — so a cache miss's fall-through
 * (query -> lookup -> populate -> respond) gets exactly the same real,
 * timed treatment as any top-level step, not a special case. `idPrefix`
 * keeps every nested step's object ids unique per branch instance. */
function compileSteps(steps: MechanismStep[], layout: Layout, entityColor: (id: string) => string, idPrefix: string): { objects: FlowObject[]; nodes: TimelineNode[] } {
  const objects: FlowObject[] = [];
  const nodes: TimelineNode[] = [];
  steps.forEach((step, i) => {
    const instanceId = `${idPrefix}${i}`;
    const gap = i === 0 ? 0 : STEP_GAP;
    if (step.kind === "send") {
      const fromPos = layout.positions[step.from];
      const toPos = layout.positions[step.to];
      const result = sendBehavior(instanceId, fromPos, toPos, step.to, step.payload, step.verb as SendVerb);
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else if (step.kind === "transform") {
      const pos = layout.positions[step.entity];
      const result = transformBehavior(instanceId, step.entity, pos, entityColor(step.entity), step.state);
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else if (step.kind === "branch") {
      const atPos = layout.positions[step.at];
      const result = branchBehavior(
        instanceId,
        step.at,
        atPos,
        entityColor(step.at),
        step.condition,
        step.outcomes.map((o) => ({ label: o.label, taken: o.label === step.taken })),
      );
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
      const takenOutcome = step.outcomes.find((o) => o.label === step.taken);
      if (takenOutcome) {
        const nested = compileSteps(takenOutcome.steps, layout, entityColor, `${instanceId}_t`);
        objects.push(...nested.objects);
        nodes.push(...nested.nodes);
      }
    } else if (step.kind === "fanout") {
      const fromPos = layout.positions[step.from];
      const result = fanoutBehavior(
        instanceId,
        fromPos,
        step.targets.map((t) => ({ toEntityId: t.to, toPos: layout.positions[t.to], payload: t.payload })),
        step.verb as SendVerb,
      );
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else if (step.kind === "aggregate") {
      const intoPos = layout.positions[step.into];
      const result = aggregateBehavior(
        instanceId,
        step.sources.map((s) => ({ fromEntityId: s.from, fromPos: layout.positions[s.from], payload: s.payload })),
        step.into,
        intoPos,
        step.resultPayload,
      );
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else if (step.kind === "connect") {
      const result = connectBehavior(step.a, layout.positions[step.a], step.b, layout.positions[step.b]);
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else if (step.kind === "disconnect") {
      const result = disconnectBehavior(step.a, step.b);
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    } else {
      const result = streamBehavior(instanceId, step.a, layout.positions[step.a], step.b, layout.positions[step.b], step.events);
      objects.push(...result.objects);
      nodes.push(delay(gap, result.timeline));
    }
  });
  return { objects, nodes };
}

/** Compiles a declared MechanismContractInput into a real `kind: "canvas"`
 * visual. Every step becomes its own real, timed choreography beat via
 * mechanismBehaviors.ts — the composition here is purely WHERE (layout) and
 * WHEN (sequencing/camera), never re-deciding WHAT HAPPENS (that's fully
 * owned by the behavior primitives). Camera stays fully neutral for the
 * whole scene: payload/state/condition/outcome content renders as
 * `roundedRectangle` containers (Canvas.tsx's camera-transformed layer,
 * same as entities' `icon`/`dot` objects), so a payload traveling toward an
 * entity always lands where it visually should even without a moving
 * camera to worry about — camera choreography is future work once a scene
 * actually needs it, not risked speculatively (see
 * feedback_camera_layer_mismatch_icon_vs_label for why that risk is real,
 * not hypothetical). */
export function composeMechanism(contract: MechanismContractInput, estimatedDurationSeconds: number): ComposedMechanism {
  void estimatedDurationSeconds; // steps carry their own real durations — see mechanismBehaviors.ts's header.
  const layout = layoutEntities(contract.entities, contract.steps);

  const entityColor = (id: string): string => (id === layout.order[0] ? FIRST_ENTITY_COLOR : OTHER_ENTITY_COLOR);

  const objects: FlowObject[] = contract.entities.map((e) => {
    const pos = layout.positions[e.id];
    const base = {
      id: e.id,
      x: pos.x,
      y: pos.y,
      label: e.label,
      color: entityColor(e.id),
      radius: ENTITY_RADIUS,
      enter: "scale" as const,
    };
    return e.icon ? { ...base, type: "icon" as const, icon: e.icon as CanvasIconKey } : { ...base, type: "dot" as const };
  });

  const entranceTimeline = layout.order.map((id, i) => act({ type: "appear", id, startSeconds: 0, sound: "entrance" }, i * ENTRANCE_STAGGER));

  const { objects: stepObjects, nodes: stepNodes } = compileSteps(contract.steps, layout, entityColor, "step");

  const entranceEnd = ENTRANCE_START + layout.order.length * ENTRANCE_STAGGER;
  const { actions: entranceActions } = flattenTimeline(par(entranceTimeline), ENTRANCE_START);
  const { actions: stepActions } = flattenTimeline(seq(stepNodes), entranceEnd + SETTLE_GAP);

  const cameraNeutral: CanvasAction = { type: "camera", startSeconds: 0, x: 50, y: 50, zoom: 1.0 };

  return {
    title: undefined,
    objects: [...objects, ...stepObjects],
    arrows: buildBaselineArrows(contract.steps),
    timeline: [...entranceActions, ...stepActions, cameraNeutral],
  };
}
