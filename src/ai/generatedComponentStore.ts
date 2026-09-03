import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Where generated motion components live, and the gate they pass through.
//
// This module writes code that will later EXECUTE inside the renderer, so it
// is the one place in the authoring pipeline that does real gatekeeping rather
// than validation. A schema violation produces a bad scene; an unrestricted
// import in generated code produces a program doing something nobody asked for
// on the author's machine. Those are different categories of problem and only
// one of them is recoverable by a repair round.
// ---------------------------------------------------------------------------

export const GENERATED_DIR = path.join("src", "video", "generated");
const BARREL_PATH = path.join(GENERATED_DIR, "index.ts");

/** The only modules a generated component may import.
 *
 * An allowlist rather than a blocklist, deliberately: a blocklist has to
 * anticipate every dangerous module (`fs`, `child_process`, `net`, and
 * whatever ships next), while an allowlist only has to name the handful a
 * motion component legitimately needs. Anything a component genuinely can't
 * express with these belongs in a reviewed primitive, not in generated code. */
const ALLOWED_IMPORTS = new Set(["react", "remotion", "../generatedMotion", "../theme"]);

/** Component ids are used as filenames and as registry keys, so they are
 * constrained to something that can be neither a path traversal nor a
 * syntactically invalid identifier. */
const ID_PATTERN = /^[a-z][a-z0-9-]{2,48}$/;

export class UnsafeComponentError extends Error {}

export function isValidComponentId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Rejects generated source that reaches outside the sanctioned surface.
 *
 * Returns the list of problems rather than throwing on the first, so a repair
 * round can fix everything at once — the same reason the Zod path formats all
 * issues instead of the first failure. */
export function findUnsafeUsage(source: string): string[] {
  const problems: string[] = [];

  const importPattern = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!ALLOWED_IMPORTS.has(specifier)) {
      problems.push(
        `imports "${specifier}" — only ${[...ALLOWED_IMPORTS].map((m) => `"${m}"`).join(", ")} are allowed.`,
      );
    }
  }

  // Bare `import "x"` for side effects, which the pattern above cannot see.
  for (const match of source.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    problems.push(`has a side-effect import of "${match[1]}" — generated components must be pure.`);
  }

  // Dynamic escapes that would route around the import allowlist entirely.
  for (const banned of ["require(", "import(", "eval(", "Function(", "process.", "globalThis."]) {
    if (source.includes(banned)) {
      problems.push(`uses "${banned}" — generated components must not reach outside the module.`);
    }
  }

  // A component that reads wall-clock time is not a pure function of the frame,
  // so it renders differently on every pass and flickers. This is a rendering
  // correctness rule, not a safety one, but it is caught in the same sweep
  // because both are "things the compiler will happily accept".
  for (const impure of ["Date.now(", "new Date(", "Math.random("]) {
    if (source.includes(impure)) {
      problems.push(
        `uses "${impure}" — a frame must be a pure function of useCurrentFrame(), or the render flickers.`,
      );
    }
  }

  return problems;
}

/** Frame literals at or above this are treated as timeline milestones rather
 * than entrance offsets. A stagger like `frame - 15` (half a second) is normal
 * and fine; a milestone at frame 200 is a scene structured around a length it
 * was only guessing at. */
const FRAME_LITERAL_LIMIT = 45;

/**
 * Finds timing that will not survive the narration fit.
 *
 * Separate from `findUnsafeUsage` because it is a different kind of wrong: not
 * dangerous, not a compile error, and completely invisible until the scene is
 * rendered against real audio. `fitSegmentsToNarration.ts` rescales every scene
 * to its measured TTS duration, so a component whose beats sit at hard-coded
 * frames simply stops finishing — the ending never fires on a scene that came
 * back shorter than the word-count estimate predicted.
 *
 * This is the standing constraint in CLAUDE.md ("anything that carries its own
 * timeline MUST be schedulable by narrationFit") expressed as a check, because
 * generated code is exactly the place where an instruction alone is not enough:
 * the first component generated against a prompt that stated this rule in prose
 * hard-coded three milestones anyway.
 */
export function findTimingViolations(source: string): string[] {
  const problems: string[] = [];

  for (const match of source.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]/g)) {
    const literals = [...match[1].matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1]));
    const milestones = literals.filter((n) => n >= FRAME_LITERAL_LIMIT);
    if (milestones.length > 0) {
      problems.push(
        `interpolates \`frame\` over hard-coded frames [${match[1].trim()}] — express these as fractions of \`durationInFrames\` (e.g. durationInFrames * 0.4) so the scene still finishes when narration is re-fitted.`,
      );
    }
  }

  // A component that never reads durationInFrames in its body is structured
  // around a length it was told not to assume, whatever its literals look like.
  const uses = (source.match(/durationInFrames/g) ?? []).length;
  if (uses < 2) {
    problems.push(
      "never uses `durationInFrames` in its timing — every beat must be positioned relative to the scene's real length, not to fixed frame numbers.",
    );
  }

  return problems;
}

function componentNameFor(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Rewrites the barrel from whatever .tsx files are actually on disk.
 *
 * Derived from the directory rather than accumulated in memory so the registry
 * cannot drift from reality — a component deleted by hand, or a run that
 * crashed midway, both self-correct on the next write instead of leaving a
 * barrel importing a file that no longer exists (which would break the whole
 * bundle, not just that scene). */
export function regenerateBarrel(dir: string = GENERATED_DIR): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const ids = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.basename(f, ".tsx"))
    .filter(isValidComponentId)
    .sort();

  const header = `import type { GeneratedMotionComponent } from "../generatedMotion";

// ---------------------------------------------------------------------------
// AUTO-GENERATED BARREL — do not edit by hand.
//
// Rewritten by regenerateBarrel() in src/ai/generatedComponentStore.ts every
// time a motion component is written, and derived from the files actually
// present in this directory. It exists because Remotion bundles this project
// statically: a component reached through a dynamic path would not be traced
// by the bundler and would simply be missing at render time. A plain barrel of
// static imports is the one form the bundler is guaranteed to follow.
// ---------------------------------------------------------------------------
`;

  const imports = ids.map((id) => `import { ${componentNameFor(id)} } from "./${id}";`).join("\n");
  const entries = ids.map((id) => `  "${id}": ${componentNameFor(id)},`).join("\n");

  const body = `
export const GENERATED_COMPONENTS: Record<string, GeneratedMotionComponent> = {
${entries}
};
`;

  fs.writeFileSync(path.join(dir, "index.ts"), `${header}${imports ? `\n${imports}\n` : ""}${body}`, "utf8");
  return ids;
}

/** Writes one generated component and refreshes the barrel. Throws rather than
 * writing anything when the source fails the safety sweep — an unsafe file is
 * never persisted, not even to be inspected. */
export function writeGeneratedComponent(id: string, source: string, dir: string = GENERATED_DIR): string {
  if (!isValidComponentId(id)) {
    throw new UnsafeComponentError(
      `Invalid component id "${id}" — must match ${ID_PATTERN} (lowercase, hyphenated).`,
    );
  }
  const problems = findUnsafeUsage(source);
  if (problems.length > 0) {
    throw new UnsafeComponentError(problems.join("\n"));
  }
  if (!source.includes(`export const ${componentNameFor(id)}`)) {
    throw new UnsafeComponentError(
      `Component must export \`export const ${componentNameFor(id)}: GeneratedMotionComponent\` to match its id "${id}".`,
    );
  }

  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.tsx`);
  fs.writeFileSync(filePath, source, "utf8");
  regenerateBarrel(dir);
  return filePath;
}

export { componentNameFor, BARREL_PATH };
