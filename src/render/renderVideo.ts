import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const ENTRY_POINT = path.join(__dirname, "..", "video", "index.ts");

export interface RenderProgress {
  percent: number;
  stage: "bundling" | "rendering" | "encoding";
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
}

// Remotion's own default concurrency is one headless-Chrome render worker per
// CPU core. This project's pitch-diagram/formation/heat-map scenes render real
// gradients, blur filters and SVG animation per frame, so each worker can hold
// 200-350MB at a single point in time — but that's a snapshot, not the whole
// story. Observed in practice: a render that started around ~17 frames/min
// (sized "safely" against free RAM at the moment it kicked off) degraded to
// ~4 frames/min over two hours as free RAM kept dropping further than that
// initial snapshot accounted for, until Windows started paging — CPU stayed
// at ~20% the whole time, confirming it was RAM-bound, not compute-bound.
// Two changes from the original version of this function, both aimed at that
// same failure mode: the per-worker budget is roughly doubled (700MB, not
// 350MB) to price in growth over a long render instead of just its starting
// footprint, and a flat 1GB reserve is subtracted before any worker math
// happens at all, so the rest of the machine (and the OS) always keeps some
// headroom regardless of how much RAM happens to be free right now. Together
// these make a low-free-RAM machine (a live example: 1034MB free) correctly
// resolve to a single worker instead of the 2 the old math allowed, while a
// genuinely high-RAM machine can still scale up.
const ESTIMATED_MB_PER_RENDER_WORKER = 700;
const SAFETY_RESERVE_MB = 1024;
const MIN_CONCURRENCY = 1;

function safeConcurrency(): number {
  const freeMb = os.freemem() / 1024 / 1024;
  const cpuCount = os.cpus().length;
  const usableMb = Math.max(0, freeMb - SAFETY_RESERVE_MB);
  const byMemory = Math.floor(usableMb / ESTIMATED_MB_PER_RENDER_WORKER);
  return Math.max(MIN_CONCURRENCY, Math.min(cpuCount, byMemory));
}

/** Generic composition renderer with a live terminal progress bar (default)
 * or a caller-supplied progress callback — the UI server passes its own to
 * forward progress to the browser over SSE instead of stdout. */
export async function renderVideo<T extends Record<string, unknown>>(
  compositionId: string,
  inputProps: T,
  outputPath: string,
  onProgress?: (progress: RenderProgress) => void,
  concurrency?: number,
): Promise<void> {
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
  const bundleLocation = await bundle({ entryPoint: ENTRY_POINT });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  const resolvedConcurrency = concurrency ?? safeConcurrency();
  console.log(`Rendering with concurrency=${resolvedConcurrency} (free RAM: ${Math.round(os.freemem() / 1024 / 1024)}MB)`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    concurrency: resolvedConcurrency,
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
      reportProgress({
        percent: Math.round(progress * 100),
        stage: stitchStage === "muxing" ? "encoding" : "rendering",
        renderedFrames,
        encodedFrames,
        totalFrames: composition.durationInFrames,
      });
    },
  });
}
