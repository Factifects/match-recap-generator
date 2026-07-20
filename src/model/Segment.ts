import { z } from "zod";
import { VISUAL_DEFINITIONS } from "./visualDefinitions";

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
  /** Chapter beats only: a short whoosh layered under the swoosh-wipe transition. */
  sfxStaticPath?: string;
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
  panelColor?: "neutral" | "red" | "blue" | "yellow";
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
};
