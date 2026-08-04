import "./index.css";
import { Composition } from "remotion";
import { AnalysisVideo, transitionFramesFor } from "./compositions/AnalysisVideo";
import { InfiniteRoadBenchmark, BENCHMARK_DURATION_FRAMES, BENCHMARK_WIDTH, BENCHMARK_HEIGHT } from "./compositions/InfiniteRoadBenchmark";
import { FPS } from "./theme";
import type { TimedSegment, AspectRatio, AudioClipPlacement } from "../model/Segment";

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** TransitionSeries overlaps each segment's outgoing transition with the next
 * — that overlap is shared, not additive, so it must be subtracted from the
 * naive sum or the composition's declared duration overshoots the actual
 * rendered content. A hard-cut segment overlaps by far fewer frames than a
 * dissolve, so this has to be computed per segment, not a flat rate. Each
 * segment's own padding (added in AnalysisVideo.tsx) is exactly its own
 * transitionFramesFor, so the same call is reused here to stay in sync. */
export function totalDurationInFrames(segments: TimedSegment[]): number {
  const rawSum = segments.reduce(
    (sum, segment) =>
      sum + Math.ceil(Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0) * FPS) + transitionFramesFor(segment),
    0,
  );
  const transitionOverlap = segments.slice(0, -1).reduce((sum, segment) => sum + transitionFramesFor(segment), 0);
  return rawSum - transitionOverlap;
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AnalysisVideo"
        component={AnalysisVideo}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={150}
        defaultProps={{
          segments: [] as TimedSegment[],
          aspectRatio: "16:9" as AspectRatio,
          backgroundMusicPath: undefined as string | undefined,
          audioClips: [] as AudioClipPlacement[],
        }}
        calculateMetadata={async ({ props }) => {
          const { segments, aspectRatio } = props as { segments: TimedSegment[]; aspectRatio?: AspectRatio };
          return {
            durationInFrames: Math.max(1, totalDurationInFrames(segments)),
            ...DIMENSIONS[aspectRatio ?? "16:9"],
          };
        }}
      />
      {/* Standalone proof scene — isolated from the segment/script pipeline
          above on purpose (see InfiniteRoadBenchmark.tsx's own header
          comment). Fixed props, nothing to pass in. */}
      <Composition
        id="InfiniteRoadBenchmark"
        component={InfiniteRoadBenchmark}
        fps={FPS}
        width={BENCHMARK_WIDTH}
        height={BENCHMARK_HEIGHT}
        durationInFrames={BENCHMARK_DURATION_FRAMES}
        defaultProps={{}}
      />
    </>
  );
};
