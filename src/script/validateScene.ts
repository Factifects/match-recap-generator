import type { TimedSegment, Visual } from "../model/Segment";
import type { RepresentationNeed } from "./beatPlan";
import type { CanvasData } from "../video/sharedVisualProps";
import type { ContractEdge, SceneContract } from "./sceneContract";
import { resolveObjectPosition } from "../video/canvasLayout";
import { classifySceneMotion } from "./actionClassifier";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";
import { diagnostic, type SceneDiagnostic } from "./sceneDiagnostics";

// The levels 3 (animation richness) and 4 (semantic fidelity) checks —
// validateGeometry.ts owns levels 1-2 (overlap/composition). This is
// deliberately a SEPARATE pass from validateGeometry.ts's auto-fix loop:
// nothing here rewrites a segment, it only reads and reports, and (unlike
// validateGeometry.ts) most of it needs the segment's real effective
// duration, which is only meaningful once resolveSegmentAudio has run —
// see generate.ts's two call sites (an early estimate-based pass right
// after parsing, and an authoritative one after real narration audio
// resolves).

type CanvasTimelineActionT = NonNullable<CanvasData["timeline"]>[number];

function effectiveDurationOf(segment: TimedSegment): number {
  return Math.max(segment.durationSeconds, segment.visualMinDurationSeconds ?? 0);
}

// A scene whose authored motion ends more than this many seconds before its
// real on-screen time is a static hold — the "one dot moves, then nothing"
// failure mode from the very first version of this fix.
const DEAD_TIME_SOFT_THRESHOLD_SECONDS = 4;
// Zero explanatory events is only a HARD failure once the scene is long
// enough that "nothing demonstrates anything" is unambiguous — a short (<8s)
// beat that's just an entrance is a plausible establishing shot, not a
// failure on its own (see checkUnconnectedEntities in validateGeometry.ts
// for the stronger, always-hard combination: zero explanatory motion AND
// zero connections, regardless of duration).
const ZERO_RICHNESS_HARD_THRESHOLD_SECONDS = 8;

function checkDeadTimeAndRichness(visual: CanvasData, sceneIndex: number, effectiveDuration: number, diagnostics: SceneDiagnostic[]): void {
  const hasTimeline = !!visual.timeline && visual.timeline.length > 0;
  const hasPhases = !!visual.phases && visual.phases.length > 0;
  if (!hasTimeline && !hasPhases) return; // a fully static Data block — validateGeometry's checkUnconnectedEntities/checkLowVisualDensity already cover this shape

  const authoredEnd = computeVisualMinDurationSeconds(visual);
  const deadTime = effectiveDuration - authoredEnd;
  if (deadTime > DEAD_TIME_SOFT_THRESHOLD_SECONDS) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "soft",
        "dead-time",
        `Scene ${sceneIndex + 1}: animation finishes ~${authoredEnd.toFixed(1)}s into a ${effectiveDuration.toFixed(1)}s scene — about ${deadTime.toFixed(1)}s of static hold. Consider extending the timeline or trimming the scene.`,
      ),
    );
  }

  // `phases` (legacy) has no per-action classifier equivalent — see the
  // matching comment in validateGeometry.ts's checkUnconnectedEntities.
  // Reporting richness only for `timeline` scenes is deliberate, not an
  // oversight: every script written since 2026-08-04 uses timeline
  // exclusively (confirmed against analyses/*.txt), so this is coverage for
  // current authoring, not a gap in old scripts nothing will touch again.
  if (!hasTimeline) return;
  const motion = classifySceneMotion(visual.timeline!);
  if (motion.explanatoryCount === 0 && effectiveDuration > ZERO_RICHNESS_HARD_THRESHOLD_SECONDS) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "hard",
        "low-richness",
        `Scene ${sceneIndex + 1}: zero explanatory motion events over ${effectiveDuration.toFixed(1)}s (${motion.entranceCount} entrance, ${motion.decorativeCount} decorative) — nothing in this scene demonstrates a process, only appears/pulses.`,
      ),
    );
  } else if (motion.explanatoryCount === 0) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        3,
        "soft",
        "low-richness",
        `Scene ${sceneIndex + 1}: zero explanatory motion events (${motion.entranceCount} entrance, ${motion.decorativeCount} decorative) over a short ${effectiveDuration.toFixed(1)}s scene.`,
      ),
    );
  }
}

interface Checkpoint {
  atSeconds: number;
  x: number;
  y: number;
}

/** Every object's position over time, built by folding its `move` actions
 * (in start-time order) onto its authored base position — real trajectory
 * tracking, not a proxy. This is what makes contract realization a genuine
 * check rather than "does a move action exist somewhere": edge B->C in a
 * chain A->B->C only counts as realized if something actually reaches B
 * BEFORE traveling on to C, which requires knowing where an object already
 * was at each step, not just its final authored coordinates. */
function buildTrajectories(visual: CanvasData): Map<string, Checkpoint[]> {
  const trajectories = new Map<string, Checkpoint[]>();
  for (const object of visual.objects) {
    const base = resolveObjectPosition(object);
    trajectories.set(object.id, [{ atSeconds: 0, x: base.x, y: base.y }]);
  }
  const moves = (visual.timeline ?? [])
    .filter((a): a is Extract<CanvasTimelineActionT, { type: "move" }> => a.type === "move" && a.to !== undefined && (a.to.x !== undefined || a.to.y !== undefined))
    .sort((a, b) => a.startSeconds - b.startSeconds);
  for (const move of moves) {
    const track = trajectories.get(move.id);
    if (!track) continue; // moving an id absent from `objects` — malformed Data, ignore defensively
    const last = track[track.length - 1];
    track.push({ atSeconds: move.startSeconds, x: move.to?.x ?? last.x, y: move.to?.y ?? last.y });
  }
  return trajectories;
}

// Percent-of-canvas tolerance for "this checkpoint is near that entity" —
// generous enough to allow a compiled Flow scene's arrival-pulse position
// (which lands exactly on the target) and a hand-authored scene's
// approximate token placement alike, tight enough that two genuinely
// different entities in a typical row/fan layout (spaced >=20% apart, see
// composeFlow.ts's own ROW_X_MIN/MAX) are never confused with each other.
const REALIZATION_TOLERANCE_PERCENT = 12;

function isNear(a: { x: number; y: number }, b: { x: number; y: number }, tolerance = REALIZATION_TOLERANCE_PERCENT): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function resolveEntityPosition(id: string, visual: CanvasData): { x: number; y: number } | null {
  const object = visual.objects.find((o) => o.id === id);
  return object ? resolveObjectPosition(object) : null;
}

function edgeRealizedByArrow(edge: ContractEdge, visual: CanvasData): boolean {
  return (visual.arrows ?? []).some((arrow) => {
    if (typeof arrow.to !== "string") return false;
    return (arrow.from === edge.from && arrow.to === edge.to) || (arrow.from === edge.to && arrow.to === edge.from);
  });
}

function edgeRealizedByTransport(edge: ContractEdge, fromPos: { x: number; y: number }, toPos: { x: number; y: number }, trajectories: Map<string, Checkpoint[]>): boolean {
  for (const track of trajectories.values()) {
    for (let i = 0; i < track.length - 1; i++) {
      if (isNear(track[i], fromPos) && isNear(track[i + 1], toPos)) return true;
    }
  }
  return false;
}

interface RealizationResult {
  realizedCount: number;
  totalCount: number;
  unrealizedEdges: ContractEdge[];
}

export function checkContractRealization(contract: SceneContract, visual: CanvasData): RealizationResult {
  const trajectories = buildTrajectories(visual);
  const unrealizedEdges: ContractEdge[] = [];
  for (const edge of contract.edges) {
    const fromPos = resolveEntityPosition(edge.from, visual);
    const toPos = resolveEntityPosition(edge.to, visual);
    const realized =
      fromPos !== null && toPos !== null && (edgeRealizedByArrow(edge, visual) || edgeRealizedByTransport(edge, fromPos, toPos, trajectories));
    if (!realized) unrealizedEdges.push(edge);
  }
  return { realizedCount: contract.edges.length - unrealizedEdges.length, totalCount: contract.edges.length, unrealizedEdges };
}

function checkContract(segment: TimedSegment, visual: CanvasData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (!segment.contract) {
    diagnostics.push(
      diagnostic(sceneIndex, 4, "soft", "no-contract-declared", `Scene ${sceneIndex + 1}: semantic fidelity not declared — no Entities/Flow to check the visual against.`),
    );
    return;
  }
  if (segment.contract.edges.length === 0) return;
  const result = checkContractRealization(segment.contract, visual);
  if (result.unrealizedEdges.length > 0) {
    const edgeList = result.unrealizedEdges.map((e) => `${e.from} -${e.verb}-> ${e.to}`).join(", ");
    diagnostics.push(
      diagnostic(
        sceneIndex,
        4,
        "hard",
        "contract-unrealized",
        `Scene ${sceneIndex + 1}: contract realization ${result.realizedCount}/${result.totalCount} edges — declared but not visually realized: ${edgeList}.`,
      ),
    );
  }
}

// A `label` object farther than this from its nearest non-label object
// isn't obviously captioning anything on screen — this project's own
// convention (see Canvas.tsx's belowLabel) is a caption sitting close under
// the thing it names, so this catches a label authored at some unrelated
// leftover position, not a deliberate freestanding title/wordmark (those
// use fontStyle "wordmark"/"subtitle" and are excluded below).
const ORPHAN_LABEL_DISTANCE_PERCENT = 30;

function checkOrphanLabels(visual: CanvasData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  const labels = visual.objects.filter((o) => o.type === "label" && o.fontStyle !== "wordmark" && o.fontStyle !== "subtitle");
  const others = visual.objects.filter((o) => o.type !== "label");
  if (labels.length === 0 || others.length === 0) return;
  for (const label of labels) {
    const pos = resolveObjectPosition(label);
    const nearestDistance = Math.min(...others.map((o) => Math.hypot(pos.x - resolveObjectPosition(o).x, pos.y - resolveObjectPosition(o).y)));
    if (nearestDistance > ORPHAN_LABEL_DISTANCE_PERCENT) {
      diagnostics.push(
        diagnostic(
          sceneIndex,
          2,
          "soft",
          "orphan-label",
          `Scene ${sceneIndex + 1}: label "${label.label ?? label.id}" sits far from every other element — unclear what it's captioning.`,
        ),
      );
    }
  }
}

// A scene's single most prominent element reading too small to anchor
// attention — distinct from checkLowVisualDensity's SUM of area (several
// small icons can sum to a reasonable ratio while each individually still
// reads as insignificant). Only meaningful for a scene with few objects —
// a rich diagram legitimately has many modest-sized parts.
const PRIMARY_SIZE_MAX_OBJECTS = 3;
const PRIMARY_SIZE_MIN_RADIUS_PERCENT = 5;

function checkPrimarySize(visual: CanvasData, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  const realObjects = visual.objects.filter((o) => o.type !== "label");
  if (realObjects.length === 0 || realObjects.length > PRIMARY_SIZE_MAX_OBJECTS) return;
  const maxRadius = Math.max(0, ...realObjects.map((o) => o.radius ?? 0));
  if (maxRadius > 0 && maxRadius < PRIMARY_SIZE_MIN_RADIUS_PERCENT) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        2,
        "soft",
        "primary-size",
        `Scene ${sceneIndex + 1}: largest element is only ${maxRadius}% canvas radius across ${realObjects.length} object(s) — may read as too small to anchor the scene.`,
      ),
    );
  }
}

/** True when a visual carries something that can actually demonstrate a
 * before -> after change: an evented `timeline` (every timeline medium), or a
 * multi-snapshot `phases` block. A `canvas` timeline additionally has to carry
 * at least one EXPLANATORY action — a timeline of nothing but entrances and
 * scale-pops is exactly the "objects sitting there" failure this is meant to
 * catch, and `classifySceneMotion` already draws that line for canvas. Other
 * media's action vocabularies are richer and not worth re-classifying here;
 * their presence is taken as intent. */
function visualExpressesStateChange(visual: Visual): boolean {
  if (visual.kind === "canvas") {
    const timeline = visual.timeline ?? [];
    if (timeline.length > 0) return classifySceneMotion(timeline).explanatoryCount >= 1;
    return (visual.phases?.length ?? 0) >= 2;
  }
  const loose = visual as { timeline?: unknown[]; phases?: unknown[] };
  if (Array.isArray(loose.timeline) && loose.timeline.length > 0) return true;
  if (Array.isArray(loose.phases) && loose.phases.length >= 2) return true;
  return false;
}

/** A scene that declared a visual EVENT in its `**Visual Event:**` field
 * (beatPlan.ts) but whose Data has no way to show it — no timeline, no
 * multi-phase change, no explanatory motion. Soft, matching the standing
 * position that diagnostics report and the author looks. Fires for every
 * medium, not just canvas, since a beat plan can attach to any of them. This
 * is the mechanical form of "does the animation demonstrate the narration",
 * the same role checkContract plays for a SceneContract. */
function checkVisualEvent(segment: TimedSegment, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (segment.type !== "statement") return;
  const plan = segment.beatPlan;
  if (!plan || plan.event === null) return; // no plan, or a declared establishing/CTA beat with no event to stage

  const detail = `declares a visual event (before: "${plan.event.before}" -> consequence: "${plan.event.consequence}")`;
  if (!segment.visual) {
    diagnostics.push(
      diagnostic(sceneIndex, 4, "soft", "no-visual-event", `Scene ${sceneIndex + 1}: ${detail} but the scene has no visual at all.`),
    );
    return;
  }
  if (!visualExpressesStateChange(segment.visual)) {
    diagnostics.push(
      diagnostic(
        sceneIndex,
        4,
        "soft",
        "no-visual-event",
        `Scene ${sceneIndex + 1}: ${detail} but its Data has no timeline, multi-phase change, or explanatory motion that demonstrates it.`,
      ),
    );
  }
}

// The `visual.kind`s whose schema carries a real progression mechanism — an
// evented `timeline` or a multi-snapshot `phases` block — so they CAN show one
// thing becoming another over the scene. Everything else renders a single
// composition with only an entrance/reveal animation on top.
const CHANGE_CAPABLE_KINDS = new Set([
  "canvas",
  "canvas-3d",
  "diagram",
  "stage",
  "spatial",
  "holdings",
  "channels",
  "workspace",
  "tactical-board",
  "tactical-board-3d",
]);

// A representationNeed whose whole point is watching something change over
// time. `establish-a-situation` and `compare-two-outcomes` are deliberately
// absent — a static tableau legitimately serves both.
const NEEDS_TEMPORAL_CHANGE: ReadonlySet<RepresentationNeed> = new Set<RepresentationNeed>([
  "watch-one-thing-transform",
  "experience-a-contradiction",
  "trace-a-process",
  "follow-a-chain",
  "see-structure-appear",
  "watch-a-value-change",
]);

// Per-need exceptions: a medium that isn't generally change-capable but does
// express this one kind of change. A single value climbing IS what a stat
// counter or a line chart shows.
const EXTRA_CAPABLE_BY_NEED: Partial<Record<RepresentationNeed, ReadonlySet<string>>> = {
  "watch-a-value-change": new Set(["kinetic-stat", "single-stat", "hero-metric", "line-chart"]),
};

/** A scene whose declared `representationNeed` requires showing change over
 * time, paired with a medium that structurally cannot — a `single-stat` for
 * `watch-one-thing-transform`, a `quote` for `trace-a-process`. This is
 * upstream of `checkVisualEvent`: that one says "your Data staged nothing",
 * this one says "the medium you chose can't stage this kind of thing at all",
 * so the fix is to change the medium (or the declared need), not to bolt more
 * animation onto the wrong container. Soft — reports, never blocks. */
function checkRepresentationFit(segment: TimedSegment, sceneIndex: number, diagnostics: SceneDiagnostic[]): void {
  if (segment.type !== "statement") return;
  const plan = segment.beatPlan;
  if (!plan || plan.event === null) return;
  if (!NEEDS_TEMPORAL_CHANGE.has(plan.representationNeed)) return;
  const visual = segment.visual;
  if (!visual) return; // checkVisualEvent already reports the no-visual case

  const kind = visual.kind;
  if (CHANGE_CAPABLE_KINDS.has(kind)) return;
  if (EXTRA_CAPABLE_BY_NEED[plan.representationNeed]?.has(kind)) return;

  diagnostics.push(
    diagnostic(
      sceneIndex,
      4,
      "soft",
      "representation-mismatch",
      `Scene ${sceneIndex + 1}: declares representationNeed "${plan.representationNeed}", but the "${kind}" medium renders a single static composition and cannot show a change over time. Choose a medium with a timeline (Canvas, Diagram, Stage, Spatial, Holdings, Channels, Workspace) or change the declared representationNeed.`,
    ),
  );
}

/** Levels 3 (richness) and 4 (semantic fidelity) diagnostics for every
 * segment — call twice from generate.ts (once right after parsing against
 * estimated durations, once after resolveSegmentAudio against real
 * narration length) exactly like validateGeometry.ts's own two-pass
 * convention isn't needed for geometry (no duration dependency there) but
 * IS needed here, since dead-time/richness both depend on the segment's
 * real effective duration. */
export function diagnoseScenes(segments: TimedSegment[]): SceneDiagnostic[] {
  const diagnostics: SceneDiagnostic[] = [];
  segments.forEach((segment, index) => {
    // Beat-plan checks — run for every medium (a beat plan can attach to any).
    checkVisualEvent(segment, index, diagnostics);
    checkRepresentationFit(segment, index, diagnostics);

    if (segment.type !== "statement" || segment.visual?.kind !== "canvas") return;
    const visual = segment.visual;
    const effectiveDuration = effectiveDurationOf(segment);
    checkDeadTimeAndRichness(visual, index, effectiveDuration, diagnostics);
    checkContract(segment, visual, index, diagnostics);
    checkOrphanLabels(visual, index, diagnostics);
    checkPrimarySize(visual, index, diagnostics);
  });
  return diagnostics;
}
