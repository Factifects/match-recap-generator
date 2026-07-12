import { type TimedSegment, type Visual, type CameraStage, segmentSchema, visualSchema } from "../model/Segment";
import { resolvePattern, type PatternRole } from "../video/tacticalPatterns";
import { findAsset, findPersonArt } from "../video/assets";

const SCENE_MARKER = /^### SCENE \d+/;
const FIELD_LINE = /^\*\*([^*]+):\*\*\s*(.*)$/;
const DURATION_NUMBER = /(\d+(?:\.\d+)?)/;
const CAMERA_ARROW = /→|->/; // the "→" glyph used between multi-stage camera directives

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
 * script's scenes keep dissolving exactly as before. */
function resolveTransitionStyle(fields: SceneFields): TransitionStyle | undefined {
  const value = fields["Transition Style"]?.trim().toLowerCase();
  return value ? TRANSITION_STYLE_KEYS[value] : undefined;
}

function resolveTacticalBoardVisual(fields: SceneFields): Visual | null {
  // An explicit **Data:** JSON block always wins — needed for scenes where
  // Focus/Supporting Players don't cleanly name individual players (e.g. a
  // recap montage whose Focus is "Full pitch", a camera description, not a
  // person), so the template's name-substitution would mislabel a circle.
  const dataOverride = resolveDataVisual("tactical-board", fields);
  if (dataOverride) return dataOverride;

  const patternName = fields["Pattern"];
  if (!patternName || patternName.trim() === "—") return null;
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

  const players: { id: string; x: number; y: number; team: "home" | "away"; label: string }[] = [];
  (Object.keys(template.roles) as PatternRole[]).forEach((role) => {
    const name = roleNames[role];
    const roleTemplate = template.roles[role];
    if (!name || !roleTemplate) return;
    players.push({ id: role, x: roleTemplate.x, y: roleTemplate.y, team: roleTemplate.side, label: name });
  });
  if (players.length === 0) return null;

  const arrows = (template.arrows ?? [])
    .filter((arrow) => players.some((p) => p.id === arrow.from))
    .map((arrow) => ({ from: arrow.from, to: { x: arrow.toX, y: arrow.toY } }));

  const result = visualSchema.safeParse({
    kind: "tactical-board",
    title: stripQuotes(fields["Annotation"]) || patternName,
    players,
    arrows,
    highlightZone: template.highlightZone,
  });
  return result.success ? result.data : null;
}

const DATA_DRIVEN_KINDS: Record<string, string> = {
  formation: "formation",
  shotmap: "shot-map",
  playercomparison: "player-comparison",
  barchart: "barchart",
  goalsequence: "goal-sequence",
  momentumtimeline: "momentum-timeline",
  stat: "single-stat",
  statburst: "statburst",
  icon: "icon",
  zone: "zone",
  sequence: "sequence",
  donut: "shape",
  radar: "radar",
  verticaltacticalboard: "vertical-tactical-board",
  quote: "quote",
  leaguetable: "league-table",
  careerpath: "career-path",
  passnetwork: "pass-network",
  heatmap: "heat-map",
  analysis: "analysis",
};

/** Scene types other than TacticalBoard need real numeric/positional data
 * that free-text Narration/Focus/Pattern fields can't reliably provide (exact
 * shot coordinates, formation rosters, stat values). Rather than guess at
 * numbers, these require an explicit **Data:** JSON field (same convention as
 * parseAnalysisScript.ts's [TAG: {...json...}] tags) — a scene of a supported
 * type with no Data field falls back to a plain text scene (see
 * resolveVisual/parseSceneScript below), same graceful-degradation rule as
 * every other tag in this project.
 */
function resolveDataVisual(kind: string, fields: SceneFields): Visual | null {
  const dataRaw = fields["Data"];
  if (!dataRaw) return null;
  try {
    const parsed = JSON.parse(dataRaw);
    const result = visualSchema.safeParse({ kind, title: stripQuotes(fields["Annotation"]), ...parsed });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function resolveVisual(sceneType: string, fields: SceneFields): Visual | null {
  const type = sceneType.trim().toLowerCase();
  if (type === "tacticalboard") return resolveTacticalBoardVisual(fields);
  const kind = DATA_DRIVEN_KINDS[type.replace(/\s+/g, "")];
  if (!kind) return null;
  return resolveDataVisual(kind, fields);
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

/** A jersey image per side of a Formation scene, keyed by "home"/"away" —
 * only included when a real asset exists for that team, so a side with no
 * jersey art falls back to Formation's plain colored disc. */
function resolveJerseyImages(visual: Visual): Partial<Record<"home" | "away", string>> | undefined {
  if (visual.kind !== "formation") return undefined;
  const images: Partial<Record<"home" | "away", string>> = {};
  for (const side of visual.sides) {
    const jersey = findAsset("jerseys", side.team);
    if (jersey) images[side.side] = jersey;
  }
  return Object.keys(images).length > 0 ? images : undefined;
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
      segments.push({
        ...chapterResult.data,
        durationSeconds: chapterDurationSeconds,
        visualMinDurationSeconds: chapterDurationSeconds,
        transitionOut: parseTransitionOut(fields["Transition"]),
        transitionStyle: resolveTransitionStyle(fields),
        panelColor: resolvePanelColor(fields),
      });
      continue;
    }

    // Statement is the other odd one out: kinetic-typography text over the
    // Narration itself (StatementCard), with no Data/visual at all — for a
    // welcome/sign-off line that doesn't need a graphic. Previously
    // unreachable from this format entirely: resolveVisual has no case for
    // an unrecognized Scene Type other than returning null, and the main
    // path below skips (continue) any block whose visual doesn't resolve —
    // so a scene meant to fall back to plain text just vanished instead of
    // rendering. Special-cased the same way Chapter is, before that skip.
    if (sceneType.trim().toLowerCase() === "statement") {
      const statementResult = segmentSchema.safeParse({ type: "statement", text: narration, visual: undefined });
      if (!statementResult.success) continue;
      const statementDurationSeconds = parseDurationSeconds(fields["Duration"]);
      segments.push({
        ...statementResult.data,
        durationSeconds: statementDurationSeconds,
        visualMinDurationSeconds: statementDurationSeconds,
        transitionOut: parseTransitionOut(fields["Transition"]),
        transitionStyle: resolveTransitionStyle(fields),
        panelColor: resolvePanelColor(fields),
      });
      continue;
    }

    const visual = resolveVisual(sceneType, fields);
    if (!visual) continue; // unresolvable scene type/pattern for now — skip gracefully

    const result = segmentSchema.safeParse({ type: "statement", text: narration, visual });
    if (!result.success) continue;

    const focusPoint = resolveFocusPoint(fields, visual);
    const camera = parseCameraField(fields["Camera"], focusPoint, visual);

    const visualMinDurationSeconds = parseDurationSeconds(fields["Duration"]);
    segments.push({
      ...result.data,
      durationSeconds: visualMinDurationSeconds,
      visualMinDurationSeconds,
      camera,
      transitionOut: parseTransitionOut(fields["Transition"]),
      transitionStyle: resolveTransitionStyle(fields),
      backgroundImage: resolveBackgroundImage(visual, fields),
      backgroundImageMode: resolveBackgroundImageMode(fields),
      backgroundImageSide: resolveBackgroundImageSide(fields),
      panelColor: resolvePanelColor(fields),
      iconImage: resolveIconImage(visual),
      jerseyImages: resolveJerseyImages(visual),
    });
  }

  return segments;
}

export function isSceneScript(scriptText: string): boolean {
  return SCENE_MARKER.test(scriptText) || /^### SCENE \d+/m.test(scriptText);
}
