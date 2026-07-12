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

/** Generic composition renderer with a live terminal progress bar (default)
 * or a caller-supplied progress callback — the UI server passes its own to
 * forward progress to the browser over SSE instead of stdout. */
export async function renderVideo<T extends Record<string, unknown>>(
  compositionId: string,
  inputProps: T,
  outputPath: string,
  onProgress?: (progress: RenderProgress) => void,
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

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
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
