import { useEffect, useRef, useState } from "react";
import type { TimedSegment, AudioClipPlacement } from "../../../src/model/Segment";

const PIXELS_PER_SECOND = 44;
/** Shared with GeneratePage.tsx so a newly added/duplicated clip and a
 * dragged one clamp to the exact same floor. */
export const MIN_CLIP_DURATION_SECONDS = 0.2;
const MIN_DURATION_SECONDS = MIN_CLIP_DURATION_SECONDS;
/** How close (in on-screen pixels) a drag has to land to a candidate point
 * — scene boundaries, the video's own end, another clip's start/end — to
 * snap to it exactly, with a visual guide line while it's snapped. */
const SNAP_PIXELS = 10;
const SNAP_SECONDS = SNAP_PIXELS / PIXELS_PER_SECOND;

function segmentLabel(segment: TimedSegment): string {
  const text = segment.text;
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function fileNameOf(staticPath: string): string {
  return staticPath.split("/").pop() ?? staticPath;
}

function segmentStartTimes(segments: TimedSegment[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const segment of segments) {
    starts.push(acc);
    acc += segment.durationSeconds;
  }
  return starts;
}

/** Snaps `raw` to whichever candidate point is within SNAP_SECONDS, if any —
 * returns the snapped value (for use) alongside the candidate itself (for
 * drawing the guide line), or `raw`/`null` when nothing's close enough. */
function snapTo(raw: number, candidates: number[]): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = SNAP_SECONDS;
  for (const c of candidates) {
    const dist = Math.abs(raw - c);
    if (dist <= bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best !== null ? { value: best, guide: best } : { value: raw, guide: null };
}

/** Tracks a mouse-drag session from a fixed start point (not incremental
 * per-frame deltas, to avoid drift) — attaches window-level listeners for
 * the duration of the drag and cleans them up on mouseup. No drag-and-drop
 * library needed for plain "click, drag, release" resizing/positioning. */
function useSecondsDrag() {
  const session = useRef<{ startX: number; onDelta: (deltaSeconds: number) => void } | null>(null);

  function handleMove(e: MouseEvent) {
    if (!session.current) return;
    const deltaPx = e.clientX - session.current.startX;
    session.current.onDelta(deltaPx / PIXELS_PER_SECOND);
  }
  function handleUp() {
    session.current = null;
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  }

  return function startDrag(e: React.MouseEvent, onDelta: (deltaSeconds: number) => void) {
    e.preventDefault();
    e.stopPropagation();
    session.current = { startX: e.clientX, onDelta };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };
}

function Ruler({ totalSeconds }: { totalSeconds: number }) {
  const seconds = Math.ceil(totalSeconds) + 1;
  const labelEvery = totalSeconds > 40 ? 5 : 1;
  return (
    <div className="relative h-5" style={{ width: seconds * PIXELS_PER_SECOND }}>
      {Array.from({ length: seconds }, (_, s) => (
        <div key={s} className="absolute top-0 h-full border-l border-border/60" style={{ left: s * PIXELS_PER_SECOND }}>
          {s % labelEvery === 0 && <span className="absolute top-0 left-1 text-[10px] text-text-dim">{s}s</span>}
        </div>
      ))}
    </div>
  );
}

/** A thin vertical guide shown inside a lane while a drag is snapped to a
 * candidate point — the visual confirmation that research on timeline UX
 * calls out as necessary alongside the snap itself, not just the snap. */
function SnapGuide({ atSeconds }: { atSeconds: number | null }) {
  if (atSeconds === null) return null;
  return (
    <div
      className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-accent-ink z-20 pointer-events-none"
      style={{ left: atSeconds * PIXELS_PER_SECOND }}
    />
  );
}

interface TimelineProps {
  segments: TimedSegment[];
  onReorderSegments: (segments: TimedSegment[]) => void;
  onResizeSegment: (index: number, durationSeconds: number) => void;
  /** One shared narration volume applied to every scene at once — not a
   * per-scene control, so the whole video's narration stays at one
   * consistent loudness rather than needing N sliders kept in sync by hand. */
  onVolumeChange: (volume: number) => void;
  audioClips: AudioClipPlacement[];
  onUpdateClip: (id: string, patch: Partial<AudioClipPlacement>) => void;
  onDuplicateClip: (clip: AudioClipPlacement) => void;
  onRemoveClip: (id: string) => void;
  /** Hides both audio lanes entirely — used for the pre-generation preview
   * when audio isn't being authored there. Defaults to true. */
  showAudioTrack?: boolean;
}

/** A CapCut-style ruler timeline: a scene track (drag to reorder, drag the
 * right edge to change on-screen duration), a background-music lane, and a
 * separate sound-effects lane — music and sfx are independent (their own
 * upload button, their own list, can hold any number of clips each) even
 * though every clip shares the same drag/trim/volume/duplicate mechanics.
 * Dragging snaps to scene boundaries, the video's own end, and other clips'
 * edges, with a visible guide line while snapped — dragging without any
 * alignment assistance is precise-feeling only by luck. */
export const Timeline: React.FC<TimelineProps> = ({
  segments,
  onReorderSegments,
  onResizeSegment,
  onVolumeChange,
  audioClips,
  onUpdateClip,
  onDuplicateClip,
  onRemoveClip,
  showAudioTrack = true,
}) => {
  const startDrag = useSecondsDrag();
  const dragSourceIndex = useRef<number | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownClipIds = useRef<Set<string>>(new Set());

  const starts = segmentStartTimes(segments);
  // The video's real, rendered length — driven by scenes alone. Audio can
  // never play past this: it's the ceiling every clip drag/resize clamps
  // against, regardless of how long the uploaded source file actually is.
  const videoDurationSeconds = starts.length > 0 ? starts[starts.length - 1] + segments[starts.length - 1].durationSeconds : 0;
  const clipsEnd = audioClips.reduce((max, c) => Math.max(max, c.startSeconds + c.durationSeconds), 0);
  const totalSeconds = Math.max(videoDurationSeconds, clipsEnd, 1);

  const musicClips = audioClips.filter((c) => c.kind === "music");
  const sfxClips = audioClips.filter((c) => c.kind !== "music");

  // Every point worth snapping to: each scene boundary, the video's own
  // start/end, and every clip's own start/end — shared across every drag
  // operation below (each just excludes its own moving edge as needed).
  function snapCandidatesExcluding(excludeClipId?: string): number[] {
    const points = [0, videoDurationSeconds, ...starts];
    for (const c of audioClips) {
      if (c.id === excludeClipId) continue;
      points.push(c.startSeconds, c.startSeconds + c.durationSeconds);
    }
    return points;
  }

  // A newly uploaded or duplicated clip is easy to miss if it lands outside
  // whatever part of a long timeline is currently scrolled into view —
  // scroll it into view automatically instead of relying on the user to
  // notice a change somewhere off-screen.
  useEffect(() => {
    const added = audioClips.find((c) => !knownClipIds.current.has(c.id));
    knownClipIds.current = new Set(audioClips.map((c) => c.id));
    if (added && scrollRef.current) {
      const targetLeft = Math.max(0, added.startSeconds * PIXELS_PER_SECOND - 120);
      scrollRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
    }
  }, [audioClips]);

  function endDrag(cleanup: () => void) {
    cleanup();
    setSnapGuide(null);
  }

  function handleSceneResizeStart(e: React.MouseEvent, index: number) {
    const startDuration = segments[index].durationSeconds;
    const candidates = snapCandidatesExcluding();
    setResizingIndex(index);
    startDrag(e, (deltaSeconds) => {
      const raw = Math.max(MIN_DURATION_SECONDS, startDuration + deltaSeconds);
      const rawEnd = starts[index] + raw;
      const { value: snappedEnd, guide } = snapTo(rawEnd, candidates);
      setSnapGuide(guide);
      onResizeSegment(index, Math.max(MIN_DURATION_SECONDS, snappedEnd - starts[index]));
    });
    const stopWatch = () => {
      endDrag(() => setResizingIndex(null));
      window.removeEventListener("mouseup", stopWatch);
    };
    window.addEventListener("mouseup", stopWatch);
  }

  function handleClipBodyDragStart(e: React.MouseEvent, clip: AudioClipPlacement) {
    const startSeconds = clip.startSeconds;
    const candidates = snapCandidatesExcluding(clip.id);
    setDraggingClipId(clip.id);
    startDrag(e, (deltaSeconds) => {
      const maxStart = Math.max(0, videoDurationSeconds - clip.durationSeconds);
      const raw = Math.min(maxStart, Math.max(0, startSeconds + deltaSeconds));
      const { value: snappedStart, guide } = snapTo(raw, candidates);
      setSnapGuide(guide);
      onUpdateClip(clip.id, { startSeconds: Math.min(maxStart, Math.max(0, snappedStart)) });
    });
    const stopWatch = () => {
      endDrag(() => setDraggingClipId(null));
      window.removeEventListener("mouseup", stopWatch);
    };
    window.addEventListener("mouseup", stopWatch);
  }

  function handleClipLeftTrimStart(e: React.MouseEvent, clip: AudioClipPlacement) {
    const startSeconds = clip.startSeconds;
    const trimStart = clip.trimStartSeconds ?? 0;
    const duration = clip.durationSeconds;
    const candidates = snapCandidatesExcluding(clip.id);
    startDrag(e, (deltaSeconds) => {
      // Dragging the left edge right: clip starts later on the timeline,
      // skips further into the source, and shrinks — all three move
      // together so the clip's right edge stays put.
      const rawClamped = Math.max(-trimStart, Math.min(deltaSeconds, duration - MIN_DURATION_SECONDS));
      const rawNewStart = startSeconds + rawClamped;
      const { value: snappedStart, guide } = snapTo(rawNewStart, candidates);
      setSnapGuide(guide);
      const clamped = Math.max(-trimStart, Math.min(snappedStart - startSeconds, duration - MIN_DURATION_SECONDS));
      onUpdateClip(clip.id, {
        startSeconds: Math.max(0, startSeconds + clamped),
        trimStartSeconds: trimStart + clamped,
        durationSeconds: duration - clamped,
      });
    });
    const stopWatch = () => {
      endDrag(() => {});
      window.removeEventListener("mouseup", stopWatch);
    };
    window.addEventListener("mouseup", stopWatch);
  }

  function handleClipRightTrimStart(e: React.MouseEvent, clip: AudioClipPlacement) {
    const duration = clip.durationSeconds;
    const trimStart = clip.trimStartSeconds ?? 0;
    const sourceLength = clip.sourceDurationSeconds;
    const startSeconds = clip.startSeconds;
    const candidates = snapCandidatesExcluding(clip.id);
    startDrag(e, (deltaSeconds) => {
      let next = Math.max(MIN_DURATION_SECONDS, duration + deltaSeconds);
      if (sourceLength) next = Math.min(next, sourceLength - trimStart);
      // Never let a clip extend past the video's own actual length.
      next = Math.min(next, videoDurationSeconds - startSeconds);
      const rawEnd = startSeconds + next;
      const { value: snappedEnd, guide } = snapTo(rawEnd, candidates);
      setSnapGuide(guide);
      onUpdateClip(clip.id, { durationSeconds: Math.max(MIN_DURATION_SECONDS, snappedEnd - startSeconds) });
    });
    const stopWatch = () => {
      endDrag(() => {});
      window.removeEventListener("mouseup", stopWatch);
    };
    window.addEventListener("mouseup", stopWatch);
  }

  function handleDrop(targetIndex: number) {
    const sourceIndex = dragSourceIndex.current;
    dragSourceIndex.current = null;
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    const next = [...segments];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorderSegments(next);
  }

  function renderAudioLane(clips: AudioClipPlacement[], label: string) {
    return (
      <>
        <div className="text-[10px] uppercase tracking-wide text-text-dim mb-1 mt-3">{label}</div>
        <div className="relative h-14 bg-bg rounded-lg border border-border">
          <SnapGuide atSeconds={snapGuide} />
          {clips.map((clip) => (
            <div
              key={clip.id}
              className={`absolute top-1 bottom-1 rounded-md bg-accent/25 border px-2 py-1 overflow-hidden select-none ${
                draggingClipId === clip.id ? "border-accent" : "border-accent/50"
              }`}
              style={{ left: clip.startSeconds * PIXELS_PER_SECOND, width: Math.max(30, clip.durationSeconds * PIXELS_PER_SECOND) }}
            >
              <div
                onMouseDown={(e) => handleClipBodyDragStart(e, clip)}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              />
              {/* Hit targets are deliberately wider than they look (extending
                  slightly over the clip body) — a thin visual edge is fine to
                  look at, but needs real margin for a mouse to reliably grab. */}
              <div
                onMouseDown={(e) => handleClipLeftTrimStart(e, clip)}
                className="absolute top-0 left-0 h-full w-2.5 cursor-col-resize hover:bg-accent-ink/40 z-10"
              />
              <div
                onMouseDown={(e) => handleClipRightTrimStart(e, clip)}
                className="absolute top-0 right-0 h-full w-2.5 cursor-col-resize hover:bg-accent-ink/40 z-10"
              />
              <div className="relative flex items-center justify-between gap-1 pointer-events-none">
                <span className="text-[10px] truncate">{fileNameOf(clip.staticPath)}</span>
                <span className="flex gap-1 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => onDuplicateClip(clip)}
                    title="Copy this clip to another point in the timeline"
                    className="text-[10px] leading-none px-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveClip(clip.id)}
                    title="Remove"
                    className="text-[10px] leading-none px-1 rounded bg-white/10 hover:bg-danger/60 cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>

        {clips.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {clips.map((clip) => (
              <div key={clip.id} className="flex items-center gap-2 text-[11px] text-text-dim">
                <span className="truncate w-32 shrink-0" title={fileNameOf(clip.staticPath)}>
                  {fileNameOf(clip.staticPath)}
                </span>
                <span className="shrink-0">Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={clip.volume ?? 1}
                  onChange={(e) => onUpdateClip(clip.id, { volume: Number(e.target.value) })}
                  className="w-28 accent-accent"
                />
                <span className="w-9 shrink-0 tabular-nums">{Math.round((clip.volume ?? 1) * 100)}%</span>
                <button
                  type="button"
                  onClick={() => onDuplicateClip(clip)}
                  className="text-[11px] font-bold text-text bg-transparent border border-border rounded-full px-2.5 py-0.5 hover:border-[#3d444a] cursor-pointer shrink-0"
                >
                  Copy to new spot
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-2">
      <div style={{ width: (totalSeconds + 1) * PIXELS_PER_SECOND, minWidth: "100%" }}>
        <Ruler totalSeconds={totalSeconds} />

        <div className="text-[10px] uppercase tracking-wide text-text-dim mb-1 mt-2">Scenes — drag to reorder, drag right edge to trim</div>
        <div className="relative h-16 bg-bg rounded-lg border border-border mb-3">
          <SnapGuide atSeconds={snapGuide} />
          {segments.map((segment, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => (dragSourceIndex.current = index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={`absolute top-1 bottom-1 rounded-md bg-panel-alt border px-2 py-1 overflow-hidden cursor-grab active:cursor-grabbing select-none ${
                resizingIndex === index ? "border-accent" : "border-border"
              }`}
              style={{ left: starts[index] * PIXELS_PER_SECOND, width: Math.max(20, segment.durationSeconds * PIXELS_PER_SECOND) }}
            >
              <div className="text-[10px] text-text-dim truncate">{segment.type}</div>
              <div className="text-[11px] leading-tight truncate">{segmentLabel(segment)}</div>
              <div
                onMouseDown={(e) => handleSceneResizeStart(e, index)}
                className="absolute top-0 right-0 h-full w-3 cursor-col-resize hover:bg-accent/40"
              />
            </div>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2 text-[11px] text-text-dim">
          <span className="shrink-0">Narration volume (all scenes)</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={segments[0]?.narrationVolume ?? 1}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-40 accent-accent"
          />
          <span className="w-10 shrink-0 tabular-nums">{Math.round((segments[0]?.narrationVolume ?? 1) * 100)}%</span>
        </div>

        {showAudioTrack && (
          <>
            {renderAudioLane(musicClips, "Background music — drag body to move, drag edges to trim length")}
            {renderAudioLane(sfxClips, "Sound effects — add as many as you like; drag body to move, drag edges to trim length")}
            <p className="text-[10px] text-text-dim mt-2">A clip can never play past the video's own length.</p>
          </>
        )}
      </div>
    </div>
  );
};
