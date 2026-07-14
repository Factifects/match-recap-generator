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
  /** Set once ElevenLabs generation has run; absent means duration is still a word-count estimate. */
  audioStaticPath?: string;
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
};
