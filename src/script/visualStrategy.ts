import fs from "node:fs";
import path from "node:path";

// The strategy layer: which VISUAL BEHAVIOUR should explain this concept.
//
// The governing question is never "how do I animate these components?" but
// "what is the best visual way to make THIS concept understandable?" A scene
// that has not answered it falls back to the house default — component, line,
// component, travelling dot — which is the repetition this whole layer exists
// to break.
//
// WHAT THIS FILE HONESTLY IS
//
// It is a RECOMMENDER, not an analyst. It does not understand a topic; it
// matches the concept against a table of known shapes (most of which came
// straight from the standing directive) and falls back to keyword evidence.
// Calling that "analysing the concept" would overstate it, and an author who
// believed the overstatement would stop thinking about the choice — which is
// the one thing that must not happen, because picking the strategy IS the
// creative act. Suggestions are advisory and always overridable by the
// script's own declared profile.
//
// It also remembers what the last few videos led with, because a channel that
// reaches for the same grammar every time develops a recognisable and boring
// template even while every individual video looks fine.

export type VisualStrategy =
  | "transformation" | "stateChange" | "physicalInteraction" | "competition" | "accumulation"
  | "failure" | "splitting" | "merging" | "expansion" | "zoom" | "codeExecution" | "uiInteraction"
  | "beforeAfter" | "simulation" | "comparison" | "metaphor" | "reveal" | "causalChain"
  | "timeLapse" | "loop" | "perspective" | "scaleChange" | "absence" | "detach"
  | "topology" | "dependency" | "lineage";

export interface StrategyProfile {
  /** The grammar the video leads with. */
  primary: VisualStrategy;
  /** Supporting grammars the scenes may draw on. */
  secondary: VisualStrategy[];
  /** Explicitly banned for this video — normally the house defaults. */
  avoid: string[];
}

/** The house defaults, banned unless a video argues otherwise. Every one of
 * these is a way of drawing a diagram rather than showing a system. */
export const DEFAULT_AVOID = [
  "permanent flowchart",
  "repeated connector arrows",
  "repeated travelling dots",
  "static component cards",
  "vertical A -> B -> C layout",
];

/** Concept shapes, taken from the standing directive's own mapping. Keyed by
 * the words a script about that concept actually uses. */
const CONCEPT_TABLE: { match: RegExp; primary: VisualStrategy; secondary: VisualStrategy[] }[] = [
  { match: /race condition|concurren|two requests|same time|lost update/i, primary: "competition", secondary: ["stateChange", "physicalInteraction", "simulation"] },
  { match: /cache|caching|memoi[sz]|stampede|invalidat/i, primary: "stateChange", secondary: ["accumulation", "absence", "transformation"] },
  { match: /rate limit|throttl|token bucket|leaky bucket|quota/i, primary: "simulation", secondary: ["accumulation", "comparison", "physicalInteraction"] },
  { match: /cors|same.origin|preflight|browser block/i, primary: "uiInteraction", secondary: ["physicalInteraction", "reveal"] },
  { match: /index|indexing|full table scan|query plan/i, primary: "beforeAfter", secondary: ["simulation", "zoom"] },
  { match: /retry|retries|thundering herd|backoff|storm/i, primary: "causalChain", secondary: ["loop", "accumulation", "failure"] },
  { match: /load balanc|round robin|sharding|fan.?out/i, primary: "simulation", secondary: ["splitting", "scaleChange"] },
  { match: /replicat|consensus|leader election|quorum/i, primary: "splitting", secondary: ["merging", "failure", "stateChange"] },
  { match: /kubernetes|k8s|pod|orchestrat|scheduler/i, primary: "expansion", secondary: ["stateChange", "splitting", "zoom"] },
  { match: /websocket|polling|real.?time|typing indicator|long poll/i, primary: "comparison", secondary: ["simulation", "timeLapse", "absence"] },
  { match: /auth|token|session|cookie|jwt|login|sign.?in/i, primary: "transformation", secondary: ["uiInteraction", "reveal", "stateChange"] },
  { match: /idempoten|duplicate charge|exactly once|at least once/i, primary: "causalChain", secondary: ["stateChange", "loop"] },
  { match: /memory leak|technical debt|log growth|disk fill/i, primary: "timeLapse", secondary: ["accumulation", "failure"] },
  { match: /queue|backpressure|worker pool|job/i, primary: "accumulation", secondary: ["simulation", "loop", "failure"] },
  { match: /compil|interpret|ast|bytecode|parser|transpil/i, primary: "transformation", secondary: ["codeExecution", "zoom"] },
  { match: /rest|graphql|grpc|api design|over.?fetch/i, primary: "comparison", secondary: ["transformation", "simulation"] },
  { match: /cdn|edge|latency|round trip|propagat/i, primary: "scaleChange", secondary: ["absence", "comparison", "timeLapse"] },
  { match: /outage|cascading|deadlock|overload|crash/i, primary: "failure", secondary: ["causalChain", "accumulation"] },
  { match: /url|query string|tracking parameter|utm/i, primary: "reveal", secondary: ["transformation", "splitting", "absence"] },
  { match: /encrypt|tls|https|certificate|handshake/i, primary: "transformation", secondary: ["reveal", "perspective"] },
];

/** Suggests a profile from the video's narration. Deliberately returns a
 * SUGGESTION with its evidence, so a human can disagree with it knowingly
 * rather than a default being applied invisibly. */
export function suggestProfile(narration: string): { profile: StrategyProfile; matched: string | null } {
  for (const entry of CONCEPT_TABLE) {
    const hit = narration.match(entry.match);
    if (hit) {
      return { profile: { primary: entry.primary, secondary: entry.secondary, avoid: [...DEFAULT_AVOID] }, matched: hit[0] };
    }
  }
  // No known shape. `reveal` is the honest default for a Techijest video —
  // every one of them opens on something strange and then uncovers the
  // mechanism — but it is offered, not assumed to be right.
  return { profile: { primary: "reveal", secondary: ["transformation", "stateChange"], avoid: [...DEFAULT_AVOID] }, matched: null };
}

// --- cross-video memory ----------------------------------------------------

const HISTORY_PATH = path.join(process.cwd(), "analyses", ".strategy-history.json");
/** How far back a repeat still counts as repetition. */
const HISTORY_WINDOW = 3;

interface HistoryEntry {
  script: string;
  primary: string;
  at: string;
}

export function readStrategyHistory(): HistoryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

/** Records this video's leading grammar, keeping only a short tail. Written
 * beside the scripts rather than in `output/` on purpose: it is authoring
 * history, and it should survive a cleared render directory. */
export function recordStrategyUse(script: string, primary: string): void {
  const history = readStrategyHistory().filter((e) => e.script !== script);
  history.push({ script, primary, at: new Date().toISOString() });
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(-12), null, 2));
  } catch {
    // History is a convenience. Failing to write it must never fail a render.
  }
}

/** Warns when this video leads with a grammar the recent ones already used.
 * Returns null when the choice is fresh. */
export function repetitionWarning(script: string, primary: string): string | null {
  const recent = readStrategyHistory()
    .filter((e) => e.script !== script)
    .slice(-HISTORY_WINDOW);
  const clashes = recent.filter((e) => e.primary === primary);
  if (clashes.length === 0) return null;
  return `The last ${recent.length} video(s) include ${clashes.length} that already led with "${primary}" (${clashes
    .map((c) => c.script)
    .join(", ")}). Leading with a different grammar keeps the channel from settling into one recognisable template.`;
}
