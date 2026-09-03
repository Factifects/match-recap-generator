import "./index.css";
import { Composition } from "remotion";
import { AnalysisVideo, transitionFramesFor } from "./compositions/AnalysisVideo";
import { InfiniteRoadBenchmark, BENCHMARK_DURATION_FRAMES, BENCHMARK_WIDTH, BENCHMARK_HEIGHT } from "./compositions/InfiniteRoadBenchmark";
import { ShortVideo, shortTotalFrames, type ShortClip, type ShortVideoProps } from "./compositions/ShortVideo";
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
      {/* The footage-backed short: looping background, narration, punch
          captions. A separate composition from AnalysisVideo rather than a
          scene type inside it, because it is a different product — one
          continuous clip where the captions are the content, not a sequence of
          authored visuals. See ShortVideo.tsx. */}
      <Composition
        id="ShortVideo"
        component={ShortVideo as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={150}
        defaultProps={{
          clips: [] as ShortClip[],
          backgroundVideo: undefined as string | undefined,
          backgroundColor: "#0b0d10",
          backgroundRate: 1,
          backgroundDurationSeconds: 10,
          captionStyle: undefined,
        }}
        calculateMetadata={async ({ props }) => {
          const { clips, aspectRatio } = props as unknown as ShortVideoProps & { aspectRatio?: AspectRatio };
          return {
            durationInFrames: shortTotalFrames(clips ?? []),
            // Defaults to portrait: this format exists for vertical feeds, so
            // landscape has to be asked for rather than fallen into.
            ...DIMENSIONS[aspectRatio ?? "9:16"],
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
