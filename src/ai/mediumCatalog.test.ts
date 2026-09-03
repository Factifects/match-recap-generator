import { describe, it, expect } from "vitest";
import { VISUAL_DEFINITIONS } from "../model/visualDefinitions";
import {
  EXCLUDED_FROM_AUTHORING,
  SPECIALIZED_MEDIUMS,
  authorableMediums,
  findMedium,
  jsonSchemaFor,
  listMediums,
  pickExemplars,
  renderExemplars,
  renderMediumCatalog,
  type Exemplar,
} from "./mediumCatalog";

describe("mediumCatalog", () => {
  it("exposes every registered visual definition", () => {
    expect(listMediums()).toHaveLength(VISUAL_DEFINITIONS.length);
  });

  // The authoring pipeline's whole correctness argument is that the model is
  // prompted with the SAME schema the renderer validates against. If any
  // registered medium cannot be rendered as JSON Schema, that medium silently
  // becomes unauthorable — so this asserts the property for all of them rather
  // than for a sample.
  it("renders JSON Schema for every registered medium", () => {
    for (const def of VISUAL_DEFINITIONS) {
      expect(() => jsonSchemaFor(def.kind), `kind "${def.kind}" must be promptable`).not.toThrow();
      expect(jsonSchemaFor(def.kind).length).toBeGreaterThan(2);
    }
  });

  it("emits compact schema text, not pretty-printed", () => {
    // Indenting `stage` costs ~13k tokens on every scene call for no
    // comprehension gain. Guarding the property, not the exact byte count.
    const schema = jsonSchemaFor("stage");
    expect(schema).not.toContain("\n  ");
  });

  it("finds a medium by kind or by its Scene Type key", () => {
    expect(findMedium("stage")?.kind).toBe("stage");
    expect(findMedium("Stage")?.kind).toBe("stage");
    expect(findMedium("nonexistent-medium")).toBeUndefined();
  });

  it("ranks exemplars by choreographic richness", () => {
    const corpus: Exemplar[] = [
      { sceneType: "Stage", narration: "thin", data: "{}", sourceFile: "a.txt" },
      { sceneType: "Stage", narration: "rich", data: `{"timeline":[${"1,".repeat(200)}1]}`, sourceFile: "b.txt" },
      { sceneType: "Diagram", narration: "other", data: `{"x":${"0".repeat(500)}}`, sourceFile: "c.txt" },
    ];
    const picked = pickExemplars(corpus, "Stage", 2);
    expect(picked.map((e) => e.narration)).toEqual(["rich", "thin"]);
    // A different medium's scenes must never leak in — they would teach the
    // model the wrong schema entirely.
    expect(picked.every((e) => e.sceneType === "Stage")).toBe(true);
  });

  it("degrades to an instruction when no exemplar of a medium exists", () => {
    expect(renderExemplars([])).toContain("No prior example");
  });
});

describe("authoring policy", () => {
  it("excludes the football heritage from AI authoring", () => {
    const kinds = authorableMediums().map((m) => m.kind);
    // These still render and are still hand-authorable — they are simply not
    // things an unattended author should ever reach for on a tech lesson.
    for (const heritage of ["formation", "shot-map", "pass-network", "league-table"]) {
      expect(kinds, `"${heritage}" must not be offered to the author`).not.toContain(heritage);
    }
    expect(authorableMediums().length).toBeLessThan(listMediums().length);
  });

  it("keeps specialized mediums available but conditioned", () => {
    // The fix for a badly-chosen medium is a stated condition, not removal:
    // `spatial` and `channels` are right for some concepts and catastrophic
    // for others, and only the outline call knows which it is looking at.
    const kinds = authorableMediums().map((m) => m.kind);
    expect(kinds).toContain("spatial");
    expect(kinds).toContain("channels");
    const catalog = renderMediumCatalog();
    expect(catalog).toMatch(/\b(ONLY|USE) WHEN\b/);
  });

  it("states a condition for every specialized medium it lists", () => {
    const catalog = renderMediumCatalog();
    for (const kind of Object.keys(SPECIALIZED_MEDIUMS)) {
      if (EXCLUDED_FROM_AUTHORING.has(kind)) continue;
      const line = catalog.split("\n").find((l) => l.includes(`(kind: ${kind})`));
      expect(line, `"${kind}" must appear in the catalog`).toBeDefined();
      // The invariant is that a specialized medium states a CONDITION, not
      // that it uses one particular wording — `motion` is gated on "USE WHEN
      // no other medium fits" rather than "ONLY WHEN <shape of data>".
      expect(line, `"${kind}" must carry a stated condition`).toMatch(/\b(ONLY|USE) WHEN\b/);
    }
  });

  it("never offers an excluded medium a condition instead of exclusion", () => {
    for (const kind of EXCLUDED_FROM_AUTHORING) {
      expect(SPECIALIZED_MEDIUMS[kind]).toBeUndefined();
    }
  });
});
