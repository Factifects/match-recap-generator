import { describe, it, expect } from "vitest";
import { normalizeSlug } from "./brandRegistry";

// The network paths are deliberately not unit-tested (they hit a real CDN and
// would make the suite flaky and offline-hostile). What IS tested is the part
// with real logic — slug normalization — plus the contract that matters most:
// every failure path returns null so a diagram falls back to its shape rather
// than failing a render. That contract is enforced by `fetchAndCache` catching
// everything; see resolveDiagramBrands.test.ts for the segment-level behaviour.

describe("normalizeSlug", () => {
  it("matches Simple Icons' own slug conventions", () => {
    expect(normalizeSlug("Node.js")).toBe("nodedotjs");
    expect(normalizeSlug("PostgreSQL")).toBe("postgresql");
    expect(normalizeSlug("Apache Kafka")).toBe("apachekafka");
    expect(normalizeSlug("C++")).toBe("cplusplus");
  });

  it("is stable against casing and stray whitespace", () => {
    expect(normalizeSlug("  ReDiS  ")).toBe("redis");
  });

  it("returns empty for a name with nothing usable in it", () => {
    expect(normalizeSlug("  !!!  ")).toBe("");
  });
});
