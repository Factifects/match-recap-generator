import { useEffect, useRef, useState } from "react";
import type { TimedSegment, AudioClipPlacement } from "../../../src/model/Segment";

const BASE_PIXELS_PER_SECOND = 44;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const ZOOM_STEP_FACTOR = 1.25;
/** Shared with GeneratePage.tsx so a newly added/duplicated clip and a
 * dragged one clamp to the exact same floor. */
export const MIN_CLIP_DURATION_SECONDS = 0.2;
const MIN_DURATION_SECONDS = MIN_CLIP_DURATION_SECONDS;
/** How close (in on-screen pixels) a drag has to land to a candidate point
 * — scene boundaries, the video's own end, another clip's start/end — to
 * snap to it exactly, with a visual guide line while it's snapped. A pixel
 * count, not a fixed seconds value, so snapping feels equally precise at
 * any zoom level. */
const SNAP_PIXELS = 10;

const ROW_HEIGHT_PX = 56;
const ROW_INSET_PX = 4;

function segmentLabel(segment: TimedSegment): string {
  const text = segment.text;
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function fileNameOf(staticPath: string): string {
  return staticPath.split("/").pop() ?? staticPath;
}

function clipDisplayName(clip: AudioClipPlacement): string {
  return clip.label || fileNameOf(clip.staticPath);
}

/** A segment's real floor once real narration resolves is
 * `Math.max(durationSeconds, visualMinDurationSeconds)` (see
 * resolveSegmentAudio) — a multi-phase Canvas/TacticalBoard scene can't
 * finish faster than its phase count requires. Using the raw estimate alone
 * here undercounts the video's true minimum length in the pre-generation
 * preview, which is exactly what let a background-music/sfx clip get placed
 * against a shorter length than the real render ends up enforcing. */
function effectiveDurationOf(segment: TimedSegment): number {
  return Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0);
}

function segmentStartTimes(segments: TimedSegment[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const segment of segments) {
    starts.push(acc);
    acc += effectiveDurationOf(segment);
  }
  return starts;
}

/** Snaps `raw` to whichever candidate point is within `snapSeconds`, if any
 * — returns the snapped value (for use) alongside the candidate itself (for
 * drawing the guide line), or `raw`/`null` when nothing's close enough. */
function snapTo(raw: number, candidates: number[], snapSeconds: number): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = snapSeconds;
  for (const c of candidates) {
    const dist = Math.abs(raw - c);
    if (dist <= bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best !== null ? { value: best, guide: best } : { value: raw, guide: null };
}

/** How many lane rows a lane-group (music/sfx) needs to show right now: at
 * least enough to fit every clip's own explicit `lane`, at least the user's
 * manually-requested count (via "+ Add lane"), and never fewer than 1. */
function effectiveLaneCount(clips: AudioClipPlacement[], requestedCount: number): number {
  const maxUsed = clips.reduce((max, c) => Math.max(max, (c.lane ?? 0) + 1), 0);
  return Math.max(1, requestedCount, maxUsed);
}

// One shared AudioContext for every waveform decode — browsers cap how many
// can exist at once, and there's no reason to want more than one here.
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioContext) sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return sharedAudioContext;
}

// A fixed COUNT of buckets across the whole file (the original approach)
// starves a short trim of a long file — e.g. background music is often
// several minutes long, so a clip trimmed down to the video's length could
// see as few as a dozen buckets, each spanning many seconds: the "max
// amplitude in this bucket" collapses toward a flat, uniform block instead
// of a recognizable waveform shape. A fixed DENSITY (buckets per second of
// audio) instead means resolution scales with the file's own length, so
// any trimmed slice — long or short — still gets plenty of buckets.
const PEAKS_PER_SECOND = 24;
interface WaveformData {
  peaks: number[]; // 0-1 normalized peak amplitude per bucket, one bucket per 1/PEAKS_PER_SECOND of the FULL source file
  durationSeconds: number;
}
// Keyed by staticPath so every placement of the same uploaded file (e.g. a
// clip duplicated via "Copy to new spot") reuses one decode instead of
// re-fetching and re-decoding the same audio N times.
const waveformCache = new Map<string, Promise<WaveformData | null>>();

function loadWaveform(staticPath: string): Promise<WaveformData | null> {
  const cached = waveformCache.get(staticPath);
  if (cached) return cached;
  const promise = (async (): Promise<WaveformData | null> => {
    try {
      const res = await fetch(`/${staticPath}`);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
      const channel = audioBuffer.getChannelData(0);
      const bucketCount = Math.max(1, Math.ceil(audioBuffer.duration * PEAKS_PER_SECOND));
      const blockSize = Math.max(1, Math.floor(channel.length / bucketCount));
      const peaks: number[] = [];
      for (let i = 0; i < bucketCount; i++) {
        const start = i * blockSize;
        let max = 0;
        for (let j = start; j < start + blockSize && j < channel.length; j++) {
          max = Math.max(max, Math.abs(channel[j]));
        }
        peaks.push(max);
      }
      return { peaks, durationSeconds: audioBuffer.duration };
    } catch {
      // Best-effort — a clip still works perfectly (drag/trim/play) without
      // its waveform if decoding fails for any reason (unsupported codec,
      // network hiccup); it just falls back to the plain flat block.
      return null;
    }
  })();
  waveformCache.set(staticPath, promise);
  return promise;
}

function useWaveform(staticPath: string): WaveformData | null {
  const [data, setData] = useState<WaveformData | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    loadWaveform(staticPath).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [staticPath]);
  return data;
}

/** Renders only the slice of the full waveform this clip's trim currently
 * exposes, stretched across the clip's own on-screen width — so dragging
 * the trim handles visibly changes which part of the waveform is showing,
 * the same way a real audio editor's clip thumbnail does. */
function ClipWaveform({ clip }: { clip: AudioClipPlacement }) {
  const data = useWaveform(clip.staticPath);
  if (!data || data.peaks.length === 0) return null;
  const totalSeconds = data.durationSeconds || clip.sourceDurationSeconds || clip.durationSeconds;
  if (totalSeconds <= 0) return null;
  const trimStart = clip.trimStartSeconds ?? 0;
  const startFrac = Math.max(0, Math.min(1, trimStart / totalSeconds));
  const endFrac = Math.max(startFrac, Math.min(1, (trimStart + clip.durationSeconds) / totalSeconds));
  const startIdx = Math.floor(startFrac * data.peaks.length);
  const endIdx = Math.max(startIdx + 1, Math.ceil(endFrac * data.peaks.length));
  const visible = data.peaks.slice(startIdx, endIdx);
  if (visible.length === 0) return null;
  const barWidth = 100 / visible.length;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none text-accent-ink/50"
    >
      {visible.map((peak, i) => {
        const h = Math.max(6, peak * 92);
        return <rect key={i} x={i * barWidth} y={(100 - h) / 2} width={Math.max(0.4, barWidth * 0.7)} height={h} fill="currentColor" />;
      })}
    </svg>
  );
}

/** Tracks a mouse-drag session from a fixed start point (not incremental
 * per-frame deltas, to avoid drift) — attaches window-level listeners for
 * the duration of the drag and cleans them up on mouseup. No drag-and-drop
 * library needed for plain "click, drag, release" resizing/positioning.
 * `pixelsPerSecond` is captured at drag-start (not re-read live), so a zoom
 * change mid-drag can't retroactively distort an in-flight gesture. Reports
 * raw vertical pixel movement alongside the horizontal seconds delta —
 * unused by most callers (trim handles, scene resize), but a clip body drag
 * uses it to let dragging up/down reassign which lane row the clip is on. */
function useSecondsDrag() {
  const session = useRef<{ startX: number; startY: number; onDelta: (deltaSeconds: number, deltaYPx: number) => void; pixelsPerSecond: number } | null>(
    null,
  );

  function handleMove(e: MouseEvent) {
    if (!session.current) return;
    const deltaPx = e.clientX - session.current.startX;
    const deltaYPx = e.clientY - session.current.startY;
    session.current.onDelta(deltaPx / session.current.pixelsPerSecond, deltaYPx);
  }
  function handleUp() {
    session.current = null;
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  }

  return function startDrag(
    e: React.MouseEvent,
    pixelsPerSecond: number,
    onDelta: (deltaSeconds: number, deltaYPx: number) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    session.current = { startX: e.clientX, startY: e.clientY, onDelta, pixelsPerSecond };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };
}

function Ruler({ totalSeconds, pixelsPerSecond }: { totalSeconds: number; pixelsPerSecond: number }) {
  const seconds = Math.ceil(totalSeconds) + 1;
  // Denser zoom can show every second; zoomed way out needs to skip more of
  // them or the labels overlap into an unreadable smear.
  const labelEvery = pixelsPerSecond < 12 ? 20 : pixelsPerSecond < 24 ? 10 : totalSeconds > 40 ? 5 : 1;
  return (
    <div className="relative h-5" style={{ width: seconds * pixelsPerSecond }}>
      {Array.from({ length: seconds }, (_, s) => (
        <div key={s} className="absolute top-0 h-full border-l border-border/60" style={{ left: s * pixelsPerSecond }}>
          {s % labelEvery === 0 && <span className="absolute top-0 left-1 text-[10px] text-text-dim">{s}s</span>}
        </div>
      ))}
    </div>
  );
}

/** A thin vertical guide shown inside a lane while a drag is snapped to a
 * candidate point — the visual confirmation that research on timeline UX
 * calls out as necessary alongside the snap itself, not just the snap. */
function SnapGuide({ atSeconds, pixelsPerSecond }: { atSeconds: number | null; pixelsPerSecond: number }) {
  if (atSeconds === null) return null;
  return (
    <div
      className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-accent-ink z-20 pointer-events-none"
      style={{ left: atSeconds * pixelsPerSecond }}
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
 * alignment assistance is precise-feeling only by luck. Each lane-group
 * (music/sfx) can hold several explicit, user-controlled lane rows ("+ Add
 * lane") — a clip's row is a plain `lane` index the user sets by dragging it
 * up/down, not auto-computed from overlaps, so two sounds can be
 * deliberately layered at the same timestamp (e.g. a whoosh under a click)
 * by placing one on its own lane first. Each clip shows a waveform
 * (best-effort — silently absent if decoding fails), and the whole ruler can
 * be zoomed in/out independent of the browser's own zoom, since a
 * multi-minute video and a tightly-packed sfx lane want very different
 * pixels-per-second. */
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
  const [zoom, setZoom] = useState(1);
  // Explicit, user-controlled lane counts per lane-group — not derived
  // purely from clip data, so an "Add lane" click shows an empty row
  // immediately (a target to drag a clip into) rather than only appearing
  // once a clip already claims that row.
  const [musicLaneCount, setMusicLaneCount] = useState(1);
  const [sfxLaneCount, setSfxLaneCount] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownClipIds = useRef<Set<string>>(new Set());

  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom;
  const snapSeconds = SNAP_PIXELS / pixelsPerSecond;

  const starts = segmentStartTimes(segments);
  // The video's real, rendered length — driven by scenes alone. Audio can
  // never play past this: it's the ceiling every clip drag/resize clamps
  // against, regardless of how long the uploaded source file actually is.
  const videoDurationSeconds = starts.length > 0 ? starts[starts.length - 1] + effectiveDurationOf(segments[starts.length - 1]) : 0;
  const clipsEnd = audioClips.reduce((max, c) => Math.max(max, c.startSeconds + c.durationSeconds), 0);
  const totalSeconds = Math.max(videoDurationSeconds, clipsEnd, 1);

  const musicClips = audioClips.filter((c) => c.kind === "music");
  const sfxClips = audioClips.filter((c) => c.kind !== "music");
  const musicLanes = effectiveLaneCount(musicClips, musicLaneCount);
  const sfxLanes = effectiveLaneCount(sfxClips, sfxLaneCount);

  function zoomBy(factor: number) {
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor)));
  }

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
      const targetLeft = Math.max(0, added.startSeconds * pixelsPerSecond - 120);
      scrollRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioClips]);

  function endDrag(cleanup: () => void) {
    cleanup();
    setSnapGuide(null);
  }

  function handleSceneResizeStart(e: React.MouseEvent, index: number) {
    const startDuration = segments[index].durationSeconds;
    const candidates = snapCandidatesExcluding();
    setResizingIndex(index);
    startDrag(e, pixelsPerSecond, (deltaSeconds) => {
      const raw = Math.max(MIN_DURATION_SECONDS, startDuration + deltaSeconds);
      const rawEnd = starts[index] + raw;
      const { value: snappedEnd, guide } = snapTo(rawEnd, candidates, snapSeconds);
      setSnapGuide(guide);
      onResizeSegment(index, Math.max(MIN_DURATION_SECONDS, snappedEnd - starts[index]));
    });
    const stopWatch = () => {
      endDrag(() => setResizingIndex(null));
      window.removeEventListener("mouseup", stopWatch);
    };
    window.addEventListener("mouseup", stopWatch);
  }

  function handleClipBodyDragStart(e: React.MouseEvent, clip: AudioClipPlacement, laneCount: number) {
    const startSeconds = clip.startSeconds;
    const startLane = clip.lane ?? 0;
    const candidates = snapCandidatesExcluding(clip.id);
    setDraggingClipId(clip.id);
    startDrag(e, pixelsPerSecond, (deltaSeconds, deltaYPx) => {
      const maxStart = Math.max(0, videoDurationSeconds - clip.durationSeconds);
      const raw = Math.min(maxStart, Math.max(0, startSeconds + deltaSeconds));
      const { value: snappedStart, guide } = snapTo(raw, candidates, snapSeconds);
      setSnapGuide(guide);
      // Dragging vertically reassigns which lane row the clip sits on —
      // rounded to the nearest whole row and clamped to however many lanes
      // this group currently has, so a small vertical wobble while mostly
      // dragging horizontally doesn't accidentally bump the clip to another
      // lane.
      const laneDelta = Math.round(deltaYPx / ROW_HEIGHT_PX);
      const nextLane = Math.max(0, Math.min(laneCount - 1, startLane + laneDelta));
      onUpdateClip(clip.id, { startSeconds: Math.min(maxStart, Math.max(0, snappedStart)), lane: nextLane });
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
    startDrag(e, pixelsPerSecond, (deltaSeconds) => {
      // Dragging the left edge right: clip starts later on the timeline,
      // skips further into the source, and shrinks — all three move
      // together so the clip's right edge stays put.
      const rawClamped = Math.max(-trimStart, Math.min(deltaSeconds, duration - MIN_DURATION_SECONDS));
      const rawNewStart = startSeconds + rawClamped;
      const { value: snappedStart, guide } = snapTo(rawNewStart, candidates, snapSeconds);
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
    startDrag(e, pixelsPerSecond, (deltaSeconds) => {
      let next = Math.max(MIN_DURATION_SECONDS, duration + deltaSeconds);
      if (sourceLength) next = Math.min(next, sourceLength - trimStart);
      // Never let a clip extend past the video's own actual length.
      next = Math.min(next, videoDurationSeconds - startSeconds);
      const rawEnd = startSeconds + next;
      const { value: snappedEnd, guide } = snapTo(rawEnd, candidates, snapSeconds);
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

  function renderAudioLane(
    clips: AudioClipPlacement[],
    label: string,
    laneCount: number,
    onAddLane: () => void,
    onRemoveLane: () => void,
  ) {
    const lastLaneHasClips = clips.some((c) => (c.lane ?? 0) === laneCount - 1);
    const laneHeight = laneCount * ROW_HEIGHT_PX + ROW_INSET_PX * 2;
    return (
      <>
        <div className="flex items-center justify-between mb-1 mt-3">
          <div className="text-[10px] uppercase tracking-wide text-text-dim">{label}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-dim">
            <span>{laneCount} lane{laneCount === 1 ? "" : "s"}</span>
            <button
              type="button"
              onClick={onRemoveLane}
              disabled={laneCount <= 1 || lastLaneHasClips}
              title={lastLaneHasClips ? "Move clips off the last lane before removing it" : "Remove the last (empty) lane"}
              className="w-5 h-5 leading-none rounded border border-border hover:border-[#3d444a] disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              −
            </button>
            <button
              type="button"
              onClick={onAddLane}
              title="Add an empty lane — drag a clip up/down into it to layer sounds at the same timestamp"
              className="w-5 h-5 leading-none rounded border border-border hover:border-[#3d444a] cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
        <div className="relative bg-bg rounded-lg border border-border" style={{ height: laneHeight }}>
          <SnapGuide atSeconds={snapGuide} pixelsPerSecond={pixelsPerSecond} />
          {Array.from({ length: laneCount - 1 }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 border-b border-border/40 pointer-events-none" style={{ top: (i + 1) * ROW_HEIGHT_PX }} />
          ))}
          {clips.map((clip) => {
            const row = clip.lane ?? 0;
            return (
              <div
                key={clip.id}
                className={`absolute rounded-md bg-accent/25 border px-2 py-1 overflow-hidden select-none ${
                  draggingClipId === clip.id ? "border-accent" : "border-accent/50"
                }`}
                style={{
                  left: clip.startSeconds * pixelsPerSecond,
                  width: Math.max(30, clip.durationSeconds * pixelsPerSecond),
                  top: ROW_INSET_PX + row * ROW_HEIGHT_PX,
                  height: ROW_HEIGHT_PX - ROW_INSET_PX * 2,
                }}
              >
                <ClipWaveform clip={clip} />
                <div
                  onMouseDown={(e) => handleClipBodyDragStart(e, clip, laneCount)}
                  title="Drag to move; drag up/down to change lane"
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
                  <span className="text-[10px] truncate">{clipDisplayName(clip)}</span>
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
            );
          })}
        </div>

        {clips.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {clips.map((clip) => (
              <div key={clip.id} className="flex items-center gap-2 text-[11px] text-text-dim">
                <input
                  type="text"
                  value={clip.label ?? ""}
                  placeholder={fileNameOf(clip.staticPath)}
                  title={fileNameOf(clip.staticPath)}
                  onChange={(e) => onUpdateClip(clip.id, { label: e.target.value })}
                  className="w-32 shrink-0 bg-transparent border border-border rounded px-1.5 py-0.5 text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
                />
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
                <button
                  type="button"
                  onClick={() => onRemoveClip(clip.id)}
                  className="text-[11px] font-bold text-text bg-transparent border border-border rounded-full px-2.5 py-0.5 hover:border-danger hover:text-danger cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 mb-1.5 text-[11px] text-text-dim">
        <span className="mr-1">Zoom</span>
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP_FACTOR)}
          disabled={zoom <= ZOOM_MIN}
          className="w-5 h-5 leading-none rounded border border-border hover:border-[#3d444a] disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          −
        </button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP_FACTOR)}
          disabled={zoom >= ZOOM_MAX}
          className="w-5 h-5 leading-none rounded border border-border hover:border-[#3d444a] disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          +
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="text-[10px] rounded-full border border-border px-2 py-0.5 hover:border-[#3d444a] cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-2">
        <div style={{ width: (totalSeconds + 1) * pixelsPerSecond, minWidth: "100%" }}>
          <Ruler totalSeconds={totalSeconds} pixelsPerSecond={pixelsPerSecond} />

          <div className="text-[10px] uppercase tracking-wide text-text-dim mb-1 mt-2">Scenes — drag to reorder, drag right edge to trim</div>
          <div className="relative h-16 bg-bg rounded-lg border border-border mb-3">
            <SnapGuide atSeconds={snapGuide} pixelsPerSecond={pixelsPerSecond} />
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
                style={{ left: starts[index] * pixelsPerSecond, width: Math.max(20, effectiveDurationOf(segment) * pixelsPerSecond) }}
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
              {renderAudioLane(
                musicClips,
                "Background music — drag body to move, drag edges to trim length",
                musicLanes,
                () => setMusicLaneCount(musicLanes + 1),
                () => setMusicLaneCount(Math.max(1, musicLanes - 1)),
              )}
              {renderAudioLane(
                sfxClips,
                "Sound effects — add as many as you like; drag body to move, drag edges to trim length",
                sfxLanes,
                () => setSfxLaneCount(sfxLanes + 1),
                () => setSfxLaneCount(Math.max(1, sfxLanes - 1)),
              )}
              <p className="text-[10px] text-text-dim mt-2">
                A clip can never play past the video's own length. Drag a clip up/down to move it to another lane — use "+" to add an
                empty one when you want to layer two sounds at the same timestamp.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
