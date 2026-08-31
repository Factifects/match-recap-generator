import { describe, expect, it } from "vitest";
import { diagnoseHoldingsScenes } from "./validateHoldings";
import type { TimedSegment } from "../model/Segment";

function scene(timeline: unknown[], seed = 7): TimedSegment {
  return {
    type: "statement",
    text: "n",
    durationSeconds: 14,
    visual: { kind: "holdings", theme: "dark", seed, subject: "MACHINE", holds: "PEERS", refPrefix: "P", betterWhen: "low", timeline },
  } as unknown as TimedSegment;
}

describe("diagnoseHoldingsScenes", () => {
  it("warns when the assembly beat would actually SUCCEED", () => {
    // The real fault, caught by a render: at 40 machines this population covers
    // everything, so the beat about the picture not fitting would have played
    // with no holes on screen at all.
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 40, startSeconds: 0.2, durationSeconds: 1.4 },
        { type: "assemble", startSeconds: 2, durationSeconds: 4 },
      ]),
    ]);
    expect(found.some((d) => d.category === "holdings-no-gaps")).toBe(true);
  });

  it("says nothing when the holes are real", () => {
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 20, startSeconds: 0.2, durationSeconds: 1.4 },
        { type: "assemble", startSeconds: 2, durationSeconds: 4 },
      ]),
    ]);
    expect(found.filter((d) => d.category.startsWith("holdings-"))).toHaveLength(0);
  });

  it("warns about a readout that will render as zero", () => {
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 40, startSeconds: 0.2, durationSeconds: 1.4 },
        { type: "readout", show: "gaps", startSeconds: 4, durationSeconds: 3 },
      ]),
    ]);
    expect(found.some((d) => d.category === "holdings-empty-readout")).toBe(true);
  });

  it("warns when a comparison pairs two participants with nothing in common", () => {
    // The rendered fault: two machines side by side, nothing marked, narration
    // claiming they share a peer or two.
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 4, startSeconds: 0.2, durationSeconds: 1 },
        { type: "compare", panes: [0, 1], startSeconds: 2, durationSeconds: 5 },
      ]),
    ]);
    expect(found.some((d) => d.category === "holdings-compare-disjoint")).toBe(true);
  });

  it("says nothing when the compared pair really does overlap", () => {
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 4, startSeconds: 0.2, durationSeconds: 1 },
        { type: "compare", panes: [1, 3], startSeconds: 2, durationSeconds: 5 },
      ]),
    ]);
    expect(found.filter((d) => d.category.startsWith("holdings-compare"))).toHaveLength(0);
  });

  it("warns when a targeted beat points at something nobody holds", () => {
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 12, startSeconds: 0.2, durationSeconds: 1 },
        { type: "agree", ref: "S99", startSeconds: 3, durationSeconds: 4 },
        { type: "change", ref: "S99", startSeconds: 8, durationSeconds: 3 },
      ]),
    ]);
    expect(found.some((d) => d.category === "holdings-agree-empty")).toBe(true);
    expect(found.some((d) => d.category === "holdings-change-empty")).toBe(true);
  });

  it("never blocks a render — every finding is advisory", () => {
    const found = diagnoseHoldingsScenes([
      scene([
        { type: "panes", count: 12, startSeconds: 0.2, durationSeconds: 1 },
        { type: "agree", ref: "S99", startSeconds: 3, durationSeconds: 4 },
      ]),
    ]);
    expect(found.every((d) => d.severity === "soft")).toBe(true);
  });

  it("ignores scenes of every other medium", () => {
    const stage = { type: "statement", text: "s", durationSeconds: 5, visual: { kind: "stage", objects: [], edges: [], timeline: [] } } as unknown as TimedSegment;
    expect(diagnoseHoldingsScenes([stage])).toHaveLength(0);
  });
});
