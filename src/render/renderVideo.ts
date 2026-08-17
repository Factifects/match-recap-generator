import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, makeCancelSignal, type CancelSignal } from "@remotion/renderer";
import { config } from "../config";

const ENTRY_POINT = path.join(__dirname, "..", "video", "index.ts");

export interface RenderProgress {
  percent: number;
  stage: "bundling" | "rendering" | "encoding";
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
}

export { makeCancelSignal, type CancelSignal };

/** `@remotion/renderer` implements this at runtime (make-cancel-signal.js)
 * but doesn't re-export it from its public `.d.ts` index, so it can't be
 * imported directly without reaching into an internal path that could move
 * under a version bump. Same check, reproduced locally: a cancelled
 * renderMedia() call rejects with an Error whose message contains this
 * exact string. */
export function isUserCancelledRender(err: unknown): boolean {
  return err instanceof Error && err.message.includes("renderMedia() got cancelled");
}

// --- Concurrency ---------------------------------------------------------
//
// Remotion's own default is one headless-Chrome render worker per CPU core.
// This project's diagram/workspace scenes render real gradients, masks and
// SVG animation per frame, and a live render was observed degrading from
// ~17 frames/min to ~4 frames/min over two hours as free RAM kept dropping
// further than the concurrency choice at kickoff accounted for — CPU stayed
// at ~20% the whole time, confirming it was RAM-bound, not compute-bound.
//
// This machine also never has anywhere close to its full RAM available to
// Remotion: VS Code, several TypeScript language servers, esbuild watchers,
// browser tabs and the Remotion compositor's own long-running process are
// all resident at the same time. So the policy here is deliberately blunt
// rather than a per-worker budget formula: stay at 1 worker until there's
// real headroom, and even then cap at 2 until benchmarking proves higher is
// safe. Bands are against FREE memory at the moment a render starts, not
// total system RAM — a 24GB machine with 900MB free is not "24GB available".
const GB = 1024 * 1024 * 1024;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY_UNTIL_BENCHMARKED = 2;

function tieredConcurrency(freeBytes: number): number {
  const freeGb = freeBytes / GB;
  if (freeGb < 12) return MIN_CONCURRENCY;
  return MAX_CONCURRENCY_UNTIL_BENCHMARKED;
}

/** Resolves render concurrency: an explicit call-site override wins, then
 * `RENDER_CONCURRENCY` (see config.ts), then the RAM-tiered default above.
 * Exported so server.ts can report the value it's about to use before a
 * render starts, and so tests can call it directly without spinning up a
 * real render. */
export function resolveConcurrency(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const envOverride = config.renderConcurrency();
  if (envOverride !== undefined) return envOverride;
  return tieredConcurrency(os.freemem());
}

// --- Bundle caching --------------------------------------------------------
//
// Reused across every render call within the same process instead of
// re-running webpack from scratch each time — matters most for the scene-
// preview loop (server.ts's long-running `npm run ui` process handles many
// separate render requests over its lifetime, and each one used to pay a
// full bundle() before doing any actual rendering, working directly against
// "previewing a scene should take seconds" being the whole point of scene
// preview existing). Safe to cache for the process's lifetime: this process
// already requires a manual restart to pick up ANY source change (tsx runs
// server.ts once at startup, no --watch flag — see package.json's "ui"
// script), so a stale bundle was never a risk this introduces, only a cost
// this removes. The CLI's one-shot invocations get no real benefit from
// this (a fresh process every run has nothing to reuse), but also lose
// nothing — it's the same single bundle() call it always made.
let cachedBundleLocation: Promise<string> | null = null;

function getBundleLocation(): Promise<string> {
  if (!cachedBundleLocation) {
    // A failed bundle attempt (a transient fs/network hiccup, not a code
    // problem) must not poison every later render in this same process —
    // clear the cache on rejection so the NEXT call gets a fresh attempt
    // instead of the same permanently-broken promise forever.
    cachedBundleLocation = bundle({ entryPoint: ENTRY_POINT }).catch((err) => {
      cachedBundleLocation = null;
      throw err;
    });
  }
  return cachedBundleLocation;
}

// --- Memory/frame telemetry ------------------------------------------------
//
// Purpose-built to answer one question with evidence instead of a guess:
// does RSS stabilize over the course of a render, or does it climb without
// bound? Logged every LOG_EVERY_N_FRAMES frames (not every frame — that
// would itself be a meaningful amount of I/O over a multi-thousand-frame
// render) alongside which scene is currently on screen, so a leak can be
// correlated to a specific composition rather than just "somewhere".
const LOG_EVERY_N_FRAMES = 200;

/** Best-effort "which segment is this frame in" lookup. `inputProps` is
 * generic across every composition this renderer serves — only the
 * AnalysisVideo composition's `segments` shape is recognized; anything else
 * (the benchmark composition, a future composition with no segments array)
 * just logs without a scene label rather than guessing. Ignores transition
 * overlap between segments (a few frames of slop at each boundary) since
 * this is a diagnostic label, not a frame-accurate cue. */
function makeSceneLookup(inputProps: unknown, fps: number): (frame: number) => string | undefined {
  const segments = (inputProps as { segments?: unknown })?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return () => undefined;

  const boundaries: { endFrame: number; label: string }[] = [];
  let cursor = 0;
  segments.forEach((segment: unknown, index: number) => {
    const duration = typeof (segment as { durationSeconds?: unknown })?.durationSeconds === "number" ? (segment as { durationSeconds: number }).durationSeconds : 0;
    const text = typeof (segment as { text?: unknown })?.text === "string" ? (segment as { text: string }).text : undefined;
    cursor += Math.max(0, duration) * fps;
    const label = text ? `${index + 1}:${text.slice(0, 24).trim()}` : `scene ${index + 1}`;
    boundaries.push({ endFrame: cursor, label });
  });

  return (frame: number) => boundaries.find((b) => frame < b.endFrame)?.label ?? boundaries[boundaries.length - 1]?.label;
}

function logTelemetry(frame: number, totalFrames: number, sceneLabel: string | undefined, concurrency: number, startedAt: number): void {
  const mem = process.memoryUsage();
  const rssGb = (mem.rss / GB).toFixed(2);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `FRAME ${frame} / ${totalFrames}` +
      (sceneLabel ? `\n  SCENE: ${sceneLabel}` : "") +
      `\n  RSS: ${rssGb} GB\n  HEAP: ${heapMb} MB\n  CONCURRENCY: ${concurrency}\n  ELAPSED: ${elapsedS}s`,
  );
}

export interface RenderVideoOptions {
  onProgress?: (progress: RenderProgress) => void;
  /** Overrides the RAM-tiered default — see resolveConcurrency(). */
  concurrency?: number;
  /** Lets a caller (server.ts) actually stop an in-progress render instead
   * of merely marking it cancelled after the fact — created via
   * `makeCancelSignal()` and passed straight through to `renderMedia`,
   * which polls it between frames/chunks. */
  cancelSignal?: CancelSignal;
  /** Preview-mode rendering (Part 14): a fraction (0-1] of full resolution.
   * Passed straight to `renderMedia`'s own `scale` — 0.5 renders at half
   * width/height, which is the single biggest lever on both render time and
   * per-frame memory for the same reason a smaller browser window is
   * cheaper to paint. Omit for a full-quality render (the default,
   * unchanged behavior). */
  scale?: number;
}

/** Generic composition renderer with a live terminal progress bar (default)
 * or a caller-supplied progress callback — the UI server passes its own to
 * forward progress to the browser over SSE instead of stdout. */
export async function renderVideo<T extends Record<string, unknown>>(
  compositionId: string,
  inputProps: T,
  outputPath: string,
  options: RenderVideoOptions = {},
): Promise<void> {
  const { onProgress, concurrency: concurrencyOverride, cancelSignal, scale } = options;
  const reportProgress =
    onProgress ??
    (({ percent, stage, renderedFrames, encodedFrames, totalFrames }: RenderProgress) => {
      const barLength = 30;
      const filled = Math.round((percent / 100) * barLength);
      const bar = "#".repeat(filled) + "-".repeat(barLength - filled);
      process.stdout.write(
        `\r[${bar}] ${percent}% — ${stage} (rendered ${renderedFrames}/${totalFrames}, encoded ${encodedFrames}/${totalFrames})   `,
      );
      if (percent >= 100) process.stdout.write("\n");
    });

  reportProgress({ percent: 0, stage: "bundling", renderedFrames: 0, encodedFrames: 0, totalFrames: 0 });
  const bundleLocation = await getBundleLocation();

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  const resolvedConcurrency = resolveConcurrency(concurrencyOverride);
  console.log(`Rendering with concurrency=${resolvedConcurrency} (free RAM: ${(os.freemem() / GB).toFixed(2)}GB)${scale ? ` scale=${scale}` : ""}`);

  const sceneAt = makeSceneLookup(inputProps, composition.fps);
  const startedAt = Date.now();
  let lastLoggedFrame = -LOG_EVERY_N_FRAMES;

  try {
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      concurrency: resolvedConcurrency,
      chromiumOptions: { gl: "swangle" },
      cancelSignal,
      scale,
      onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
        reportProgress({
          percent: Math.round(progress * 100),
          stage: stitchStage === "muxing" ? "encoding" : "rendering",
          renderedFrames,
          encodedFrames,
          totalFrames: composition.durationInFrames,
        });
        if (renderedFrames - lastLoggedFrame >= LOG_EVERY_N_FRAMES) {
          lastLoggedFrame = renderedFrames;
          logTelemetry(renderedFrames, composition.durationInFrames, sceneAt(renderedFrames), resolvedConcurrency, startedAt);
        }
      },
    });
  } catch (err) {
    if (isUserCancelledRender(err)) {
      console.log(`Render cancelled at frame ${lastLoggedFrame < 0 ? 0 : lastLoggedFrame}/${composition.durationInFrames}.`);
    }
    throw err;
  }
}
