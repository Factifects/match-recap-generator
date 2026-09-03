import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VISUAL_DEFINITIONS } from "../model/visualDefinitions";
import { estimateTokens } from "./provider";

// ---------------------------------------------------------------------------
// The registry, made promptable.
//
// `visualDefinitions.ts` already is the spec: 45 mediums, each with a Zod
// schema, a human description and the `Scene Type:` string that selects it.
// Nothing here re-describes any of that by hand — a second, prose copy of the
// schema would rot the first time someone adds a field, and the model would
// then be authoring against a spec the parser no longer accepts. Everything
// below is DERIVED, so the prompt is correct by construction and a new medium
// becomes authorable the moment it lands in the registry.
//
// This is also the answer to the context-budget problem. SCRIPT_FORMAT_REFERENCE.md
// is 43KB of prose and the 45 schemas together are far larger than that; sending
// either wholesale on every scene call would be slow, expensive, and would bury
// the one schema that actually matters. So the pipeline splits in two: the
// outline call sees only the one-line catalog (which medium exists, and what
// it's for), and each scene call sees only the chosen medium's schema.
// ---------------------------------------------------------------------------

export interface MediumSummary {
  kind: string;
  /** The exact string that must follow `**Scene Type:**` in the script. */
  sceneTypeKey: string;
  label: string;
  description: string;
  category: string;
}

/** The one-line-per-medium catalog handed to the outline stage. Small on
 * purpose — this is a menu, not a manual. */
export function listMediums(): MediumSummary[] {
  return VISUAL_DEFINITIONS.map((def) => ({
    kind: def.kind,
    sceneTypeKey: def.sceneTypeKey,
    label: def.label,
    description: def.description,
    category: def.category,
  }));
}

// --- Authoring policy ------------------------------------------------------
//
// Not every registered medium is a good thing for a model to REACH FOR. The
// registry is a capability list; this is an editorial one, and the two are
// deliberately different concerns kept in different files — a medium stays
// fully renderable and hand-authorable while being a bad default for an
// unattended author.
//
// Both lists below were written from rendered evidence, not theory. The first
// AI-authored airplane-mode script picked `channels` for a concept with no
// day-shaped structure (it rendered as three labels in an empty frame) and
// `spatial` for a concept that needed no 3D (it rendered as an unrecognizable
// stick). Both scenes passed every validator, because "schema-valid and
// geometrically sound" and "reads as anything at all" are different questions.

/** Mediums excluded from AI authoring entirely.
 *
 * The project's football-analysis heritage — still live, still rendering, and
 * completely wrong for a tech lesson. A model shown `formation` and
 * `shot-map` in a catalog will eventually reach for one, and the result is
 * never recoverable by a repair round because nothing about it is invalid. */
export const EXCLUDED_FROM_AUTHORING = new Set([
  // Raw code generation, disabled by default after being rendered and looked
  // at (2026-09-01). The machinery works — generate, gate, compile, repair,
  // register, render all function — but the OUTPUT does not: on the models
  // this pipeline can actually afford, a generated component renders as a few
  // tiny shapes on an empty ground with no text. The critique pass scored one
  // 2/10 readable, 0/10 text, `looksEmpty: true`.
  //
  // The root cause is not fixable by more repair rounds. Good motion design
  // from raw codegen needs a frontier model, which defeats the point of running
  // on a free tier; and constraining components to fit a free tier's token
  // budget makes them worse. Meanwhile a hand-built medium produces a good
  // scene from a cheap model every time, because the quality lives in the
  // medium rather than in the generation.
  //
  // The code stays (`Scene Type: motion` still renders, and
  // `npm run author:motion` still generates) — it is simply not something an
  // unattended author should reach for. Re-enable it by removing this entry if
  // a frontier model is ever the default.
  "motion",
  "tactical-board",
  "vertical-tactical-board",
  "tactical-board-3d",
  "formation",
  "formation-3d",
  "shot-map",
  "shot-map-3d",
  "pass-network",
  "heat-map",
  "zone",
  "goal-sequence",
  "player-comparison",
  "league-table",
  "momentum-timeline",
  "career-path",
]);

/** Mediums that are powerful but fail badly when reached for casually, with
 * the condition under which each one is actually the right answer. Surfaced in
 * the catalog as an explicit "ONLY WHEN" so the outline call has to justify
 * the choice rather than be tempted by an interesting-sounding name.
 *
 * `spatial` carries the hardest-won note: three separate attempts to carry an
 * episode on a rendered 3D world failed the same way, because a depiction has
 * to compete with the real thing a viewer already knows and loses. */
export const SPECIALIZED_MEDIUMS: Record<string, string> = {
  spatial:
    "ONLY WHEN physical distance or 3D position IS the concept. A depiction that needs narration to identify it has already failed — prefer deliberate abstraction.",
  "canvas-3d":
    "ONLY WHEN volume or occlusion IS the concept. Otherwise a flat medium reads faster and better.",
  channels:
    "ONLY WHEN the subject is genuinely a day (or other fixed span) of activity across several parallel streams. It renders as an empty frame for anything else.",
  holdings:
    "ONLY WHEN the point is that NO complete picture exists anywhere — many participants each holding a partial, conflicting view.",
  treemap: "ONLY WHEN showing proportion of a whole across many categories.",
  "packed-circles": "ONLY WHEN showing relative magnitude across many items at once.",
  radar: "ONLY WHEN comparing the same several dimensions across two subjects.",
  funnel: "ONLY WHEN showing progressive drop-off through ordered stages.",
};

/** The default medium set for AI authoring — everything registered, minus the
 * heritage exclusions. Specialized mediums stay IN, but carry their condition. */
export function authorableMediums(): MediumSummary[] {
  return listMediums().filter((m) => !EXCLUDED_FROM_AUTHORING.has(m.kind));
}

/** Mediums whose schema actually fits a provider's per-request budget.
 *
 * A medium is only authorable if its JSON Schema, plus the doctrine prompt and
 * room for the reply, fits in one request. `stage` is ~7000 tokens of schema on
 * its own, which exceeds Groq's entire 8000-token ceiling before a single word
 * of brief or output — no amount of trimming exemplars rescues it, and sending
 * it produces a 413 that no retry can clear.
 *
 * So the constraint is applied where it can still be acted on: at medium
 * SELECTION, before the outline commits to something that cannot be authored.
 * On a provider with no meaningful ceiling this filters nothing. */
export function mediumsWithinBudget(budgetTokens: number | undefined, reserveTokens = 3200): MediumSummary[] {
  const authorable = authorableMediums();
  if (budgetTokens === undefined) return authorable;
  const available = budgetTokens - reserveTokens;
  return authorable.filter((m) => estimateTokens(jsonSchemaFor(m.kind)) <= available);
}

export function findMedium(kindOrSceneType: string): MediumSummary | undefined {
  const needle = kindOrSceneType.toLowerCase().replace(/\s+/g, "");
  return listMediums().find(
    (m) => m.kind.toLowerCase() === needle || m.sceneTypeKey.toLowerCase().replace(/\s+/g, "") === needle,
  );
}

/** Renders the catalog for a prompt, grouped by category so the model sees
 * that `stats-dataviz` and `generic-diagrams` are different kinds of answer
 * rather than one flat list of 45 near-synonyms. */
export function renderMediumCatalog(only?: string[]): string {
  const mediums = only ? listMediums().filter((m) => only.includes(m.kind)) : authorableMediums();
  const byCategory = new Map<string, MediumSummary[]>();
  for (const m of mediums) {
    const bucket = byCategory.get(m.category) ?? [];
    bucket.push(m);
    byCategory.set(m.category, bucket);
  }
  const lines: string[] = [];
  for (const [category, items] of byCategory) {
    lines.push(`\n## ${category}`);
    for (const m of items) {
      const caveat = SPECIALIZED_MEDIUMS[m.kind];
      lines.push(
        `- \`${m.sceneTypeKey}\` (kind: ${m.kind}) — ${m.description}${caveat ? ` **${caveat}**` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

/** The Zod schema for one medium — the same object the parser validates
 * against, so what passes here passes there by definition. */
export function schemaFor(kind: string): z.ZodTypeAny | undefined {
  return VISUAL_DEFINITIONS.find((d) => d.kind === kind)?.schema;
}

/** JSON Schema text for one medium, for the scene-authoring prompt.
 *
 * `io: "input"` matters: several schemas carry defaults and resolver-filled
 * fields (a diagram node's `logoPath`/`logoHex` are written by the brand
 * resolver, never authored). The output view would present those as things the
 * model should supply, which is exactly wrong. */
export function jsonSchemaFor(kind: string): string {
  const schema = schemaFor(kind);
  if (!schema) throw new Error(`No visual definition registered for kind "${kind}".`);
  const jsonSchema = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  // Compact, not pretty-printed. Indenting `stage` takes it from 28KB to
  // 80KB for zero comprehension gain — that is ~13k wasted tokens on every
  // scene call, and on the free tier it is the difference between fitting the
  // budget and not.
  return JSON.stringify(jsonSchema);
}

// --- Exemplars -------------------------------------------------------------
//
// Few-shot examples are mined from `analyses/*.txt` rather than written here.
// Those files are the real, rendered, hand-tuned output of this engine, so
// they demonstrate things no schema can state: how dense a good scene's
// timeline is, that beats are staggered rather than simultaneous, how narration
// and choreography actually line up. A hand-written example in this file would
// be a guess at the house style; these ARE the house style.

export interface Exemplar {
  sceneType: string;
  narration: string;
  durationSeconds?: number;
  data: string;
  sourceFile: string;
}

const SCENE_SPLIT = /^---$/m;

function parseField(block: string, field: string): string | undefined {
  const match = block.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\n\\*\\*|\\n\\s*$)`, "i"));
  return match?.[1]?.trim();
}

/** Reads every scene out of the analyses corpus. Deliberately tolerant: these
 * are working files that also contain comments, abandoned drafts and proof
 * scripts, so anything that doesn't parse is skipped rather than thrown on. */
export function loadExemplarCorpus(analysesDir: string): Exemplar[] {
  if (!fs.existsSync(analysesDir)) return [];
  const exemplars: Exemplar[] = [];
  const files = fs
    .readdirSync(analysesDir)
    .filter((f) => f.endsWith(".txt"))
    // Newest first — later scripts reflect the most recent doctrine, and the
    // engine's conventions have moved substantially over its life.
    .map((f) => ({ f, mtime: fs.statSync(path.join(analysesDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.f);

  for (const file of files) {
    const text = fs.readFileSync(path.join(analysesDir, file), "utf8");
    for (const block of text.split(SCENE_SPLIT)) {
      const sceneType = parseField(block, "Scene Type");
      const data = parseField(block, "Data");
      const narration = parseField(block, "Narration");
      if (!sceneType || !data || !narration) continue;
      if (!data.startsWith("{")) continue;
      const durationRaw = parseField(block, "Duration");
      const duration = durationRaw ? Number.parseFloat(durationRaw) : undefined;
      exemplars.push({
        sceneType: sceneType.trim(),
        narration,
        durationSeconds: Number.isFinite(duration) ? duration : undefined,
        data,
        sourceFile: file,
      });
    }
  }
  return exemplars;
}

/** Picks the most instructive examples of one medium.
 *
 * Ranked by Data size as a proxy for choreographic richness. That proxy is
 * crude but points the right way: the failure this engine's doctrine warns
 * about most is the thin scene — two objects and an arrow — and a thin scene
 * is always a short Data block. Showing the model the richest real scenes
 * anchors it above that floor rather than at it. */
export function pickExemplars(corpus: Exemplar[], sceneTypeKey: string, count = 2): Exemplar[] {
  const needle = sceneTypeKey.toLowerCase().replace(/\s+/g, "");
  return corpus
    .filter((e) => e.sceneType.toLowerCase().replace(/\s+/g, "") === needle)
    .sort((a, b) => b.data.length - a.data.length)
    .slice(0, count);
}

export function renderExemplars(exemplars: Exemplar[]): string {
  if (exemplars.length === 0) {
    return "(No prior example of this medium exists in the corpus — follow the schema exactly and keep the choreography dense.)";
  }
  return exemplars
    .map(
      (e, i) =>
        `### Example ${i + 1} (from ${e.sourceFile})\n\n**Narration:** ${e.narration}\n\n**Duration:** ${e.durationSeconds ?? "?"} seconds\n\n**Data:** ${e.data}`,
    )
    .join("\n\n");
}
