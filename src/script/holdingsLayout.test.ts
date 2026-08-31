import { describe, expect, it } from "vitest";
import {
  buildPanes,
  assemblyAttempt,
  agree,
  affectedBy,
  packWall,
  assemblyPlacement,
  spreadRow,
  stagePlacement,
  sharedRefs,
  estimateTextWidthPx,
  rowLayout,
  segmentId,
  UNIVERSE_SIZE,
  type PaneBox,
} from "./holdingsLayout";

const RECT = { x: 0, y: 0, width: 1600, height: 760 };

function overlaps(a: PaneBox, b: PaneBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("holdings — the population", () => {
  it("is deterministic for a seed, and different across seeds", () => {
    expect(buildPanes(20, 4)).toEqual(buildPanes(20, 4));
    expect(buildPanes(20, 4)).not.toEqual(buildPanes(20, 5));
  });

  it("keeps every device's holdings small enough for a viewer to count", () => {
    for (const pane of buildPanes(60, 1)) {
      expect(pane.records.length).toBeGreaterThanOrEqual(2);
      expect(pane.records.length).toBeLessThanOrEqual(6);
    }
  });

  it("gives no two neighbours the same holdings", () => {
    const panes = buildPanes(12, 1);
    const signatures = panes.map((p) => p.records.map((r) => r.ref).join(","));
    expect(new Set(signatures).size).toBeGreaterThan(panes.length * 0.8);
  });

  it("makes devices overlap partially — neither identical nor disjoint", () => {
    const panes = buildPanes(40, 1);
    let sharedPairs = 0;
    for (let i = 0; i < panes.length; i++) {
      for (let j = i + 1; j < panes.length; j++) {
        const a = new Set(panes[i].records.map((r) => r.ref));
        const shared = panes[j].records.filter((r) => a.has(r.ref)).length;
        if (shared > 0) sharedPairs++;
      }
    }
    const totalPairs = (panes.length * (panes.length - 1)) / 2;
    expect(sharedPairs).toBeGreaterThan(0);
    expect(sharedPairs).toBeLessThan(totalPairs);
  });

  it("ties disagreement to the age of a reading, not to noise", () => {
    // Two devices holding the same segment should differ MORE when their
    // readings were taken further apart in time. Checked across the whole
    // population rather than on one lucky pair.
    const panes = buildPanes(150, 1);
    const pairs: { ageGap: number; valueGap: number }[] = [];
    for (let i = 0; i < panes.length; i++) {
      for (let j = i + 1; j < panes.length; j++) {
        for (const a of panes[i].records) {
          const b = panes[j].records.find((r) => r.ref === a.ref);
          if (!b || a.value === undefined || b.value === undefined) continue;
          pairs.push({ ageGap: Math.abs((a.ageSeconds ?? 0) - (b.ageSeconds ?? 0)), valueGap: Math.abs(a.value - b.value) });
        }
      }
    }
    expect(pairs.length).toBeGreaterThan(30);
    const fresh = pairs.filter((p) => p.ageGap < 10);
    const stale = pairs.filter((p) => p.ageGap > 25);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    expect(mean(stale.map((p) => p.valueGap))).toBeGreaterThan(mean(fresh.map((p) => p.valueGap)));
  });
});

describe("holdings — the assembly genuinely fails", () => {
  it("leaves real holes: some of the world is held by nobody", () => {
    const report = assemblyAttempt(buildPanes(30, 1));
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.coverage).toBeLessThan(1);
  });

  it("leaves real contradictions: the same thing held twice, differently", () => {
    const report = assemblyAttempt(buildPanes(120, 1));
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(Math.max(...report.conflicts.map((c) => c.spread))).toBeGreaterThan(0);
  });

  it("reports completion honestly when a population really does cover everything", () => {
    // The failure must be a property of the data, not a guarantee of the
    // function — otherwise the beat is faked. A big enough population closes
    // the holes, and the report has to say so.
    const report = assemblyAttempt(buildPanes(4000, 1));
    expect(report.gaps).toHaveLength(0);
    expect(report.coverage).toBe(1);
  });
});

describe("holdings — aggregation and locality", () => {
  it("agrees on one number from many partial readings", () => {
    const panes = buildPanes(400, 1);
    const busiest = segmentId(7);
    const agreement = agree(panes, busiest);
    expect(agreement.readings.length).toBeGreaterThan(3);
    const values = agreement.readings.map((r) => r.value);
    expect(agreement.agreed).toBeGreaterThanOrEqual(Math.min(...values));
    expect(agreement.agreed).toBeLessThanOrEqual(Math.max(...values));
  });

  it("uses a median, so one stopped device cannot drag the answer down", () => {
    const panes = buildPanes(120, 1);
    const ref = segmentId(12);
    const before = agree(panes, ref);
    const withOutlier = [...panes, { id: "stuck", label: "STUCK", records: [{ kind: "segment" as const, ref, value: 3, ageSeconds: 1 }] }];
    const after = agree(withOutlier, ref);
    expect(Math.abs(after.agreed - before.agreed)).toBeLessThanOrEqual(4);
    expect(after.discarded).toContain("stuck");
  });

  it("selects rather than averages when the rule says so", () => {
    // A router keeps the cheapest advertised path; it does not average the
    // routes its neighbours offer. Rendering a median there would state the
    // wrong mechanism confidently.
    const panes = buildPanes(200, 1);
    const ref = segmentId(9);
    const values = agree(panes, ref).readings.map((r) => r.value);
    expect(agree(panes, ref, "min").agreed).toBe(Math.min(...values));
    expect(agree(panes, ref, "max").agreed).toBe(Math.max(...values));
    // A selection sets aside everything it did not choose.
    expect(agree(panes, ref, "min").discarded).toHaveLength(values.length - 1);
  });

  it("keeps a change local — almost nobody was holding the thing that changed", () => {
    const panes = buildPanes(600, 1);
    for (let i = 0; i < UNIVERSE_SIZE; i++) {
      const { fraction } = affectedBy(panes, segmentId(i));
      expect(fraction).toBeLessThan(0.25);
    }
  });

  it("still finds everyone who does hold it", () => {
    const panes = buildPanes(80, 1);
    const ref = segmentId(5);
    const { paneIds } = affectedBy(panes, ref);
    const expected = panes.filter((p) => p.records.some((r) => r.ref === ref)).map((p) => p.id);
    expect(paneIds).toEqual(expected);
  });
});

describe("holdings — the wall", () => {
  it("never lets two panes touch, at any count", () => {
    for (const count of [1, 2, 3, 5, 8, 12, 24, 60, 150]) {
      const boxes = packWall(count, RECT);
      expect(boxes).toHaveLength(count);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i], boxes[j])).toBe(false);
        }
      }
    }
  });

  it("keeps every pane inside the rect", () => {
    for (const count of [1, 4, 9, 40, 200]) {
      for (const box of packWall(count, RECT)) {
        expect(box.x).toBeGreaterThanOrEqual(RECT.x - 0.001);
        expect(box.y).toBeGreaterThanOrEqual(RECT.y - 0.001);
        expect(box.x + box.width).toBeLessThanOrEqual(RECT.x + RECT.width + 0.001);
        expect(box.y + box.height).toBeLessThanOrEqual(RECT.y + RECT.height + 0.001);
      }
    }
  });

  it("drops detail as the wall fills, so it can never draw text too small to read", () => {
    expect(packWall(2, RECT)[0].detail).toBe("full");
    expect(packWall(150, RECT)[0].detail).toBe("dense");
    const counts = [2, 6, 20, 60, 150];
    const rank = { full: 0, compact: 1, dense: 2 };
    const details = counts.map((c) => rank[packWall(c, RECT)[0].detail]);
    for (let i = 1; i < details.length; i++) expect(details[i]).toBeGreaterThanOrEqual(details[i - 1]);
  });

  it("keeps every row inside its own card, at any row count", () => {
    // The rendered fault: a six-row card drew its last row past the bottom
    // edge, clipped in half, because the row gap was added after the fit rather
    // than solved for inside it.
    const box = { width: 480, height: 330 };
    for (const rows of [1, 2, 3, 4, 5, 6]) {
      const geometry = rowLayout(box, "full", rows);
      const lastBottom = geometry.tops[rows - 1] + geometry.rowHeight;
      expect(lastBottom).toBeLessThanOrEqual(box.height - geometry.pad * 0.5);
      expect(geometry.tops[0]).toBeGreaterThanOrEqual(geometry.headerHeight);
    }
  });

  it("over-estimates text width, never under", () => {
    // A plate one character too wide costs nothing; one too narrow puts the end
    // of the caption back on top of the content it was meant to sit above.
    expect(estimateTextWidthPx("NOBODY HOLDS ALL OF THEM.", 52)).toBeGreaterThan(25 * 52 * 0.55);
    expect(estimateTextWidthPx("A", 40)).toBeGreaterThan(0);
    expect(estimateTextWidthPx("AB", 40)).toBeGreaterThan(estimateTextWidthPx("A", 40));
    expect(estimateTextWidthPx("AB", 40, 3)).toBeGreaterThan(estimateTextWidthPx("AB", 40));
  });

  it("never lets a row of fixed-width items overlap, however many there are", () => {
    // The rendered bug this locks down: chips laid out by dividing a span
    // between them clipped each other's digits once the list got long.
    for (const count of [1, 2, 5, 12, 40]) {
      const xs = spreadRow(count, 62, 12, 960);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(62);
      if (count > 1) expect((xs[0] + xs[xs.length - 1]) / 2).toBeCloseTo(960, 5);
    }
  });

  it("keeps an assembled pane card-shaped instead of stretching it into a strip", () => {
    const panes = buildPanes(20, 1);
    const slots = packWall(panes.length, RECT);
    const target = { x: 100, y: 80, width: 1400, height: 620 };
    const cellW = target.width / 8;
    for (let i = 0; i < panes.length; i++) {
      const placed = assemblyPlacement(panes[i], slots[i], target, 1);
      expect(placed.width).toBeLessThanOrEqual(cellW * 1.6);
      expect(placed.width / placed.height).toBeLessThan(4);
    }
  });

  it("brings a named subject forward to a readable size, wherever it sat in the wall", () => {
    // The fault this fixes: inspecting device 5 of 150 used to dim the wall
    // around a card far too small to read a single row of.
    const slots = packWall(150, RECT);
    const [staged] = stagePlacement(slots, [4], RECT, 1);
    expect(staged.width).toBeGreaterThan(slots[4].width * 3);
    expect(staged.detail).toBe("full");
    expect(staged.x).toBeGreaterThanOrEqual(RECT.x);
    expect(staged.x + staged.width).toBeLessThanOrEqual(RECT.x + RECT.width);
    expect(staged.y).toBeGreaterThanOrEqual(RECT.y);
    expect(staged.y + staged.height).toBeLessThanOrEqual(RECT.y + RECT.height);
  });

  it("sits two compared subjects side by side without overlapping", () => {
    const slots = packWall(60, RECT);
    const [a, b] = stagePlacement(slots, [3, 40], RECT, 1);
    expect(overlaps(a as PaneBox, b as PaneBox)).toBe(false);
    expect(a.y).toBeCloseTo(b.y, 5);
    // Centred as a pair, so the comparison reads as one composition.
    expect((a.x + b.x + b.width) / 2).toBeCloseTo(RECT.x + RECT.width / 2, 0);
  });

  it("stacks two compared subjects in portrait instead of squeezing them side by side", () => {
    const portrait = { x: 0, y: 0, width: 1080, height: 1500 };
    const slots = packWall(60, portrait);
    const [a, b] = stagePlacement(slots, [3, 40], portrait, 1);
    expect(overlaps(a as PaneBox, b as PaneBox)).toBe(false);
    // Stacked: same column, different rows — the opposite of the landscape case.
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(b.y).toBeGreaterThan(a.y + a.height);
    expect(a.width).toBeGreaterThan(portrait.width * 0.5);
    for (const box of [a, b]) {
      expect(box.y).toBeGreaterThanOrEqual(portrait.y);
      expect(box.y + box.height).toBeLessThanOrEqual(portrait.y + portrait.height);
    }
  });

  it("leaves a subject exactly where it was until the beat actually starts", () => {
    const slots = packWall(30, RECT);
    const [staged] = stagePlacement(slots, [7], RECT, 0);
    expect(staged.x).toBeCloseTo(slots[7].x, 5);
    expect(staged.width).toBeCloseTo(slots[7].width, 5);
  });

  it("computes what two participants actually share", () => {
    const panes = buildPanes(30, 1);
    const shared = sharedRefs(panes[0], panes[1]);
    const inBoth = panes[0].records.filter((r) => panes[1].records.some((o) => o.ref === r.ref)).map((r) => r.ref);
    expect(shared.sort()).toEqual(inBoth.sort());
  });

  it("moves a pane from its slot toward the shared frame and back", () => {
    const pane = buildPanes(3, 1)[0];
    const slot = packWall(3, RECT)[0];
    const target = { x: 200, y: 100, width: 1200, height: 600 };
    const at0 = assemblyPlacement(pane, slot, target, 0);
    expect(at0.x).toBeCloseTo(slot.x, 5);
    expect(at0.y).toBeCloseTo(slot.y, 5);
    const at1 = assemblyPlacement(pane, slot, target, 1);
    expect(at1.x).not.toBeCloseTo(slot.x, 1);
  });

  it("lands panes on top of each other when assembled — the mess IS the point", () => {
    const panes = buildPanes(14, 1);
    const slots = packWall(panes.length, RECT);
    const target = { x: 100, y: 80, width: 1400, height: 620 };
    const placed = panes.map((pane, i) => ({ id: pane.id, ...assemblyPlacement(pane, slots[i], target, 1) }));
    let collisions = 0;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) collisions++;
      }
    }
    expect(collisions).toBeGreaterThan(0);
  });
});
