import { useRef, useState } from "react";
import type { SceneDiagnostic } from "../../../src/script/sceneDiagnostics";

export interface AuthorCompleteEvent {
  scriptText: string;
  title: string;
  sceneCount: number;
  diagnostics: SceneDiagnostic[];
  provider: string;
  model: string;
}

/** SSE state for a script-AUTHORING job.
 *
 * A sibling of useRenderProgress rather than a third case inside it. That
 * hook's CompleteEvent requires `videoUrl` and `outputName` because every job
 * it watches produces a video; an authoring job produces a script and no video
 * at all. Widening it would have made every field optional and left callers
 * guessing which shape they actually received — the two jobs stream the same
 * events but mean genuinely different things, so they get their own types.
 *
 * There is no `progress` listener here on purpose: authoring emits no percent
 * (there is no frame count to divide by), only log lines like "Scene 3/6" and
 * "repairing round 1", which are more informative than a fake bar would be. */
export function useAuthorJob() {
  const [authoring, setAuthoring] = useState(false);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [result, setResult] = useState<AuthorCompleteEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  function watch(jobId: string, onComplete: (data: AuthorCompleteEvent) => void) {
    sourceRef.current?.close();
    setAuthoring(true);
    setResult(null);
    setStatusIsError(false);
    setStatus("Starting...");

    const source = new EventSource(`/progress/${jobId}`);
    sourceRef.current = source;

    source.addEventListener("log", (e: MessageEvent) => {
      setStatus(JSON.parse(e.data).message);
    });

    source.addEventListener("complete", (e: MessageEvent) => {
      const data: AuthorCompleteEvent = JSON.parse(e.data);
      const hard = data.diagnostics.filter((d) => d.severity === "hard").length;
      setStatus(
        hard === 0
          ? `Done — "${data.title}", ${data.sceneCount} scenes, clean.`
          : `Done — "${data.title}", ${data.sceneCount} scenes, ${hard} unresolved hard finding${hard === 1 ? "" : "s"}.`,
      );
      setResult(data);
      setAuthoring(false);
      source.close();
      // Handed to the caller rather than exposed only as state, so the script
      // lands in the editor in the same tick it arrives — the whole point is
      // that authoring feeds the existing pipeline, not a separate screen.
      onComplete(data);
    });

    source.addEventListener("failed", (e: MessageEvent) => {
      setStatusIsError(true);
      setStatus(JSON.parse(e.data).error);
      setAuthoring(false);
      source.close();
    });

    source.onerror = () => {
      setStatusIsError(true);
      setStatus("Lost connection to the server.");
      setAuthoring(false);
      source.close();
    };
  }

  return { authoring, status, statusIsError, result, watch };
}
