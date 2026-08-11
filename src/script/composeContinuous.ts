import { z } from "zod";
import { CANVAS_ICON_KEYS, type CanvasIconKey } from "../model/visualDefinitions";
import { flattenTimeline, compileDataBinding, type TimelineNode, type CanvasAction, type DataBinding } from "./timelineIR";

// The SECOND Timeline IR proof point (composeSelect.ts was the first) —
// deliberately a structurally DIFFERENT kind of scene: not a single
// resolve-then-reveal process but a CONTINUOUS one, driven entirely by a
// data series (arrival/departure timestamps), not a fixed, hand-authored
// item count. The explicit test this exists to pass: does the Timeline IR
// (sequence/parallel/delay/repeat/compileDataBinding) hold up for a genuinely
// different choreography shape, or did composeSelect.ts's success only prove
// it works for ONE shape?
//
// A real discrete-event queue simulation runs here (see simulateQueue below)
// — the compiler does not place items at hand-picked slots. How many items
// exist, when they arrive, how long they wait, and when they're consumed are
// ALL a function of the `arrivals`/`departures` input arrays. Different data
// in produces a different simulated, rendered process out; the same
// simulate→layout→timeline pipeline is reused unchanged for any arrival/
// departure pattern (that reusability is the actual point, not a specific
// script's numbers).

const actorSchema = z.object({ label: z.string(), icon: z.enum(CANVAS_ICON_KEYS).optional() });

export const queueContractSchema = z.object({
  processor: actorSchema,
  itemIcon: z.enum(CANVAS_ICON_KEYS).optional(),
  // Seconds from scene start. Not required to be sorted — simulateQueue
  // sorts its own merged event list. A departure with no corresponding
  // waiting item (queue already empty) is a defensive no-op, not an error —
  // see simulateQueue's own comment.
  arrivals: z.array(z.number().nonnegative()).min(1),
  departures: z.array(z.number().nonnegative()).min(1),
});
export type QueueContractInput = z.infer<typeof queueContractSchema>;

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
}
export interface ComposedQueue {
  title?: string;
  objects: FlowObject[];
  arrows: never[];
  timeline: CanvasAction[];
}

const ROW_Y = 55;
const PROCESSOR_X = 82;
const PROCESSOR_RADIUS = 11;
const LANE_START_X = 18;
const ITEM_RADIUS = 6;
const GAUGE_X = PROCESSOR_X;
const GAUGE_Y = ROW_Y - 24;
const GAUGE_BASE_RADIUS = 4;
const GAUGE_RADIUS_PER_ITEM = 2.4;
const GAUGE_MAX_RADIUS = 15;
const MIN_SLOTS = 3;
const MAX_SLOTS = 7;

const NEUTRAL_COLOR = "#5b8def";
const PROCESSOR_COLOR = "#c7ccd6";
const CONSUME_FLASH_COLOR = "#3ecf8e";

const ENTRANCE_START = 0.3;
const SETTLE_GAP = 0.5;
const ENTER_DURATION = 0.6;
const SHIFT_DURATION = 0.45;
const CONSUME_DURATION = 0.4;
const WAIT_PULSE_INTERVAL = 2.6;
const CONSUME_FLASH_DURATION = 0.3;

function act(action: CanvasAction, offsetSeconds?: number): TimelineNode {
  return { kind: "action", action, offsetSeconds };
}
function par(children: TimelineNode[]): TimelineNode {
  return { kind: "parallel", children };
}
function seq(children: TimelineNode[]): TimelineNode {
  return { kind: "sequence", children };
}

type QueueEvent = { t: number; kind: "arrival" | "departure" };

interface SimulatedItem {
  id: string;
  /** Every position this item occupies over its lifetime, in order — the
   * FIRST entry is where it enters the lane (its arrival slot), each
   * subsequent entry is a forward shift triggered by an earlier departure,
   * and (if it's ever served) a final entry is its consumption. Every entry
   * is a genuine simulated event, never authored by hand. */
  moves: { t: number; slotIndex: number | "consumed" }[];
}

interface SimulationResult {
  items: SimulatedItem[];
  /** Queue depth immediately after each event, earliest first — the raw
   * series compileDataBinding turns into the gauge's real, continuously
   * varying radius. */
  depthSamples: { atSeconds: number; value: number }[];
  maxDepth: number;
  /** Absolute time of each departure that actually consumed something —
   * drives the processor's "did work" flash. A departure event with an
   * empty queue produces no consumption and is skipped here. */
  consumeTimes: number[];
}

/** A real discrete-event simulation, not a layout guess: walks the merged,
 * time-sorted arrival/departure events and maintains the actual queue
 * (FIFO) exactly as a real system would — an arrival is pushed onto the
 * back, a departure serves (and removes) the front, and everything still
 * waiting shifts forward one slot. A departure with nothing in the queue is
 * a defensive no-op (an author-supplied departure list that outpaces
 * arrivals shouldn't crash the compiler, just do nothing — same graceful-
 * degradation posture as every other compiler in this project). */
function simulateQueue(contract: QueueContractInput): SimulationResult {
  const events: QueueEvent[] = [
    ...contract.arrivals.map((t): QueueEvent => ({ t, kind: "arrival" })),
    ...contract.departures.map((t): QueueEvent => ({ t, kind: "departure" })),
  ].sort((a, b) => a.t - b.t || (a.kind === "arrival" ? -1 : 1));

  const queue: string[] = [];
  const itemsById = new Map<string, SimulatedItem>();
  const depthSamples: { atSeconds: number; value: number }[] = [{ atSeconds: 0, value: 0 }];
  const consumeTimes: number[] = [];
  let maxDepth = 0;
  let arrivalCount = 0;

  for (const event of events) {
    if (event.kind === "arrival") {
      const id = `queueItem_${arrivalCount++}`;
      const item: SimulatedItem = { id, moves: [{ t: event.t, slotIndex: queue.length }] };
      itemsById.set(id, item);
      queue.push(id);
    } else {
      if (queue.length === 0) continue; // no-op: nothing waiting to serve
      const servedId = queue.shift()!;
      itemsById.get(servedId)!.moves.push({ t: event.t, slotIndex: "consumed" });
      consumeTimes.push(event.t);
      queue.forEach((id, index) => itemsById.get(id)!.moves.push({ t: event.t, slotIndex: index }));
    }
    maxDepth = Math.max(maxDepth, queue.length);
    depthSamples.push({ atSeconds: event.t, value: queue.length });
  }

  return { items: [...itemsById.values()], depthSamples, maxDepth, consumeTimes };
}

/** Compiles a declared QueueContractInput into a real `kind: "canvas"`
 * visual. Unlike composeSelect.ts's resolve-then-reveal shape, this scene
 * has no fixed endpoint to build toward — it's the OTHER kind of process: a
 * continuous flow the viewer can join at any frame and still see something
 * genuinely in motion (a new item transporting in, a shift rippling down the
 * line, the processor flashing on a consumption, the depth gauge visibly
 * swelling or draining), for as long as the input data says it should keep
 * happening. */
export function composeContinuous(contract: QueueContractInput, estimatedDurationSeconds: number): ComposedQueue {
  const sim = simulateQueue(contract);
  const slotCount = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, sim.maxDepth));
  const laneFrontX = PROCESSOR_X - PROCESSOR_RADIUS - ITEM_RADIUS - 5;
  const slotStep = slotCount > 1 ? (laneFrontX - LANE_START_X) / (slotCount - 1) : 0;
  const slotX = (index: number) => laneFrontX - Math.min(index, slotCount - 1) * slotStep;

  const objects: FlowObject[] = [];
  const processorId = "queueProcessor";
  objects.push({ id: processorId, type: contract.processor.icon ? "icon" : "dot", icon: contract.processor.icon, x: PROCESSOR_X, y: ROW_Y, radius: PROCESSOR_RADIUS, color: PROCESSOR_COLOR, label: contract.processor.label, enter: "scale" });

  // No explicit `opacity: 0` here, unlike the queue items below — an
  // "appear" action (used for this object, see arrivePhase) only gates
  // WHETHER an object renders at all, it never touches opacity itself
  // (unlike a `move` action's own `opacity` target, which items/composeSelect
  // ".ts's hidden objects rely on for their reveal). Pairing `opacity: 0`
  // with "appear" was confirmed as a real bug via a render: the gauge's
  // `visible` flag flips true right on cue, but it stays permanently
  // rendered at its authored opacity of 0 forever after — invisible for the
  // whole scene. Leaving opacity unset here defaults it to 1 once visible,
  // matching how every other appear-only object (e.g. composeSelect.ts's
  // subject) already does this correctly.
  const gaugeId = "queueDepthGauge";
  objects.push({ id: gaugeId, type: "dot", x: GAUGE_X, y: GAUGE_Y, radius: GAUGE_BASE_RADIUS, color: NEUTRAL_COLOR, label: "0 waiting" });

  // Every item is authored already sitting at its own arrival slot,
  // invisible — its FIRST timeline action is a real transport move (opacity
  // 0->1, off-lane-feeling entry) into that slot, not a teleport-in. Off-lane
  // by a few percent so the entrance genuinely reads as "arriving," the same
  // technique composeSelect.ts uses for criteria extracting out of the
  // subject.
  const OFF_LANE_X = LANE_START_X - 6;
  for (const item of sim.items) {
    objects.push({ id: item.id, type: contract.itemIcon ? "icon" : "dot", icon: contract.itemIcon, x: OFF_LANE_X, y: ROW_Y, radius: ITEM_RADIUS, color: NEUTRAL_COLOR, opacity: 0 });
  }

  const itemNodes: TimelineNode[] = [];
  for (const item of sim.items) {
    item.moves.forEach((move, i) => {
      if (move.slotIndex === "consumed") {
        itemNodes.push(act({ type: "move", id: item.id, startSeconds: 0, durationSeconds: CONSUME_DURATION, to: { x: PROCESSOR_X - PROCESSOR_RADIUS, y: ROW_Y }, opacity: 0, sound: "move" }, move.t));
        itemNodes.push(act({ type: "disappear", id: item.id, startSeconds: 0, durationSeconds: 0.2 }, move.t + CONSUME_DURATION));
        return;
      }
      const isEntry = i === 0;
      itemNodes.push(
        act(
          {
            type: "move",
            id: item.id,
            startSeconds: 0,
            durationSeconds: isEntry ? ENTER_DURATION : SHIFT_DURATION,
            to: { x: slotX(move.slotIndex), y: ROW_Y },
            opacity: isEntry ? 1 : undefined,
            sound: isEntry ? "entrance" : "move",
          },
          move.t,
        ),
      );
    });
  }

  // The processor visibly reacts every time it actually consumes an item —
  // an explanatory signal ("something just happened here"), not decoration:
  // without it, an item vanishing near the processor reads as a disappearing-
  // object glitch rather than "got processed."
  const consumeFlashNodes = sim.consumeTimes.map((t) =>
    par([act({ type: "style", id: processorId, startSeconds: 0, durationSeconds: CONSUME_FLASH_DURATION, color: CONSUME_FLASH_COLOR, sound: "success" }, t), act({ type: "move", id: processorId, startSeconds: 0, durationSeconds: CONSUME_FLASH_DURATION, scale: 1.15 }, t), act({ type: "move", id: processorId, startSeconds: 0, durationSeconds: CONSUME_FLASH_DURATION, scale: 1.0 }, t + CONSUME_FLASH_DURATION), act({ type: "style", id: processorId, startSeconds: 0, durationSeconds: 0.3, color: PROCESSOR_COLOR }, t + CONSUME_FLASH_DURATION)]),
  );

  // The gauge's radius is bound to the REAL simulated depth series — grows
  // as items back up, shrinks as they're served. A concrete use of
  // compileDataBinding's own stated purpose (magnitude via radius), not just
  // a unit-tested primitive nobody's actual compiler calls yet. Needs a
  // trailing sample holding the final value so the binding has something to
  // interpolate toward for the rest of the scene, and a minimum of two
  // samples to be a binding at all.
  const lastDepth = sim.depthSamples[sim.depthSamples.length - 1];
  const gaugeSamples = [...sim.depthSamples, { atSeconds: estimatedDurationSeconds, value: lastDepth.value }].map((s) => ({ atSeconds: s.atSeconds, value: Math.min(GAUGE_MAX_RADIUS, GAUGE_BASE_RADIUS + s.value * GAUGE_RADIUS_PER_ITEM) }));
  const gaugeBinding: DataBinding = { id: gaugeId, property: "radius", samples: gaugeSamples };
  const gaugeLabelNodes = sim.depthSamples.map((s) => act({ type: "style", id: gaugeId, startSeconds: 0, durationSeconds: 0.2, label: `${s.value} waiting` }, s.atSeconds));

  // The one piece of genuinely open-ended, count-independent motion in the
  // scene — a real `repeat` node running for however long the scene lasts,
  // proving the IR can sustain a behavior that ISN'T bounded by the finite
  // arrivals/departures list at all (unlike every item's own motion above,
  // which is inherently bounded by however many events were supplied). Reads
  // as the processor visibly staying alert between consumptions, not idle
  // decoration for its own sake.
  const idleWaitPulse: TimelineNode = {
    kind: "repeat",
    interval: WAIT_PULSE_INTERVAL,
    untilSeconds: Math.max(0, estimatedDurationSeconds - ENTRANCE_START - SETTLE_GAP - 1),
    child: seq([act({ type: "move", id: processorId, startSeconds: 0, durationSeconds: 0.35, scale: 1.06 }), act({ type: "move", id: processorId, startSeconds: 0, durationSeconds: 0.35, scale: 1.0, easing: "spring" }, 0.35)]),
  };

  const arrivePhase = seq([
    act({ type: "appear", id: processorId, startSeconds: 0, sound: "entrance" }),
    { kind: "delay", seconds: 0.3, child: par([act({ type: "appear", id: gaugeId, startSeconds: 0 }), act({ type: "style", id: gaugeId, startSeconds: 0, durationSeconds: 0.1, label: "0 waiting" })]) },
  ]);

  const { actions: arriveActions, endSeconds: queueStart } = flattenTimeline(arrivePhase, ENTRANCE_START);
  const startAt = queueStart + SETTLE_GAP;

  const { actions: itemActions } = flattenTimeline(par(itemNodes), startAt);
  const { actions: consumeFlashActions } = flattenTimeline(par(consumeFlashNodes), startAt);
  const { actions: gaugeLabelActions } = flattenTimeline(par(gaugeLabelNodes), startAt);
  const { actions: gaugeBindingActions } = flattenTimeline(compileDataBinding(gaugeBinding), startAt);
  const { actions: idlePulseActions } = flattenTimeline(idleWaitPulse, startAt);

  return {
    title: undefined,
    objects,
    arrows: [],
    timeline: [...arriveActions, ...itemActions, ...consumeFlashActions, ...gaugeLabelActions, ...gaugeBindingActions, ...idlePulseActions],
  };
}
