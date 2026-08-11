// The foundational layer every visual-intent compiler (composeFlow.ts,
// composeCompare.ts, and whatever comes after) should build on instead of
// each hand-rolling its own `let t = startAt; t += duration + gap`
// bookkeeping. Canvas.tsx's renderer already accepts a flat, evented
// timeline (appear/move/style/disappear/camera, each with its own
// startSeconds) and needs no changes — confirmed twice by actually
// rendering scenes built directly against it. What was missing is
// something above that flat array capable of expressing "these three
// things happen in parallel," "repeat this until the scene ends," or "this
// object's height should track this data series" — a real Timeline
// Intermediate Representation, compiled DOWN to the flat array Canvas
// already understands, not a change to what Canvas itself has to interpret.
//
// This is deliberately scoped to what's provably needed by real scenes
// (proven, not assumed — see composeCompare.ts's rebuild and
// composeContinuous.ts's queue scene, both built directly on this): a
// sequence/parallel/repeat/delay/stagger tree of actions, plus one
// data-binding node that expands a value series into the chained `move`
// actions Canvas already supports. It is NOT the full vocabulary from the
// architecture discussion (no morph/transform node, no code-execution node
// yet) — those get added to this same tree shape once a real scene proves
// what they need to look like, the same discipline this file itself was
// built under.

export type CanvasAction =
  | { type: "appear"; id: string; startSeconds: number; sound?: SoundCue }
  | { type: "disappear"; id: string; startSeconds: number; durationSeconds?: number; sound?: SoundCue }
  | {
      type: "move";
      id: string;
      startSeconds: number;
      durationSeconds?: number;
      to?: { x?: number; y?: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
      radius?: number;
      easing?: Easing;
      sound?: SoundCue;
      /** "arc" follows Canvas.tsx's quadratic-bezier arc motion instead of a
       * straight glide (visualDefinitions.ts's own `path` field) — needed so
       * converging/diverging paths (fan-out, aggregate, branch) read as
       * distinct curves instead of overlapping straight lines. */
      path?: "line" | "arc";
    }
  | { type: "style"; id: string; startSeconds: number; durationSeconds?: number; color?: string; label?: string; easing?: Easing; sound?: SoundCue }
  | { type: "camera"; startSeconds: number; durationSeconds?: number; x?: number; y?: number; zoom?: number; easing?: Easing; sound?: SoundCue };

export type SoundCue = "entrance" | "move" | "zoom" | "click" | "highlight" | "success" | "alert" | "typing";
export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "emphasized" | "easeOutBack" | "anticipate" | "spring";

/** An action node's `startSeconds` is authored as an OFFSET from wherever
 * its parent places it, not an absolute scene time — that's what lets a
 * `sequence`/`parallel`/`repeat` node be reused at any point in a larger
 * timeline without its children needing to know their own absolute
 * position. `flattenTimeline` (below) is what resolves offsets to real
 * absolute `startSeconds` for the actual Canvas action array. */
export type TimelineNode =
  | { kind: "action"; action: CanvasAction; offsetSeconds?: number }
  /** Children run one after another — each starts when the previous one's
   * own resolved end is reached. This is the ONE place duration-chaining
   * bookkeeping lives now, instead of every compiler recomputing `t +=
   * duration + gap` by hand. */
  | { kind: "sequence"; children: TimelineNode[]; offsetSeconds?: number }
  /** Children all start at the same offset — real simultaneous
   * choreography (camera moving while an object transports while a label
   * updates), not three separately-hand-timed actions that happen to share
   * a startSeconds. */
  | { kind: "parallel"; children: TimelineNode[]; offsetSeconds?: number }
  /** A fixed gap before `child` starts — the explicit version of what
   * every compiler was already doing by adding a constant to `t`. */
  | { kind: "delay"; seconds: number; child: TimelineNode; offsetSeconds?: number }
  /** Runs `child` repeatedly, `interval` seconds apart, either a fixed
   * `count` times or until `untilSeconds` is reached (for "keep this going
   * for the rest of the scene" continuous motion — a real queue of
   * requests entering, not a single one-shot arrival). Each repetition is
   * its own independent instance: if `child` moves an object named "x",
   * every repetition needs its own id (see composeContinuous.ts's spawn
   * pattern) — this node does not deduplicate or rename ids for you. */
  | { kind: "repeat"; child: TimelineNode; interval: number; count?: number; untilSeconds?: number; offsetSeconds?: number }
  /** Like `sequence`, but children OVERLAP by starting `gap` seconds apart
   * rather than waiting for the previous child's full duration — the
   * staggered-entrance pattern every compiler was already hand-authoring
   * via `i * ENTRANCE_STAGGER`. */
  | { kind: "stagger"; children: TimelineNode[]; gap: number; offsetSeconds?: number };

interface FlattenResult {
  actions: CanvasAction[];
  /** The absolute scene-time this node's own choreography finished at —
   * what a `sequence` parent needs to know where to start the NEXT child. */
  endSeconds: number;
}

function actionDuration(action: CanvasAction): number {
  return "durationSeconds" in action ? (action.durationSeconds ?? 0) : 0;
}

function withAbsoluteStart(action: CanvasAction, startSeconds: number): CanvasAction {
  return { ...action, startSeconds };
}

/** Resolves a TimelineNode tree into the flat, absolute-time CanvasAction[]
 * Canvas.tsx's `timeline` prop actually consumes — the one place this
 * offset-to-absolute conversion happens, so every compiler downstream gets
 * correct chaining/parallelism for free instead of recomputing it. */
export function flattenTimeline(node: TimelineNode, startAt: number): FlattenResult {
  const offset = node.offsetSeconds ?? 0;
  const at = startAt + offset;

  switch (node.kind) {
    case "action": {
      const action = withAbsoluteStart(node.action, at);
      return { actions: [action], endSeconds: at + actionDuration(action) };
    }
    case "sequence": {
      const actions: CanvasAction[] = [];
      let cursor = at;
      for (const child of node.children) {
        const result = flattenTimeline(child, cursor);
        actions.push(...result.actions);
        cursor = result.endSeconds;
      }
      return { actions, endSeconds: cursor };
    }
    case "parallel": {
      const actions: CanvasAction[] = [];
      let maxEnd = at;
      for (const child of node.children) {
        const result = flattenTimeline(child, at);
        actions.push(...result.actions);
        maxEnd = Math.max(maxEnd, result.endSeconds);
      }
      return { actions, endSeconds: maxEnd };
    }
    case "delay": {
      const result = flattenTimeline(node.child, at + node.seconds);
      return { actions: result.actions, endSeconds: result.endSeconds };
    }
    case "stagger": {
      const actions: CanvasAction[] = [];
      let cursor = at;
      let maxEnd = at;
      for (const child of node.children) {
        const result = flattenTimeline(child, cursor);
        actions.push(...result.actions);
        maxEnd = Math.max(maxEnd, result.endSeconds);
        cursor += node.gap;
      }
      return { actions, endSeconds: maxEnd };
    }
    case "repeat": {
      const actions: CanvasAction[] = [];
      // A non-positive interval with only `untilSeconds` set would never
      // advance `cursor` past the stop condition — a real infinite loop,
      // not just a modeling error, since this function has no other exit.
      // A hard iteration ceiling is the actual guarantee against that,
      // independent of whatever interval/count a caller passes in.
      const MAX_REPEAT_ITERATIONS = 10_000;
      let cursor = at;
      let maxEnd = at;
      let iterations = 0;
      while (iterations < MAX_REPEAT_ITERATIONS) {
        if (node.count !== undefined && iterations >= node.count) break;
        if (node.untilSeconds !== undefined && cursor >= node.untilSeconds) break;
        if (node.count === undefined && node.untilSeconds === undefined) break; // must have a real stop condition
        const result = flattenTimeline(node.child, cursor);
        actions.push(...result.actions);
        maxEnd = Math.max(maxEnd, result.endSeconds);
        cursor += node.interval;
        iterations++;
      }
      return { actions, endSeconds: maxEnd };
    }
  }
}

/** A single object's scalar property tracking a data series over time —
 * the concrete shape of "data -> visual property" for this first pass:
 * expands to a chained sequence of real `move` actions between consecutive
 * samples (Canvas already interpolates a `move`'s `to`/`scale`/`opacity`/
 * `radius` smoothly — this is authoring convenience, not a new renderer
 * capability). `property: "value"` binds to `radius` as the visual stand-in
 * for magnitude (a queue's fill level, a counter, a gauge) since Canvas has
 * no literal "height of a bar" object type yet — a real bar/gauge primitive
 * is future work once a scene actually needs the visual DIFFERENCE between
 * "this circle got bigger" and "this bar got taller," not before. */
export interface DataBinding {
  id: string;
  property: "radius" | "scale" | "opacity";
  samples: { atSeconds: number; value: number }[];
  easing?: Easing;
  sound?: SoundCue;
}

export function compileDataBinding(binding: DataBinding): TimelineNode {
  const children: TimelineNode[] = [];
  for (let i = 1; i < binding.samples.length; i++) {
    const prev = binding.samples[i - 1];
    const next = binding.samples[i];
    const duration = Math.max(0.1, next.atSeconds - prev.atSeconds);
    const action: CanvasAction = {
      type: "move",
      id: binding.id,
      startSeconds: 0, // resolved by flattenTimeline's own offset math
      durationSeconds: duration,
      easing: binding.easing,
      sound: binding.sound,
      [binding.property]: next.value,
    } as CanvasAction;
    children.push({ kind: "action", action, offsetSeconds: prev.atSeconds - binding.samples[0].atSeconds });
  }
  return { kind: "parallel", children };
}
