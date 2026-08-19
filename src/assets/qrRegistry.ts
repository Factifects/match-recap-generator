import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// REAL QR CODES, encoded from real data and cached to disk.
//
// A hand-drawn grid of squares would have been quicker and it would have been a
// lie. The whole subject of a video about QR error correction is that the code
// still resolves after part of it is destroyed, and that claim is only worth
// making on a code that genuinely encodes something — a viewer can pause the
// video, point their phone at the damaged frame, and either it works or the
// video was wrong. A decorative approximation cannot be checked, cannot be
// scanned, and quietly turns a demonstration into an assertion.
//
// FETCHED ONCE AT GENERATION, CACHED, NEVER AT RENDER TIME — the same rule as
// brandRegistry.ts and mascotRegistry.ts. A render is thousands of frames in a
// headless browser and must never depend on a network round trip.
//
// Error correction is pinned to H (the highest level, ~30% of codewords
// recoverable) because that is the number the video actually talks about. If
// the script says a third can be missing, the code on screen has to be the
// level where that is true.

const QR_DIR = path.join(process.cwd(), "public", "assets", "qr");
const MANIFEST_PATH = path.join(QR_DIR, "manifest.json");
const FETCH_TIMEOUT_MS = 8000;

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrAsset {
  /** The data the code actually encodes. */
  data: string;
  correction: QrErrorCorrection;
  /** Path relative to `public/`, ready for Remotion's staticFile(). */
  staticPath: string;
  source: string;
  fetchedAt: string;
}

type Manifest = Record<string, QrAsset>;

/** One cache entry per (data, correction) pair — the same URL at a different
 * error-correction level is a genuinely different image with a different module
 * count, so it must not share a file. */
function keyFor(data: string, correction: QrErrorCorrection): string {
  return crypto.createHash("sha256").update(`${correction}:${data}`).digest("hex").slice(0, 20);
}

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Manifest): void {
  fs.mkdirSync(QR_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/** Two independent encoders, tried in order. Neither is a brand asset and
 * neither carries a licence question — a QR code is a mechanical encoding of
 * data the author already owns. */
function candidateUrls(data: string, correction: QrErrorCorrection): string[] {
  const encoded = encodeURIComponent(data);
  return [
    `https://quickchart.io/qr?text=${encoded}&ecLevel=${correction}&margin=1&size=600&format=svg`,
    `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&ecc=${correction.toLowerCase()}&margin=4&size=600x600&format=svg`,
  ];
}

async function fetchAndCache(data: string, correction: QrErrorCorrection): Promise<QrAsset | null> {
  const key = keyFor(data, correction);
  const manifest = readManifest();
  const cached = manifest[key];
  if (cached && fs.existsSync(path.join(process.cwd(), "public", cached.staticPath))) return cached;

  for (const url of candidateUrls(data, correction)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) continue;
      const svg = await response.text();
      if (!svg.includes("<svg")) continue;
      fs.mkdirSync(QR_DIR, { recursive: true });
      // Temp file then rename, so a half-written SVG can never be read by a
      // parallel render — the same failure the audio cache already had once.
      const file = path.join(QR_DIR, `${key}.svg`);
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, svg);
      fs.renameSync(temp, file);
      const asset: QrAsset = {
        data,
        correction,
        staticPath: path.join("assets", "qr", `${key}.svg`),
        source: url,
        fetchedAt: new Date().toISOString(),
      };
      manifest[key] = asset;
      writeManifest(manifest);
      return asset;
    } catch {
      // Try the next encoder.
    }
  }
  return null;
}

const inFlight = new Map<string, Promise<QrAsset | null>>();

/** Resolves every code a script asks for. Degrades rather than fails: an
 * unresolved code falls back to the drawn module grid, which is honest as a
 * shape and simply is not scannable. */
export async function resolveQrAssets(
  wanted: { data: string; correction?: QrErrorCorrection }[],
): Promise<{ resolved: QrAsset[]; unresolved: string[] }> {
  const unique = new Map<string, { data: string; correction: QrErrorCorrection }>();
  for (const want of wanted) {
    const correction = want.correction ?? "H";
    unique.set(keyFor(want.data, correction), { data: want.data, correction });
  }

  const results = await Promise.all(
    [...unique.entries()].map(([key, want]) => {
      const existing = inFlight.get(key);
      if (existing) return existing;
      const promise = fetchAndCache(want.data, want.correction);
      inFlight.set(key, promise);
      return promise;
    }),
  );

  const resolved = results.filter((asset): asset is QrAsset => asset !== null);
  const resolvedKeys = new Set(resolved.map((asset) => keyFor(asset.data, asset.correction)));
  const unresolved = [...unique.entries()].filter(([key]) => !resolvedKeys.has(key)).map(([, want]) => want.data);
  return { resolved, unresolved };
}

export function qrPathFor(data: string, correction: QrErrorCorrection = "H"): string | undefined {
  return readManifest()[keyFor(data, correction)]?.staticPath;
}
