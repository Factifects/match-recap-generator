import { fadeIn } from "./motion";
import { FPS } from "./theme";
import type { TacticalBoardData } from "./sharedVisualProps";

export type TimelineAction = NonNullable<TacticalBoardData["timeline"]>[number];
export type FreezeAction = Extract<TimelineAction, { type: "freeze" }>;
export type MoveAction = Extract<TimelineAction, { type: "move" }>;
export type StateAction = Extract<TimelineAction, { type: "state" }>;

// Dimension-agnostic timeline math shared by TacticalBoard.tsx (2D, SVG/pixel
// projection) and TacticalBoard3D.tsx (real Three.js world space) — none of
// these touch a coordinate, only actor ids/seconds/opacity, so extracting
// them here lets both renderers consume identical timeline behavior without
// duplicating (and risking drift between) two copies of the same math.

/** Sorted-ascending `move` actions for one actor. */
export function movesFor(timeline: TimelineAction[], actorId: string): MoveAction[] {
  return timeline.filter((a): a is MoveAction => a.type === "move" && a.actorId === actorId).sort((a, b) => a.startSeconds - b.startSeconds);
}

/** Sorted-ascending `state` actions for one actor. */
export function statesFor(timeline: TimelineAction[], actorId: string): StateAction[] {
  return timeline.filter((a): a is StateAction => a.type === "state" && a.actorId === actorId).sort((a, b) => a.startSeconds - b.startSeconds);
}

/** A freeze holds the whole board at its own `startSeconds` for
 * `durationSeconds` of real elapsed time, then every later action resumes
 * exactly where it left off — authors write `startSeconds` on one nominal
 * timeline as if freezes took zero time, and this converts real elapsed
 * scene-seconds `t` down to that nominal timeline (`te`) for every other
 * fold (actor/ball position) to consume. Freezes are assumed non-overlapping
 * (the schema doesn't enforce it, but an author authoring a teaching pause
 * has no reason to overlap two). */
export function computeEffectiveSeconds(timeline: TimelineAction[] | undefined, t: number): number {
  if (!timeline) return t;
  const freezes = timeline.filter((a): a is FreezeAction => a.type === "freeze").sort((a, b) => a.startSeconds - b.startSeconds);
  let shift = 0;
  for (const freeze of freezes) {
    const wallStart = freeze.startSeconds + shift;
    const wallEnd = wallStart + freeze.durationSeconds;
    if (t < wallStart) break;
    if (t <= wallEnd) return freeze.startSeconds;
    shift += freeze.durationSeconds;
  }
  return t - shift;
}

/** Companion to computeEffectiveSeconds — that function tells every OTHER
 * fold "what nominal time is it," collapsing a freeze window to a single
 * held instant; this one tells the freeze's OWN rendering "am I currently
 * inside a freeze, and how far into its own (real, unfrozen) on-screen
 * duration am I" so its annotations/circles can fade in using real elapsed
 * seconds rather than the frozen nominal time everything else sees. */
export function resolveActiveFreeze(timeline: TimelineAction[], t: number): { freeze: FreezeAction; localSeconds: number } | null {
  const freezes = timeline.filter((a): a is FreezeAction => a.type === "freeze").sort((a, b) => a.startSeconds - b.startSeconds);
  let shift = 0;
  for (const freeze of freezes) {
    const wallStart = freeze.startSeconds + shift;
    const wallEnd = wallStart + freeze.durationSeconds;
    if (t < wallStart) return null;
    if (t <= wallEnd) return { freeze, localSeconds: t - wallStart };
    shift += freeze.durationSeconds;
  }
  return null;
}

/** Shared appear/disappear fade for a `tacticalObjects` entry — `disappear`
 * covers both `disappearSeconds` (zone/line/triangle) and a lane's
 * `closesAtSeconds`, which fade out identically (a closing passing lane IS
 * just an authored disappear moment, not different math). */
export function objectOpacity(te: number, appearSeconds: number, disappearSeconds: number | undefined): number {
  const appearOpacity = fadeIn(te * FPS, appearSeconds * FPS, 12);
  if (disappearSeconds === undefined) return appearOpacity;
  const disappearOpacity = 1 - fadeIn(te * FPS, disappearSeconds * FPS, 12);
  return Math.min(appearOpacity, Math.max(0, disappearOpacity));
}
