import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ENGINE_DOCTRINE, estimateDurationSeconds } from "./doctrine";
import { withRetries, type LlmProvider } from "./provider";
import {
  GENERATED_DIR,
  UnsafeComponentError,
  componentNameFor,
  findTimingViolations,
  findUnsafeUsage,
  regenerateBarrel,
  writeGeneratedComponent,
} from "./generatedComponentStore";
import type { OutlineScene } from "./authorOutline";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Bespoke animation: the model writes a Remotion component, not a schema.
//
// This is the answer to the ceiling on the schema path. There, the model picks
// among mediums that already exist, so a concept none of them fits gets forced
// into the nearest one and every video is assembled from the same looks. Here
// there is no medium — the component IS the animation, and it can use anything
// Remotion offers.
//
// What replaces the schema as the correctness signal is the TypeScript
// compiler, which is a genuinely stronger check than Zod for this kind of
// output: it verifies that every prop, hook and interpolation actually
// type-checks against the real Remotion API, which is most of what goes wrong
// in generated animation code. What it CANNOT check is whether the result
// looks like anything — that needs the rendered frame, and lives in the
// critique pass, not here.
// ---------------------------------------------------------------------------

// Higher than the schema path's budget. Code generation converges more slowly
// than filling in a schema — a component has several independent ways to be
// wrong at once (contract, timing, types) and a round usually fixes one class.
const MAX_COMPILE_REPAIR_ROUNDS = 5;

/** Extracted so the prompt states the contract in the same words the type
 * does. The model is far more reliable given a concrete example of the exact
 * shape it must produce than given a prose description of it. */
function skeletonFor(id: string): string {
  return `import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import type { GeneratedMotionComponent } from "../generatedMotion";

export const ${componentNameFor(id)}: GeneratedMotionComponent = ({ durationInFrames, orientation, narrationText }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // ...
  return <div style={{ width: "100%", height: "100%" }}>{/* ... */}</div>;
};`;
}

function buildSystemPrompt(id: string): string {
  return `${ENGINE_DOCTRINE}

# Your task right now

Write ONE self-contained Remotion React component that animates a single scene. You are not filling in a schema — you are authoring the animation itself, so it can be whatever this specific concept genuinely needs.

# Hard requirements

- Output a complete TypeScript React file. No prose, no code fence, no explanation.
- It must export exactly: \`export const ${componentNameFor(id)}: GeneratedMotionComponent = (...)\`
- You may import ONLY from: "react", "remotion", "../generatedMotion", "../theme".
- Every visual value must be a pure function of \`useCurrentFrame()\`. Never call Date.now(), new Date(), or Math.random() — the renderer runs each frame independently and any of those makes the output flicker.
- Derive ALL timing from the \`durationInFrames\` prop, never hard-coded frame numbers. Narration is re-fitted against real measured audio after you write this, so a scene that assumes a fixed length will desynchronize.
- Branch on \`orientation\`. Portrait (9:16) and landscape (16:9) are separate compositions, not one layout scaled.
- The root element must fill the frame: \`width: "100%", height: "100%"\`. Paint your own background — never leave it transparent.

# The exact shape

${skeletonFor(id)}

# What makes this good rather than merely working

- Real motion design: staggered entrances, spring physics for anything that should feel physical, eased transforms, masks and clip paths for reveals, transform-origin used deliberately. Not everything fading in together.
- Progressive disclosure. The frame at 20% through must differ meaningfully from the frame at 60%.
- Type large. This is watched on a phone. A label under ~28px is unreadable; primary type should be far bigger.
- Every piece of text needs its own backing plate or a guaranteed-contrasting ground. Never place text directly over a busy or variable region.
- Restraint beats density. One mechanism demonstrated clearly outperforms fifteen elements moving at once.
- Keep the file under about 180 lines. This is a real design constraint, not just a budget one: a component that needs 500 lines is almost always staging fifteen things at once instead of demonstrating one, which is the exact failure the rule above describes.

# Output

The complete file, starting with \`import React from "react";\`. Nothing else.`;
}

/** A much leaner system prompt for repair rounds.
 *
 * Repair is an EDITING task, not an authoring one: the model already has a
 * concrete file and a list of what is wrong with it, and re-sending the full
 * creative doctrine tells it nothing it can act on. Dropping it saves ~1200
 * tokens, which is the difference between a repair round fitting inside a free
 * tier's per-minute budget and being rejected outright — Groq's 8000 TPM ceiling
 * counts the system prompt, the previous source AND the requested output
 * together, and the doctrine alone was a seventh of it.
 *
 * The rules kept here are exactly the ones a repair can violate: the export
 * shape, the import allowlist, purity, and narration-relative timing. */
function buildRepairSystemPrompt(id: string): string {
  return `You are fixing a Remotion React component that was rejected. Output the complete corrected file and nothing else — no prose, no code fence.

Non-negotiable constraints:
- Export exactly: \`export const ${componentNameFor(id)}: GeneratedMotionComponent = (...)\`
- Import ONLY from: "react", "remotion", "../generatedMotion", "../theme".
- No Date.now(), new Date(), or Math.random() — every frame must be a pure function of useCurrentFrame().
- All timing derived from the \`durationInFrames\` prop as fractions, never hard-coded frame numbers.
- Root element fills the frame and paints its own background.
- Keep the file under about 180 lines.

Change only what is needed to fix the reported problems. Everything else already passed.`;
}

function stripFences(text: string): string {
  const fenced = text.trim().match(/^```(?:tsx?|typescript|jsx?)?\s*([\s\S]*?)```$/);
  return (fenced ? fenced[1] : text).trim();
}

/** Type-checks the project and returns only the diagnostics for this
 * component's own file.
 *
 * Scoped to the one file on purpose: the project has pre-existing errors
 * elsewhere in other people's working state, and feeding those back would send
 * the model chasing problems it did not cause and cannot fix. */
export async function typecheckComponent(filePath: string): Promise<string[]> {
  try {
    await execFileAsync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { maxBuffer: 20 * 1024 * 1024 });
    return [];
  } catch (err) {
    const output = `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`;
    const normalized = filePath.split(path.sep).join("/");
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(normalized));
  }
}

export interface AuthorMotionOptions {
  scene: OutlineScene;
  /** Stable registry id; also the filename and the exported symbol's basis. */
  id: string;
  aspectRatio: "16:9" | "9:16";
  onLog?: (message: string) => void;
}

export interface AuthoredMotionScene {
  id: string;
  filePath: string;
  narration: string;
  durationSeconds: number;
  repairRounds: number;
}

export async function authorMotionScene(
  provider: LlmProvider,
  options: AuthorMotionOptions,
): Promise<AuthoredMotionScene> {
  const { scene, id, aspectRatio, onLog } = options;
  const durationSeconds = estimateDurationSeconds(scene.narration);
  const system = buildSystemPrompt(id);
  const repairSystem = buildRepairSystemPrompt(id);

  const baseUser = `Narration spoken over this scene (~${durationSeconds}s):
"${scene.narration}"

What the animation must DEMONSTRATE: ${scene.visualIntent}

Aspect ratio: ${aspectRatio} (${aspectRatio === "9:16" ? "portrait" : "landscape"})
Act: ${scene.act}

Write the component.`;

  let repairRounds = 0;
  let lastProblems = "";
  let lastSource = "";

  for (let attempt = 0; attempt <= MAX_COMPILE_REPAIR_ROUNDS; attempt++) {
    // The previous attempt's SOURCE goes back with the errors. Without it the
    // model regenerates from the brief each round and cannot see what it wrote
    // last time, so it fixes the reported problem and silently reintroduces one
    // it had already solved — the loop then alternates between two classes of
    // error and exhausts its budget without converging. Repair has to be an
    // edit of a specific file, not another attempt at the same task.
    const user =
      attempt === 0
        ? baseUser
        : `The scene's narration is: "${scene.narration}"
Aspect ratio: ${aspectRatio} (${aspectRatio === "9:16" ? "portrait" : "landscape"}).

# Your previous attempt

\`\`\`tsx
${lastSource}
\`\`\`

# It was rejected for these reasons

${lastProblems}

Return the COMPLETE corrected file.`;

    const result = await withRetries(
      () =>
        provider.complete({
          system: attempt === 0 ? system : repairSystem,
          user,
          cacheSystem: true,
          // Far higher than the schema path's budget. A real motion component
          // is a few hundred lines of dense JSX and interpolation, and a
          // truncated one is worse than none — it fails as a cascade of
          // confusing syntax errors rather than as "ran out of room".
          maxOutputTokens: 48_000,
          temperature: attempt === 0 ? 0.8 : 0.2,
        }),
      onLog,
    );

    const source = stripFences(result.text);

    // The safety and timing sweeps run BEFORE anything touches disk, so unsafe
    // source is never written even transiently. Timing is checked here rather
    // than left to the prompt because prose was demonstrably not enough: the
    // first component generated against a prompt stating this rule hard-coded
    // three milestones anyway, and nothing downstream would have caught it —
    // it compiles, renders, and only fails once narration is re-fitted.
    const violations = [...findUnsafeUsage(source), ...findTimingViolations(source)];
    if (violations.length > 0) {
      lastSource = source;
      lastProblems = violations.map((p) => `- The component ${p}`).join("\n");
      repairRounds++;
      onLog?.(`  motion "${id}": ${violations.length} contract violation(s), repairing (round ${repairRounds})`);
      continue;
    }

    let filePath: string;
    try {
      filePath = writeGeneratedComponent(id, source);
    } catch (err) {
      if (!(err instanceof UnsafeComponentError)) throw err;
      lastSource = source;
      lastProblems = err.message;
      repairRounds++;
      onLog?.(`  motion "${id}": rejected before write, repairing (round ${repairRounds})`);
      continue;
    }

    onLog?.(`  motion "${id}": compiling...`);
    const errors = await typecheckComponent(filePath);
    if (errors.length === 0) {
      return { id, filePath, narration: scene.narration, durationSeconds, repairRounds };
    }

    lastSource = source;
    lastProblems = errors.slice(0, 20).join("\n");
    repairRounds++;
    onLog?.(`  motion "${id}": ${errors.length} compile error(s), repairing (round ${repairRounds})`);
  }

  // A component that never compiled must not stay on disk AS A .tsx: the barrel
  // imports every .tsx in the directory, so leaving a broken one there would
  // break the bundle for EVERY scene, not just this one.
  const orphan = path.join(GENERATED_DIR, `${id}.tsx`);
  if (fs.existsSync(orphan)) fs.rmSync(orphan);
  regenerateBarrel();

  // But it is kept for inspection under a non-.tsx extension, which the barrel
  // ignores. Deleting the evidence outright made a repeatable failure
  // impossible to diagnose — the errors named a line nobody could look at.
  // This is the artifact that says whether the model wrote bad code or the
  // pipeline mangled good code on the way in.
  const rejectedPath = path.join(GENERATED_DIR, `${id}.rejected.txt`);
  fs.writeFileSync(
    rejectedPath,
    `// REJECTED after ${MAX_COMPILE_REPAIR_ROUNDS} repair rounds.\n// Problems:\n${lastProblems
      .split("\n")
      .map((l) => `//   ${l}`)
      .join("\n")}\n\n${lastSource}`,
    "utf8",
  );

  throw new Error(
    `Could not generate a compiling component for "${id}" after ${MAX_COMPILE_REPAIR_ROUNDS} repair rounds.\nLast errors:\n${lastProblems}\nRejected source kept at ${rejectedPath} for inspection.`,
  );
}
