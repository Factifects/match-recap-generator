import { CANVAS_ICON_KEYS, type CanvasIconKey } from "../model/visualDefinitions";

// A Scene Contract is a script author's DECLARATION of what a scene is
// supposed to demonstrate — separate from (and checkable against) the
// Canvas Data that actually realizes it. This is what makes "does the
// animation demonstrate the narration" a deterministic check instead of an
// unfalsifiable one: you cannot judge whether an object array demonstrates
// a concept with no stated concept to check it against, but "does declared
// edge client->proxy have a real transport or connection?" is exactly as
// mechanical as an overlap check once the edge is written down.
//
// Three new optional **Field:** lines, same convention as every other field
// in parseSceneScript.ts:
//
//   **Thesis:** A reverse proxy receives every request instead of the real
//   server, then forwards it on and relays the response back.
//
//   **Entities:** client:device, proxy:shield, server:server
//
//   **Flow:** client -request-> proxy; proxy -forwards-> server; server -returns-> proxy; proxy -returns-> client
//
// `Flow` is semicolon-separated on ONE line, not one edge per line — the
// script parser's extractFields() already joins a multi-line field's buffer
// with spaces (see parseSceneScript.ts), which would silently collapse a
// newline-per-edge Flow field into one ambiguous run-on string. Semicolons
// avoid touching that shared parsing behavior at all (every other
// multi-line field, e.g. Narration, relies on exactly that space-joining to
// reflow prose) — same "structured content packed onto one line" convention
// **Data:** already established for JSON.
//
// Entity ids in `Flow`/`Entities` are the SAME ids used for Canvas object
// `id`s in a hand-authored `**Data:**` block (for a `Canvas` scene that adds
// a contract purely for validation) — no separate binding table. A `Flow`
// scene type (composeFlow.ts) enforces this automatically, since it assigns
// entity ids directly as object ids.

/** Transport verbs move a token from `from` to `to` and are what the
 * realization checker looks for a real `move`/arrow for. `checks`/
 * `validates` are pulses AT a node (no travel expected). `transforms`/
 * `stores`/`accumulates` are state changes at the target, satisfied by a
 * `style` action or a token being absorbed (disappearing into the target)
 * rather than a full transport back out. */
export const FLOW_VERBS = [
  "request",
  "forwards",
  "routes",
  "returns",
  "responds",
  "blocks",
  "rejects",
  "stores",
  "checks",
  "validates",
  "transforms",
  "accumulates",
] as const;
export type FlowVerb = (typeof FLOW_VERBS)[number];
const FLOW_VERB_SET = new Set<string>(FLOW_VERBS);

export const TRANSPORT_VERBS = new Set<FlowVerb>(["request", "forwards", "routes", "returns", "responds", "blocks", "rejects"]);
export const PULSE_VERBS = new Set<FlowVerb>(["checks", "validates"]);
export const STATE_VERBS = new Set<FlowVerb>(["stores", "transforms", "accumulates"]);

export interface ContractEntity {
  id: string;
  icon?: CanvasIconKey;
  label: string;
}

export interface ContractEdge {
  from: string;
  to: string;
  verb: FlowVerb;
}

export interface SceneContract {
  thesis?: string;
  entities: ContractEntity[];
  edges: ContractEdge[];
}

const EDGE_PATTERN = /^([A-Za-z0-9_]+)\s*-(\w+)->\s*([A-Za-z0-9_]+)$/;

/** A capitalized-words label from a bare id ("realServer" -> "Real Server")
 * — only used when an entity is authored without an explicit label, so most
 * Flow-compiled entities still get something readable without an author
 * having to spell out every label by hand. */
function labelFromId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** `client:device` or `client:device:"The Client"` — icon is validated
 * against the real CANVAS_ICON_KEYS registry; an unrecognized icon name is
 * dropped (undefined) rather than passed through, since an icon object with
 * an unknown key renders NOTHING in Canvas.tsx (CANVAS_ICON_COMPONENTS
 * lookup returns null and the object simply doesn't draw) — a silently
 * invisible entity would be a worse failure than falling back to a plain dot. */
function parseEntity(raw: string): ContractEntity | null {
  const parts = raw.split(":").map((p) => p.trim());
  const id = parts[0];
  if (!id) return null;
  const iconCandidate = parts[1];
  const icon = iconCandidate && (CANVAS_ICON_KEYS as readonly string[]).includes(iconCandidate) ? (iconCandidate as CanvasIconKey) : undefined;
  const label = parts[2] || labelFromId(id);
  return { id, icon, label };
}

export function parseEntitiesField(raw: string | undefined): ContractEntity[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseEntity)
    .filter((e): e is ContractEntity => e !== null);
}

function parseEdge(raw: string): ContractEdge | null {
  const match = raw.trim().match(EDGE_PATTERN);
  if (!match) return null;
  const [, from, verbRaw, to] = match;
  const verb = verbRaw.toLowerCase();
  if (!FLOW_VERB_SET.has(verb)) return null;
  return { from, to, verb: verb as FlowVerb };
}

export function parseFlowField(raw: string | undefined): ContractEdge[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseEdge)
    .filter((e): e is ContractEdge => e !== null);
}

/** Reads the Thesis/Entities/Flow fields off an already-extracted field map
 * (same shape parseSceneScript.ts's own SceneFields has — passed as a plain
 * Record so this module doesn't need to import that unexported interface).
 * Returns undefined when neither Entities nor Flow is present, so every
 * existing script (none of which write these fields) is completely
 * unaffected — a bare Thesis with no Flow isn't a contract to check
 * anything against, just documentation. */
export function parseSceneContract(fields: Record<string, string>): SceneContract | undefined {
  const entities = parseEntitiesField(fields["Entities"]);
  const edges = parseFlowField(fields["Flow"]);
  if (entities.length === 0 && edges.length === 0) return undefined;
  return { thesis: fields["Thesis"]?.trim() || undefined, entities, edges };
}
