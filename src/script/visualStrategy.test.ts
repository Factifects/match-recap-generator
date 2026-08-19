import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { suggestProfile, recordStrategyUse, repetitionWarning, readStrategyHistory, DEFAULT_AVOID } from "./visualStrategy";

const HISTORY = path.join(process.cwd(), "analyses", ".strategy-history.json");
let saved: string | null = null;

beforeEach(() => {
  saved = fs.existsSync(HISTORY) ? fs.readFileSync(HISTORY, "utf8") : null;
  if (fs.existsSync(HISTORY)) fs.rmSync(HISTORY);
});
afterEach(() => {
  if (saved !== null) fs.writeFileSync(HISTORY, saved);
  else if (fs.existsSync(HISTORY)) fs.rmSync(HISTORY);
});

describe("suggestProfile", () => {
  it("matches a race condition to competition, not to a flow", () => {
    const { profile } = suggestProfile("Two people tap buy at the same time and both get a ticket.");
    expect(profile.primary).toBe("competition");
    expect(profile.secondary).toContain("stateChange");
  });

  it("matches caching to state change, with absence as a supporting grammar", () => {
    const { profile } = suggestProfile("A team added a cache in front of their database.");
    expect(profile.primary).toBe("stateChange");
    expect(profile.secondary).toContain("absence");
  });

  it("matches indexing to before/after", () => {
    expect(suggestProfile("Why did the query get slower after adding an index?").profile.primary).toBe("beforeAfter");
  });

  it("matches polling versus websockets to comparison", () => {
    expect(suggestProfile("Why is the typing indicator instant when polling is not?").profile.primary).toBe("comparison");
  });

  it("always bans the house defaults", () => {
    const { profile } = suggestProfile("anything at all");
    for (const banned of DEFAULT_AVOID) expect(profile.avoid).toContain(banned);
  });

  it("reports when nothing matched, rather than pretending it analysed the topic", () => {
    const { matched } = suggestProfile("a completely unrelated sentence about gardening");
    expect(matched).toBeNull();
  });

  it("reports the evidence when something did match", () => {
    expect(suggestProfile("this is about a retry storm").matched).toBeTruthy();
  });
});

describe("cross-video strategy history", () => {
  it("warns when a recent video already led with the same grammar", () => {
    recordStrategyUse("video-a", "comparison");
    expect(repetitionWarning("video-b", "comparison")).toContain("comparison");
  });

  it("stays quiet when the grammar is fresh", () => {
    recordStrategyUse("video-a", "comparison");
    expect(repetitionWarning("video-b", "competition")).toBeNull();
  });

  it("does not warn a video about its own earlier run", () => {
    recordStrategyUse("video-a", "comparison");
    expect(repetitionWarning("video-a", "comparison")).toBeNull();
  });

  it("replaces a script's previous entry instead of accumulating duplicates", () => {
    recordStrategyUse("video-a", "comparison");
    recordStrategyUse("video-a", "failure");
    const history = readStrategyHistory().filter((e) => e.script === "video-a");
    expect(history).toHaveLength(1);
    expect(history[0].primary).toBe("failure");
  });

  it("only looks back over a short window", () => {
    recordStrategyUse("v1", "comparison");
    for (const n of ["v2", "v3", "v4"]) recordStrategyUse(n, "failure");
    expect(repetitionWarning("v5", "comparison")).toBeNull();
  });
});
