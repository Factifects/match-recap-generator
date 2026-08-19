import fs from "node:fs";
import path from "node:path";

// The Techijest mascot — a reacting face at the edge of the frame.
//
// WHAT IT IS FOR, AND WHAT IT IS NOT FOR
//
// The mascot is a STORYTELLING DEVICE. It reacts to what the system does —
// puzzled at the strange thing, alarmed at the failure, satisfied at the payoff
// — and it never touches the system, never stands in for a component, and never
// enters the stage's own coordinate space. The technical system remains the
// subject; the standing rule is that Techijest is not a cartoon channel.
//
// That constraint is why this is deliberately NOT a stage object kind. A mascot
// that could be placed in a region would inevitably start being used as a
// component, and the frame would drift toward characters explaining things to
// each other instead of a system operating.
//
// SOURCING AND LICENCE
//
// The character is Bottts by Pablo Stanley, generated through the DiceBear API
// against a FIXED SEED so every video shows the same robot, with expression
// driven by eye and mouth parameters rather than by swapping images. Its licence
// ("Free for personal and commercial use", carried in each SVG's own metadata)
// is more permissive than CC-BY.
//
// An earlier pass used Twemoji faces here and was wrong: a different yellow
// emoji per beat is a set of reaction images, not a mascot. A mascot is one
// persona the audience recognises across videos, which requires the body to
// stay fixed while only the face changes.
//
// This was a deliberate choice over two tempting alternatives:
//   - arbitrary character art from a search result: copyrighted by default, and
//     a real liability on a monetised channel;
//   - open-source project mascots (the Go gopher, the Docker whale): the
//     artwork may be freely licensed but the marks are usually TRADEMARKED, and
//     trademark is not waived by an art licence.
// CC-BY costs one credit line in the video description, which `attribution()`
// below returns so the caller can surface it rather than it being forgotten.
//
// CC BY-SA sets (OpenMoji among them) are deliberately excluded: share-alike
// can be read as reaching the derived video, which is not a question worth
// having about a published Short.
//
// FETCHED ONCE AT GENERATION, CACHED TO DISK, NEVER AT RENDER TIME — same
// reasoning as brandRegistry.ts: a render is thousands of frames in a headless
// browser, and a per-frame fetch would issue thousands of requests and let one
// network blip fail a long render.

const MASCOT_DIR = path.join(process.cwd(), "public", "assets", "mascot");
const MANIFEST_PATH = path.join(MASCOT_DIR, "manifest.json");

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/bottts/svg";
/** THE CHANNEL'S ROBOT. One fixed seed means one recurring character across
 * every video — which is the whole difference between a mascot and a set of
 * reaction images. Changing this value changes the mascot's identity, so it
 * should outlive individual videos. */
const MASCOT_SEED = "techijest";
/** Locked so the robot's body never re-rolls between expressions. Without it,
 * each face would arrive on a differently-coloured machine and the character
 * would not read as the same one. */
const MASCOT_FIXED = "backgroundColor=transparent&baseColor=1c2c3a&eyesColor=22d3ee&mouthColor=22d3ee&sidesColor=1c2c3a&topColor=22d3ee";
export const MASCOT_LICENSE =
  'Bottts by Pablo Stanley (bottts.com), licensed "Free for personal and commercial use", generated via the DiceBear API (dicebear.com).';
export const MASCOT_ATTRIBUTION = "Mascot: Bottts by Pablo Stanley (bottts.com), free for commercial use.";
const FETCH_TIMEOUT_MS = 8000;

/** The expression vocabulary, mapped to Twemoji codepoints.
 *
 * Kept SMALL and named by what the mascot is DOING, not by which emoji it is.
 * A scene should be able to say "the mascot is suspicious here" without the
 * author choosing a codepoint, and the set should be swappable for original
 * artwork later without a single script changing. Each name maps to exactly one
 * beat a technical explainer actually needs. */
export const MASCOT_EXPRESSIONS = {
  /** The mystery has just landed. Default opening face. */
  puzzled: "eyes=round&mouth=diagram",
  /** Something is wrong and getting worse. */
  alarmed: "eyes=dizzy&mouth=grill02",
  /** The reveal has just clicked. */
  surprised: "eyes=bulging&mouth=square01",
  /** Watching something go badly that was predictable. */
  unimpressed: "eyes=shade01&mouth=grill01",
  /** The payoff worked. */
  pleased: "eyes=happy&mouth=smile01",
  /** Approving of the fix. */
  approving: "eyes=happy&mouth=smile02",
  /** Thinking through the mechanism. */
  focused: "eyes=sensor&mouth=diagram",
} as const;

export type MascotExpression = keyof typeof MASCOT_EXPRESSIONS;

export interface MascotAsset {
  expression: MascotExpression;
  /** Path relative to `public/`, ready for Remotion's staticFile(). */
  staticPath: string;
  source: string;
  license: string;
  fetchedAt: string;
}

type Manifest = Record<string, MascotAsset>;

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Manifest): void {
  fs.mkdirSync(MASCOT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function fetchSvg(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const body = await response.text();
    // Guard against a CDN error page being cached as if it were artwork.
    return body.trimStart().startsWith("<svg") ? body : null;
  } catch {
    return null;
  }
}

/** Resolves every expression a script uses, writing each to disk once.
 *
 * Every failure path returns without the asset rather than throwing — offline,
 * timeout, an unknown codepoint — and the renderer simply draws no mascot. A
 * missing mascot must never fail a render: it is a garnish on the explanation,
 * not part of it. */
export async function resolveMascotAssets(expressions: MascotExpression[]): Promise<{ resolved: MascotAsset[]; unresolved: string[] }> {
  const wanted = [...new Set(expressions)].filter((e) => e in MASCOT_EXPRESSIONS);
  if (wanted.length === 0) return { resolved: [], unresolved: [] };

  const manifest = readManifest();
  const resolved: MascotAsset[] = [];
  const unresolved: string[] = [];
  let dirty = false;

  for (const expression of wanted) {
    const cached = manifest[expression];
    if (cached && fs.existsSync(path.join(process.cwd(), "public", cached.staticPath))) {
      resolved.push(cached);
      continue;
    }

    const face = MASCOT_EXPRESSIONS[expression];
    const url = `${DICEBEAR_BASE}?seed=${MASCOT_SEED}&${MASCOT_FIXED}&${face}`;
    const svg = await fetchSvg(url);
    if (!svg) {
      unresolved.push(expression);
      continue;
    }

    fs.mkdirSync(MASCOT_DIR, { recursive: true });
    const fileName = `${expression}.svg`;
    // Written temp-then-rename: a half-written SVG left by an interrupted run
    // would be cached as valid and then fail to parse on every later render.
    const finalPath = path.join(MASCOT_DIR, fileName);
    const tempPath = `${finalPath}.tmp`;
    fs.writeFileSync(tempPath, svg);
    fs.renameSync(tempPath, finalPath);

    const asset: MascotAsset = {
      expression,
      staticPath: `assets/mascot/${fileName}`,
      source: url,
      license: MASCOT_LICENSE,
      fetchedAt: new Date().toISOString(),
    };
    manifest[expression] = asset;
    resolved.push(asset);
    dirty = true;
  }

  if (dirty) writeManifest(manifest);
  return { resolved, unresolved };
}

/** The credit line the video description must carry, or null when no mascot was
 * used. Returned rather than logged so a caller can surface it in the upload
 * details instead of it being quietly forgotten — which is the usual way a
 * CC-BY obligation gets breached. */
export function attribution(usedAny: boolean): string | null {
  return usedAny ? MASCOT_ATTRIBUTION : null;
}
