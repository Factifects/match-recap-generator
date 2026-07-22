import { type TimedSegment, type Visual, type CameraStage, segmentSchema, visualSchema } from "../model/Segment";
import { VISUAL_DEFINITIONS } from "../model/visualDefinitions";
import { resolvePattern, TACTICAL_PATTERNS, type PatternRole, type PatternRoleTemplate } from "../video/tacticalPatterns";
import { findAsset, findPersonArt } from "../video/assets";
import { PHASE_DURATION_FRAMES } from "../video/compositions/TacticalBoard";
import { CANVAS_PHASE_DURATION_FRAMES } from "../video/compositions/Canvas";
import { CANVAS3D_PHASE_DURATION_FRAMES } from "../video/compositions/Canvas3D";
import { FPS } from "../video/theme";

const SCENE_MARKER = /^### SCENE \d+/;
const FIELD_LINE = /^\*\*([^*]+):\*\*\s*(.*)$/;
const DURATION_NUMBER = /(\d+(?:\.\d+)?)/;
const CAMERA_ARROW = /→|->/; // the "→" glyph used between multi-stage camera directives

// The floor `resolveSegmentAudio` applies on top of real narration audio —
// deliberately small, just enough for a static visual's entrance animation
// to finish (see motion.ts: most fade/slide/scale-settle entrances resolve
// inside 16-24 frames, well under a second at 30fps). Previously this floor
// came from the authored `Duration` field, a hand-written narration-length
// guess that's reliably longer than real ElevenLabs speech — every scene
// held on screen in silence until that guess's clock ran out, regardless of
// how long the narrator actually took. `Duration` still drives the
// no-`--audio` estimate render (parseDurationSeconds below); it no longer
// floors real audio.
const MIN_REAL_AUDIO_FLOOR_SECONDS = 2;

// Held on screen after a `timeline`-authored tactical-board scene's last
// action ends — enough for that action's own settle/idle-glow to read
// before the scene cuts, same purpose as MIN_REAL_AUDIO_FLOOR_SECONDS above
// but sized for "one beat just finished," not "a static visual just entered."
const TIMELINE_SETTLE_BUFFER_SECONDS = 1;

/** Only a visual with genuine multi-beat choreography earns a floor above
 * the bare minimum — right now that's a multi-phase TacticalBoard or Canvas,
 * each of whose phases hold the screen for a fixed per-phase frame count so a
 * real breakdown legitimately runs long because it has real content, not
 * because of an inflated word-count guess. */
export function computeVisualMinDurationSeconds(visual: Visual | undefined): number {
  // A `timeline`-authored board's real choreographed length is knowable
  // directly from its own authored timing — a genuinely better floor than
  // guessing from phase count, since it reflects exactly how much action was
  // actually authored rather than a per-phase constant. `state` actions have
  // no `durationSeconds` (they're instantaneous), so they contribute just
  // their own `startSeconds` as an end point.
  if (visual?.kind === "tactical-board" && visual.timeline && visual.timeline.length > 0) {
    const lastEndSeconds = Math.max(
      ...visual.timeline.map((action) => (action.type === "state" ? action.startSeconds : action.startSeconds + action.durationSeconds)),
    );
    return lastEndSeconds + TIMELINE_SETTLE_BUFFER_SECONDS;
  }
  if (visual?.kind === "tactical-board" && visual.phases && visual.phases.length > 0) {
    const phaseCount = 1 + visual.phases.length;
    return (phaseCount * PHASE_DURATION_FRAMES) / FPS;
  }
  if (visual?.kind === "canvas" && visual.phases && visual.phases.length > 0) {
    const phaseCount = 1 + visual.phases.length;
    return (phaseCount * CANVAS_PHASE_DURATION_FRAMES) / FPS;
  }
  if (visual?.kind === "canvas-3d" && visual.phases && visual.phases.length > 0) {
    const phaseCount = 1 + visual.phases.length;
    return (phaseCount * CANVAS3D_PHASE_DURATION_FRAMES) / FPS;
  }
  return MIN_REAL_AUDIO_FLOOR_SECONDS;
}

interface SceneFields {
  [field: string]: string;
}

function splitIntoBlocks(scriptText: string): string[] {
  const lines = scriptText.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (SCENE_MARKER.test(line.trim())) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function extractFields(block: string): SceneFields {
  const lines = block.split(/\r?\n/);
  const fields: SceneFields = {};
  let currentField: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentField) fields[currentField] = buffer.join(" ").trim();
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line === "---") continue;
    const match = line.match(FIELD_LINE);
    if (match) {
      flush();
      currentField = match[1].trim();
      if (match[2]) buffer.push(match[2].trim());
      continue;
    }
    if (currentField) buffer.push(line);
  }
  flush();
  return fields;
}

function stripQuotes(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/^["“]|["”]$/g, "").trim();
}

function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 5;
  const match = value.match(DURATION_NUMBER);
  return match ? Number(match[1]) : 5;
}

function parseTransitionOut(value: string | undefined): "cut" | "dissolve" {
  return value?.toLowerCase().includes("hard cut") ? "cut" : "dissolve";
}

type TransitionStyle = "fade" | "zoom-in" | "zoom-out" | "slide-left" | "slide-right" | "slide-up" | "slide-down";
const TRANSITION_STYLE_KEYS: Record<string, TransitionStyle> = {
  fade: "fade",
  "zoom in": "zoom-in",
  "zoom out": "zoom-out",
  "slide left": "slide-left",
  "slide right": "slide-right",
  "slide up": "slide-up",
  "slide down": "slide-down",
};

/** An optional **Transition Style:** field — independent of Transition
 * (Hard Cut/Cross Dissolve/Fade to Black), which still controls timing only.
 * Undefined falls back to "fade" in AnalysisVideo.tsx, so every existing
 * script's scenes keep dissolving exactly as before. Falls back to the
 * matching Story Beat default (see STORY_BEAT_TRANSITION_DEFAULTS) when no
 * explicit Transition Style is set but a Story Beat is — an explicit field
 * always wins over the beat-derived default. */
function resolveTransitionStyle(fields: SceneFields, storyBeat: StoryBeat | undefined): TransitionStyle | undefined {
  const value = fields["Transition Style"]?.trim().toLowerCase();
  if (value && TRANSITION_STYLE_KEYS[value]) return TRANSITION_STYLE_KEYS[value];
  return storyBeat ? STORY_BEAT_TRANSITION_DEFAULTS[storyBeat] : undefined;
}

type StoryBeat = "reveal" | "comparison" | "evidence" | "escalation" | "explanation" | "payoff" | "reflection" | "question";
const STORY_BEAT_KEYS: Record<string, StoryBeat> = {
  reveal: "reveal",
  comparison: "comparison",
  evidence: "evidence",
  escalation: "escalation",
  explanation: "explanation",
  payoff: "payoff",
  reflection: "reflection",
  question: "question",
};

// Each beat's own narrative shape suggests a default presentation — a Reveal
// wants something appearing suddenly closer, a Comparison wants the
// side-by-side motion of a slide, evidence lands hardest with a settling
// pull-back, escalation rises, and the calmer beats (Explanation/Reflection/
// Question) default to a plain fade rather than fighting for attention.
// Purely a default: an explicit **Transition Style:** field always overrides it.
const STORY_BEAT_TRANSITION_DEFAULTS: Record<StoryBeat, TransitionStyle> = {
  reveal: "zoom-in",
  comparison: "slide-left",
  evidence: "zoom-out",
  escalation: "slide-up",
  explanation: "fade",
  payoff: "zoom-in",
  reflection: "fade",
  question: "fade",
};

/** An optional **Story Beat:** field — authoring metadata for the scene's
 * narrative function (see STORY_BEAT_TRANSITION_DEFAULTS). Undefined leaves
 * transitionStyle entirely up to the explicit Transition Style field (or the
 * "fade" fallback), so a script that never sets Story Beat is unaffected. */
function resolveStoryBeat(fields: SceneFields): StoryBeat | undefined {
  const value = fields["Story Beat"]?.trim().toLowerCase();
  return value ? STORY_BEAT_KEYS[value] : undefined;
}

// Sorted longest-key-first so a more specific multi-word pattern name (e.g.
// "half-space overload") matches before a shorter one it happens to contain
// ("half-space") — first match in this order wins.
const TACTICAL_PATTERN_NAMES_BY_LENGTH = Object.keys(TACTICAL_PATTERNS).sort((a, b) => b.length - a.length);

/** The parser doesn't require an explicit **Pattern:** field — if the author
 * simply writes the tactical concept into the Narration itself ("Hakimi
 * overlaps down the right"), any TACTICAL_PATTERNS key appearing as a
 * substring of the Narration text (case-insensitive) is picked automatically.
 * An explicit Pattern field always wins when both are present; this only
 * fires when Pattern is absent, so no existing script's pattern choice can
 * be silently overridden by a coincidental word match in its own prose. */
function detectPatternFromNarration(narration: string | undefined): string | null {
  if (!narration) return null;
  const lower = narration.toLowerCase();
  return TACTICAL_PATTERN_NAMES_BY_LENGTH.find((name) => lower.includes(name)) ?? null;
}

/** Builds one phase's (or phase 0's) resolved player list from a pattern's
 * role templates and the script's real Focus/Supporting Players names —
 * shared by phase 0 and every entry in a multi-phase pattern's `phases`,
 * since a later phase re-uses the SAME role->name mapping (the same person
 * plays "focus" in every phase, only their x/y changes). A role missing from
 * `roles` (common in a later phase that only re-arranges some of the cast)
 * simply isn't included, matching TacticalBoard.tsx's own "phases don't have
 * to repeat everyone" behavior for hand-authored Data phases. */
function buildRolePlayers(
  roles: Partial<Record<PatternRole, PatternRoleTemplate>>,
  roleNames: Partial<Record<PatternRole, string>>,
): { id: string; x: number; y: number; team: "home" | "away"; label: string }[] {
  const players: { id: string; x: number; y: number; team: "home" | "away"; label: string }[] = [];
  (Object.keys(roles) as PatternRole[]).forEach((role) => {
    const name = roleNames[role];
    const roleTemplate = roles[role];
    if (!name || !roleTemplate) return;
    players.push({ id: role, x: roleTemplate.x, y: roleTemplate.y, team: roleTemplate.side, label: name });
  });
  return players;
}

function buildRoleArrows(
  arrows: { from: PatternRole; toX: number; toY: number; kind?: "run" | "pass" }[] | undefined,
  players: { id: string }[],
) {
  return (arrows ?? [])
    .filter((arrow) => players.some((p) => p.id === arrow.from))
    .map((arrow) => ({ from: arrow.from, to: { x: arrow.toX, y: arrow.toY }, kind: arrow.kind ?? "run" }));
}

function resolveTacticalBoardVisual(fields: SceneFields): Visual | null {
  // An explicit **Data:** JSON block always wins — needed for scenes where
  // Focus/Supporting Players don't cleanly name individual players (e.g. a
  // recap montage whose Focus is "Full pitch", a camera description, not a
  // person), so the template's name-substitution would mislabel a circle.
  const dataOverride = resolveDataVisual("tactical-board", fields);
  if (dataOverride) return dataOverride;

  const explicitPatternName = fields["Pattern"]?.trim();
  const patternName =
    explicitPatternName && explicitPatternName !== "—" ? explicitPatternName : detectPatternFromNarration(fields["Narration"]);
  if (!patternName) return null;
  const template = resolvePattern(patternName);
  if (!template) return null;

  const focusName = fields["Focus"]?.trim();
  if (!focusName) return null;
  const supportingNames = (fields["Supporting Players"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "—");

  const roleNames: Partial<Record<PatternRole, string>> = { focus: focusName };
  if (supportingNames[0]) roleNames.supporting = supportingNames[0];
  if (supportingNames[1]) roleNames.supporting2 = supportingNames[1];
  // supporting3 is reserved for a guaranteed-visible opposition marker (see
  // "half-space overload") — unlike supporting/supporting2, a pattern that
  // defines it always gets a label, even if the script doesn't name a third
  // player, so an opposition-requiring pattern can't silently ship without one.
  if (template.roles.supporting3) roleNames.supporting3 = supportingNames[2] || "Defender";

  const players = buildRolePlayers(template.roles, roleNames);
  if (players.length === 0) return null;

  const arrows = buildRoleArrows(template.arrows, players);

  // A pattern's own `phases` (see "switch of play"/"counter press") become
  // real follow-on beats, exactly like a hand-authored Data block's `phases`
  // — same role->name substitution as phase 0, just re-arranged per phase.
  const phases = (template.phases ?? [])
    .map((phase) => {
      const phasePlayers = buildRolePlayers(phase.roles, roleNames);
      if (phasePlayers.length === 0) return null;
      return {
        players: phasePlayers,
        arrows: buildRoleArrows(phase.arrows, phasePlayers),
        highlightZone: phase.highlightZone,
        caption: phase.caption,
        dataPoint: phase.dataPoint,
      };
    })
    .filter((phase): phase is NonNullable<typeof phase> => phase !== null);

  const result = visualSchema.safeParse({
    kind: "tactical-board",
    title: stripQuotes(fields["Annotation"]) || patternName,
    players,
    arrows,
    highlightZone: template.highlightZone,
    phases: phases.length > 0 ? phases : undefined,
  });
  return result.success ? result.data : null;
}

/** Scene types other than TacticalBoard need real numeric/positional data
 * that free-text Narration/Focus/Pattern fields can't reliably provide (exact
 * shot coordinates, formation rosters, stat values). Rather than guess at
 * numbers, these require an explicit **Data:** JSON field (same convention as
 * parseAnalysisScript.ts's [TAG: {...json...}] tags) — a scene of a supported
 * type with no Data field falls back to a plain text scene (see
 * resolveVisual/parseSceneScript below), same graceful-degradation rule as
 * every other tag in this project.
 */
// A malformed **Data:** block (bad JSON, or JSON that fails the visual's own
// Zod schema — an invalid enum value, a missing required field) used to fail
// completely silently: the scene would just fall back to a plain caption
// card with no visual, and the only way to notice was to actually render the
// scene and see a boring text screen where a diagram should be. Logging here
// means that shows up immediately as a build-time warning instead of a
// render-time surprise discovered scene-by-scene.
function resolveDataVisual(kind: string, fields: SceneFields): Visual | null {
  const dataRaw = fields["Data"];
  if (!dataRaw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataRaw);
  } catch (err) {
    console.warn(`[parseSceneScript] Scene "${fields["Annotation"] ?? kind}": Data block is not valid JSON — falling back to a plain caption. ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const result = visualSchema.safeParse({ kind, title: stripQuotes(fields["Annotation"]), ...(parsed as Record<string, unknown>) });
  if (!result.success) {
    console.warn(
      `[parseSceneScript] Scene "${fields["Annotation"] ?? kind}" (${kind}): Data block failed validation — falling back to a plain caption.\n${result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
    );
    return null;
  }
  return result.data;
}

/** Looks up a "Scene Type:" string against the visual registry's
 * `sceneTypeKey` instead of a hand-maintained kind-name dictionary — adding
 * a 22nd visual type needs no edit here, just one new entry in
 * src/model/visualDefinitions.ts. */
function resolveVisual(sceneType: string, fields: SceneFields): Visual | null {
  const type = sceneType.trim().toLowerCase().replace(/\s+/g, "");
  if (type === "tacticalboard") return resolveTacticalBoardVisual(fields);
  const definition = VISUAL_DEFINITIONS.find((def) => def.sceneTypeKey === type);
  if (!definition) return null;
  return resolveDataVisual(definition.kind, fields);
}

/** Average position of a set of players — used as a camera anchor when a
 * Data-based TacticalBoard has no `id: "focus"` player (that id only exists
 * on Pattern-based scenes) and no player name appears in the Camera phrase
 * itself. A hardcoded midfield point (the previous behavior) frames whatever
 * empty stretch of pitch happens to sit at x=50 when the real action is
 * somewhere else entirely — the centroid at least starts the camera
 * somewhere near the actual players. */
function centroidOf(players: { x: number; y: number }[]): { x: number; y: number } | null {
  if (players.length === 0) return null;
  const x = players.reduce((sum, p) => sum + p.x, 0) / players.length;
  const y = players.reduce((sum, p) => sum + p.y, 0) / players.length;
  return { x, y };
}

/** A player name mentioned directly in a Camera phrase (e.g. "Follow Gordon")
 * takes priority over every other focus-point heuristic — it's the one case
 * where the script author named an exact target, so guessing (a fixed
 * midfield point, a generic centroid) would be actively worse than just
 * reading the phrase. Matches tactical-board's players by label, case-
 * insensitively substring-matched since scripts write full names ("Gordon")
 * against a phrase like "Follow Gordon". */
function resolveNamedCameraTarget(phrase: string, visual: Visual | null): { x: number; y: number } | null {
  if (visual?.kind !== "tactical-board") return null;
  const p = phrase.toLowerCase();
  for (const player of visual.players) {
    if (player.label && p.includes(player.label.toLowerCase())) {
      return { x: player.x, y: player.y };
    }
  }
  return null;
}

function resolveFocusPoint(fields: SceneFields, visual: Visual | null): { x: number; y: number } | null {
  if (visual?.kind === "tactical-board") {
    const focusPlayer = visual.players.find((p) => p.id === "focus");
    if (focusPlayer) return { x: focusPlayer.x, y: focusPlayer.y };
    return centroidOf(visual.players);
  }
  if (visual?.kind === "goal-sequence") {
    // The midpoint of shooter -> target, not just the target — a camera
    // centered purely on the goal-mouth point pushed the shooter (often a
    // real distance away) entirely out of a tightly-zoomed frame, showing a
    // keeper and a floating ball with no sense of who actually took the shot.
    return { x: (visual.from.x + visual.to.x) / 2, y: (visual.from.y + visual.to.y) / 2 };
  }
  return null;
}

function parseCameraStage(phrase: string, focusPoint: { x: number; y: number } | null, visual: Visual | null): CameraStage {
  const p = phrase.toLowerCase();
  // A name in the phrase itself ("Follow Gordon") is a script author pointing
  // at an exact target — that overrides every keyword-driven guess below,
  // including "left half"/"box"/generic "follow", all of which otherwise
  // fall back to a much coarser focusPoint (or nothing at all).
  const namedTarget = resolveNamedCameraTarget(phrase, visual);
  if (p.includes("wide") || p.includes("full pitch") || p.includes("full box") || p.includes("zoom out")) {
    return { focus: "full", zoom: 1 };
  }
  // "Left/right half" means the wing the actual scene content sits on, at
  // whatever depth (x) the scene's focus player is at — not a fixed midfield
  // x, which would frame an empty stretch of pitch next to the real action.
  if (p.includes("left half")) return { focus: namedTarget ?? { x: focusPoint?.x ?? 50, y: 25 }, zoom: 1.6 };
  if (p.includes("right half")) return { focus: namedTarget ?? { x: focusPoint?.x ?? 50, y: 75 }, zoom: 1.6 };
  if (p.includes("central channel")) return { focus: namedTarget ?? { x: 50, y: 50 }, zoom: 1.6 };
  // "Goal line" framing tends to focus a point right at the pitch's own edge
  // (x=100, the goal itself) — zooming as tight as a mid-pitch close-up would
  // push half the frame past the boundary into empty space, so it gets a
  // gentler zoom to keep some pitch visible around the shot.
  if (p.includes("goal line")) return { focus: namedTarget ?? focusPoint ?? "box-right", zoom: 1.5 };
  // Was 2.2 — tight enough that a shooter/keeper pair (or a player and the
  // focus point they're a real distance from) could end up entirely outside
  // the clipped frame. 1.7 keeps a "close" feel while leaving enough margin
  // that both ends of a shot or duel stay visible.
  if (p.includes("box") || p.includes("close-up") || p.includes("close tactical")) {
    return { focus: namedTarget ?? focusPoint ?? "box-right", zoom: 1.7 };
  }
  if (p.includes("follow") || p.includes("pan")) {
    return { focus: namedTarget ?? focusPoint ?? "full", zoom: p.includes("follow") ? 1.8 : 1.4 };
  }
  return { focus: "full", zoom: 1 };
}

function parseCameraField(value: string | undefined, focusPoint: { x: number; y: number } | null, visual: Visual | null): CameraStage[] {
  if (!value) return [{ focus: "full", zoom: 1 }];
  const stages = value
    .split(CAMERA_ARROW)
    .map((s) => s.trim())
    .filter(Boolean);
  if (stages.length === 0) return [{ focus: "full", zoom: 1 }];
  return stages.map((stage) => parseCameraStage(stage, focusPoint, visual));
}

const SUBJECT_KINDS = new Set(["player", "manager", "fans"]);

/** Faded background photo/silhouette/flag for whichever scene has an obvious
 * single subject — only resolved when a real asset exists (see
 * src/video/assets.ts), so most scenes simply get none.
 *
 * An explicit **Subject:** field always wins, for scene types with no single
 * named player baked into their Data shape (Icon, Stat, Sequence, etc.) —
 * everything else falls back to inferring one from the visual's own shape,
 * same as before. **Subject Kind:** (player/manager/fans, defaults to player)
 * picks which generic silhouette a Subject without a real photo falls back
 * to — a manager story with no photo yet should get the suited silhouette,
 * not the running-player one. */
function resolveBackgroundImage(visual: Visual, fields: SceneFields): string | undefined {
  const explicitSubject = fields["Subject"]?.trim();
  if (explicitSubject) {
    const kindField = fields["Subject Kind"]?.trim().toLowerCase();
    const kind = (SUBJECT_KINDS.has(kindField ?? "") ? kindField : "player") as "player" | "manager" | "fans";
    const art = findPersonArt(explicitSubject, kind);
    if (art) return art;
  }
  if (visual.kind === "tactical-board") {
    const focusPlayer = visual.players.find((p) => p.id === "focus") ?? visual.players[0];
    return focusPlayer ? findPersonArt(focusPlayer.label) : undefined;
  }
  if (visual.kind === "goal-sequence") {
    return findPersonArt(visual.shooter);
  }
  if (visual.kind === "formation") {
    const team = visual.sides[0]?.team;
    return team ? (findAsset("flags", team) ?? findAsset("badges", team)) : undefined;
  }
  return undefined;
}

/** "Featured" (clear, full-color, larger) vs "faded" (low-contrast
 * set-dressing) — an explicit **Image Style:** field picks it, defaulting to
 * "faded" so every existing script's scenes keep rendering exactly as
 * before. */
function resolveBackgroundImageMode(fields: SceneFields): "faded" | "featured" {
  return fields["Image Style"]?.trim().toLowerCase() === "featured" ? "featured" : "faded";
}

const IMAGE_SIDE_KEYS = new Set(["left", "right", "center"]);

/** An optional **Image Side:** field — undefined falls back to BackgroundArt's
 * own default ("right"), so every existing script is unaffected. */
function resolveBackgroundImageSide(fields: SceneFields): "left" | "right" | "center" | undefined {
  const value = fields["Image Side"]?.trim().toLowerCase();
  return value && IMAGE_SIDE_KEYS.has(value) ? (value as "left" | "right" | "center") : undefined;
}

/** A real image for an Icon scene's icon key, if the user has supplied one in
 * public/assets/icons/ — falls back to nothing, meaning the card keeps using
 * its built-in hand-drawn stroke icon. */
function resolveIconImage(visual: Visual): string | undefined {
  if (visual.kind !== "icon") return undefined;
  return findAsset("icons", visual.icon);
}

const PANEL_COLOR_KEYS = new Set(["neutral", "red", "blue", "yellow"]);

/** An optional bold background color-block, any Scene Type — defaults to
 * "neutral" (today's exact background) when the field is absent or doesn't
 * match one of the known keys, so no existing script is affected. */
function resolvePanelColor(fields: SceneFields): "neutral" | "red" | "blue" | "yellow" | undefined {
  const value = fields["Panel Color"]?.trim().toLowerCase();
  return value && PANEL_COLOR_KEYS.has(value) ? (value as "neutral" | "red" | "blue" | "yellow") : undefined;
}

/** An optional **Continue Canvas:** true field, set on the scene AFTER the
 * one it should visually continue from — a signal to mergeCanvasContinuity.ts
 * (run as a post-parse pass in generate.ts) that this scene's Canvas visual
 * should be folded into the immediately preceding scene's Canvas as more
 * phases, so the camera glides/pans into it instead of cutting/dissolving.
 * Absent or any other value means today's behavior: this scene renders as its
 * own independent segment, unaffected. Only meaningful when both this scene
 * and its predecessor are `Scene Type: Canvas` — mergeCanvasContinuity.ts is
 * responsible for that check, not this parser. */
function resolveContinueCanvas(fields: SceneFields): true | undefined {
  return fields["Continue Canvas"]?.trim().toLowerCase() === "true" ? true : undefined;
}

/** An optional **Continue Board:** true field — same convention as
 * **Continue Canvas:** above, but for TacticalBoard's evented `timeline`
 * instead of Canvas's `phases`. Consumed by mergeTacticalContinuity.ts (run
 * as a post-parse pass in generate.ts); a scene isn't required to be
 * `Scene Type: TacticalBoard` at parse time for this field to be set (same
 * graceful-degradation posture as Continue Canvas — mergeTacticalContinuity.ts
 * is responsible for checking that, not this parser). */
function resolveContinueBoard(fields: SceneFields): true | undefined {
  return fields["Continue Board"]?.trim().toLowerCase() === "true" ? true : undefined;
}

const BOARD_POSITION_KEYS = new Set(["left", "right", "center"]);

/** An optional **Board Position:** field, TacticalBoard/Formation only —
 * undefined falls back to those cards' own default ("center"), so every
 * existing script renders exactly as before. */
function resolveBoardPosition(visual: Visual, fields: SceneFields): "left" | "right" | "center" | undefined {
  if (visual.kind !== "tactical-board" && visual.kind !== "formation") return undefined;
  const value = fields["Board Position"]?.trim().toLowerCase();
  return value && BOARD_POSITION_KEYS.has(value) ? (value as "left" | "right" | "center") : undefined;
}

/** An optional **Animation:** field — cross-visual reveal control (stagger
 * timing, reveal order, a gentle pulse) parsed as JSON, same convention as
 * **Data:**. Currently only Grid/BarChart read the result; every other
 * visual kind simply ignores it. This field previously existed as free
 * prose that was never read anywhere, so this parse is wrapped in try/catch:
 * any existing script's prose-style Animation value just fails to parse and
 * returns undefined, identical to today's behavior. */
function resolveAnimation(
  fields: SceneFields,
): { staggerSeconds?: number; focusOrder?: number[]; pulse?: boolean } | undefined {
  const raw = fields["Animation"];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { staggerSeconds, focusOrder, pulse } = parsed as Record<string, unknown>;
    return {
      staggerSeconds: typeof staggerSeconds === "number" ? staggerSeconds : undefined,
      focusOrder: Array.isArray(focusOrder) && focusOrder.every((n) => typeof n === "number") ? focusOrder : undefined,
      pulse: typeof pulse === "boolean" ? pulse : undefined,
    };
  } catch {
    return undefined;
  }
}

/** An optional **Phases:** field — an independent sequence of on-screen
 * captions playing over the scene's own duration, parsed as a JSON array.
 * Works identically across every visual kind since it renders as a shared
 * overlay, not per-card. Does not collide with TacticalBoard's own nested
 * `Data.phases` JSON property — different field, different scope, different
 * meaning (player-position choreography vs. caption sequencing). */
function resolvePhases(fields: SceneFields): { caption: string; startSeconds?: number }[] | undefined {
  const raw = fields["Phases"];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const phases = parsed
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && typeof p.caption === "string")
      .map((p) => ({
        caption: p.caption as string,
        startSeconds: typeof p.startSeconds === "number" ? p.startSeconds : undefined,
      }));
    return phases.length > 0 ? phases : undefined;
  } catch {
    return undefined;
  }
}

/** A jersey image per side of a Formation/Formation 3D scene, keyed by
 * "home"/"away" — only included when a real asset exists for that team.
 * Formation.tsx falls back to its plain colored disc/RolePod when absent;
 * Formation3D.tsx falls back to DEFAULT_JERSEY_3D (a jersey either way, just
 * not this specific team's) since that 3D family always shows a jersey. */
function resolveJerseyImages(visual: Visual): Partial<Record<"home" | "away", string>> | undefined {
  if (visual.kind !== "formation" && visual.kind !== "formation-3d") return undefined;
  const images: Partial<Record<"home" | "away", string>> = {};
  for (const side of visual.sides) {
    const jersey = findAsset("jerseys", side.team);
    if (jersey) images[side.side] = jersey;
  }
  return Object.keys(images).length > 0 ? images : undefined;
}

/** Shared by the Statement Scene Type and by the graceful-degradation
 * fallback when some other Scene Type's visual fails to resolve — plain
 * kinetic-typography text over Narration, no Data/visual required. Returns
 * null only if `narration` itself is somehow empty (segmentSchema requires
 * non-empty text), which can't happen given the `!narration` guard already
 * run before either caller. */
function buildStatementFallback(fields: SceneFields, narration: string): TimedSegment | null {
  const result = segmentSchema.safeParse({ type: "statement", text: narration, visual: undefined });
  if (!result.success) return null;
  const durationSeconds = parseDurationSeconds(fields["Duration"]);
  const storyBeat = resolveStoryBeat(fields);
  return {
    ...result.data,
    durationSeconds,
    visualMinDurationSeconds: MIN_REAL_AUDIO_FLOOR_SECONDS,
    transitionOut: parseTransitionOut(fields["Transition"]),
    transitionStyle: resolveTransitionStyle(fields, storyBeat),
    storyBeat,
    panelColor: resolvePanelColor(fields),
  };
}

/**
 * Parses the "Scene Specification Script" format (### SCENE N blocks with
 * **Field:** labels) into TimedSegment[]. Every scene always carries a
 * visual — that's the point of this format, unlike parseAnalysisScript.ts's
 * prose-plus-optional-tags model. Narration still drives real audio
 * duration; a scene's stated Duration becomes a minimum instead (see
 * resolveSegmentAudio), never a substitute for real speech length.
 */
export function parseSceneScript(scriptText: string): TimedSegment[] {
  const blocks = splitIntoBlocks(scriptText);
  const segments: TimedSegment[] = [];

  for (const block of blocks) {
    const fields = extractFields(block);
    const narration = fields["Narration"];
    const sceneType = fields["Scene Type"];
    if (!narration || !sceneType) continue;

    // Chapter is the odd one out: a section-divider swoosh card (see
    // ChapterCard.tsx), not a visual overlaid on narration. Keep its
    // on-screen title SHORT (Annotation) — it's rendered at giant size with
    // no wrapping — while Narration can still be a full sentence read aloud
    // under it, exactly like every other scene type's audio.
    if (sceneType.trim().toLowerCase() === "chapter") {
      const chapterResult = segmentSchema.safeParse({ type: "chapter", text: stripQuotes(fields["Annotation"]) || narration });
      if (!chapterResult.success) continue;
      const chapterDurationSeconds = parseDurationSeconds(fields["Duration"]);
      const chapterStoryBeat = resolveStoryBeat(fields);
      segments.push({
        ...chapterResult.data,
        durationSeconds: chapterDurationSeconds,
        visualMinDurationSeconds: MIN_REAL_AUDIO_FLOOR_SECONDS,
        transitionOut: parseTransitionOut(fields["Transition"]),
        transitionStyle: resolveTransitionStyle(fields, chapterStoryBeat),
        storyBeat: chapterStoryBeat,
        panelColor: resolvePanelColor(fields),
        narrationText: narration,
      });
      continue;
    }

    // Statement is the other odd one out: kinetic-typography text over the
    // Narration itself (StatementCard), with no Data/visual at all — for a
    // welcome/sign-off line that doesn't need a graphic.
    if (sceneType.trim().toLowerCase() === "statement") {
      const statementSegment = buildStatementFallback(fields, narration);
      if (statementSegment) segments.push(statementSegment);
      continue;
    }

    const visual = resolveVisual(sceneType, fields);
    if (!visual) {
      // A Scene Type that doesn't resolve (unrecognized type, or a
      // recognized one whose **Data:** field is missing/invalid/mismatched
      // for that visual's schema) previously dropped the ENTIRE scene here
      // — not just its visual, but its narration and duration too, with no
      // indication anything was wrong. Fall back to a plain Statement
      // instead, same principle as Statement's own special case above: a
      // scene should still speak its line rather than vanish silently.
      const fallbackSegment = buildStatementFallback(fields, narration);
      if (fallbackSegment) segments.push(fallbackSegment);
      continue;
    }

    const result = segmentSchema.safeParse({ type: "statement", text: narration, visual });
    if (!result.success) continue;

    const focusPoint = resolveFocusPoint(fields, visual);
    const camera = parseCameraField(fields["Camera"], focusPoint, visual);

    const estimatedDurationSeconds = parseDurationSeconds(fields["Duration"]);
    const storyBeat = resolveStoryBeat(fields);
    segments.push({
      ...result.data,
      durationSeconds: estimatedDurationSeconds,
      visualMinDurationSeconds: computeVisualMinDurationSeconds(visual),
      camera,
      transitionOut: parseTransitionOut(fields["Transition"]),
      transitionStyle: resolveTransitionStyle(fields, storyBeat),
      storyBeat,
      backgroundImage: resolveBackgroundImage(visual, fields),
      backgroundImageMode: resolveBackgroundImageMode(fields),
      backgroundImageSide: resolveBackgroundImageSide(fields),
      panelColor: resolvePanelColor(fields),
      iconImage: resolveIconImage(visual),
      jerseyImages: resolveJerseyImages(visual),
      boardPosition: resolveBoardPosition(visual, fields),
      animation: resolveAnimation(fields),
      phases: resolvePhases(fields),
      continuesCanvasFrom: resolveContinueCanvas(fields),
      continuesBoardFrom: resolveContinueBoard(fields),
    });
  }

  return segments;
}

export function isSceneScript(scriptText: string): boolean {
  return SCENE_MARKER.test(scriptText) || /^### SCENE \d+/m.test(scriptText);
}
