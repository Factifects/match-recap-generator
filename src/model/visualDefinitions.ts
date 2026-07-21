import { z } from "zod";

// The single source of truth for every visual template type: what it's
// called, which category it groups under, what "Scene Type:" string a
// script uses to select it, and the Zod shape of its Data JSON. Segment.ts's
// visualSchema is DERIVED from this list (z.discriminatedUnion over each
// entry's `schema`) rather than hand-duplicated — adding a 22nd visual type
// means adding one entry here (plus a component + a VISUAL_COMPONENTS map
// entry in src/video/visualComponents.tsx), not editing four separate files
// that have to be kept in sync by hand. See the "Visual Registry" plan this
// was built from for the full rationale.
export type VisualCategory = "pitch-tactics" | "stats-dataviz" | "narrative-callouts" | "generic-diagrams";

const beatSchema = z.object({
  marker: z.string(),
  label: z.string(),
});

const barSchema = z.object({
  label: z.string(),
  value: z.number(),
});

const tableRowSchema = z.object({
  rank: z.number(),
  label: z.string(),
  value: z.number(),
  // Extra stat columns beyond `value` (e.g. a real standings row's W/D/L/GD,
  // or a Golden-Boot row's Assists/xG alongside Goals) — present only when
  // the table's own `columnLabels` is, so a plain single-column table (the
  // common case) is unaffected.
  columns: z.array(z.number()).optional(),
  highlight: z.boolean().optional(),
});

const kpiStatSchema = z.object({
  label: z.string(),
  value: z.string(),
  // A short run of recent values (already normalized 0-100 by the author,
  // same convention as radar's series values) rendered as a tiny sparkline —
  // optional, since not every stat has a meaningful trend to show.
  trend: z.array(z.number().min(0).max(100)).optional(),
  // A plain-language delta ("+12 vs last match", "-3 PPDA") — kept as a
  // pre-formatted string rather than a signed number, since the "is this
  // good?" direction differs stat to stat (lower PPDA is better, higher xG
  // is better) and only the author writing the stat actually knows which.
  delta: z.string().optional(),
  // Drives a small colored indicator triangle next to `delta` — separate
  // from delta's sign (a PPDA of -3 is "good", i.e. green, even though the
  // number itself is negative), so the author states the verdict directly
  // rather than the component guessing it from a number's sign.
  deltaDirection: z.enum(["up", "down", "neutral"]).optional(),
});

const careerStopSchema = z.object({
  label: z.string(),
  period: z.string(),
});

const networkNodeSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
});

const networkLinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().min(0),
});

export const ICON_KEYS = [
  "goal",
  "card",
  "save",
  "whistle",
  "clock",
  "star",
  "assist",
  "sub",
  "trophy",
  "ticket",
  "grass",
  "case",
] as const;
export const ZONE_KEYS = ["defensive", "middle", "attacking"] as const;

// Canvas's icon vocabulary — a curated allow-list of Heroicons (not
// arbitrary icon-library names), same convention as ICON_KEYS above but for
// the generic-diagram Canvas scene rather than the football Icon scene. The
// actual icon components (React, Heroicons) live in
// ../video/canvasIcons.ts's CANVAS_ICON_COMPONENTS — this file only owns the
// data-level key list, so the model layer never imports from video/.
export const CANVAS_ICON_KEYS = [
  "jet",
  "rocket",
  "server",
  "database",
  "cloud",
  "globe",
  "device",
  "camera",
  "signal",
  "wifi",
  "shield",
  "bolt",
  "lock",
  "search",
  "warning",
  "check",
  "cross",
  "chip",
  "target",
  "scale",
  "factory",
  "person",
  "flask",
] as const;
export type CanvasIconKey = (typeof CANVAS_ICON_KEYS)[number];
export const FORMATION_NAMES = ["4-3-3", "4-2-3-1", "3-4-2-1", "5-4-1", "4-4-2"] as const;

// role is optional — when a script doesn't specify one, Formation.tsx falls
// back to FORMATION_TEMPLATES' per-slot default (e.g. slot index 9 in 4-3-3
// defaults to "TF") so every pod still has a label without every script
// needing to author one.
const formationPlayerSchema = z.object({ name: z.string(), role: z.string().optional() });

const formationSideSchema = z.object({
  team: z.string(),
  formationName: z.enum(FORMATION_NAMES),
  players: z.array(formationPlayerSchema).min(1),
  side: z.enum(["home", "away"]).default("home"),
});

const pitchPointSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });
const pctNum = z.number().min(0).max(100);

// Behavior states a player can be in — explain WHY a player is where they
// are (a "pressing" full-back reads differently than a "holdingWidth" one at
// the same coordinate), rendered as a JerseyDisc ring/icon variant. Only
// meaningful alongside `timeline` (below) — a `state`-type timeline action
// overrides whatever's set here at the point it fires; this top-level field
// is just the t=0 starting state.
export const PLAYER_STATE_KEYS = [
  "pressing",
  "marking",
  "covering",
  "holdingWidth",
  "receiving",
  "overlapping",
  "underlapping",
  "screening",
  "dropping",
  "checkingShoulder",
  "waiting",
  "carrying",
] as const;

// Named run identities — each maps to a distinct curve/dash treatment (see
// RUN_TYPE_GEOMETRY in CurvedMovementArrow.tsx) instead of every player
// movement reading as the same straight glide, regardless of what the run
// actually means tactically.
export const RUN_TYPE_KEYS = [
  "standard",
  "overlap",
  "underlap",
  "blindsideRun",
  "thirdManRun",
  "recoveryRun",
  "counterRun",
  "dummyRun",
  "supportRun",
  "diagonalRun",
  "channelRun",
  "halfSpaceRun",
] as const;

const tacticalPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
  // Optional t=0 behavior state / facing direction (degrees, 0 = attacking
  // direction "up") — a `timeline` `state` action later overrides either.
  // Absent for every script written before `timeline` existed.
  state: z.enum(PLAYER_STATE_KEYS).optional(),
  facing: z.number().min(0).max(360).optional(),
});

const tacticalArrowSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  // "run" (default) glides the FROM player's own marker to `to` — for an
  // actual player movement (an overlapping run, a covering shift). "pass"
  // instead leaves the FROM player's marker exactly where it is and animates
  // only the ball traveling to `to` — for the ball moving between two
  // players who both stay put. Defaulting to "run" keeps every existing
  // script's arrows behaving exactly as before; "pass" exists specifically
  // because a real render showed the previous run-only behavior making a
  // passer's own disc slide across the pitch to the receiver's feet, reading
  // as "the passer ran there" rather than "the passer played the ball there."
  kind: z.enum(["run", "pass"]).default("run"),
  // Purely visual — a distinct color/dash treatment per tactical concept, so
  // a press, a defensive recovery, and a third-man run don't all read as the
  // same generic colored line. Independent of `kind`: a press is a "run"
  // (a player moving) styled as `style: "press"`, not a new kind. Defaults to
  // "standard" (today's exact look) so every existing script is unaffected.
  style: z.enum(["standard", "press", "recovery", "third-man-run"]).default("standard"),
});

// Kept separate from tacticalPlayerSchema/tacticalArrowSchema rather than
// reused — VerticalTacticalBoard is its own Scene Type with its own fields
// (`role`, per-arrow `curve`/`bow`), not a variant of TacticalBoard's.
const verticalPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
  role: z.string().optional(),
});

const verticalArrowSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  curve: z.boolean().optional(),
  bow: z.number().optional(),
});

const analysisPlayerSchema = z.object({
  id: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  label: z.string(),
  revealed: z.boolean().optional(),
});

const gazeLineSchema = z.object({
  from: z.string(),
  to: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
});

const heatZoneSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  intensity: z.number().min(0).max(1),
});

const tacticalZoneSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0).max(100),
  height: z.number().min(0).max(100),
});

const tacticalAnnotationSchema = z.object({
  text: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

// Mirrors CameraStage["focus"] (src/model/Segment.ts) — CameraStage itself
// has no Zod counterpart today since the scene-level "Camera:" field is
// parsed from free text (parseCameraStage in parseSceneScript.ts), not JSON.
// This is a separate schema purely for JSON-authored `timeline` camera
// events; the scene-level Camera: field/behavior is untouched.
const timelineFocusSchema = z.union([z.enum(["full", "left-half", "right-half", "box-left", "box-right"]), pitchPointSchema]);

const tacticalBallSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  // Actor id currently holding the ball, absent = loose ball. `possession`
  // timeline actions reassign this at the point they fire.
  belongsTo: z.string().optional(),
});

// One beat in an evented tactical-board demonstration — see `timeline`
// below. Unlike `tacticalPhaseSchema`'s full-roster snapshots, each entry
// here describes ONE thing happening to ONE actor (or the camera/freeze) at
// an author-given `startSeconds`, so several can overlap or stagger
// arbitrarily instead of being locked to a fixed per-phase/per-arrow-index
// timer. `type: "state"` doubles as this project's answer to "trigger"
// framing (e.g. "IF ball enters half-space THEN press begins") — the author
// places a state action at the moment the trigger fires; there's no
// conditional-evaluation engine, since scripts are hand/LLM-authored with
// the outcome already decided, not simulated.
const timedActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    actorId: z.string(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.6),
    to: pitchPointSchema,
    runType: z.enum(RUN_TYPE_KEYS).default("standard"),
    // Explicit override of RUN_TYPE_GEOMETRY's default curvature for this
    // run type, for the rare case an author needs a sharper/shallower bend.
    bow: z.number().optional(),
  }),
  z.object({
    type: z.literal("state"),
    actorId: z.string(),
    startSeconds: z.number().min(0),
    state: z.enum(PLAYER_STATE_KEYS).optional(),
    facing: z.number().min(0).max(360).optional(),
  }),
  z.object({
    type: z.literal("possession"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.6),
    fromId: z.string().optional(),
    toId: z.string().optional(),
    // A shot/clearance may not have a receiving player — a bare pitch point
    // the ball travels to instead of `toId`.
    toPoint: pitchPointSchema.optional(),
    action: z.enum(["pass", "carry", "shot", "clearance"]).default("pass"),
  }),
  z.object({
    type: z.literal("camera"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(1),
    focus: timelineFocusSchema,
    zoom: z.number(),
  }),
  z.object({
    type: z.literal("freeze"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.5),
    annotations: z.array(tacticalAnnotationSchema).optional(),
    circles: z.array(z.object({ x: pctNum, y: pctNum, radius: z.number() })).optional(),
  }),
]);

// Tactical-relationship overlays beyond the existing rectangular
// `highlightZone` — a defensive/compactness line, a passing lane that can
// visually "close" (fade) as a press develops, or a triangle (a common
// build-up-shape callout). `appearSeconds`/`disappearSeconds` (or
// `closesAtSeconds` for a lane) are only meaningful alongside `timeline`;
// on a plain (non-timeline) board they'd just mean "always visible."
const tacticalObjectSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("zone"),
    ...tacticalZoneSchema.shape,
    appearSeconds: z.number().min(0).default(0),
    disappearSeconds: z.number().min(0).optional(),
  }),
  z.object({
    shape: z.literal("line"),
    // Length-axis (goal-to-goal) position, matching every other coordinate
    // in this file — a defensive/compactness line is fixed at one length
    // value and spans the full width, same convention as tacticalPlayerSchema
    // and pitchPointSchema (x = length, y = width; see TacticalBoard.tsx).
    x: pctNum,
    label: z.string().optional(),
    appearSeconds: z.number().min(0).default(0),
    disappearSeconds: z.number().min(0).optional(),
  }),
  z.object({
    shape: z.literal("lane"),
    from: pitchPointSchema,
    to: pitchPointSchema,
    closesAtSeconds: z.number().min(0).optional(),
    appearSeconds: z.number().min(0).default(0),
  }),
  z.object({
    shape: z.literal("triangle"),
    points: z.array(pitchPointSchema).length(3),
    appearSeconds: z.number().min(0).default(0),
    disappearSeconds: z.number().min(0).optional(),
  }),
]);

// A follow-on beat after the board's initial (top-level players/arrows)
// arrangement — a full player arrangement, not a delta, so the component can
// glide every marker from its previous-phase position to this one by
// matching on `id` without guessing which players didn't move. `caption`/
// `dataPoint` are what turn a re-arrangement into an actual demonstration:
// a short on-screen line (what's happening) and a small stat readout (the
// number that makes it true), each phase's own beat instead of one static
// diagram the narration has to describe unaided.
const tacticalPhaseSchema = z.object({
  players: z.array(tacticalPlayerSchema).min(1),
  arrows: z.array(tacticalArrowSchema).optional(),
  highlightZone: tacticalZoneSchema.optional(),
  caption: z.string().optional(),
  dataPoint: z.string().optional(),
});

const shotSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["home", "away"]),
  result: z.enum(["goal", "saved", "blocked", "off-target"]),
  xg: z.number().min(0).max(1).optional(),
});

const comparisonStatRowSchema = z.object({
  label: z.string(),
  left: z.number(),
  right: z.number(),
});

const treemapSegmentSchema = z.object({
  label: z.string(),
  value: z.number().min(0),
});

const tierCardSchema = z.object({
  name: z.string(),
  price: z.string(),
  tagline: z.string().optional(),
  featured: z.boolean().optional(),
});

const funnelStageSchema = z.object({
  label: z.string(),
  value: z.number().min(0),
});

const packedCircleSchema = z.object({
  label: z.string(),
  value: z.number().min(0),
});

const splitPanelSchema = z.object({
  label: z.string(),
  value: z.string(),
  caption: z.string().optional(),
});

const gridItemSchema = z.object({
  label: z.string(),
  caption: z.string().optional(),
  icon: z.enum(ICON_KEYS).optional(),
});

// Canvas: a generic (non-pitch) 2D scene — "dot" is the generic "thing" in a
// diagram (a plane, a node, a particle), "circle"/"ellipse"/"rectangle"/
// "roundedRectangle"/"polygon"/"line" are generic shape primitives, "label"
// is free floating text with no marker (a "Safe"/"Warning" callout appearing
// mid-diagram, or a big standalone emoji), "icon" is a real pictogram from
// Canvas's curated Heroicons vocabulary (CANVAS_ICON_KEYS in
// ../video/canvasIcons.ts) — reach for this instead of a plain rectangle/dot
// whenever a real-world object (a server, a jet, a phone) has a clearer
// pictorial stand-in than a labeled box. Kept deliberately generic rather
// than domain-specific beyond that icon vocabulary, so the same primitives
// cover any topic a script author reaches for. Every field below besides
// id/type/x/y is optional with a default that reproduces v1's exact
// behavior, so a v1 script (no rotation/scale/enter/exit/etc.) renders
// byte-for-byte identically.
const canvasObjectSchema = z.object({
  id: z.string(),
  type: z.enum(["dot", "circle", "label", "rectangle", "roundedRectangle", "ellipse", "line", "polygon", "icon"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  label: z.string().optional(),
  color: z.string().optional(),
  // "icon" type only — which Heroicon to render. Required for that type to
  // render anything (an "icon" object with no `icon` key renders nothing).
  icon: z.enum(CANVAS_ICON_KEYS).optional(),
  // "circle"/"ellipse" radius, OR "roundedRectangle" corner radius, OR
  // "icon" half-size — percent of canvas width, so a growing radar bubble/
  // zone can be authored without pixel math (same convention as pitch
  // coordinates).
  radius: z.number().min(0).max(100).optional(),
  // "rectangle"/"roundedRectangle"/"ellipse"/"line" — percent of canvas
  // width/height. For "line", `width` is the segment length and `rotation`
  // its angle (degrees) from (x,y).
  width: z.number().min(0).max(100).optional(),
  height: z.number().min(0).max(100).optional(),
  // "polygon" only — vertex offsets from (x,y), NOT absolute coordinates, so
  // the whole shape can still be repositioned by changing x/y alone.
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  // Animatable like x/y/radius — glides phase-to-phase the same way.
  rotation: z.number().default(0),
  scale: z.number().default(1),
  // Author-set base opacity — multiplies with the entrance-fade opacity, so
  // an object can be authored at e.g. 0.4 opacity throughout without fighting
  // its own enter/exit fade.
  opacity: z.number().min(0).max(1).default(1),
  filled: z.boolean().default(true),
  fillOpacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().optional(),
  // Z-order — objects are sorted by this (stable) before rendering, so a
  // label/connector can be pinned above or below markers regardless of
  // array order. 0 for everything (the default) reproduces today's
  // array-order rendering exactly, since a stable sort of equal keys is a
  // no-op.
  layer: z.number().default(0),
  // How this object animates in when it first appears (phase 0, or a later
  // phase it's newly present in) / out (present in the previous phase but
  // absent from this one). "fade" (today's only enter behavior) and "none"
  // (today's only exit behavior — an absent object simply vanishes) are the
  // defaults, so no existing script's visual behavior changes.
  enter: z.enum(["none", "fade", "scale", "slide"]).default("fade"),
  exit: z.enum(["none", "fade", "scale", "slide"]).default("none"),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeOut"),
  // A fading ghost trail behind this object while it glides — same
  // technique as TacticalBoard's GHOST_TRAIL, opt-in per object.
  trail: z.boolean().default(false),
  // Continuous ambient motion, layered on top of everything above (entrance,
  // phase-to-phase glide, author-set rotation/scale/opacity) rather than
  // replacing it — built on motion.ts's `pulse()` helper, which already
  // existed and is used by 13 other compositions but was never wired into
  // Canvas. "none" (default) reproduces today's exact behavior: an object
  // sits fully still once its entrance settles. "spin" = continuous full
  // rotation (a processor/loading motif). "pulse" = gentle continuous scale
  // breathing (something "active"). "glow" = continuous opacity breathing
  // (a status indicator, a live connection). Each object's own `id` seeds a
  // phase offset so multiple idle objects in the same scene don't breathe in
  // lockstep.
  idle: z.enum(["none", "spin", "pulse", "glow"]).default("none"),
});

const canvasArrowSchema = z.object({
  from: z.string(),
  // A fixed point (today's only option), OR another object's id — resolved
  // live every frame against that object's current (phase-interpolated)
  // position, so a connector automatically tracks a moving target.
  to: z.union([z.string(), z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })]),
  style: z.enum(["solid", "dashed", "dotted", "double"]).default("solid"),
  label: z.string().optional(),
  color: z.string().optional(),
  strokeWidth: z.number().optional(),
  // Once the arrow's own draw-in finishes, continuously animate the dash
  // pattern along its length so it reads as data/current flowing from
  // `from` to `to` rather than a static dashed connector — the "continuously
  // training line" motif. Only visible with a dashed/dotted style (a solid
  // stroke has no dash pattern to animate); silently a no-op on "solid"/
  // "double" rather than an error, since a script author toggling `flow` on
  // an arrow while iterating on its style shouldn't hit a validation error.
  flow: z.boolean().default(false),
});

// Optional camera framing over Canvas's flat plane — absent (the default)
// renders the full, unzoomed canvas exactly as today. Phases glide the
// camera the same generalized way they glide any object's properties.
const canvasCameraSchema = z.object({
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  zoom: z.number().min(0.5).max(6).default(1),
});

// A follow-on beat after Canvas's initial (top-level objects/arrows)
// arrangement — same "full snapshot, not a delta" convention as
// tacticalPhaseSchema, so the component can glide every object from its
// previous-phase properties to this phase's by matching on `id`.
const canvasPhaseSchema = z.object({
  objects: z.array(canvasObjectSchema).min(1),
  arrows: z.array(canvasArrowSchema).optional(),
  camera: canvasCameraSchema.optional(),
  // Anchors this phase to an absolute point in the segment's timeline instead
  // of the default fixed CANVAS_PHASE_DURATION_FRAMES cadence (see Canvas.tsx)
  // — set by mergeCanvasContinuity.ts on a folded-in scene's first phase once
  // that sub-scene's real narration offset is known, so the camera arrives
  // exactly when that sub-scene's audio starts rather than at a fixed frame
  // count. Absent (every script authored directly, today's only case) keeps
  // the existing fixed-cadence behavior unchanged; a phase after an anchored
  // one with no startSeconds of its own resumes fixed-cadence spacing FROM
  // that anchor.
  startSeconds: z.number().min(0).optional(),
});

export interface VisualDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: string;
  category: VisualCategory;
  label: string;
  description: string;
  /** Normalized (lowercased, whitespace-stripped) "Scene Type:" match key —
   * kept explicit rather than derived from `label` since several existing
   * scripts' Scene Type strings don't match their display name 1:1 (e.g.
   * "shape" is authored as "Donut", "single-stat" as "Stat"). */
  sceneTypeKey: string;
  schema: Schema;
}

// A "visual" is a graphic that replaces the default caption for one narration
// beat. It never carries its own timing — the beat's real narration audio (or,
// pre-audio, its word-count estimate) always drives how long it's on screen, so
// swapping the caption for a graphic never silently drops narration content.
export const VISUAL_DEFINITIONS = [
  {
    kind: "tactical-board",
    category: "pitch-tactics",
    label: "Tactical Board",
    description:
      "Named players as jersey-colored discs on a pitch, with movement arrows and an optional highlighted zone. Optionally an ordered `phases` array turns this into a real multi-beat demonstration (players/arrows re-arrange phase to phase, each with its own caption/data readout) instead of one static diagram.",
    sceneTypeKey: "tacticalboard",
    schema: z.object({
      kind: z.literal("tactical-board"),
      title: z.string(),
      players: z.array(tacticalPlayerSchema).min(1),
      arrows: z.array(tacticalArrowSchema).optional(),
      highlight: z.array(z.string()).optional(),
      highlightZone: tacticalZoneSchema.optional(),
      annotations: z.array(tacticalAnnotationSchema).optional(),
      phases: z.array(tacticalPhaseSchema).min(1).optional(),
      // Evented alternative to `phases`: a timed-action demonstration
      // (players/ball/camera/freeze beats each with their own `startSeconds`)
      // instead of full-roster snapshots. Mutually exclusive with `phases` in
      // practice (not `.refine()`-enforced) — the renderer prefers `timeline`
      // when both are present. `phases`-only scripts are completely
      // unaffected: this and the two fields below are all new and optional.
      ball: tacticalBallSchema.optional(),
      timeline: z.array(timedActionSchema).min(1).optional(),
      tacticalObjects: z.array(tacticalObjectSchema).optional(),
    }),
  },
  {
    kind: "vertical-tactical-board",
    category: "pitch-tactics",
    label: "Vertical Tactical Board",
    description: "Portrait pitch (goal-to-goal running top-to-bottom) with role-pill player labels and curved arrows, plus a side-text caption.",
    sceneTypeKey: "verticaltacticalboard",
    schema: z.object({
      kind: z.literal("vertical-tactical-board"),
      title: z.string(),
      players: z.array(verticalPlayerSchema).min(1),
      arrows: z.array(verticalArrowSchema).optional(),
      sideText: z.string().optional(),
    }),
  },
  {
    kind: "formation",
    category: "pitch-tactics",
    label: "Formation",
    description: "One or two full lineups shown as a compressed formation shape facing each other.",
    sceneTypeKey: "formation",
    schema: z.object({
      kind: z.literal("formation"),
      title: z.string().optional(),
      sides: z.array(formationSideSchema).min(1).max(2),
    }),
  },
  {
    kind: "shot-map",
    category: "pitch-tactics",
    label: "Shot Map",
    description: "Every shot from a match as a marker on the pitch, styled by result and optionally sized by xG.",
    sceneTypeKey: "shotmap",
    schema: z.object({
      kind: z.literal("shot-map"),
      title: z.string(),
      shots: z.array(shotSchema).min(1),
    }),
  },
  {
    kind: "pass-network",
    category: "pitch-tactics",
    label: "Pass Network",
    description: "Player nodes connected by weighted lines showing how a team built play.",
    sceneTypeKey: "passnetwork",
    schema: z.object({
      kind: z.literal("pass-network"),
      title: z.string(),
      nodes: z.array(networkNodeSchema).min(2),
      links: z.array(networkLinkSchema).min(1),
    }),
  },
  {
    kind: "heat-map",
    category: "pitch-tactics",
    label: "Heat Map",
    description: "Where a player/team operated most, as blurred color blobs of author-decided intensity.",
    sceneTypeKey: "heatmap",
    schema: z.object({
      kind: z.literal("heat-map"),
      title: z.string(),
      zones: z.array(heatZoneSchema).min(1),
    }),
  },
  {
    kind: "zone",
    category: "pitch-tactics",
    label: "Zone",
    description: "An abstract pitch diagram with one attacking/middle/defensive third highlighted.",
    sceneTypeKey: "zone",
    schema: z.object({
      kind: z.literal("zone"),
      zone: z.enum(ZONE_KEYS),
      label: z.string(),
      caption: z.string(),
    }),
  },
  {
    kind: "goal-sequence",
    category: "pitch-tactics",
    label: "Goal Sequence",
    description:
      "A single shot/touch as a ball-path animation from one pitch point to another, with an optional keeper. `curve: \"bounce\"` (with optional `bouncePoints`) arcs the ball through real up-down hops instead of one smooth glide — for a loose ball, a lofted through-ball, or a deflection.",
    sceneTypeKey: "goalsequence",
    schema: z.object({
      kind: z.literal("goal-sequence"),
      title: z.string(),
      shooter: z.string(),
      from: pitchPointSchema,
      to: pitchPointSchema,
      keeper: z.string().optional(),
      keeperAt: pitchPointSchema.optional(),
      curve: z.union([z.boolean(), z.literal("bounce")]).default(false),
      bouncePoints: z.array(pitchPointSchema).optional(),
    }),
  },
  {
    kind: "analysis",
    category: "pitch-tactics",
    label: "Analysis",
    description: "Revisits an already-shown moment: freeze the shape, draw gaze lines, then reveal the element the defense's attention missed.",
    sceneTypeKey: "analysis",
    schema: z.object({
      kind: z.literal("analysis"),
      title: z.string(),
      players: z.array(analysisPlayerSchema).min(1),
      gazeLines: z.array(gazeLineSchema).optional(),
      revealCaption: z.string().optional(),
    }),
  },
  {
    kind: "statburst",
    category: "stats-dataviz",
    label: "Stat Burst",
    description: "Two-value head-to-head with a proportional bar — the simple version of Player Comparison.",
    sceneTypeKey: "statburst",
    schema: z.object({
      kind: z.literal("statburst"),
      label: z.string(),
      leftLabel: z.string(),
      leftValue: z.number(),
      rightLabel: z.string(),
      rightValue: z.number(),
      format: z.enum(["integer", "decimal"]).default("integer"),
      // Attached directly to both big numbers (e.g. prefix "£" -> "£215m") —
      // not just left to a caption, since these cards have no caption field
      // at all and a bare number is ambiguous for money/other units.
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
  },
  {
    kind: "barchart",
    category: "stats-dataviz",
    label: "Bar Chart",
    description: "A row of labeled bars, minimum two.",
    sceneTypeKey: "barchart",
    schema: z.object({
      kind: z.literal("barchart"),
      title: z.string(),
      bars: z.array(barSchema).min(2),
      // Chart-level, applied to every bar's value label (e.g. prefix "$" on a
      // set of price-tier bars) — bars within one chart always share a unit.
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
  },
  {
    kind: "shape",
    category: "stats-dataviz",
    label: "Donut Chart",
    description: "Proportional segments of a whole, minimum two.",
    sceneTypeKey: "donut",
    schema: z.object({
      kind: z.literal("shape"),
      title: z.string(),
      segments: z.array(barSchema).min(2),
    }),
  },
  {
    kind: "radar",
    category: "stats-dataviz",
    label: "Radar Chart",
    description: "A multi-axis profile (3+ axes) for one or two entities, every value pre-normalized 0-100.",
    sceneTypeKey: "radar",
    schema: z.object({
      kind: z.literal("radar"),
      title: z.string(),
      axes: z.array(z.string()).min(3),
      series: z
        .array(
          z.object({
            label: z.string(),
            values: z.array(z.number().min(0).max(100)),
            color: z.string().optional(),
          }),
        )
        .min(1)
        .max(2),
    }),
  },
  {
    kind: "single-stat",
    category: "stats-dataviz",
    label: "Single Stat",
    description: "One climbing counter with optional secondary context text.",
    sceneTypeKey: "stat",
    schema: z.object({
      kind: z.literal("single-stat"),
      title: z.string(),
      value: z.number(),
      context: z.string().optional(),
      // Attached directly to the giant number (e.g. prefix "£" -> "£449m")
      // instead of relying on `context`'s small text to carry the unit.
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
  },
  {
    kind: "momentum-timeline",
    category: "stats-dataviz",
    label: "Momentum Timeline",
    description: "A match's rhythm across the minute axis — named stretches arch up (rise) or down (fall) from a baseline.",
    sceneTypeKey: "momentumtimeline",
    schema: z.object({
      kind: z.literal("momentum-timeline"),
      title: z.string(),
      matchMinutes: z.number().min(1),
      phases: z
        .array(
          z.object({
            startMinute: z.number().min(0),
            endMinute: z.number().min(0),
            direction: z.enum(["rise", "fall"]).default("rise"),
            label: z.string(),
          }),
        )
        .min(1),
    }),
  },
  {
    kind: "league-table",
    category: "stats-dataviz",
    label: "League Table",
    description:
      "A full ranked multi-row table (standings, top-scorer charts), minimum two rows. Optional `columnLabels` + per-row `columns` render a real multi-stat table (e.g. MP/W/D/L/GD/Pts, or Goals/Assists/xG) instead of one proportional-bar column.",
    sceneTypeKey: "leaguetable",
    schema: z.object({
      kind: z.literal("league-table"),
      title: z.string(),
      columnLabel: z.string(),
      columnLabels: z.array(z.string()).optional(),
      rowLabel: z.string().optional(),
      rows: z.array(tableRowSchema).min(2),
    }),
  },
  {
    kind: "kpi-panel",
    category: "stats-dataviz",
    label: "KPI Panel",
    description:
      "3-5 small stat tiles in one card (label, big value, optional trend sparkline/delta) — Power BI's multi-row-card pattern, for a dense analytics readout (xG, progressive passes, PPDA, distance covered, etc.) instead of forcing several facts into separate scenes.",
    sceneTypeKey: "kpipanel",
    schema: z.object({
      kind: z.literal("kpi-panel"),
      title: z.string(),
      stats: z.array(kpiStatSchema).min(2).max(5),
    }),
  },
  {
    kind: "hero-metric",
    category: "stats-dataviz",
    label: "Hero Metric",
    description:
      "One number given the full frame — eyebrow label, a proportional bar, the giant value, then subtext. For the single number a scene is actually about, not a stat that shares billing with others.",
    sceneTypeKey: "herometric",
    schema: z.object({
      kind: z.literal("hero-metric"),
      label: z.string(),
      value: z.number(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      subtext: z.string().optional(),
      // Author-decided fill (0-1), same "you choose the scale" convention as
      // Radar/HeatMap — not derived from `value` itself, since there's no
      // universal "100%" for an arbitrary metric (revenue, distance, a count).
      barProgress: z.number().min(0).max(1).optional(),
    }),
  },
  {
    kind: "treemap",
    category: "stats-dataviz",
    label: "Treemap",
    description: "Proportionally-sized rectangles for a set of values — for a pricing/distribution breakdown where relative size tells the story, not a ranked list.",
    sceneTypeKey: "treemap",
    schema: z.object({
      kind: z.literal("treemap"),
      title: z.string().optional(),
      segments: z.array(treemapSegmentSchema).min(2),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
  },
  {
    kind: "tier-cards",
    category: "stats-dataviz",
    label: "Tier Cards",
    description: "A row of pricing/package tiers, each a name + price + tagline — one tier can be marked `featured` to visually stand out (a raised, highlighted card) from the rest.",
    sceneTypeKey: "tiercards",
    schema: z.object({
      kind: z.literal("tier-cards"),
      title: z.string().optional(),
      tiers: z.array(tierCardSchema).min(2).max(5),
    }),
  },
  {
    kind: "funnel",
    category: "stats-dataviz",
    label: "Funnel",
    description: "Ordered stages narrowing top to bottom, each stage's width proportional to its value — for a hierarchy or drop-off (a transfer process, a knockout draw, a pricing ladder), not a flat category comparison (that's Bar Chart).",
    sceneTypeKey: "funnel",
    schema: z.object({
      kind: z.literal("funnel"),
      title: z.string().optional(),
      stages: z.array(funnelStageSchema).min(2).max(6),
      // Cosmetic only — both shapes narrow the same direction (top-to-bottom
      // by value); "pyramid" renders each stage as a centered triangular band
      // instead of a rectangle, for a hierarchy-of-levels feel rather than a
      // drop-off/conversion feel. Defaults to "funnel".
      shape: z.enum(["funnel", "pyramid"]).default("funnel"),
    }),
  },
  {
    kind: "packed-circles",
    category: "stats-dataviz",
    label: "Packed Circles",
    description: "A cluster of circles sized by value (area, not radius, scales with value) — for a distribution/magnitude comparison across more items than Stat Burst's two values, without Bar Chart's implied ranking axis.",
    sceneTypeKey: "packedcircles",
    schema: z.object({
      kind: z.literal("packed-circles"),
      title: z.string().optional(),
      circles: z.array(packedCircleSchema).min(2).max(8),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
  },
  {
    kind: "split-cards",
    category: "stats-dataviz",
    label: "Split Cards",
    description: "Two panels side by side, each a label/value/caption — for a qualitative or mixed-content comparison (a claim vs a claim, not just two numbers) that Stat Burst's numeric-only head-to-head can't carry.",
    sceneTypeKey: "splitcards",
    schema: z.object({
      kind: z.literal("split-cards"),
      title: z.string().optional(),
      left: splitPanelSchema,
      right: splitPanelSchema,
    }),
  },
  {
    kind: "player-comparison",
    category: "stats-dataviz",
    label: "Player Comparison",
    description: "A multi-row stat table comparing two players in genuinely comparable roles.",
    sceneTypeKey: "playercomparison",
    schema: z.object({
      kind: z.literal("player-comparison"),
      leftPlayer: z.string(),
      rightPlayer: z.string(),
      stats: z.array(comparisonStatRowSchema).min(1),
    }),
  },
  {
    kind: "sequence",
    category: "narrative-callouts",
    label: "Sequence",
    description: "A chain of connected moments/minutes building on each other, stacked vertically.",
    sceneTypeKey: "sequence",
    schema: z.object({
      kind: z.literal("sequence"),
      title: z.string(),
      beats: z.array(beatSchema).min(1),
    }),
  },
  {
    kind: "quote",
    category: "narrative-callouts",
    label: "Quote",
    description: "A quoted statement with attribution — for reporting what someone said, not a fact about them.",
    sceneTypeKey: "quote",
    schema: z.object({
      kind: z.literal("quote"),
      quote: z.string(),
      attribution: z.string(),
    }),
  },
  {
    kind: "career-path",
    category: "narrative-callouts",
    label: "Career Path",
    description: "A player's or manager's history as a left-to-right journey across years, minimum two stops.",
    sceneTypeKey: "careerpath",
    schema: z.object({
      kind: z.literal("career-path"),
      title: z.string(),
      stops: z.array(careerStopSchema).min(2),
    }),
  },
  {
    kind: "grid",
    category: "narrative-callouts",
    label: "Grid",
    description: "A grid of small items, each an optional icon + label + caption — for a collection of related facts (transfer rumors, top scorers, award nominees) shown together, not a single fact (that's Icon) or a ranked table (that's League Table).",
    sceneTypeKey: "grid",
    schema: z.object({
      kind: z.literal("grid"),
      title: z.string().optional(),
      items: z.array(gridItemSchema).min(2).max(9),
    }),
  },
  {
    kind: "icon",
    category: "narrative-callouts",
    label: "Icon",
    description: "A single fact paired with a matching symbolic icon (goal/card/save/etc).",
    sceneTypeKey: "icon",
    schema: z.object({
      kind: z.literal("icon"),
      icon: z.enum(ICON_KEYS),
      headline: z.string(),
      caption: z.string(),
    }),
  },
  {
    kind: "code",
    category: "narrative-callouts",
    label: "Code Snippet",
    description:
      "A code-editor-style window — real monospace font, left-aligned, per-token syntax-highlight coloring (keyword/string/function/variable/comment/number/plain), traffic-light chrome, a filename tab. For narration that references actual code, JSON, or a config/log line — not a generic diagram (use Canvas for that, even if it also contains text).",
    sceneTypeKey: "code",
    schema: z.object({
      kind: z.literal("code"),
      // Shown in the tab pill next to the language badge, e.g. "isPrime.js",
      // "response.json" — purely cosmetic, no file is actually read.
      filename: z.string().optional(),
      // Badge text, e.g. "JS", "JSON", "HTTP" — short by convention (this is
      // a small pill, not a label) but not constrained to a fixed list since
      // new scripts may reference languages this file's author didn't
      // anticipate.
      language: z.string().optional(),
      // One entry per line; each line is its own ordered list of colored
      // tokens rendered left-to-right with no forced gaps (a token's own
      // text should include whatever whitespace it needs, e.g. "const " not
      // "const") — real per-token syntax highlighting, not a single flat
      // color per line. An empty array renders as a blank spacer line
      // (still takes up line-height), for grouping related statements the
      // way real code uses blank lines between blocks.
      lines: z
        .array(
          z.array(
            z.object({
              text: z.string(),
              token: z.enum(["keyword", "string", "function", "variable", "comment", "number", "plain"]).default("plain"),
            }),
          ),
        )
        .min(1)
        .max(12),
    }),
  },
  {
    kind: "canvas",
    category: "generic-diagrams",
    label: "Canvas",
    description:
      "A generic 2D scene: freely positioned objects (dot/circle/label/rectangle/roundedRectangle/ellipse/line/polygon), connected by arrows or object-tracking connectors, optionally rearranging across phases (every animatable property glides id-matched from one phase's value to the next) with per-object enter/exit animations, layering, trails, and an optional pan/zoom camera — the general-purpose diagram for anything a pitch/chart visual can't express (systems, physics, spatial relationships).",
    sceneTypeKey: "canvas",
    schema: z.object({
      kind: z.literal("canvas"),
      title: z.string().optional(),
      objects: z.array(canvasObjectSchema).min(1),
      arrows: z.array(canvasArrowSchema).optional(),
      phases: z.array(canvasPhaseSchema).min(1).optional(),
      snap: z.number().optional(),
      camera: canvasCameraSchema.optional(),
    }),
  },
] as const satisfies readonly VisualDefinition[];

export type VisualKind = (typeof VISUAL_DEFINITIONS)[number]["kind"];
