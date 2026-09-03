import { describe, it, expect } from "vitest";
import { extractJson } from "./extractJson";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses a bare JSON array", () => {
    expect(extractJson("[1,2]")).toEqual([1, 2]);
  });

  it("unwraps a fenced block with a language tag", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("unwraps a fenced block without a language tag", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  // The specific failure this recovers from: a model that has just been shown
  // 28KB of JSON Schema explaining itself before answering. Burning a repair
  // round on that would be pure waste, since the payload is already correct.
  it("recovers JSON wrapped in explanatory prose", () => {
    expect(extractJson('Here is the scene:\n{"a":1}\nLet me know if you need changes.')).toEqual({ a: 1 });
  });

  it("keeps nested braces intact when prose surrounds the payload", () => {
    expect(extractJson('Sure:\n{"a":{"b":[1,2]},"c":3}\ndone')).toEqual({ a: { b: [1, 2] }, c: 3 });
  });

  it("returns undefined when there is no JSON at all, rather than throwing", () => {
    expect(extractJson("I cannot author this scene.")).toBeUndefined();
  });

  it("returns undefined for a truncated object", () => {
    expect(extractJson('{"a":1')).toBeUndefined();
  });
});
