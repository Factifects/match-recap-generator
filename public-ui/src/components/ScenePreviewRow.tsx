import { useRenderProgress } from "../hooks/useRenderProgress";
import { Button } from "./Button";
import type { AspectRatio, TimedSegment } from "../../../src/model/Segment";

/** One scene's own render-in-isolation control — the "click Scene 03, see
 * just that scene in seconds instead of waiting on the whole video" loop
 * the scene-level preview machinery (generate.ts's previewScene, POST
 * /preview-scene) exists to make usable. Its own useRenderProgress()
 * instance (not a shared one) is what gives each row independent progress/
 * result state — calling the hook here, once per row COMPONENT instance,
 * rather than in a loop inside GeneratePage, is what makes that safe. */
export const ScenePreviewRow: React.FC<{
  script: string;
  sceneIndex: number; // 0-based — matches SceneDiagnostic.sceneIndex and previewScene's own convention
  label: string;
  withAudio: boolean;
  ttsProvider: string;
  edgeVoice?: string;
  aspectRatio: AspectRatio;
  /** Pre-generation timeline-preview edits, when the user reordered/trimmed
   * anything — without this, `sceneIndex` would resolve against a fresh
   * re-parse of `script` in its ORIGINAL order, previewing a different
   * scene than whichever one this row's label was actually drawn from. */
  segments?: TimedSegment[];
}> = ({ script, sceneIndex, label, withAudio, ttsProvider, edgeVoice, aspectRatio, segments }) => {
  const progress = useRenderProgress();

  async function handlePreview() {
    try {
      const res = await fetch("/preview-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, sceneIndex, withAudio, ttsProvider, edgeVoice, aspectRatio, segments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scene preview failed to start.");
      progress.watch(data.jobId);
    } catch (err) {
      progress.fail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border border-border rounded-lg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] truncate" title={label}>
          {label}
        </span>
        <Button
          variant="secondary"
          onClick={handlePreview}
          disabled={progress.generating}
          className="!mt-0 !text-[11px] !py-1 !px-2.5 shrink-0"
        >
          {progress.generating ? "Rendering…" : "Preview this scene"}
        </Button>
      </div>
      {progress.status && (
        <div className={`text-[11px] ${progress.statusIsError ? "text-danger" : "text-text-dim"}`}>{progress.status}</div>
      )}
      {progress.result?.videoUrl && (
        <video src={progress.result.videoUrl} controls className="w-full rounded-lg border border-border max-h-[220px]" />
      )}
    </div>
  );
};
