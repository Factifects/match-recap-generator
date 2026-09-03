import { describe, it, expect } from "vitest";
import { parseSceneScript, isSceneScript } from "../script/parseSceneScript";
import { diagnoseScript, serializeScript } from "./authorScript";
import { rotationWarnings, type Outline } from "./authorOutline";
import { estimateDurationSeconds } from "./doctrine";
import type { AuthoredScene } from "./authorScene";

const scene = (sceneType: string, narration: string, data: unknown): AuthoredScene => ({
  sceneType,
  narration,
  durationSeconds: estimateDurationSeconds(narration),
  data,
  repairRounds: 0,
});

describe("serializeScript", () => {
  // The load-bearing test for the whole pipeline. Everything upstream can be
  // correct — valid outline, schema-valid Data — and the video still comes out
  // empty if the assembled FILE isn't in the dialect parseSceneScript reads.
  // That failure is silent by design elsewhere in the engine: an unrecognized
  // scene degrades to a plain caption rather than throwing, so it would only
  // ever show up as a boring render. This asserts the format contract directly.
  it("produces a script the real parser recognizes and reads back", () => {
    const scenes = [
      scene("stat", "Cold does not drain your battery. It hides it.", {
        kind: "single-stat",
        title: "Capacity lost at 0C",
        value: 20,
        suffix: "%",
      }),
      scene("quote", "The chemistry slows down, and the voltage sags below what the phone will accept.", {
        kind: "quote",
        quote: "The charge is still there. The phone just cannot reach it.",
        attribution: "Lithium-ion behaviour below freezing",
      }),
    ];

    const scriptText = serializeScript("Cold Batteries", scenes, "why phones die in the cold", "gemini", "gemini-3.6-flash");

    expect(isSceneScript(scriptText)).toBe(true);

    const segments = parseSceneScript(scriptText);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("Cold does not drain your battery. It hides it.");
    expect(segments[1].text).toContain("chemistry slows down");
    // A visual on every segment is the point of this script format — a segment
    // that parsed but lost its visual means the Data block didn't survive
    // serialization, which is exactly the silent degradation described above.
    for (const segment of segments) {
      expect(segment.type).not.toBe("chapter");
      expect("visual" in segment && segment.visual).toBeTruthy();
    }
  });

  it("survives narration containing the field and separator markers", () => {
    // Narration is model-written prose. If it happens to contain `---` or a
    // `**Something:**` run, naive serialization would split one scene into two
    // or invent a field, and the corruption would be invisible until render.
    const scenes = [
      scene("stat", "The rule is simple --- and the exception is not. **Note:** it still applies.", {
        kind: "single-stat",
        title: "Edge case",
        value: 1,
      }),
    ];
    const segments = parseSceneScript(serializeScript("Edge", scenes, "t", "gemini", "m"));
    expect(segments).toHaveLength(1);
  });

  it("writes provenance for the model that authored the script", () => {
    const scriptText = serializeScript("T", [scene("stat", "One.", { kind: "single-stat", title: "a", value: 1 })], "my topic", "anthropic", "claude-opus-5");
    expect(scriptText).toContain("anthropic/claude-opus-5");
    expect(scriptText).toContain("my topic");
  });
});

describe("diagnoseScript", () => {
  it("runs the project's real diagnostics over an assembled script", () => {
    const scriptText = serializeScript(
      "T",
      [scene("stat", "A single stat with nothing else happening at all.", { kind: "single-stat", title: "a", value: 1 })],
      "t",
      "gemini",
      "m",
    );
    // Asserting the shape, not a specific finding — the diagnostic set is
    // owned by validateScene/validateGeometry and is expected to evolve.
    // What must hold is that the repair loop receives well-formed findings.
    const diagnostics = diagnoseScript(scriptText);
    expect(Array.isArray(diagnostics)).toBe(true);
    for (const d of diagnostics) {
      expect(typeof d.sceneIndex).toBe("number");
      expect(["hard", "soft"]).toContain(d.severity);
      expect(typeof d.message).toBe("string");
    }
  });
});

describe("rotationWarnings", () => {
  const outlineOf = (types: string[]): Outline => ({
    title: "T",
    scenes: types.map((sceneType) => ({ sceneType, narration: "n", visualIntent: "v", act: "reveal" as const })),
  });

  it("flags three consecutive scenes in the same medium", () => {
    expect(rotationWarnings(outlineOf(["Stage", "Stage", "Stage"]))).toHaveLength(1);
  });

  it("accepts two in a row", () => {
    expect(rotationWarnings(outlineOf(["Stage", "Stage", "Diagram"]))).toHaveLength(0);
  });

  it("flags more than one Statement scene", () => {
    const warnings = rotationWarnings(outlineOf(["Statement", "Diagram", "Statement"]));
    expect(warnings.some((w) => w.includes("Statement"))).toBe(true);
  });
});
