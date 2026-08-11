import type { CanvasData } from "../video/sharedVisualProps";

// Classifies each Canvas TIMELINE action by what it actually communicates,
// not merely that it exists — a raw event count is trivially gamed (a scene
// can have 8 events and still be "icon pulses, icon pulses, icon pulses").
// Confirmed against real scripts (analyses/*-2026-08-07.txt): across three
// recent files, 111 `appear` events and 28 decorative scale-pops against
// only 12 real transport moves. This module is what turns "N events" into
// "N events, of which M actually demonstrate something" — the mechanical
// half of "animate ideas, not objects."
//
// Deliberately scoped to the evented `timeline` field only, not the older
// `phases` snapshot mechanism — every script written since timeline shipped
// (2026-08-04 onward) uses it exclusively; `phases` is effectively legacy.
// validateScene.ts falls back to a coarser phase-count heuristic for the
// handful of older `phases`-authored scenes rather than this classifier.

type CanvasTimelineActionT = NonNullable<CanvasData["timeline"]>[number];

export type MotionClass =
  // An object entering the scene — necessary, but tells the viewer nothing
  // beyond "this thing exists now."
  | "entrance"
  // In-place emphasis with no travel and no state change — the scale-pop
  // pair (`move` with scale/rotation but no `to`), or a `style` action that
  // sets neither color nor label. Reads as "look at this," not "this
  // happened."
  | "decorative"
  // Real transport (a `move` with a genuine `to` position), a meaningful
  // state change (`style` setting color or label — a hit/miss/success/
  // reject signal), or a `disappear` (something leaving as a consequence,
  // e.g. a rejected request vanishing). These are the events that can
  // actually demonstrate a process.
  | "explanatory"
  // Camera moves reframe attention but don't animate an entity or a
  // relationship between entities — counted separately, never toward
  // richness in either direction.
  | "camera";

/** A `move` action "transports" when it declares a real target position —
 * schema-level proxy (no resolved scene state needed) for "this object is
 * actually going somewhere," as opposed to a scale/rotation-only emphasis
 * pulse in place. */
export function moveHasTransport(action: Extract<CanvasTimelineActionT, { type: "move" }>): boolean {
  return action.to !== undefined && (action.to.x !== undefined || action.to.y !== undefined);
}

export function classifyTimelineAction(action: CanvasTimelineActionT): MotionClass {
  switch (action.type) {
    case "appear":
      return "entrance";
    case "camera":
      return "camera";
    case "disappear":
      return "explanatory";
    case "move":
      return moveHasTransport(action) ? "explanatory" : "decorative";
    case "style":
      return action.color !== undefined || action.label !== undefined ? "explanatory" : "decorative";
    default:
      return "decorative";
  }
}

export interface SceneMotionSummary {
  entranceCount: number;
  decorativeCount: number;
  explanatoryCount: number;
  cameraCount: number;
  /** The explanatory actions themselves, sorted by start time — used both to
   * report *what* happened (not just how many) and as the raw material for
   * the contract-realization checker. */
  explanatoryActions: CanvasTimelineActionT[];
}

export function classifySceneMotion(timeline: CanvasTimelineActionT[]): SceneMotionSummary {
  const summary: SceneMotionSummary = { entranceCount: 0, decorativeCount: 0, explanatoryCount: 0, cameraCount: 0, explanatoryActions: [] };
  for (const action of timeline) {
    const cls = classifyTimelineAction(action);
    if (cls === "entrance") summary.entranceCount++;
    else if (cls === "decorative") summary.decorativeCount++;
    else if (cls === "camera") summary.cameraCount++;
    else {
      summary.explanatoryCount++;
      summary.explanatoryActions.push(action);
    }
  }
  return summary;
}
