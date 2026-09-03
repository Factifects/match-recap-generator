import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  UnsafeComponentError,
  componentNameFor,
  findTimingViolations,
  findUnsafeUsage,
  isValidComponentId,
  regenerateBarrel,
  writeGeneratedComponent,
} from "./generatedComponentStore";

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-store-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const validSource = (name: string) => `import React from "react";
import type { GeneratedMotionComponent } from "../generatedMotion";
export const ${name}: GeneratedMotionComponent = () => <div />;`;

describe("component ids", () => {
  it("accepts lowercase hyphenated ids", () => {
    expect(isValidComponentId("gps-downlink-only")).toBe(true);
  });

  it("rejects ids that could escape the directory or break the barrel", () => {
    // These are written to disk as filenames and emitted into the barrel as
    // identifiers, so anything that isn't both a safe path segment and a safe
    // symbol has to be refused before it becomes either.
    for (const bad of ["../escape", "Has-Capitals", "has space", "has/slash", "a", ""]) {
      expect(isValidComponentId(bad), `"${bad}" must be rejected`).toBe(false);
    }
  });
});

describe("findUnsafeUsage", () => {
  it("passes a component using only the sanctioned imports", () => {
    expect(findUnsafeUsage(validSource("Ok"))).toEqual([]);
  });

  it("blocks imports outside the allowlist", () => {
    // The whole point of an allowlist: this must fail without anyone having
    // predicted that `node:fs` specifically would be the thing attempted.
    expect(findUnsafeUsage(`import fs from "node:fs";`).join()).toContain("node:fs");
    expect(findUnsafeUsage(`import x from "child_process";`).join()).toContain("child_process");
    expect(findUnsafeUsage(`import x from "../../server";`).join()).toContain("../../server");
  });

  it("blocks dynamic escapes that would route around the import allowlist", () => {
    for (const escape of ['require("fs")', 'import("fs")', 'eval("x")', "process.env", "globalThis.x"]) {
      expect(findUnsafeUsage(escape).length, `"${escape}" must be caught`).toBeGreaterThan(0);
    }
  });

  it("blocks impure frame values that would make the render flicker", () => {
    // Not a safety rule but a correctness one, and invisible to the compiler:
    // each frame renders independently, so a clock or RNG read produces a
    // different picture on every pass.
    for (const impure of ["Date.now()", "new Date()", "Math.random()"]) {
      expect(findUnsafeUsage(impure).length, `"${impure}" must be caught`).toBeGreaterThan(0);
    }
  });

  it("reports every problem at once rather than only the first", () => {
    expect(findUnsafeUsage(`import fs from "node:fs";\nconst t = Date.now();`).length).toBe(2);
  });
});

describe("writeGeneratedComponent", () => {
  it("writes the component and registers it in the barrel", () => {
    const dir = tempDir();
    writeGeneratedComponent("my-scene", validSource("MyScene"), dir);
    expect(fs.existsSync(path.join(dir, "my-scene.tsx"))).toBe(true);
    const barrel = fs.readFileSync(path.join(dir, "index.ts"), "utf8");
    expect(barrel).toContain('import { MyScene } from "./my-scene";');
    expect(barrel).toContain('"my-scene": MyScene,');
  });

  it("never persists unsafe source", () => {
    const dir = tempDir();
    expect(() => writeGeneratedComponent("bad-scene", `import fs from "node:fs";`, dir)).toThrow(
      UnsafeComponentError,
    );
    expect(fs.existsSync(path.join(dir, "bad-scene.tsx"))).toBe(false);
  });

  it("requires the exported symbol to match the id", () => {
    const dir = tempDir();
    // Otherwise the barrel would import a name the file does not export, which
    // breaks the bundle for EVERY scene rather than just this one.
    expect(() => writeGeneratedComponent("my-scene", validSource("SomethingElse"), dir)).toThrow(
      UnsafeComponentError,
    );
  });
});

describe("regenerateBarrel", () => {
  it("derives the registry from what is actually on disk", () => {
    const dir = tempDir();
    writeGeneratedComponent("scene-one", validSource("SceneOne"), dir);
    writeGeneratedComponent("scene-two", validSource("SceneTwo"), dir);

    // A file removed by hand, or by a run that failed after writing, must
    // self-correct — a barrel importing a missing file breaks the whole bundle.
    fs.rmSync(path.join(dir, "scene-one.tsx"));
    const ids = regenerateBarrel(dir);

    expect(ids).toEqual(["scene-two"]);
    const barrel = fs.readFileSync(path.join(dir, "index.ts"), "utf8");
    expect(barrel).not.toContain("scene-one");
    expect(barrel).toContain("scene-two");
  });

  it("produces a valid empty registry when there is nothing to register", () => {
    const dir = tempDir();
    expect(regenerateBarrel(dir)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "index.ts"), "utf8")).toContain("GENERATED_COMPONENTS");
  });
});

describe("componentNameFor", () => {
  it("maps a hyphenated id to a PascalCase symbol", () => {
    expect(componentNameFor("gps-downlink-only")).toBe("GpsDownlinkOnly");
  });
});

describe("findTimingViolations", () => {
  const withDuration = (body: string) =>
    `const { durationInFrames } = props; ${body} const end = durationInFrames;`;

  it("accepts timing expressed as fractions of the scene's real length", () => {
    expect(
      findTimingViolations(withDuration("const t = interpolate(frame, [0, durationInFrames * 0.5], [0, 1]);")),
    ).toEqual([]);
  });

  it("flags hard-coded timeline milestones", () => {
    // The exact failure this exists for: these compile, render, and look fine
    // at the estimated length, then silently stop finishing once the scene is
    // re-fitted to shorter measured narration.
    const problems = findTimingViolations(withDuration("const t = interpolate(frame, [150, 200], [0, 1]);"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("150");
  });

  it("allows small literals, which are entrance offsets rather than milestones", () => {
    expect(findTimingViolations(withDuration("const t = interpolate(frame, [0, 20], [0, 1]);"))).toEqual([]);
  });

  it("flags a component that never uses durationInFrames at all", () => {
    const problems = findTimingViolations("const t = interpolate(frame, [0, 20], [0, 1]);");
    expect(problems.some((p) => p.includes("durationInFrames"))).toBe(true);
  });
});
