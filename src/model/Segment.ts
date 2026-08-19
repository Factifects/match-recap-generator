import { z } from "zod";
import { VISUAL_DEFINITIONS } from "./visualDefinitions";
import type { SceneContract } from "../script/sceneContract";

/** Whole-video render option (not per-segment data) — lives here since this
 * model file is already the one shared import point for both the node-side
 * pipeline (generate.ts/cli.ts/server.ts) and the video/rendering layer
 * (Root.tsx/AnalysisVideo.tsx), avoiding a circular import between those two. */
export type AspectRatio = "16:9" | "9:16";

// Re-exported for backward compatibility — formations.ts/icons.ts/
// ZoneMapCard.tsx already import these from here; the values themselves now
// live in visualDefinitions.ts (the visual registry) alongside every other
// visual-type constant, so there's one place to look for "what values does
// this field accept" per visual type instead of two.
export { ICON_KEYS, ZONE_KEYS, FORMATION_NAMES } from "./visualDefinitions";

// A "visual" is a graphic that replaces the default caption for one narration
// beat. It never carries its own timing — the beat's real narration audio (or,
// pre-audio, its word-count estimate) always drives how long it's on screen, so
// swapping the caption for a graphic never silently drops narration content.
// Derived from the visual registry (src/model/visualDefinitions.ts) rather
// than hand-listed here — see that file's docstring for why. `Visual` is
// derived independently from the union of each registry entry's own schema
// type, rather than from `z.infer<typeof visualSchema>` — zod v4's
// `discriminatedUnion` wants a compile-time-literal tuple of
// `$ZodTypeDiscriminable` options, which a runtime `.map()` over the
// registry can't produce without an `any` escape hatch; that cast is
// confined to `visualSchema`'s construction, not `Visual`'s type, so every
// other file's type-checking is unaffected. Discrimination itself still
// works correctly at runtime — zod only needs each element to be an object
// schema with a literal `kind`, which every registry entry already is.
export type Visual = z.infer<(typeof VISUAL_DEFINITIONS)[number]["schema"]>;

export const visualSchema = z.discriminatedUnion(
  "kind",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VISUAL_DEFINITIONS.map((def) => def.schema) as any,
) as z.ZodType<Visual>;

export const segmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chapter"), text: z.string().min(1) }),
  z.object({ type: z.literal("statement"), text: z.string().min(1), visual: visualSchema.optional() }),
]);

export type Segment = z.infer<typeof segmentSchema>;

// A user-placed audio clip (sound effect or music) on the whole-video
// timeline — independent of any single segment, so the same uploaded file
// can be trimmed to a chosen length and placed at more than one point in the
// video (copy/paste, CapCut-style), rather than being bound to one scene.
// Lives alongside `backgroundMusicPath` as a composition-level prop, not a
// TimedSegment field — see AnalysisVideo.tsx's rendering and the timeline
// editor (EditPage.tsx) for how placements are authored.
export interface AudioClipPlacement {
  id: string;
  staticPath: string;
  /** Where in the OVERALL video timeline (seconds from the very start) this
   * instance starts playing — not relative to any segment. */
  startSeconds: number;
  /** How long this instance plays for — the "length the user controls",
   * independent of the source file's own full length. */
  durationSeconds: number;
  /** Offset into the source file to start playback from, so the same
   * uploaded file can be trimmed differently at each placement. */
  trimStartSeconds?: number;
  /** 0-1. Defaults to 1 (full volume) when absent. */
  volume?: number;
  /** The uploaded source file's own full length — not used by the renderer
   * (only startSeconds/durationSeconds/trimStartSeconds matter there), just
   * lets the timeline-editor UI clamp trim-handle dragging to the file's
   * actual length instead of letting a drag run past the real audio. */
  sourceDurationSeconds?: number;
  /** UI grouping only (the renderer treats every clip identically) — keeps
   * background music and sound effects in separate lanes/upload buttons
   * even though they share the same drag/trim/volume mechanics. Missing on
   * older sidecar JSON predates this field; treated as "sfx". */
  kind?: "music" | "sfx";
  /** User-editable display name shown in the timeline editor in place of
   * the uploaded file's (hash-like) filename — cosmetic only, never read by
   * the renderer. Falls back to the filename when unset. */
  label?: string;
  /** Which row within its lane (music/sfx are separate lane groups) this
   * clip renders on in the timeline editor — purely a UI concern (the
   * renderer plays every clip regardless of lane), but explicit rather than
   * auto-computed from overlaps: the user places a clip on its own lane
   * *before* dragging it into an overlap, e.g. layering a whoosh under a
   * click at the same timestamp. Defaults to 0 when unset. */
  lane?: number;
  /** Fade-in ramp length in seconds, from silent up to full volume at the
   * clip's own start — dragged via the timeline editor's fade handle (see
   * Timeline.tsx's handleFadeInDragStart). Unset/0 means no fade-in, the
   * only behavior that existed before manual fade control. */
  fadeInSeconds?: number;
  /** Fade-out ramp length in seconds, down to silent by the clip's own end —
   * dragged via the timeline editor's fade handle. Unset (as opposed to an
   * explicit 0) leaves AnalysisVideo.tsx's own smart default in charge: a
   * short automatic fade UNLESS another clip is glued flush against this
   * one's tail (see hasGluedSuccessor), in which case it skips the fade so a
   * duplicated/tiled clip doesn't dip right at the seam. Setting this field
   * at all — including to 0 — is a deliberate manual override of that
   * default, e.g. dragging a real crossfade even across a glued boundary. */
  fadeOutSeconds?: number;
}

// Camera framing for pitch-based visuals (TacticalBoard/Formation/ShotMap/
// GoalSequence) — presentation metadata, not visual data, so it lives outside
// the zod visual schema. One stage holds a static framing for the scene; two
// stages pan/zoom from the first to the second across the scene's duration.
export interface CameraStage {
  focus: "full" | "left-half" | "right-half" | "box-left" | "box-right" | { x: number; y: number };
  zoom: number;
}

export type TimedSegment = Segment & {
  durationSeconds: number;
  /** Set when a user explicitly picked this scene's duration in the
   * pre-generation timeline preview (GeneratePage.tsx, before narration
   * exists) — resolveSegmentAudio must not overwrite `durationSeconds` with
   * the real narration length or the visualMinDurationSeconds floor the way
   * it does for every other, unedited segment. Narration audio is still
   * generated and attached as usual; only which duration wins changes. */
  manualDurationOverride?: boolean;
  /** Set once ElevenLabs generation has run; absent means duration is still a word-count estimate. */
  audioStaticPath?: string;
  /** The REAL spoken length of this segment's narration, as measured from the
   * generated TTS audio — the narration temporal spine (see CLAUDE.md). Kept
   * separate from `durationSeconds` on purpose: `durationSeconds` is the
   * segment's on-screen length, which can legitimately exceed narration by a
   * DECLARED hold (see `tailHoldSeconds`), whereas this is the ground truth
   * every visual beat must be scheduled against. For a merged Canvas passage
   * this is the sum of every `narrationClips` entry's real duration.
   *
   * Absent means narration audio was never generated (an estimate-only render,
   * i.e. no `--audio`) — the fitting and narration-sync checks both no-op in
   * that case rather than fitting a real timeline to a word-count guess. */
  narrationSeconds?: number;
  /** Deliberate, declared on-screen time AFTER narration ends — a final-result
   * hold, an outro beat. This is the ONLY legitimate reason for a segment to
   * outlast its narration; anything else is the dead-tail failure the spine
   * exists to eliminate, and validateNarrationSync.ts reports it as such. */
  tailHoldSeconds?: number;
  /** What actually gets synthesized into narration audio, when it needs to
   * differ from `text` (the on-screen content). Chapter scenes are the one
   * case today: `text` is deliberately kept short (the giant on-screen
   * Annotation, no wrapping), but the author's full `Narration:` line should
   * still be spoken in full underneath it — without this field, resolveAudio
   * would have nothing but `text` to synthesize, silently discarding
   * whatever narration the author actually wrote for that beat. Absent means
   * speak `text` itself, unchanged from every other segment's behavior. */
  narrationText?: string;
  /** This scene's narration volume. Defaults to 1 (the recorded level).
   * Unlike a plain HTML5 `<audio>` element, values above 1 are meaningful
   * here — Remotion mixes the final audio track itself (via its renderer,
   * not literal browser playback), so amplifying narration past its
   * original level actually takes effect in the rendered mp4. */
  narrationVolume?: number;
  /** Chapter beats only: a short whoosh layered under the swoosh-wipe transition.
   * Canvas scenes fall back to this same field ONLY when their timeline has no
   * per-action `sound` cues (see `sfxClips` below) — one generic whoosh
   * stretched under the whole scene, today's only Canvas SFX behavior. */
  sfxStaticPath?: string;
  /** Canvas timeline scenes only: discrete SFX hits, one per timeline action
   * that requested a `sound` cue, each playing at that action's own
   * `startSeconds` within the segment — the fix for a single generic whoosh
   * getting stretched under an entire multi-beat choreographed scene. Takes
   * over from `sfxStaticPath` entirely when present (resolveSegmentAudio
   * never sets both on the same segment), since layering a whole-scene
   * whoosh under precise per-beat hits would just reintroduce the mismatch
   * this exists to fix. */
  sfxClips?: {
    staticPath: string;
    startSeconds: number;
    durationSeconds: number;
    volume?: number;
    /** Offset into the SOURCE file. A cue that fires many times in a row (the
     * keyboard under a typing run) replays a different slice each time, so it
     * does not turn into one sample looping audibly. */
    trimStartSeconds?: number;
  }[];
  /** Pitch-based visuals only; ignored by non-pitch components. */
  camera?: CameraStage[];
  /** How this segment transitions OUT to the next one. Defaults to "dissolve". */
  transitionOut?: "cut" | "dissolve";
  /** Which presentation plays the "dissolve" — independent of transitionOut,
   * which still controls timing (cut = 1 frame, everything else = the normal
   * crossfade duration). "cut" always forces a hard cut regardless of this.
   * Defaults to "fade" (today's only behavior) when absent. An explicit
   * `Transition Style` field always wins; absent that, `storyBeat` (below)
   * supplies a default — see STORY_BEAT_TRANSITION_DEFAULTS in
   * parseSceneScript.ts. */
  transitionStyle?: "fade" | "zoom-in" | "zoom-out" | "slide-left" | "slide-right" | "slide-up" | "slide-down";
  /** Authoring metadata for the scene's narrative function — a Reveal lands
   * differently than a Question. Not rendered directly (no on-screen badge),
   * but drives transitionStyle's default when the author hasn't set an
   * explicit Transition Style, so a script's beats can be structural without
   * hand-picking a presentation for every single scene. */
  storyBeat?: "reveal" | "comparison" | "evidence" | "escalation" | "explanation" | "payoff" | "reflection" | "question";
  /** Scene-spec scripts only: the author's stated minimum for how long this
   * scene's visual needs to breathe, independent of narration length. Kept
   * separate from durationSeconds so resolveSegmentAudio can take max(realAudio,
   * this) instead of blindly overwriting a deliberate visual-pacing floor. */
  visualMinDurationSeconds?: number;
  /** Path relative to public/ for a faded background image (player photo,
   * flag, badge, or generic silhouette) — resolved at parse time via
   * src/video/assets.ts, so this is only ever set when a real file exists.
   * Absent means render nothing, not a placeholder. */
  backgroundImage?: string;
  /** "featured" renders backgroundImage full-color and near-full-opacity —
   * for a scene that IS about this person, not just set-dressing behind it.
   * Defaults to "faded" (the set-dressing treatment) when absent. */
  backgroundImageMode?: "faded" | "featured";
  /** Which side backgroundImage sits on — "center" only really works well on
   * Icon/Stat, whose cards shift their own text below the image
   * (`stackedLayout`) when it's set; other cards just position it centered
   * without moving their own text, which can still overlap. Defaults to
   * "right" (today's behavior) when absent. */
  backgroundImageSide?: "left" | "right" | "center";
  /** Icon scenes only: a real image for this icon key (public/assets/icons/
   * <key>.png), resolved at parse time — falls back to the built-in
   * hand-drawn stroke icon (IconGlyph) when no matching file exists. */
  iconImage?: string;
  /** Every Scene Type: an optional bold background color-block (Tifo
   * Football-style), in place of the default neutral dark background.
   * Literal union kept in sync with src/video/theme.ts's PANEL_COLORS keys —
   * duplicated rather than imported so this model layer stays independent of
   * the video/rendering layer. Absent means today's exact neutral
   * background, unchanged for every existing script. */
  panelColor?: "neutral" | "red" | "blue" | "yellow" | "light";
  /** Formation scenes only: a resolved jersey image per side, keyed by
   * "home"/"away" — same parse-time resolution as backgroundImage. A side
   * with no jersey asset falls back to the plain colored disc. */
  jerseyImages?: Partial<Record<"home" | "away", string>>;
  /** TacticalBoard/Formation scenes only: where the pitch board sits in a
   * landscape frame. "left"/"right" moves the title/caption into a side text
   * panel instead of overlaying/sitting above the board. Defaults to
   * "center" (today's behavior) when absent; ignored in portrait. */
  boardPosition?: "left" | "right" | "center";
  /** Cross-visual reveal control — how existing Data gets animated in, not
   * what the Data itself contains. Wired into every array-based card (Grid,
   * BarChart, LeagueTable, TierCards, Funnel, PackedCircles, KpiPanel,
   * Treemap, MomentumTimeline, Radar); other visual kinds simply ignore it.
   * Absent means every current default (hardcoded per-component stagger,
   * natural array order, no pulse) stays exactly as today. */
  animation?: {
    staggerSeconds?: number;
    focusOrder?: number[];
    pulse?: boolean;
  };
  /** An independent sequence of on-screen captions playing over the scene's
   * own duration, on top of whichever visual is showing — works identically
   * regardless of visual kind (rendered as a sibling overlay, not per-card). */
  phases?: { caption: string; startSeconds?: number }[];
  /** Scene-spec scripts only: set when this scene's `**Continue Canvas:**`
   * field is `true` — a signal to mergeCanvasContinuity.ts (src/script/) that
   * this scene's Canvas visual should be folded into the immediately
   * preceding scene's Canvas as more phases (camera glides/pans into it
   * rather than a cut/dissolve) instead of becoming its own segment. Consumed
   * and never persisted past that merge step — a scene that actually reaches
   * rendering never has this set to true (it's been absorbed into its
   * predecessor by then). */
  continuesCanvasFrom?: boolean;
  /** Set by mergeCanvasContinuity.ts + resolveSegmentAudio in place of a
   * single `audioStaticPath` when this segment is a merged Canvas passage
   * (multiple originally-independent scenes folded into one) — each entry is
   * one sub-scene's own narration, played back at its own offset within this
   * segment's total duration rather than one continuous clip. Absent for
   * every ordinary (non-merged) segment, which keeps using `audioStaticPath`
   * exactly as today. `staticPath`/`offsetSeconds`/`durationSeconds` are
   * filled in by resolveSegmentAudio once real TTS duration is known — before
   * that, an entry only has `text`. */
  narrationClips?: { text: string; staticPath?: string; offsetSeconds?: number; durationSeconds?: number; volume?: number }[];
  /** Internal bookkeeping set by mergeCanvasContinuity.ts, consumed and
   * deleted by resolveSegmentAudio — never reaches the rendered sidecar JSON.
   * One entry per `narrationClips` entry AFTER the first (a merged passage's
   * first sub-scene starts at offset 0 and needs no anchor): the index into
   * `visual.phases` (Canvas only) of that sub-scene's own boundary phase,
   * whose `startSeconds` gets patched to that sub-scene's real cumulative
   * narration offset once resolveSegmentAudio knows it. */
  _canvasClipBoundaries?: number[];
  /** Internal bookkeeping set by mergeCanvasContinuity.ts, consumed and
   * deleted by resolveSegmentAudio — never reaches the rendered sidecar JSON.
   * One `[from, to)` slice of `phases` (on-screen captions) per
   * `narrationClips` entry, INCLUDING the first — every caption in `phases`
   * already has an absolute `startSeconds` within its own sub-scene's span by
   * the time this is set; resolveSegmentAudio only needs to add each range's
   * clip's real cumulative offset to every caption inside it. */
  _canvasCaptionRanges?: { from: number; to: number }[];
  /** Scene-spec scripts only: set when this scene's `**Continue Board:**`
   * field is `true` — a signal to mergeTacticalContinuity.ts (src/script/)
   * that this scene's TacticalBoard `timeline` should be folded into the
   * immediately preceding scene's TacticalBoard as more timeline events
   * (one continuous camera/roster, never cutting) instead of becoming its
   * own segment. Consumed and never persisted past that merge step — a scene
   * that actually reaches rendering never has this set to true. */
  continuesBoardFrom?: boolean;
  /** Internal bookkeeping set by mergeTacticalContinuity.ts, consumed and
   * deleted by resolveSegmentAudio — never reaches the rendered sidecar
   * JSON. One `[from, to)` slice of `visual.timeline` (TacticalBoard only)
   * per `narrationClips` entry — every timeline event inside a range still
   * has its `startSeconds` relative to that sub-scene's own local zero;
   * resolveSegmentAudio adds that clip's real cumulative narration offset to
   * every event in its range once real TTS duration is known (mirrors
   * `_canvasCaptionRanges`'s role for Canvas captions). */
  _boardClipRanges?: { from: number; to: number }[];
  /** Scene-spec scripts only: set when this scene's `**Continue Diagram:**`
   * field is `true` — a signal to mergeDiagramContinuity.ts (src/script/)
   * that this scene's Diagram `timeline` should be folded into the
   * immediately preceding scene's Diagram (one persistent structure/canvas
   * that keeps building, never cutting) instead of becoming its own segment.
   * Consumed and never persisted past that merge step — a scene that
   * actually reaches rendering never has this set to true. */
  continuesDiagramFrom?: boolean;
  /** `**Continue Stage:** true` — folds this scene into the preceding Stage
   * passage so the entities persist across what would have been a cut. */
  continuesStageFrom?: boolean;
  /** `**Word Captions:** true` — burned-in karaoke captions, the word being
   * spoken lit while the rest of the line stays plain. Mutually exclusive with
   * `phases`: both render the same bottom-pinned chrome, so a segment picks one
   * caption treatment, never both. */
  wordCaptions?: boolean;
  /** The VIDEO-level visual strategy plan (see visualStrategy.ts), declared on
   * whichever scene carries the `Strategy Profile` field. */
  strategyProfile?: { primary: string; secondary: string[]; avoid: string[] };
  /** Internal bookkeeping set by mergeDiagramContinuity.ts, consumed and
   * deleted by resolveSegmentAudio — never reaches the rendered sidecar
   * JSON. One `[from, to)` slice of `visual.timeline` (Diagram only) per
   * `narrationClips` entry — every timeline event inside a range still has
   * its `startSeconds` relative to that sub-scene's own local zero;
   * resolveSegmentAudio adds that clip's real cumulative narration offset to
   * every event in its range once real TTS duration is known (mirrors
   * `_boardClipRanges`'s role for TacticalBoard). */
  _diagramClipRanges?: { from: number; to: number }[];
  /** Which timeline actions came from which narration clip, for a folded Stage
   * passage. Unlike `_diagramClipRanges`, each range also records the ESTIMATED
   * offset already applied to those actions at merge time, so the audio pass
   * corrects by the difference instead of shifting a second time — which is
   * what keeps a no-audio preview of a folded passage coherent. */
  _stageClipRanges?: { from: number; to: number; appliedOffsetSeconds: number }[];
  /** Scene-spec scripts only: parsed from optional `**Thesis:**`/
   * `**Entities:**`/`**Flow:**` fields (see src/script/sceneContract.ts) —
   * the author's DECLARED intent for what this scene demonstrates,
   * independent of whatever Canvas Data actually realizes it. Absent for
   * every scene that doesn't declare Entities/Flow (i.e. every script
   * written before this existed) — validateScene.ts reports "semantic
   * fidelity: not declared" for those rather than silently treating them as
   * passing. A `Scene Type: Flow` scene always has one (composeFlow.ts
   * derives its Canvas Data FROM this contract, so the two can't drift);
   * a `Scene Type: Canvas` scene may declare one purely for validation
   * against hand-authored Data. */
  contract?: SceneContract;
};
