import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Timeline, MIN_CLIP_DURATION_SECONDS } from "../components/Timeline";
import { AudioUploadButton } from "../components/AudioUploadButton";
import { EDGE_VOICES } from "../../../src/audio/ttsVoices";
import { useRenderProgress } from "../hooks/useRenderProgress";
import { uploadAudio } from "../lib/uploadAudio";
import type { TimedSegment, AspectRatio, AudioClipPlacement } from "../../../src/model/Segment";

/** Encodes provider + voice as one string so a single <select> drives both —
 * "elevenlabs" or "edge:<voiceId>". Split on submit. */
const VOICE_OPTIONS = [
  { value: "elevenlabs", label: "ElevenLabs (default, costs real money)" },
  ...EDGE_VOICES.map((v) => ({ value: `edge:${v.id}`, label: `${v.label} — Edge TTS (free)` })),
];

interface TimelineData {
  segments: TimedSegment[];
  aspectRatio: AspectRatio;
  backgroundMusicPath?: string;
  audioClips?: AudioClipPlacement[];
  videoUrl: string;
}

/** The pre-generation timeline preview — a parse-only view of the pasted
 * script (word-count-estimated durations, no narration/render involved) so
 * scene order/duration AND background music/sfx can all be edited before
 * Generate is ever clicked, same as the post-generation editor — see
 * POST /parse in server.ts. */
interface PreTimelineData {
  segments: TimedSegment[];
  usedSceneFormat: boolean;
  audioClips: AudioClipPlacement[];
}

function newClipId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

/** A segment's real floor once real narration resolves is
 * `Math.max(durationSeconds, visualMinDurationSeconds)` (see
 * resolveSegmentAudio) — a multi-phase Canvas/TacticalBoard scene can't
 * finish faster than its phase count requires, regardless of how short its
 * authored `Duration:` guess or word-count estimate was. Ignoring
 * `visualMinDurationSeconds` here (as this used to) undercounts the video's
 * true minimum length in the *pre*-generation preview, so a background-
 * music/sfx clip placed against that shorter estimate falls short once the
 * real render enforces the floor — the exact "video ends up a bit longer
 * than the music" drift this now prevents. */
function effectiveDurationOf(segment: TimedSegment): number {
  return Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0);
}

function videoDurationOf(segments: TimedSegment[]): number {
  return segments.reduce((sum, s) => sum + effectiveDurationOf(s), 0);
}

/** Appends `newClip` right after whatever's already last in its lane (music
 * and sfx are tracked as separate lanes) — existing clips are never touched.
 * If `newClip`'s own preferred duration would run past the video's end, it
 * clips *itself* down to fit the remaining room instead, floored at
 * MIN_CLIP_DURATION_SECONDS (which can, in the degenerate case of an already
 * full lane, mean it lands overlapping the very end rather than disappear
 * entirely). Existing clips keeping their exact length is the whole point —
 * a newly added/duplicated clip should never eat into its predecessor's
 * duration. */
function appendToLane(
  existingClipsInLane: AudioClipPlacement[],
  videoDurationSeconds: number,
  newClip: AudioClipPlacement,
): AudioClipPlacement[] {
  const sorted = [...existingClipsInLane].sort((a, b) => a.startSeconds - b.startSeconds);
  const cursor = sorted.reduce((end, c) => Math.max(end, c.startSeconds + c.durationSeconds), 0);
  const remaining = videoDurationSeconds - cursor;
  const start = remaining > 0 ? cursor : Math.max(0, videoDurationSeconds - MIN_CLIP_DURATION_SECONDS);
  const duration = remaining > 0 ? Math.min(newClip.durationSeconds, remaining) : MIN_CLIP_DURATION_SECONDS;
  return [...sorted, { ...newClip, startSeconds: start, durationSeconds: Math.max(MIN_CLIP_DURATION_SECONDS, duration) }];
}

/** `appendToLane` only ever looks at the clips it's given — this narrows
 * that set to just `newClip`'s own lane row before calling it, so a new
 * upload or duplicate only makes room against clips actually sharing its
 * row, not every clip in the whole lane-group regardless of which row
 * they're on (which would needlessly push a new clip later just because
 * some *other* row's last clip happens to end later). */
function appendToLaneRow(
  existingOfKind: AudioClipPlacement[],
  videoDurationSeconds: number,
  newClip: AudioClipPlacement,
): AudioClipPlacement[] {
  const targetLane = newClip.lane ?? 0;
  const sameRow = existingOfKind.filter((c) => (c.lane ?? 0) === targetLane);
  const otherRows = existingOfKind.filter((c) => (c.lane ?? 0) !== targetLane);
  return [...otherRows, ...appendToLane(sameRow, videoDurationSeconds, newClip)];
}

export const GeneratePage: React.FC = () => {
  // One continuous page, not a tab switch: script/config at the top, the
  // timeline preview/editor directly below it, always visible — not gated
  // behind a click. A tab split here meant the timeline preview you were
  // configuring (and, after Generate, the render itself) stayed invisible
  // until you remembered to switch tabs; every reference UX pattern for this
  // kind of "build here, see it update over there" tool (Descript's editor,
  // the standard SaaS build/live-preview split) keeps both visible together.
  const [script, setScript] = useState("");
  const [withAudio, setWithAudio] = useState(false);
  const [voiceSelection, setVoiceSelection] = useState("elevenlabs");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const progress = useRenderProgress();

  // Populated once generation finishes — the resolved segments/audio for the
  // just-generated video, editable right here on the same page instead of
  // navigating elsewhere. `editProgress` tracks the separate "Save & Render"
  // re-render pass so it doesn't clobber the original generate progress bar.
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineError, setTimelineError] = useState("");
  const [timelineOutputName, setTimelineOutputName] = useState<string | null>(null);
  const editProgress = useRenderProgress();

  useEffect(() => {
    if (!progress.result) return;
    setTimelineOutputName(progress.result.outputName);
    setTimelineError("");
    fetch(`/timeline/${progress.result.outputName}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load this video's timeline.");
        setTimeline(body);
      })
      .catch((err) => setTimelineError(err instanceof Error ? err.message : String(err)));
  }, [progress.result]);

  // Pre-generation timeline preview: parses the pasted script the moment
  // typing pauses (debounced, not on every keystroke) — no narration/render
  // involved, so it's instant and free. Replaced wholesale on every re-parse,
  // so editing the script after customizing durations here resets those
  // edits, same as the post-generation editor resetting per video.
  const [preTimeline, setPreTimeline] = useState<PreTimelineData | null>(null);
  const [preTimelineError, setPreTimelineError] = useState("");

  useEffect(() => {
    if (!script.trim()) {
      setPreTimeline(null);
      setPreTimelineError("");
      return;
    }
    const timer = setTimeout(() => {
      fetch("/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || "Could not parse this script.");
          // Segments/format come fresh from the new parse, but audio clips
          // the user already placed survive a re-parse — losing them on
          // every keystroke-pause while still drafting the script would be
          // a bad trade for a feature meant to save a second render.
          setPreTimeline((p) => ({ segments: body.segments, usedSceneFormat: body.usedSceneFormat, audioClips: p?.audioClips ?? [] }));
          setPreTimelineError("");
        })
        .catch((err) => setPreTimelineError(err instanceof Error ? err.message : String(err)));
    }, 600);
    return () => clearTimeout(timer);
  }, [script]);

  async function handleGenerate() {
    if (!script.trim()) {
      progress.fail("Paste a script first.");
      return;
    }

    setTimeline(null);
    setTimelineOutputName(null);
    setTimelineError("");

    try {
      const [ttsProvider, edgeVoice] = voiceSelection.startsWith("edge:")
        ? ["edge", voiceSelection.slice(5)]
        : ["elevenlabs", undefined];

      const startRes = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          withAudio,
          aspectRatio,
          ttsProvider,
          edgeVoice,
          // Carries any pre-generation reorder/trim/audio edits straight
          // into the render — the server uses `segments` instead of
          // re-parsing `script` from scratch when present.
          segments: preTimeline?.segments,
          audioClips: preTimeline?.audioClips.length ? preTimeline.audioClips : undefined,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Generation failed to start.");

      progress.watch(startData.jobId);
    } catch (err) {
      progress.fail(err instanceof Error ? err.message : String(err));
    }
  }

  function updateSegment(index: number, patch: Partial<TimedSegment>) {
    setTimeline((t) => (t ? { ...t, segments: t.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : t));
  }

  function updateAllNarrationVolume(volume: number) {
    setTimeline((t) => (t ? { ...t, segments: t.segments.map((s) => ({ ...s, narrationVolume: volume })) } : t));
  }

  function reorderSegments(nextSegments: TimedSegment[]) {
    setTimeline((t) => (t ? { ...t, segments: nextSegments } : t));
  }

  async function handleAddAudioClip(file: File, kind: "music" | "sfx") {
    if (!timeline) return;
    setTimelineError("");
    try {
      const uploaded = await uploadAudio(file);
      // `?? 3` would let a real 0 (a file whose duration genuinely parsed to
      // zero) through unchanged, producing a clip so thin it's effectively
      // invisible — treat any non-positive duration as "unknown" instead.
      const sourceDuration = uploaded.durationSeconds && uploaded.durationSeconds > 0 ? uploaded.durationSeconds : undefined;
      const videoDurationSeconds = videoDurationOf(timeline.segments);
      const existingOfKind = (timeline.audioClips ?? []).filter((c) => (c.kind ?? "sfx") === kind);
      const otherKind = (timeline.audioClips ?? []).filter((c) => (c.kind ?? "sfx") !== kind);
      // A freshly added clip keeps its own real length (or, if that's
      // unknown, defaults to trying to fill the video) — whatever's already
      // in its lane shrinks to make room instead, via appendToLane.
      const preferredDuration = Math.max(MIN_CLIP_DURATION_SECONDS, Math.min(sourceDuration ?? videoDurationSeconds, videoDurationSeconds));
      const newClip: AudioClipPlacement = {
        id: newClipId(),
        staticPath: uploaded.staticPath,
        startSeconds: 0,
        durationSeconds: preferredDuration,
        trimStartSeconds: 0,
        volume: 1,
        sourceDurationSeconds: sourceDuration,
        kind,
        lane: 0,
      };
      const relaidLane = appendToLaneRow(existingOfKind, videoDurationSeconds, newClip);
      setTimeline((t) => (t ? { ...t, audioClips: [...otherKind, ...relaidLane] } : t));
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : String(err));
    }
  }

  function updateAudioClip(id: string, patch: Partial<AudioClipPlacement>) {
    setTimeline((t) =>
      t ? { ...t, audioClips: (t.audioClips ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) } : t,
    );
  }

  function removeAudioClip(id: string) {
    setTimeline((t) => (t ? { ...t, audioClips: (t.audioClips ?? []).filter((c) => c.id !== id) } : t));
  }

  /** "Copy/paste" — duplicates a placement's file/trim/length as a new
   * instance appended after everything else already sharing its lane row,
   * keeping its own full duration and staying on that same row (drag it to
   * another lane afterward if the point was to layer it under something
   * else). */
  function duplicateAudioClip(source: AudioClipPlacement) {
    if (!timeline) return;
    const videoDurationSeconds = videoDurationOf(timeline.segments);
    const kind = source.kind ?? "sfx";
    const existingOfKind = (timeline.audioClips ?? []).filter((c) => (c.kind ?? "sfx") === kind);
    const otherKind = (timeline.audioClips ?? []).filter((c) => (c.kind ?? "sfx") !== kind);
    const newClip: AudioClipPlacement = { ...source, id: newClipId(), startSeconds: 0 };
    const relaidLane = appendToLaneRow(existingOfKind, videoDurationSeconds, newClip);
    setTimeline((t) => (t ? { ...t, audioClips: [...otherKind, ...relaidLane] } : t));
  }

  function updatePreSegment(index: number, patch: Partial<TimedSegment>) {
    setPreTimeline((p) => (p ? { ...p, segments: p.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : p));
  }

  function updateAllPreNarrationVolume(volume: number) {
    setPreTimeline((p) => (p ? { ...p, segments: p.segments.map((s) => ({ ...s, narrationVolume: volume })) } : p));
  }

  function reorderPreSegments(nextSegments: TimedSegment[]) {
    setPreTimeline((p) => (p ? { ...p, segments: nextSegments } : p));
  }

  async function handleAddPreAudioClip(file: File, kind: "music" | "sfx") {
    if (!preTimeline) return;
    setPreTimelineError("");
    try {
      const uploaded = await uploadAudio(file);
      const sourceDuration = uploaded.durationSeconds && uploaded.durationSeconds > 0 ? uploaded.durationSeconds : undefined;
      const videoDurationSeconds = videoDurationOf(preTimeline.segments);
      const existingOfKind = preTimeline.audioClips.filter((c) => (c.kind ?? "sfx") === kind);
      const otherKind = preTimeline.audioClips.filter((c) => (c.kind ?? "sfx") !== kind);
      const preferredDuration = Math.max(MIN_CLIP_DURATION_SECONDS, Math.min(sourceDuration ?? videoDurationSeconds, videoDurationSeconds));
      const newClip: AudioClipPlacement = {
        id: newClipId(),
        staticPath: uploaded.staticPath,
        startSeconds: 0,
        durationSeconds: preferredDuration,
        trimStartSeconds: 0,
        volume: 1,
        sourceDurationSeconds: sourceDuration,
        kind,
        lane: 0,
      };
      const relaidLane = appendToLaneRow(existingOfKind, videoDurationSeconds, newClip);
      setPreTimeline((p) => (p ? { ...p, audioClips: [...otherKind, ...relaidLane] } : p));
    } catch (err) {
      setPreTimelineError(err instanceof Error ? err.message : String(err));
    }
  }

  function updatePreAudioClip(id: string, patch: Partial<AudioClipPlacement>) {
    setPreTimeline((p) => (p ? { ...p, audioClips: p.audioClips.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : p));
  }

  function removePreAudioClip(id: string) {
    setPreTimeline((p) => (p ? { ...p, audioClips: p.audioClips.filter((c) => c.id !== id) } : p));
  }

  function duplicatePreAudioClip(source: AudioClipPlacement) {
    if (!preTimeline) return;
    const videoDurationSeconds = videoDurationOf(preTimeline.segments);
    const kind = source.kind ?? "sfx";
    const existingOfKind = preTimeline.audioClips.filter((c) => (c.kind ?? "sfx") === kind);
    const otherKind = preTimeline.audioClips.filter((c) => (c.kind ?? "sfx") !== kind);
    const newClip: AudioClipPlacement = { ...source, id: newClipId(), startSeconds: 0 };
    const relaidLane = appendToLaneRow(existingOfKind, videoDurationSeconds, newClip);
    setPreTimeline((p) => (p ? { ...p, audioClips: [...otherKind, ...relaidLane] } : p));
  }

  async function handleSaveAndRender() {
    if (!timeline || !timelineOutputName) return;
    try {
      const startRes = await fetch(`/timeline/${timelineOutputName}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: timeline.segments,
          aspectRatio: timeline.aspectRatio,
          backgroundMusicPath: timeline.backgroundMusicPath,
          audioClips: timeline.audioClips,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Render failed to start.");
      editProgress.watch(startData.jobId);
    } catch (err) {
      editProgress.fail(err instanceof Error ? err.message : String(err));
    }
  }

  const previewUrl = editProgress.result?.videoUrl ?? progress.result?.videoUrl;

  return (
    <div className="flex flex-col gap-4">
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
          className="w-full flex-1 min-h-[360px] bg-bg text-text border border-border rounded-xl p-3.5 font-mono text-[13px] resize-y"
        />
      </Card>

      <div className="col-span-12 md:col-span-4 flex flex-col gap-4">
        <Card tone="mint" eyebrow="Narration">
          <label className="flex items-center gap-2.5 text-[13px] leading-tight">
            <input
              type="checkbox"
              checked={withAudio}
              onChange={(e) => setWithAudio(e.target.checked)}
              className="w-[15px] h-[15px] accent-accent-ink shrink-0"
            />
            Generate real narration audio (otherwise timing is a word-count estimate)
          </label>

          <label className={`flex flex-col gap-1.5 text-[13px] mt-4 ${withAudio ? "" : "opacity-40"}`}>
            Voice:
            <select
              value={voiceSelection}
              onChange={(e) => setVoiceSelection(e.target.value)}
              disabled={!withAudio}
              className="w-full bg-panel text-text border-2 border-border rounded-full px-3.5 py-1.5 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card tone="alt" eyebrow="Aspect Ratio">
          <div className="flex gap-1 bg-panel border-2 border-border rounded-full p-1">
            {(["16:9", "9:16"] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`flex-1 text-[13px] font-bold py-1.5 rounded-full transition-colors cursor-pointer ${
                  aspectRatio === ratio ? "bg-accent-ink text-white" : "text-text-dim hover:text-text"
                }`}
              >
                {ratio === "16:9" ? "16:9 Standard" : "9:16 Shorts"}
              </button>
            ))}
          </div>
        </Card>

        <Card tone="accent" className="items-start">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={progress.generating}
            className="!bg-accent-ink !text-accent"
          >
            Generate Video
          </Button>

          {progress.progressPercent !== null && (
            <div className="mt-3.5 w-full h-2 bg-accent-ink/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-ink transition-[width] duration-200 ease-out"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          )}

          {progress.status && (
            <div
              className={`mt-3.5 text-[13px] leading-relaxed ${progress.statusIsError ? "text-danger" : "text-accent-ink/80"}`}
            >
              {progress.status}
            </div>
          )}
        </Card>
      </div>
    </div>

    <div className="grid grid-cols-12 gap-4">
      {previewUrl && (
        // Portrait renders get a narrower card that hugs the video instead
        // of a full-width row with empty space on both sides of a tall,
        // skinny player.
        <Card span={timeline?.aspectRatio === "9:16" ? 4 : 12} eyebrow="Preview">
          <video
            src={previewUrl}
            controls
            className={`max-w-full h-auto mx-auto rounded-xl border border-border ${
              timeline?.aspectRatio === "9:16" ? "max-h-[75vh]" : "max-h-[80vh]"
            }`}
          />
        </Card>
      )}

      {timelineError && (
        <Card span={12}>
          <div className="text-danger text-sm">{timelineError}</div>
        </Card>
      )}

      {!timeline && !preTimeline && (
        <Card span={12}>
          <div className="text-text-dim text-sm">
            {preTimelineError || "Paste a script above to see its timeline preview here."}
          </div>
        </Card>
      )}

      {!timeline && preTimeline && (
        <Card span={12} eyebrow="Timeline preview — before generating">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <AudioUploadButton
              label="Add background music"
              icon="🎵"
              onFile={(file) => handleAddPreAudioClip(file, "music")}
            />
            <AudioUploadButton
              label="Add a sound effect"
              icon="🔊"
              onFile={(file) => handleAddPreAudioClip(file, "sfx")}
            />
          </div>
          <Timeline
            segments={preTimeline.segments}
            onReorderSegments={reorderPreSegments}
            onResizeSegment={(index, durationSeconds) => updatePreSegment(index, { durationSeconds, manualDurationOverride: true })}
            onVolumeChange={updateAllPreNarrationVolume}
            audioClips={preTimeline.audioClips}
            onUpdateClip={updatePreAudioClip}
            onDuplicateClip={duplicatePreAudioClip}
            onRemoveClip={removePreAudioClip}
          />
          {preTimelineError && <div className="text-danger text-sm mt-3">{preTimelineError}</div>}
          <p className="text-[11px] text-text-dim mt-3">
            Estimated from word count — durations you drag here are kept exactly as set once you
            generate. Anything you don't touch still gets its real length from narration audio (if
            you're generating that) once it's ready — audio you place here plays at the position
            you set regardless.
          </p>
        </Card>
      )}

      {timeline && (
        <>
          <Card span={12} eyebrow="Timeline">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <AudioUploadButton label="Add background music" icon="🎵" onFile={(file) => handleAddAudioClip(file, "music")} />
              <AudioUploadButton label="Add a sound effect" icon="🔊" onFile={(file) => handleAddAudioClip(file, "sfx")} />
            </div>
            <Timeline
              segments={timeline.segments}
              onReorderSegments={reorderSegments}
              onResizeSegment={(index, durationSeconds) => updateSegment(index, { durationSeconds })}
              onVolumeChange={updateAllNarrationVolume}
              audioClips={timeline.audioClips ?? []}
              onUpdateClip={updateAudioClip}
              onDuplicateClip={duplicateAudioClip}
              onRemoveClip={removeAudioClip}
            />
            <p className="text-[11px] text-text-dim mt-3">
              Shortening a scene below its narration's real length still cuts that narration off early
              — narration audio itself isn't re-timed, only the visual's on-screen duration changes —
              but the cut now fades out over the last few frames instead of stopping mid-word. A clip
              defaults to filling the rest of the video (so it acts like background music out of the
              box) — drag its edges to shorten it into a short sound effect instead.
            </p>
          </Card>

          <Card span={12} tone="accent" className="items-start">
            <Button
              variant="primary"
              onClick={handleSaveAndRender}
              disabled={editProgress.generating}
              className="!bg-accent-ink !text-accent"
            >
              Save & Render
            </Button>

            {editProgress.progressPercent !== null && (
              <div className="mt-3.5 w-full h-2 bg-accent-ink/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-ink transition-[width] duration-200 ease-out"
                  style={{ width: `${editProgress.progressPercent}%` }}
                />
              </div>
            )}

            {editProgress.status && (
              <div
                className={`mt-3.5 text-[13px] leading-relaxed ${editProgress.statusIsError ? "text-danger" : "text-accent-ink/80"}`}
              >
                {editProgress.status}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
    </div>
  );
};
