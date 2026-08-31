import { describe, expect, it } from "vitest";
import {
  derive,
  deriveWithout,
  firstConfidentAt,
  silentChannels,
  timeToX,
  stackRows,
  weightedRows,
  axisTicks,
  stackLabels,
  estimateTextWidthPx,
  type Mark,
  type Channel,
} from "./channelLayout";

const WINDOW = { from: 7, to: 23 };
const RECT = { x: 100, y: 60, width: 1720, height: 900 };

const CHANNELS: Channel[] = [
  { id: "mic", label: "MICROPHONE" },
  { id: "location", label: "LOCATION" },
  { id: "search", label: "SEARCH" },
  { id: "purchase", label: "PURCHASES" },
  { id: "social", label: "WHO YOU WERE NEAR" },
];

/** One ordinary day. Nothing on the microphone channel, by construction — the
 * episode's claim is that the conclusion is reachable without it. */
const MARKS: Mark[] = [
  { at: 8.2, channel: "location", label: "gym, 40 minutes", signals: ["running"] },
  { at: 9.1, channel: "social", label: "near a running club", signals: ["running"] },
  { at: 12.6, channel: "search", label: "blister plasters", signals: ["running", "firstaid"] },
  { at: 13.4, channel: "location", label: "sports shop, 6 minutes", signals: ["running"] },
  { at: 18.9, channel: "purchase", label: "protein bars", signals: ["running", "diet"] },
  { at: 20.2, channel: "search", label: "half marathon dates", signals: ["running"] },
];

describe("channels — the inference is computed, never asserted", () => {
  it("derives the conclusion the traces actually support", () => {
    const inference = derive(MARKS);
    expect(inference.winner).toBe("running");
    expect(inference.margin).toBeGreaterThan(0);
    expect(inference.supporting.length).toBeGreaterThan(3);
  });

  it("reaches that conclusion with the microphone channel empty", () => {
    // The whole episode. No audio anywhere in the population, and the answer
    // still lands — so the claim is a property of the data on screen.
    expect(silentChannels(CHANNELS, MARKS)).toContain("mic");
    expect(derive(MARKS).winner).toBe("running");
  });

  it("knows nothing before the day starts", () => {
    expect(derive(MARKS, 7).winner).toBeNull();
  });

  it("builds its confidence over the day rather than all at once", () => {
    const early = derive(MARKS, 9.5);
    const late = derive(MARKS, 21);
    expect(late.score).toBeGreaterThan(early.score);
    expect(late.margin).toBeGreaterThanOrEqual(early.margin);
  });
});

describe("channels — switching a channel off", () => {
  it("still lands without location, which is the uncomfortable part", () => {
    const without = deriveWithout(MARKS, "location");
    expect(without.winner).toBe("running");
  });

  it("lands LATER without location, and the delay is measured", () => {
    const withAll = firstConfidentAt(MARKS, 2);
    const withoutLocation = firstConfidentAt(
      MARKS.filter((m) => m.channel !== "location"),
      2,
    );
    expect(withAll).not.toBeNull();
    expect(withoutLocation).not.toBeNull();
    expect(withoutLocation!).toBeGreaterThan(withAll!);
  });

  it("reports honestly when a channel really was load-bearing", () => {
    // Not a guarantee of the function — if removing a channel genuinely killed
    // the conclusion, this has to say so, or the closing beat is a lie.
    const narrow: Mark[] = [
      { at: 9, channel: "location", signals: ["running"] },
      { at: 10, channel: "location", signals: ["running"] },
      { at: 11, channel: "search", signals: ["cooking"] },
    ];
    expect(derive(narrow).winner).toBe("running");
    expect(deriveWithout(narrow, "location").winner).toBe("cooking");
  });
});

describe("channels — the shared clock", () => {
  it("puts a trace exactly under the moment that produced it", () => {
    // The causal reading of the whole medium depends on this: two conversions
    // computed separately would drift and quietly stop being true.
    const moment = 13.4;
    const mark = MARKS.find((m) => m.at === 13.4)!;
    expect(timeToX(mark.at, WINDOW, RECT)).toBe(timeToX(moment, WINDOW, RECT));
  });

  it("maps the window onto the rect, and clamps outside it", () => {
    expect(timeToX(7, WINDOW, RECT)).toBe(RECT.x);
    expect(timeToX(23, WINDOW, RECT)).toBe(RECT.x + RECT.width);
    expect(timeToX(2, WINDOW, RECT)).toBe(RECT.x);
    expect(timeToX(30, WINDOW, RECT)).toBe(RECT.x + RECT.width);
  });

  it("is monotonic through the day", () => {
    let previous = -Infinity;
    for (let at = 7; at <= 23; at += 0.5) {
      const x = timeToX(at, WINDOW, RECT);
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });
});

describe("channels — the stack", () => {
  it("never overlaps two channel rows, at any count", () => {
    for (const count of [1, 2, 5, 8, 12]) {
      const { rows } = stackRows(RECT, count);
      expect(rows).toHaveLength(count);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].height);
      }
    }
  });

  it("keeps the strip and every row inside the rect", () => {
    for (const count of [1, 4, 9]) {
      const { strip, rows } = stackRows(RECT, count);
      expect(strip.y).toBeGreaterThanOrEqual(RECT.y);
      for (const row of rows) {
        expect(row.y).toBeGreaterThanOrEqual(strip.y + strip.height);
        expect(row.y + row.height).toBeLessThanOrEqual(RECT.y + RECT.height + 0.001);
      }
    }
  });

  it("gives the day-as-lived real room rather than a header strip", () => {
    const { strip } = stackRows(RECT, 5);
    expect(strip.height).toBeGreaterThan(RECT.height * 0.2);
  });

  it("labels the axis without crowding it", () => {
    const ticks = axisTicks(WINDOW, RECT);
    expect(ticks.length).toBeLessThanOrEqual(10);
    expect(ticks[0].label).toMatch(/AM|PM/);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].x).toBeGreaterThan(ticks[i - 1].x);
  });
});

describe("channels — labels never collide", () => {
  it("drops a crowded label to the next level instead of printing through its neighbour", () => {
    // The rendered fault, exactly: two moments an hour apart both landed on the
    // same side and printed "shop on the way homescrolling in bed".
    const labels = [
      { centerX: 100, width: 180 },
      { centerX: 200, width: 180 },
      { centerX: 900, width: 160 },
    ];
    const levels = stackLabels(labels);
    expect(levels[0]).not.toBe(levels[1]);
    // Far away from both, so it can reuse the first level.
    expect(levels[2]).toBe(0);
  });

  it("never puts two overlapping labels on the same level, on real-looking input", () => {
    const texts = ["gym before work", "coffee with Sam", "planning dinner", "sore feet", "quick errand", "shop on the way home", "cooking", "scrolling in bed"];
    const at = [8.2, 9.1, 11.0, 12.6, 13.4, 18.9, 19.4, 20.2];
    const labels = at.map((hour, i) => ({ centerX: timeToX(hour, WINDOW, RECT), width: estimateTextWidthPx(texts[i], 21) }));
    const levels = stackLabels(labels);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        if (levels[i] !== levels[j]) continue;
        const a = labels[i];
        const b = labels[j];
        const overlap = Math.abs(a.centerX - b.centerX) < (a.width + b.width) / 2;
        expect(overlap).toBe(false);
      }
    }
  });

  it("keeps everything on one level when nothing is crowded", () => {
    const levels = stackLabels([
      { centerX: 100, width: 80 },
      { centerX: 500, width: 80 },
      { centerX: 900, width: 80 },
    ]);
    expect(levels).toEqual([0, 0, 0]);
  });
});

describe("channels — the frame can change", () => {
  it("gives a solo'd channel the height the others give up", () => {
    // Dimming leaves the same picture with less contrast; collapsing changes
    // what the frame is. The beat whose point is one empty line needs that line
    // to BE the frame.
    const even = weightedRows(RECT, [1, 1, 1, 1, 1]);
    const solo = weightedRows(RECT, [4.2, 0, 0, 0, 0]);
    expect(solo.rows[0].height).toBeGreaterThan(even.rows[0].height * 3);
    expect(solo.rows[1].height).toBeLessThan(1);
  });

  it("never overlaps rows at any weighting, including a full collapse", () => {
    for (const weights of [[1, 1, 1], [3, 1, 0.2], [4.2, 0, 0, 0, 0], [0, 0, 0]]) {
      const { rows } = weightedRows(RECT, weights);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].height - 0.001);
      }
      for (const row of rows) expect(row.y + row.height).toBeLessThanOrEqual(RECT.y + RECT.height + 0.001);
    }
  });

  it("falls back to an even split rather than dividing by zero", () => {
    const { rows } = weightedRows(RECT, [0, 0, 0]);
    expect(rows).toHaveLength(3);
    expect(rows[0].height).toBeGreaterThan(0);
  });

  it("spreads one hour across the whole frame when the window narrows", () => {
    // The medium's camera: same traces, different scale.
    const wide = { from: 7, to: 23 };
    const narrow = { from: 8, to: 10 };
    const gapWide = Math.abs(timeToX(9.1, wide, RECT) - timeToX(8.2, wide, RECT));
    const gapNarrow = Math.abs(timeToX(9.1, narrow, RECT) - timeToX(8.2, narrow, RECT));
    expect(gapNarrow).toBeGreaterThan(gapWide * 5);
  });
});
