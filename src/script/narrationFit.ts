// The narration temporal spine (see CLAUDE.md, "Narration is the timeline
// authority"). Every compiler in this project authors its choreography against
// an ESTIMATED scene duration — the script's `Duration:` field, parsed before
// any TTS has run. Real narration audio essentially never matches that guess,
// and until this file existed nothing reconciled the two: parseSceneScript set
// `visualMinDurationSeconds` to the authored choreography's own end, and
// resolveAudio took `max(realNarration, visualMin)`. So a scene whose
// choreography was authored for 49s but whose narration came in at 44s ran the
// full 49s with the narrator silent for the last 5. The visual, not the
// narrator, won the duration argument. That is the failure this fixes.
//
//   NARRATION IS THE CLOCK.
//   VISUAL CHOREOGRAPHY IS FIT TO THAT CLOCK.
//   VISUAL MEANING MUST NOT BE DISTORTED TO FIT IT.
//
// Explicitly NOT any of the four rejected shortcuts: no trimming (render it
// all, cut the overhang), no freeze-frame padding, no global speed scaling
// (multiply every timestamp by audio/visual), no per-video special-casing.
// Proportional scaling is the one that looks closest to correct and is still
// wrong: it happily squashes a data packet's journey into an imperceptible
// flick to buy time that a removable pause was holding.
//
// What it does instead — fitting, in a deliberate priority order:
//
//   Compressing (narration shorter than the choreography)
//     1. expendable pauses BETWEEN beats give up their time first
//     2. only then do beats compress, and only down to the point where every
//        action inside them is still perceptible
//     3. anything still over is reported as `overflowSeconds` rather than
//        squashed further — a real timing conflict, surfaced before render
//
//   Expanding (narration longer than the choreography)
//     1. meaningful beats stretch first, so the viewer keeps learning
//     2. then a little breathing room between beats
//     3. only then do beats stretch past their comfortable cap, and how far
//        past is reported as `uncoveredSeconds`
//
// Beat ORDER and each beat's internal structure are always preserved: a beat
// scales as a unit, so a chained travel -> arrive -> highlight sequence stays
// chained and causal, and a camera move stays welded to the beat it belongs to.
//
// Beats are DERIVED from the flat action array rather than declared by each
// composer, so every existing compiler (composeFlow / composeSelect /
// composeContinuous / composeMechanism) inherits the contract without being
// rewritten first — "a general contract every composer inherits, not a patch on
// today's scenes". A composer that knows its real narration-beat boundaries can
// pass them as `anchors`, which pin authored times to narration times exactly
// and fit each window between them independently; that is the path future
// semantic-beat compilers should use.

import type { CanvasData } from "../video/sharedVisualProps";

export type CanvasTimelineAction = NonNullable<CanvasData["timeline"]>[number];

/** The only shape this file needs from an action: when it starts and (maybe)
 * how long it lasts. Everything here is generic over it so any medium that
 * carries its own timeline — Canvas today, the `workspace` code/terminal medium
 * alongside it — inherits the narration spine rather than growing a second,
 * unsynchronized clock. That is a standing constraint, not a convenience: see
 * CLAUDE.md. A medium supplies its own perceptual minimums via
 * `FitOptions.minSecondsFor`; the default is the Canvas table below. */
export interface TimedAction {
  type: string;
  startSeconds: number;
  durationSeconds?: number;
}

/** Two actions closer together than this belong to the same beat. Set just
 * above a typical entrance stagger (0.12-0.25s across the compilers) so a
 * staggered group reads as ONE beat — a staggered entrance is a single
 * narrative event, and compressing its members independently would desynchronize
 * the stagger itself. */
const BEAT_CLUSTER_GAP_SECONDS = 0.35;

/** Floor for a pause BETWEEN beats. Below this two beats visually merge and the
 * viewer loses the sense that a second thing happened. */
const GAP_MIN_SECONDS = 0.12;

/** How much breathing room a single interior gap may gain when narration runs
 * long. Past this it stops being a beat separation and becomes dead air. */
const GAP_EXPANSION_MAX_SECONDS = 0.75;

/** A beat stretches to at most this multiple of its authored length before the
 * fitter starts looking elsewhere for room. */
const BEAT_COMFORTABLE_EXPANSION = 1.6;

/** Past this multiple, motion authored for a shorter window reads as sluggish
 * however meaningful it is. Beats are still stretched (a freeze would be worse)
 * but the excess is reported as `uncoveredSeconds` so validation can say the
 * narration has more time than the scene has content for. */
const BEAT_STRETCH_WARN_RATIO = 2.0;

/** Perceptual minimums — how long each kind of action needs in order to be
 * legible at all. These are what stop compression from turning a packet's
 * journey into a one-frame jump. A `move` that changes position is a transport
 * the viewer has to SEE travel; a `move` that only changes scale/opacity/radius
 * is emphasis and can go quicker. */
const MIN_TRANSPORT_SECONDS = 0.5;
const MIN_EMPHASIS_SECONDS = 0.3;
const MIN_STYLE_SECONDS = 0.3;
const MIN_DISAPPEAR_SECONDS = 0.25;
/** A camera move faster than this reads as a jump cut rather than a move. */
const MIN_CAMERA_SECONDS = 0.6;

/** Difference below which the authored timeline already counts as fitted.
 * Re-timing everything to shave a tenth of a second is churn, and it would
 * needlessly perturb sfx cue placement. Also the tolerance validation uses for
 * "visualEnd ~= narrationEnd". */
export const FIT_TOLERANCE_SECONDS = 0.25;

function actionDuration(action: TimedAction): number {
  return action.durationSeconds ?? 0;
}

/** How long a reader needs to find and take in a highlighted line of code, or
 * to follow a scroll to somewhere else in a file. Code is read, not watched,
 * so its floors are longer than a diagram's. */
const MIN_CODE_HIGHLIGHT_SECONDS = 1.2;
const MIN_CODE_SCROLL_SECONDS = 0.7;
const MIN_CODE_REVEAL_SECONDS = 0.4;

/** The shortest this specific action can run and still be perceived. An
 * instantaneous action (`appear`) has no duration to protect, so it is 0.
 * Never returns more than the action was actually authored for: a deliberate
 * 0.2s flicker keeps its 0.2s. This floor exists to stop COMPRESSION from
 * destroying legibility, not to inflate anything. */
export function actionMinSeconds(action: TimedAction): number {
  const authored = actionDuration(action);
  switch (action.type) {
    case "appear":
      return 0;
    case "disappear":
      return Math.min(MIN_DISAPPEAR_SECONDS, authored);
    case "style":
      return Math.min(MIN_STYLE_SECONDS, authored);
    case "camera":
      return Math.min(MIN_CAMERA_SECONDS, authored);
    case "move": {
      const to = (action as { to?: { x?: number; y?: number } }).to;
      const movesPosition = to !== undefined && (to.x !== undefined || to.y !== undefined);
      return Math.min(movesPosition ? MIN_TRANSPORT_SECONDS : MIN_EMPHASIS_SECONDS, authored);
    }
    // The `spatial` medium's own actions. `travel` is a transport in three
    // dimensions — a body physically crossing the world — so it earns the same
    // floor as a Canvas `move` that changes position: compressed below this it
    // reads as a teleport, and "watch this one traveller cross the city" is
    // precisely the thing the medium exists to show.
    case "travel":
      return Math.min(MIN_TRANSPORT_SECONDS, authored);
    case "exit":
      return Math.min(MIN_DISAPPEAR_SECONDS, authored);
    // The `holdings` medium's own actions. `inspect` and `compare` exist to be
    // READ — the viewer is counting rows inside a pane — so they take the same
    // floor as a highlighted line of code rather than a diagram's. `assemble`
    // is the medium's signature move and is meaningless as a flicker.
    case "inspect":
    case "compare":
      return Math.min(MIN_CODE_HIGHLIGHT_SECONDS, authored);
    case "assemble":
    case "agree":
      return Math.min(1.4, authored);
    // The `workspace` medium's own actions — a highlighted line has to stay up
    // long enough to actually be READ, which is the whole point of highlighting
    // it, so this is the strictest floor in the table.
    case "highlight":
      return Math.min(MIN_CODE_HIGHLIGHT_SECONDS, authored);
    case "scroll":
    case "focusPane":
      return Math.min(MIN_CODE_SCROLL_SECONDS, authored);
    case "reveal":
      return Math.min(MIN_CODE_REVEAL_SECONDS, authored);
    default:
      return 0;
  }
}

export interface VisualBeat {
  /** Authored (pre-fit) span of this beat. */
  startSeconds: number;
  endSeconds: number;
  /** Indices into the action array this beat was derived from. */
  actionIndices: number[];
  /** Shortest this beat can run while every action inside it stays above its
   * own perceptual minimum. Derived from the tightest RATIO any single action
   * imposes rather than a max of absolute minimums, so the beat's internal
   * structure compresses uniformly instead of some actions collapsing while
   * others hold — that is what preserves causality inside a beat. */
  minSeconds: number;
}

function finalizeBeat(raw: { start: number; end: number; indices: number[] }, actions: TimedAction[]): VisualBeat {
  const duration = raw.end - raw.start;
  let tightestRatio = 0;
  for (const index of raw.indices) {
    const action = actions[index];
    const dur = actionDuration(action);
    if (dur <= 0) continue;
    tightestRatio = Math.max(tightestRatio, actionMinSeconds(action) / dur);
  }
  return {
    startSeconds: raw.start,
    endSeconds: raw.end,
    actionIndices: raw.indices.slice().sort((a, b) => a - b),
    minSeconds: duration > 0 ? duration * Math.min(1, tightestRatio) : 0,
  };
}

/** Groups actions that happen together into beats. Actions are clustered by
 * time, not by object or type: a camera push, a token launch and a label change
 * that all fire at the same moment are ONE beat, because they are one thing
 * happening as far as the viewer is concerned.
 *
 * `restrictTo` limits derivation to a subset of action indices (used when
 * anchors split the timeline into windows) while keeping every index referring
 * to the ORIGINAL array, so callers never have to translate indices back. */
export function deriveBeats(actions: TimedAction[], restrictTo?: number[]): VisualBeat[] {
  const indices = restrictTo ?? actions.map((_, i) => i);
  if (indices.length === 0) return [];
  const ordered = indices
    .map((index) => ({ index, action: actions[index] }))
    .sort((a, b) => a.action.startSeconds - b.action.startSeconds);

  const beats: VisualBeat[] = [];
  let current: { start: number; end: number; indices: number[] } | null = null;
  for (const { action, index } of ordered) {
    const start = action.startSeconds;
    const end = start + actionDuration(action);
    if (current && start <= current.end + BEAT_CLUSTER_GAP_SECONDS) {
      current.end = Math.max(current.end, end);
      current.indices.push(index);
    } else {
      if (current) beats.push(finalizeBeat(current, actions));
      current = { start, end, indices: [index] };
    }
  }
  if (current) beats.push(finalizeBeat(current, actions));
  return beats;
}

/** A hard correspondence between a point in the authored choreography and the
 * real narration moment it belongs to — "the request reaches the server" stays
 * welded to the sentence that says so, however much the rest of the timeline
 * has to move. Windows between consecutive anchors are fitted independently, so
 * compression in one part of a scene can never drag a later beat off the
 * narration beat it illustrates. */
export interface NarrationAnchor {
  authoredSeconds: number;
  narrationSeconds: number;
}

export interface FitOptions {
  /** Real spoken length of this scene's narration, from generated TTS audio.
   * This is the window the choreography has to tell its story in. */
  narrationSeconds: number;
  /** Deliberate silence before the first beat (an establishing moment). */
  leadInSeconds?: number;
  /** Optional hard authored->narration correspondences; see NarrationAnchor. */
  anchors?: NarrationAnchor[];
}

export interface FitReport {
  authoredEndSeconds: number;
  fittedEndSeconds: number;
  narrationSeconds: number;
  /** How much the choreography still overruns after being compressed as far as
   * legibility allows — the "8 seconds of visual, 3 seconds of narration"
   * timing conflict, detected BEFORE rendering rather than papered over. */
  overflowSeconds: number;
  /** Narration time the scene had no real content for: beats stretched past
   * BEAT_STRETCH_WARN_RATIO, plus any interior gap inflation. Reported rather
   * than filled with invented motion. */
  uncoveredSeconds: number;
  beatCount: number;
  /** False when the authored timeline was already within FIT_TOLERANCE_SECONDS
   * of the narration window and was left untouched. */
  changed: boolean;
}

export interface FitResult<T extends TimedAction = CanvasTimelineAction> {
  actions: T[];
  /** Maps any authored timestamp onto the fitted timeline. Callers MUST run
   * every other time-carrying field of the segment through this — on-screen
   * caption `phases[].startSeconds` and generated `sfxClips[].startSeconds`
   * both reference the authored timeline and would desynchronize from the
   * choreography they were placed against if only `actions` were re-timed. */
  remapSeconds: (seconds: number) => number;
  report: FitReport;
}

type Element = { kind: "gap" | "beat"; ideal: number; min: number; beat?: VisualBeat };

interface Allocation {
  sizes: number[];
  /** Time that could not be removed without breaking perceptual minimums. */
  overflowSeconds: number;
  /** Time that had to go somewhere the viewer gains nothing from. */
  uncoveredSeconds: number;
}

/** Shares `amount` across `indices` in proportion to each one's remaining
 * headroom, mutating `sizes`. Returns how much was actually placed. */
function share(sizes: number[], indices: number[], headroom: (i: number) => number, amount: number, sign: 1 | -1): number {
  const total = indices.reduce((sum, i) => sum + Math.max(0, headroom(i)), 0);
  if (total <= 1e-9 || amount <= 1e-9) return 0;
  const placed = Math.min(amount, total);
  for (const i of indices) {
    sizes[i] += sign * (Math.max(0, headroom(i)) / total) * placed;
  }
  return placed;
}

/** Fits one window's alternating gap/beat elements into `target` seconds, in
 * the priority order documented at the top of this file. */
function allocate(elements: Element[], target: number): Allocation {
  const sizes = elements.map((e) => e.ideal);
  const idealTotal = sizes.reduce((sum, s) => sum + s, 0);
  const gapIndices = elements.map((e, i) => (e.kind === "gap" ? i : -1)).filter((i) => i >= 0);
  const beatIndices = elements.map((e, i) => (e.kind === "beat" ? i : -1)).filter((i) => i >= 0);

  if (Math.abs(idealTotal - target) <= 1e-9) return { sizes, overflowSeconds: 0, uncoveredSeconds: 0 };

  if (target < idealTotal) {
    let need = idealTotal - target;
    // 1. Expendable pauses go first.
    need -= share(sizes, gapIndices, (i) => sizes[i] - elements[i].min, need, -1);
    // 2. Then beats, but never below the point where their actions stop reading.
    if (need > 1e-9) need -= share(sizes, beatIndices, (i) => sizes[i] - elements[i].min, need, -1);
    // 3. Whatever is left is a genuine conflict, not something to squash.
    return { sizes, overflowSeconds: Math.max(0, need), uncoveredSeconds: 0 };
  }

  let extra = target - idealTotal;
  // 1. Meaningful beats stretch first — the viewer keeps learning.
  extra -= share(sizes, beatIndices, (i) => elements[i].ideal * BEAT_COMFORTABLE_EXPANSION - sizes[i], extra, 1);
  // 2. A little breathing room between beats.
  let breathing = 0;
  if (extra > 1e-9) {
    breathing = share(sizes, gapIndices, (i) => Math.max(0, elements[i].ideal + GAP_EXPANSION_MAX_SECONDS - sizes[i]), extra, 1);
    extra -= breathing;
  }
  // 3. Rather than freeze the scene, keep stretching the beats — but say so.
  if (extra > 1e-9 && beatIndices.length > 0) {
    share(sizes, beatIndices, (i) => Math.max(elements[i].ideal, 1), extra, 1);
    extra = 0;
  }

  const authoredBeatTotal = beatIndices.reduce((sum, i) => sum + elements[i].ideal, 0);
  const fittedBeatTotal = beatIndices.reduce((sum, i) => sum + sizes[i], 0);
  const overStretch = Math.max(0, fittedBeatTotal - authoredBeatTotal * BEAT_STRETCH_WARN_RATIO);
  return { sizes, overflowSeconds: Math.max(0, extra), uncoveredSeconds: overStretch + breathing };
}

/** Builds the alternating gap/beat element list covering
 * `[windowStart, windowEnd]` for the beats inside it. */
function elementsFor(beats: VisualBeat[], windowStart: number, windowEnd: number): Element[] {
  const elements: Element[] = [];
  let cursor = windowStart;
  for (const beat of beats) {
    const gap = Math.max(0, beat.startSeconds - cursor);
    elements.push({ kind: "gap", ideal: gap, min: Math.min(gap, GAP_MIN_SECONDS) });
    elements.push({ kind: "beat", ideal: Math.max(0, beat.endSeconds - beat.startSeconds), min: beat.minSeconds, beat });
    cursor = beat.endSeconds;
  }
  const trailing = Math.max(0, windowEnd - cursor);
  elements.push({ kind: "gap", ideal: trailing, min: Math.min(trailing, GAP_MIN_SECONDS) });
  return elements;
}

/** Re-times an authored choreography so it tells its story across exactly the
 * real narration window. See this file's header for the priority order and why
 * fitting (rather than trimming / padding / scaling) is the required mechanism. */
export function fitTimelineToNarration<T extends TimedAction>(actions: T[], options: FitOptions): FitResult<T> {
  const { narrationSeconds } = options;
  const leadIn = Math.max(0, options.leadInSeconds ?? 0);
  const authoredEnd = actions.reduce((end, a) => Math.max(end, a.startSeconds + actionDuration(a)), 0);

  const unchanged = (report?: Partial<FitReport>): FitResult<T> => ({
    actions,
    remapSeconds: (seconds: number) => seconds,
    report: {
      authoredEndSeconds: authoredEnd,
      fittedEndSeconds: authoredEnd,
      narrationSeconds,
      overflowSeconds: 0,
      uncoveredSeconds: 0,
      beatCount: 0,
      changed: false,
      ...report,
    },
  });

  if (actions.length === 0 || narrationSeconds <= 0 || authoredEnd <= 0) return unchanged();

  const allBeats = deriveBeats(actions);

  // Split into windows at the anchors. With no anchors this is one window
  // covering the whole scene — the ordinary case.
  const sortedAnchors = (options.anchors ?? [])
    .filter((a) => a.authoredSeconds > 0 && a.authoredSeconds < authoredEnd)
    .slice()
    .sort((a, b) => a.authoredSeconds - b.authoredSeconds);

  // A MATCHING TOTAL DOES NOT IMPLY MATCHING PARTS. Bailing out on the totals
  // alone is right for a single-narration scene, and wrong for a folded passage
  // (see the merge*Continuity passes): a passage whose choreography happens to
  // end when its last clip ends can still have its second sub-scene's beats
  // running over its third sub-scene's narration. Anchors exist precisely to
  // say where those internal boundaries are, so when there are any, the windows
  // between them get fitted rather than the whole thing waved through.
  if (sortedAnchors.length === 0 && Math.abs(authoredEnd - narrationSeconds) <= FIT_TOLERANCE_SECONDS) {
    return unchanged({ beatCount: allBeats.length });
  }

  const bounds: { authoredStart: number; authoredEnd: number; fittedStart: number; fittedEnd: number }[] = [];
  let prevAuthored = 0;
  let prevFitted = leadIn;
  for (const anchor of sortedAnchors) {
    bounds.push({ authoredStart: prevAuthored, authoredEnd: anchor.authoredSeconds, fittedStart: prevFitted, fittedEnd: anchor.narrationSeconds });
    prevAuthored = anchor.authoredSeconds;
    prevFitted = anchor.narrationSeconds;
  }
  bounds.push({ authoredStart: prevAuthored, authoredEnd, fittedStart: prevFitted, fittedEnd: narrationSeconds });

  // Authored -> fitted breakpoints, sampled at every element boundary across
  // every window, plus where each beat landed so its actions can be placed
  // relative to it (which is what keeps a beat's internal structure intact).
  const breakpoints: { from: number; to: number }[] = [{ from: 0, to: leadIn }];
  const placementByBeat = new Map<VisualBeat, { authoredStart: number; fittedStart: number; scale: number }>();
  let overflowSeconds = 0;
  let uncoveredSeconds = 0;
  let beatCount = 0;

  for (const window of bounds) {
    const indicesInWindow = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action.startSeconds >= window.authoredStart - 1e-9 && action.startSeconds < window.authoredEnd - 1e-9)
      .map(({ index }) => index);
    const beats = deriveBeats(actions, indicesInWindow);
    beatCount += beats.length;

    const elements = elementsFor(beats, window.authoredStart, window.authoredEnd);
    const allocation = allocate(elements, Math.max(0, window.fittedEnd - window.fittedStart));
    overflowSeconds += allocation.overflowSeconds;
    uncoveredSeconds += allocation.uncoveredSeconds;

    let authoredCursor = window.authoredStart;
    let fittedCursor = window.fittedStart;
    elements.forEach((element, index) => {
      if (element.kind === "beat" && element.beat) {
        const scale = element.ideal > 0 ? allocation.sizes[index] / element.ideal : 1;
        placementByBeat.set(element.beat, { authoredStart: element.beat.startSeconds, fittedStart: fittedCursor, scale });
      }
      authoredCursor += element.ideal;
      fittedCursor += allocation.sizes[index];
      breakpoints.push({ from: authoredCursor, to: fittedCursor });
    });
  }
  breakpoints.sort((a, b) => a.from - b.from);

  function remapSeconds(seconds: number): number {
    if (seconds <= breakpoints[0].from) return breakpoints[0].to;
    for (let i = 1; i < breakpoints.length; i++) {
      const prev = breakpoints[i - 1];
      const next = breakpoints[i];
      if (seconds <= next.from) {
        const span = next.from - prev.from;
        const ratio = span > 1e-9 ? (seconds - prev.from) / span : 0;
        return prev.to + ratio * (next.to - prev.to);
      }
    }
    const last = breakpoints[breakpoints.length - 1];
    return last.to + (seconds - last.from);
  }

  const beatByActionIndex = new Map<number, VisualBeat>();
  for (const beat of placementByBeat.keys()) {
    for (const index of beat.actionIndices) beatByActionIndex.set(index, beat);
  }

  const fittedActions = actions.map((action, index) => {
    const beat = beatByActionIndex.get(index);
    const placement = beat ? placementByBeat.get(beat) : undefined;
    if (!placement) return { ...action, startSeconds: remapSeconds(action.startSeconds) };

    const startSeconds = placement.fittedStart + (action.startSeconds - placement.authoredStart) * placement.scale;
    if (!("durationSeconds" in action) || action.durationSeconds === undefined) {
      return { ...action, startSeconds };
    }
    return {
      ...action,
      startSeconds,
      durationSeconds: Math.max(actionMinSeconds(action), action.durationSeconds * placement.scale),
    };
  });

  const fittedEnd = fittedActions.reduce((end, a) => Math.max(end, a.startSeconds + actionDuration(a)), 0);

  return {
    actions: fittedActions,
    remapSeconds,
    report: {
      authoredEndSeconds: authoredEnd,
      fittedEndSeconds: fittedEnd,
      narrationSeconds,
      overflowSeconds,
      uncoveredSeconds,
      beatCount,
      changed: true,
    },
  };
}
