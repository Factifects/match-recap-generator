import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { EDGE_VOICES } from "../../../src/audio/ttsVoices";

/** Encodes provider + voice as one string so a single <select> drives both —
 * "elevenlabs" or "edge:<voiceId>". Split on submit. */
const VOICE_OPTIONS = [
  { value: "elevenlabs", label: "ElevenLabs (default, costs real money)" },
  ...EDGE_VOICES.map((v) => ({ value: `edge:${v.id}`, label: `${v.label} — Edge TTS (free)` })),
];

interface ProgressEvent {
  percent: number;
  stage: string;
}

interface CompleteEvent {
  segmentCount: number;
  usedSceneFormat: boolean;
  totalSeconds: number;
  videoUrl: string;
}

export const GeneratePage: React.FC = () => {
  const [script, setScript] = useState("");
  const [withAudio, setWithAudio] = useState(false);
  const [voiceSelection, setVoiceSelection] = useState("elevenlabs");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // Captured at completion time, not read live from `aspectRatio` — the
  // selector is free to move on to a different value while a finished
  // preview is still on screen, and the preview should keep describing the
  // video that's actually playing.
  const [videoAspectRatio, setVideoAspectRatio] = useState<"16:9" | "9:16">("16:9");

  async function handleGenerate() {
    if (!script.trim()) {
      setStatusIsError(true);
      setStatus("Paste a script first.");
      return;
    }

    setGenerating(true);
    setVideoUrl(null);
    setStatusIsError(false);
    setStatus("Starting...");
    setProgressPercent(null);

    try {
      const [ttsProvider, edgeVoice] = voiceSelection.startsWith("edge:")
        ? ["edge", voiceSelection.slice(5)]
        : ["elevenlabs", undefined];

      const startRes = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, withAudio, aspectRatio, ttsProvider, edgeVoice }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Generation failed to start.");

      const source = new EventSource(`/progress/${startData.jobId}`);

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
          `Done — ${data.segmentCount} segments (${data.usedSceneFormat ? "scene-spec" : "prose+tags"} format), ` +
            `${(data.totalSeconds / 60).toFixed(1)} minutes.`,
        );
        setVideoUrl(data.videoUrl);
        setVideoAspectRatio(aspectRatio);
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
    } catch (err) {
      setStatusIsError(true);
      setStatus(err instanceof Error ? err.message : String(err));
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card span={8} eyebrow="Script">
        <p className="text-text-dim text-sm mb-3">
          Paste an analysis script — either the prose+tags format or the Scene Specification (
          <code className="bg-white/5 px-1.5 py-0.5 rounded text-[0.92em]">### SCENE N</code>) format,
          auto-detected.
        </p>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste your script here..."
          className="w-full flex-1 min-h-[360px] bg-bg text-text border border-border rounded-lg p-3 font-mono text-[13px] resize-y"
        />
      </Card>

      <Card span={4} eyebrow="Options">
        <label className="flex items-center gap-2.5 text-[13px] text-text-dim leading-tight">
          <input
            type="checkbox"
            checked={withAudio}
            onChange={(e) => setWithAudio(e.target.checked)}
            className="w-[15px] h-[15px] accent-accent shrink-0"
          />
          Generate real narration audio (otherwise timing is a word-count estimate)
        </label>

        <label className={`flex items-center gap-2.5 text-[13px] mt-4 ${withAudio ? "text-text-dim" : "text-text-dim/40"}`}>
          Voice:
          <select
            value={voiceSelection}
            onChange={(e) => setVoiceSelection(e.target.value)}
            disabled={!withAudio}
            className="bg-bg text-text border border-border rounded-md px-2 py-1 text-[13px] flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {VOICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            </select>
          </label>

        <label className="flex items-center gap-2.5 text-[13px] text-text-dim mt-4">
          Aspect ratio:
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as "16:9" | "9:16")}
            className="bg-bg text-text border border-border rounded-md px-2 py-1 text-[13px]"
          >
            <option value="16:9">16:9 (Standard)</option>
            <option value="9:16">9:16 (Shorts/Reels)</option>
          </select>
        </label>

        <Button variant="primary" onClick={handleGenerate} disabled={generating}>
          Generate Video
        </Button>

        {progressPercent !== null && (
          <div className="mt-3.5 w-full h-2 bg-bg border border-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-200 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {status && (
          <div className={`mt-3.5 text-[13px] leading-relaxed ${statusIsError ? "text-danger" : "text-text-dim"}`}>
            {status}
          </div>
        )}
      </Card>

      {videoUrl && (
        // Portrait renders get a narrower card that hugs the video instead
        // of a full-width row with empty space on both sides of a tall,
        // skinny player.
        <Card span={videoAspectRatio === "9:16" ? 4 : 12} eyebrow="Preview">
          <video
            src={videoUrl}
            controls
            className={`max-w-full h-auto mx-auto rounded-xl border border-border ${
              videoAspectRatio === "9:16" ? "max-h-[75vh]" : "max-h-[80vh]"
            }`}
          />
        </Card>
      )}
    </div>
  );
};
