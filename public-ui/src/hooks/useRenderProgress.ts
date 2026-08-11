import { useRef, useState } from "react";

// segmentCount/usedSceneFormat/totalSeconds are optional (not part of a
// scene-preview job's "complete" payload — see previewScene/
// startScenePreviewJob in server.ts) while sceneLabel/totalScenes are the
// scene-preview-only counterpart, so this one shared shape covers both a
// full-video job and a single-scene preview job without a second copy of
// this hook's EventSource wiring.
export interface CompleteEvent {
  segmentCount?: number;
  usedSceneFormat?: boolean;
  totalSeconds?: number;
  videoUrl: string;
  outputName: string;
  sceneLabel?: string;
  totalScenes?: number;
}

interface ProgressEvent {
  percent: number;
  stage: string;
}

/** Shared SSE-driven render-progress state — GeneratePage uses two instances
 * of this hook, one for the initial generate and one for the post-generation
 * "Save & Render" re-render, so each has its own progress bar without either
 * needing a second copy of the `/progress/:jobId` EventSource wiring. */
export function useRenderProgress() {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [result, setResult] = useState<CompleteEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  function watch(jobId: string) {
    sourceRef.current?.close();
    setGenerating(true);
    setResult(null);
    setStatusIsError(false);
    setStatus("Starting...");
    setProgressPercent(null);

    const source = new EventSource(`/progress/${jobId}`);
    sourceRef.current = source;

    source.addEventListener("log", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStatus(data.message);
    });

    source.addEventListener("progress", (e: MessageEvent) => {
      const data: ProgressEvent = JSON.parse(e.data);
      setProgressPercent(data.percent);
      setStatus(`${data.stage[0].toUpperCase()}${data.stage.slice(1)}... ${data.percent}%`);
    });

    source.addEventListener("complete", (e: MessageEvent) => {
      const data: CompleteEvent = JSON.parse(e.data);
      setProgressPercent(100);
      setStatus(
        data.sceneLabel
          ? `Done — ${data.sceneLabel} of ${data.totalScenes} rendered.`
          : `Done — ${data.segmentCount} segments (${data.usedSceneFormat ? "scene-spec" : "prose+tags"} format), ` +
              `${((data.totalSeconds ?? 0) / 60).toFixed(1)} minutes.`,
      );
      setResult(data);
      setGenerating(false);
      source.close();
    });

    source.addEventListener("failed", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStatusIsError(true);
      setStatus(data.error);
      setGenerating(false);
      source.close();
    });

    source.onerror = () => {
      setStatusIsError(true);
      setStatus("Lost connection to the server.");
      setGenerating(false);
      source.close();
    };
  }

  function fail(message: string) {
    setStatusIsError(true);
    setStatus(message);
    setGenerating(false);
  }

  return { generating, status, statusIsError, progressPercent, result, watch, fail };
}
