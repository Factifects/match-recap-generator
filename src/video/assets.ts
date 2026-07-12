import fs from "node:fs";
import path from "node:path";

const ASSETS_ROOT = path.join(process.cwd(), "public", "assets");
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export type AssetCategory = "flags" | "badges" | "players" | "silhouettes" | "jerseys" | "icons";

/** Lowercase, accent-stripped, hyphenated — "Mbappé" -> "mbappe", "Salah-Eddine"
 * -> "salah-eddine" — so a script never needs to know the exact filename, just
 * the name it's already using. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Looks for a real, user-supplied asset in public/assets/<category>/ named
 * after the given name (any of a few common image extensions). Returns a
 * path relative to public/ (suitable for Remotion's staticFile()) or
 * undefined if nothing matches — callers are expected to render nothing
 * rather than invent a placeholder, same graceful-degradation rule as every
 * other optional visual in this project. Resolved at parse time (this runs
 * in plain Node, not inside a rendered component) so a missing file can
 * never cause a render-time image-load failure. */
export function findAsset(category: AssetCategory, name: string): string | undefined {
  const slug = slugify(name);
  if (!slug) return undefined;
  for (const ext of EXTENSIONS) {
    const filePath = path.join(ASSETS_ROOT, category, `${slug}.${ext}`);
    if (fs.existsSync(filePath)) return `assets/${category}/${slug}.${ext}`;
  }
  return undefined;
}

/** The silhouettes/ folder only ever holds a handful of generic fallbacks
 * (player, manager, fans), so exact-filename matching is more rigid than
 * useful there — this matches any file in the folder whose name contains the
 * category word (e.g. "manager1-silhoutte.jpeg" matches "manager"), rather
 * than requiring it be renamed to exactly "manager.ext". flags/badges/players
 * stay exact-match: with many distinct entities (every country, every club,
 * every player) a "contains" match risks matching the wrong one. */
function findSilhouette(kind: "player" | "manager" | "fans"): string | undefined {
  const dir = path.join(ASSETS_ROOT, "silhouettes");
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const match = files.find((file) => file.toLowerCase().includes(kind));
  return match ? `assets/silhouettes/${match}` : undefined;
}

/** Player/manager/fan photo if the user has supplied one, falling back to the
 * matching generic silhouette, falling back to nothing. */
export function findPersonArt(name: string, silhouette: "player" | "manager" | "fans" = "player"): string | undefined {
  return findAsset("players", name) ?? findSilhouette(silhouette);
}
