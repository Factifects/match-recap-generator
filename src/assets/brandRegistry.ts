// Real brand marks for recognizable technologies, pulled from Simple Icons.
//
// Standing mandate: when a scene names a real technology, it should show that
// technology's actual mark, not a generic box. A diagram of "Redis in front of
// Postgres" reads completely differently with the real logos on it.
//
// FETCHED FROM THE NETWORK, CACHED TO DISK, NEVER AT RENDER TIME.
//
// The distinction matters. A three-minute render is ~5,400 frames, each
// remounting components in a headless browser; fetching per frame would issue
// thousands of requests and let one network blip fail a long render. So the
// pull happens ONCE, here, during generation — the same place narration audio
// is generated — and writes an SVG into `public/assets/logos/`. Every frame
// afterwards reads a local file.
//
// Every failure path returns null rather than throwing: offline, DNS failure,
// timeout, 404 on an unknown slug, or a response that isn't actually SVG. The
// caller then falls back to the node's `shape` glyph, so a diagram always
// renders — it just renders with a cylinder instead of the Postgres elephant.

import fs from "node:fs";
import path from "node:path";

const LOGO_DIR = path.join(process.cwd(), "public", "assets", "logos");
const MANIFEST_PATH = path.join(LOGO_DIR, "manifest.json");

const SIMPLE_ICONS_BASE = "https://cdn.simpleicons.org";
/** Iconify aggregates 150+ icon sets behind one API. It is the PRIMARY source
 * because it carries things Simple Icons structurally cannot:
 *   - `logos:` — full-COLOUR brand marks (logos:aws-lambda ships the real
 *     orange gradient). Simple Icons is monochrome by design, and it has no AWS
 *     service marks at all.
 *   - `carbon:` — IBM Carbon's infrastructure glyphs (load-balancer-vpc,
 *     datastore, message-queue), which is how a diagram gets a decent icon for
 *     a generic ROLE that has no logo.
 * Simple Icons stays as the fallback: it has broad brand coverage and its
 * single-path marks tint cleanly. */
const ICONIFY_BASE = "https://api.iconify.design";
const LICENSE_SIMPLE =
  "Icon file: CC0-1.0 via Simple Icons (simpleicons.org). Trademarks remain the property of their respective owners; used here for editorial identification.";
const LICENSE_ICONIFY =
  "Icon file via the Iconify API (api.iconify.design); each source set carries its own licence (SVG Logos: CC0; Carbon: Apache-2.0). Trademarks remain the property of their respective owners.";
const FETCH_TIMEOUT_MS = 8000;

export interface BrandAsset {
  slug: string;
  title: string;
  hex: string;
  /** True when the mark is a single tintable shape (Simple Icons, or a Carbon
   * glyph drawn with `currentColor`). The renderer tints those white on a
   * brand-coloured tile. A full-colour mark is drawn as-is instead — masking it
   * would throw away the colour that makes it recognizable. */
  monochrome: boolean;
  /** Path relative to `public/`, ready for Remotion's staticFile(). */
  staticPath: string;
  source: string;
  license: string;
  fetchedAt: string;
}

type Manifest = Record<string, BrandAsset>;

/** Simple Icons' own convention: lowercase, no separators, dots spelled out.
 * "Node.js" -> "nodedotjs", "C++" -> "cplusplus". */
export function normalizeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/\./g, "dot")
    .replace(/[^a-z0-9]/g, "");
}

/** Iconify keeps kebab-case names ("aws-lambda"), so it needs its own
 * normalization rather than Simple Icons' strip-everything rule. */
export function normalizeIconifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** An author may pin a set explicitly — `brand: "carbon:datastore"` — or give a
 * bare name and let the chain below pick. */
function parseSpec(name: string): { set?: string; name: string } {
  const match = /^([a-z0-9-]+):(.+)$/i.exec(name.trim());
  return match ? { set: match[1].toLowerCase(), name: match[2] } : { name: name.trim() };
}

function isMonochrome(svg: string): boolean {
  if (svg.includes("currentColor")) return true;
  const fills = new Set([...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "none"));
  return fills.size <= 1 && !svg.includes("<linearGradient") && !svg.includes("<radialGradient");
}

/** Where to look, in order, for a bare name. Full-colour first: a real Lambda
 * mark beats a monochrome silhouette of one. */
function candidateUrls(spec: { set?: string; name: string }): string[] {
  if (spec.set === "simpleicons" || spec.set === "simple-icons") return [`${SIMPLE_ICONS_BASE}/${normalizeSlug(spec.name)}`];
  if (spec.set) return [`${ICONIFY_BASE}/${spec.set}/${normalizeIconifyName(spec.name)}.svg`];
  return [
    `${ICONIFY_BASE}/logos/${normalizeIconifyName(spec.name)}.svg`,
    `${SIMPLE_ICONS_BASE}/${normalizeSlug(spec.name)}`,
  ];
}

function readManifest(): Manifest {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    // A corrupt manifest must not break generation — treat it as empty and
    // let the fetch path rebuild it.
    return {};
  }
}

/** Merges into whatever is on disk rather than overwriting it. Several
 * resolutions run concurrently and each holds a snapshot of the manifest taken
 * when it started; a blind write loses every entry another worker added in the
 * meantime. */
function writeManifest(manifest: Manifest): void {
  try {
    fs.mkdirSync(LOGO_DIR, { recursive: true });
    const merged = { ...readManifest(), ...manifest };
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  } catch {
    // Cache write failures are non-fatal: the asset is already in memory for
    // this run, it just won't be reused next time.
  }
}

function extractTitle(svg: string, fallback: string): string {
  return /<title>([^<]+)<\/title>/.exec(svg)?.[1] ?? fallback;
}

function extractHex(svg: string): string {
  return /fill="(#[0-9a-fA-F]{3,8})"/.exec(svg)?.[1] ?? "#94a3b8";
}

// One in-flight promise per slug, negative results included. A script with
// eight scenes all mentioning Redis fetches Redis once.
const inFlight = new Map<string, Promise<BrandAsset | null>>();

async function fetchAndCache(slug: string, spec: { set?: string; name: string }): Promise<BrandAsset | null> {
  const manifest = readManifest();
  const cached = manifest[slug];
  if (cached && fs.existsSync(path.join(process.cwd(), "public", cached.staticPath))) return cached;

  // A hand-supplied file in the logo directory always wins, even with no
  // manifest entry. This is the supported override path, and it is not an edge
  // case: Simple Icons carries no AWS service marks at all (they were removed
  // for trademark reasons), so Lambda / S3 / DynamoDB — the icons most cloud
  // architecture diagrams are built from — can only come from AWS's own
  // Architecture Icons pack, dropped in here as `<slug>.svg`.
  // Only an UNATTRIBUTED file counts as a hand-supplied override. A file that
  // this registry fetched itself already has a manifest entry naming its real
  // source, and must not be relabelled — that would quietly destroy the licence
  // provenance the manifest exists to record.
  const localPath = path.join(LOGO_DIR, `${slug}.svg`);
  if (fs.existsSync(localPath) && !readManifest()[slug]) {
    try {
      const svg = fs.readFileSync(localPath, "utf8");
      const asset: BrandAsset = {
        slug,
        title: extractTitle(svg, slug),
        hex: extractHex(svg),
        monochrome: isMonochrome(svg),
        staticPath: path.join("assets", "logos", `${slug}.svg`),
        source: "local override",
        license: "Supplied locally — provenance is the author's responsibility.",
        fetchedAt: new Date().toISOString(),
      };
      manifest[slug] = asset;
      writeManifest(manifest);
      return asset;
    } catch {
      // Unreadable local file — fall through to the network.
    }
  }

  for (const url of candidateUrls(spec)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) continue;
      const svg = await response.text();
      // A CDN error page can still be a 200 — only accept real SVG.
      if (!svg.trimStart().startsWith("<svg")) continue;

      const relativePath = path.join("assets", "logos", `${slug}.svg`);
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      fs.writeFileSync(path.join(LOGO_DIR, `${slug}.svg`), svg);

      const asset: BrandAsset = {
        slug,
        title: extractTitle(svg, spec.name),
        hex: extractHex(svg),
        monochrome: isMonochrome(svg),
        staticPath: relativePath,
        source: url,
        license: url.startsWith(ICONIFY_BASE) ? LICENSE_ICONIFY : LICENSE_SIMPLE,
        fetchedAt: new Date().toISOString(),
      };
      manifest[slug] = asset;
      writeManifest(manifest);
      return asset;
    } catch {
      // Offline, DNS failure, timeout, abort — try the next source.
    }
  }
  return null;
}

/** Resolves one brand to a locally cached SVG, or null if it can't be had.
 * Never throws. */
export function resolveBrandAsset(name: string): Promise<BrandAsset | null> {
  const spec = parseSpec(name);
  // The cache key keeps the set prefix, so `carbon:datastore` and a bare
  // `datastore` never collide on disk.
  const slug = spec.set ? `${spec.set}-${normalizeIconifyName(spec.name)}` : normalizeSlug(spec.name);
  if (!slug) return Promise.resolve(null);
  let pending = inFlight.get(slug);
  if (!pending) {
    pending = fetchAndCache(slug, spec);
    inFlight.set(slug, pending);
  }
  return pending;
}

/** Test seam — lets a test reset per-process memoization. */
export function clearBrandCacheForTests(): void {
  inFlight.clear();
}

export interface BrandResolution {
  resolved: BrandAsset[];
  /** Names that could not be resolved and will fall back to their shape. */
  unresolved: string[];
}

/** Resolves many brands concurrently. Bounded so a diagram naming a dozen
 * technologies doesn't open a dozen sockets at once. */
export async function resolveBrandAssets(names: string[]): Promise<BrandResolution> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const resolved: BrandAsset[] = [];
  const unresolved: string[] = [];

  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const name = unique[cursor++];
      const asset = await resolveBrandAsset(name);
      if (asset) resolved.push(asset);
      else unresolved.push(name);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return { resolved, unresolved };
}
