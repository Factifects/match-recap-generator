import { describe, expect, it } from "vitest";
import { composeContinuous, queueContractSchema, type QueueContractInput } from "./composeContinuous";
import { estimateObjectBoundingBox, boxesOverlap, resolveObjectPosition } from "../video/canvasLayout";

const shortBurst: QueueContractInput = {
  processor: { label: "Worker", icon: "server" },
  arrivals: [1, 2, 3, 8],
  departures: [4, 5, 9, 10],
};

describe("queueContractSchema", () => {
  it("accepts a well-formed contract", () => {
    expect(queueContractSchema.safeParse(shortBurst).success).toBe(true);
  });

  it("rejects an empty arrivals list", () => {
    expect(queueContractSchema.safeParse({ ...shortBurst, arrivals: [] }).success).toBe(false);
  });
});

describe("composeContinuous — item count and timing are pure functions of the data, not hand-placed", () => {
  it("produces exactly one item object per arrival, no more, no fewer", () => {
    const composed = composeContinuous(shortBurst, 15);
    const itemObjects = composed.objects.filter((o) => o.id.startsWith("queueItem_"));
    expect(itemObjects.length).toBe(shortBurst.arrivals.length);
  });

  it("a DIFFERENT arrivals/departures array produces a different number of items and different move timings — the same compiler is genuinely reused, not special-cased per script", () => {
    const longer: QueueContractInput = { processor: shortBurst.processor, arrivals: [1, 1.5, 2, 2.5, 3, 3.5], departures: [4, 4.5, 5] };
    const a = composeContinuous(shortBurst, 15);
    const b = composeContinuous(longer, 15);
    const aItems = a.objects.filter((o) => o.id.startsWith("queueItem_")).length;
    const bItems = b.objects.filter((o) => o.id.startsWith("queueItem_")).length;
    expect(aItems).toBe(4);
    expect(bItems).toBe(6);
    expect(aItems).not.toBe(bItems);
    // Different move counts too — b's items shift more since more of them
    // queue up before being served.
    const aMoves = a.timeline.filter((t) => t.type === "move" && t.id.startsWith("queueItem_")).length;
    const bMoves = b.timeline.filter((t) => t.type === "move" && t.id.startsWith("queueItem_")).length;
    expect(aMoves).not.toBe(bMoves);
  });

  it("an item that waits through an earlier departure gets MORE than one move — its motion is not one-shot", () => {
    // arrivals at 1,2 ; a departure at 3 serves item 0, so item 1 must both
    // enter (at t=1... it arrives at t=2 actually) and then shift forward
    // when item 0 is served — use arrivals [1,1.2], departure [3] so item 1
    // is still present and shifts.
    const contract: QueueContractInput = { processor: shortBurst.processor, arrivals: [1, 1.2], departures: [3] };
    const composed = composeContinuous(contract, 10);
    const item1Moves = composed.timeline.filter((t) => t.type === "move" && t.id === "queueItem_1");
    expect(item1Moves.length).toBeGreaterThan(1);
  });

  it("a departure with an empty queue is a defensive no-op, not a crash", () => {
    const contract: QueueContractInput = { processor: shortBurst.processor, arrivals: [5], departures: [1] }; // departure BEFORE any arrival
    expect(() => composeContinuous(contract, 10)).not.toThrow();
  });
});

describe("composeContinuous — the depth gauge is genuinely data-bound", () => {
  it("the gauge's radius changes over the timeline (a real move-chain from compileDataBinding), not a static value", () => {
    const composed = composeContinuous(shortBurst, 15);
    const gaugeMoves = composed.timeline.filter((t) => t.type === "move" && t.id === "queueDepthGauge");
    expect(gaugeMoves.length).toBeGreaterThan(1);
    const radii = gaugeMoves.map((m) => (m as { radius?: number }).radius).filter((r): r is number => r !== undefined);
    expect(new Set(radii).size).toBeGreaterThan(1); // it actually varies, not the same value repeated
  });
});

describe("composeContinuous — the processor sustains motion independent of the finite item list (the `repeat` primitive)", () => {
  it("the processor has idle pulse moves scheduled past the last queue event — genuinely open-ended, not bounded by arrivals/departures", () => {
    const composed = composeContinuous(shortBurst, 20); // scene runs well past the last event at t=10
    const lastEventTime = Math.max(...shortBurst.arrivals, ...shortBurst.departures);
    const processorMoves = composed.timeline.filter((t) => t.type === "move" && t.id === "queueProcessor");
    const laterMoves = processorMoves.filter((m) => m.startSeconds > lastEventTime + 2);
    expect(laterMoves.length).toBeGreaterThan(0);
  });
});

describe("composeContinuous — layout has zero overlaps", () => {
  it("the processor, gauge, and every item's resting slot are non-overlapping", () => {
    for (const contract of [shortBurst, { processor: shortBurst.processor, arrivals: [1, 1.5, 2, 2.5, 3, 3.5, 4], departures: [8] }]) {
      const composed = composeContinuous(contract, 20);
      const resolved = composed.objects
        .filter((o) => o.opacity !== 0)
        .map((o) => {
          const pos = resolveObjectPosition(o as never);
          return { id: o.id, box: estimateObjectBoundingBox(o as never, pos.x, pos.y) };
        });
      for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
          expect(boxesOverlap(resolved[i].box, resolved[j].box)).toBe(false);
        }
      }
    }
  });
});
