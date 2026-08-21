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
  "cash",
  "wallet",
  "chart",
  "mic",
  "speaker",
  "mute",
  "trash",
  "document",
  "cursor",
  "sparkle",
  "scissors",
  "envelope",
  "key",
  "identification",
  "funnel",
  "tag",
  "clock",
  "refresh",
  "laptop",
  "githubLogo",
  "googleLogo",
  "chromeLogo",
  "javascriptLogo",
  "youtubeLogo",
  "openaiLogo",
  "huggingfaceLogo",
  "thumbsUp",
  "bell",
  "chat",
  "heart",
  "cart",
] as const;
export type CanvasIconKey = (typeof CANVAS_ICON_KEYS)[number];

// A named alternative to authoring raw x/y numbers — the root cause behind
// Canvas scenes shipping with overlapping/off-balance layouts was that every
// object's position was freehand mental arithmetic on a flat 0-100 plane,
// with zero tooling and zero feedback loop (confirmed by reading the actual
// script-authoring pipeline: there's no layout helper anywhere, an author
// just picks numbers). A 5-column x 3-row grid spanning the full safe area
// (matching Canvas.tsx's own EDGE_MARGIN_PERCENT inset — these anchors are
// pre-spread across the true usable frame, not clustered toward the middle,
// which is what actually addresses "wasted real estate") gives an author a
// discrete, well-separated set of positions to choose from instead of
// freehanding a number. Deliberately NOT a forced replacement for x/y —
// arrow endpoints, phase-to-phase glide paths, and anything needing exact
// placement still need real numbers; `anchor` is sugar for the common "put
// this in a zone" case (see canvasObjectSchema's refine below).
export const CANVAS_ANCHOR_KEYS = [
  "topFarLeft",
  "topLeft",
  "topCenter",
  "topRight",
  "topFarRight",
  "middleFarLeft",
  "middleLeft",
  "middleCenter",
  "middleRight",
  "middleFarRight",
  "bottomFarLeft",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
  "bottomFarRight",
] as const;
export type CanvasAnchorKey = (typeof CANVAS_ANCHOR_KEYS)[number];

// The lookup table itself — plain numbers, no React/video import (same
// model-layer-only rule CanvasIconKey follows). Columns spread edge-to-edge
// across the same inset safe area Canvas.tsx's EDGE_MARGIN_PERCENT (8) already
// reserves, so an anchor never needs its own separate clamping — it's already
// guaranteed inside the safe area by construction.
const ANCHOR_COLUMNS = { farLeft: 8, left: 29, center: 50, right: 71, farRight: 92 };
const ANCHOR_ROWS = { top: 12, middle: 50, bottom: 88 };
export const CANVAS_ANCHOR_POSITIONS: Record<CanvasAnchorKey, { x: number; y: number }> = {
  topFarLeft: { x: ANCHOR_COLUMNS.farLeft, y: ANCHOR_ROWS.top },
  topLeft: { x: ANCHOR_COLUMNS.left, y: ANCHOR_ROWS.top },
  topCenter: { x: ANCHOR_COLUMNS.center, y: ANCHOR_ROWS.top },
  topRight: { x: ANCHOR_COLUMNS.right, y: ANCHOR_ROWS.top },
  topFarRight: { x: ANCHOR_COLUMNS.farRight, y: ANCHOR_ROWS.top },
  middleFarLeft: { x: ANCHOR_COLUMNS.farLeft, y: ANCHOR_ROWS.middle },
  middleLeft: { x: ANCHOR_COLUMNS.left, y: ANCHOR_ROWS.middle },
  middleCenter: { x: ANCHOR_COLUMNS.center, y: ANCHOR_ROWS.middle },
  middleRight: { x: ANCHOR_COLUMNS.right, y: ANCHOR_ROWS.middle },
  middleFarRight: { x: ANCHOR_COLUMNS.farRight, y: ANCHOR_ROWS.middle },
  bottomFarLeft: { x: ANCHOR_COLUMNS.farLeft, y: ANCHOR_ROWS.bottom },
  bottomLeft: { x: ANCHOR_COLUMNS.left, y: ANCHOR_ROWS.bottom },
  bottomCenter: { x: ANCHOR_COLUMNS.center, y: ANCHOR_ROWS.bottom },
  bottomRight: { x: ANCHOR_COLUMNS.right, y: ANCHOR_ROWS.bottom },
  bottomFarRight: { x: ANCHOR_COLUMNS.farRight, y: ANCHOR_ROWS.bottom },
};

// Canvas's Lottie vocabulary — same curated-allow-list convention as
// CANVAS_ICON_KEYS, for motion Canvas's static icon/shape primitives can't
// express: small hand-authored motifs (a loading spinner, a checkmark
// burst) AND sourced illustrations dropped in as a JSON file (e.g.
// "humanComputer" — a person at a laptop, from LottieFiles) that get
// registered the exact same way. The actual Lottie JSON + <Lottie>
// rendering lives in ../video/lottieAssets/index.ts (video-layer only, same
// reasoning as canvasIcons.ts) — this file only owns the data-level key
// list.
export const LOTTIE_ASSET_KEYS = ["spinner", "checkBurst", "humanComputer", "videoGoingViral"] as const;
export type LottieAssetKey = (typeof LOTTIE_ASSET_KEYS)[number];

// Shared by BarChart and Donut (`shape`) — `icon` is optional and BarChart-
// only in practice (DonutChartCard doesn't read it, same "extra field is
// safely ignored" convention as Animation on unsupported visual kinds).
// Reuses Canvas's own icon vocabulary rather than a third icon enum, since
// a bar chart is just as likely to need a topic-agnostic icon (money,
// warning, a trophy stand-in via `target`) as a Canvas diagram is.
const barSchema = z.object({
  label: z.string(),
  value: z.number(),
  icon: z.enum(CANVAS_ICON_KEYS).optional(),
});

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

// Shared by every 3D pitch visual (tactical-board-3d/formation-3d/
// shot-map-3d) — which of camera3D.ts's pure pose functions
// (resolveCameraPose3D) drives that scene's camera. "sway" (the original v1
// behavior, a narrow behind-goal arc) stays the default so an existing 3D
// scene authored before the other three styles existed is unaffected.
// "two-team-reveal" (Formation 3D only — see Formation3D.tsx) holds tight on
// one side's cluster, glides across, then holds tight on the other's, so
// labels stay legible instead of a single wide shot trying to fit all 22
// players (see feedback_formation3d_camera_too_wide memory for why that
// wide shot doesn't work).
// "cinematic-drift" (added alongside camera3D.ts's own addition of the same
// name — a forward-looking dolly/truck rather than an orbit around a fixed
// target) is legal on every 3D kind sharing this schema, not just
// canvas-3d — the pose function itself is generic, no reason to scope the
// schema narrower than it.
const cameraStyle3DSchema = z
  .enum(["sway", "orbit", "sideline-pan", "dolly-in", "two-team-reveal", "cinematic-drift"])
  .default("sway");

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

// Shared by the Code Snippet visual's primary panel and its optional
// secondPanel — one line is an ordered list of colored tokens (real
// per-token syntax highlighting, not one flat color per line).
const codeLinesSchema = z
  .array(
    z.array(
      z.object({
        text: z.string(),
        token: z.enum(["keyword", "string", "function", "variable", "comment", "number", "plain"]).default("plain"),
      }),
    ),
  )
  .min(1)
  .max(12);

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
const canvasObjectSchema = z
  .object({
  id: z.string(),
  type: z.enum(["dot", "circle", "label", "rectangle", "roundedRectangle", "ellipse", "line", "polygon", "icon", "lottie", "gif", "image"]),
  // Either give exact x/y, or name an `anchor` (see CANVAS_ANCHOR_KEYS above)
  // and let it resolve the position — enforced below by .refine(), since
  // Zod has no native "one of these two shapes" for optional siblings.
  // Numeric x/y still wins if BOTH are somehow given (an anchor with an
  // explicit override), matching the general "specific beats general"
  // convention used elsewhere in this schema.
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  anchor: z.enum(CANVAS_ANCHOR_KEYS).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  // "icon" type only — which Heroicon (or curated brand SVG) to render.
  // Required for that type to render anything (an "icon" object with no
  // `icon` key renders nothing).
  icon: z.enum(CANVAS_ICON_KEYS).optional(),
  // "lottie" type only — which hand-authored Lottie motif to play (see
  // LOTTIE_ASSET_KEYS above). Required for that type to render anything.
  // Plays once (no loop) starting the frame this object first appears —
  // for a one-shot confirmation beat (a checkmark burst on success), not
  // continuous ambient motion (that's `idle` on a plain icon/shape).
  lottie: z.enum(LOTTIE_ASSET_KEYS).optional(),
  // "gif" type only — the filename of a GIF sitting in public/assets/gifs/
  // (e.g. "trending-up.gif"). Unlike `icon`/`lottie`, deliberately a free
  // string rather than a curated enum: a GIF is an arbitrary sourced
  // illustration (GIPHY, etc.), open-ended by nature the same way a player
  // photo in assets.ts is — there's no fixed small vocabulary to enumerate.
  // A typo here fails silently at render time (the GIF just doesn't load)
  // rather than at schema-validation time, the one real tradeoff against
  // `icon`/`lottie`'s stricter enum safety; worth it for not needing a code
  // change every time a new GIF is dropped in.
  gifFile: z.string().optional(),
  // "image" type only — the filename of a static image sitting in
  // public/assets/logos/ (e.g. "techijest-logo.png"). For a fixed brand
  // asset (a channel logo) rather than a sourced illustration — free string
  // like `gifFile`, same tradeoff (typo fails silently at render time, not
  // schema-validation time).
  imageFile: z.string().optional(),
  // "label" type only — tweens the DISPLAYED NUMBER smoothly from
  // `countFrom` to `countTo` over `countDurationSeconds` once this object
  // appears, instead of `label` sitting static or hard-swapping text at
  // each phase boundary. This is what an actual "counter" motion graphic
  // needs (a real odometer-style count-up) — phase-to-phase text swapping
  // alone reads as a slideshow, not motion, confirmed as a real complaint on
  // a real render. Formats with thousands separators automatically. When
  // set, overrides `label` entirely for as long as this object is on
  // screen; omit both `countFrom`/`countTo` to keep authoring a plain
  // static label exactly as before.
  countFrom: z.number().optional(),
  countTo: z.number().optional(),
  countDurationSeconds: z.number().min(0.1).optional(),
  // "circle"/"ellipse" radius, OR "roundedRectangle" corner radius, OR
  // "icon"/"lottie"/"gif" half-size — percent of canvas width, so a growing
  // radar bubble/zone can be authored without pixel math (same convention
  // as pitch coordinates).
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
  // Without this, an object's entrance timing is purely array-index-driven
  // (10 frames apart, ~0.33s) — fine for a diagram that just needs to build
  // itself, wrong for "this node should appear the instant the narration
  // says its name." Set to seconds from the START OF THE SCENE (not the
  // phase) and this object's entrance fires exactly then instead of on the
  // automatic stagger — the actual fix for a real complaint: components
  // appearing all at once (or on a fixed fast stagger) instead of
  // progressively, in step with what's being said. Omit for the old
  // automatic-stagger behavior, unchanged.
  revealAtSeconds: z.number().min(0).optional(),
  // How this object animates in when it first appears (phase 0, or a later
  // phase it's newly present in) / out (present in the previous phase but
  // absent from this one). "fade" (today's only enter behavior) and "none"
  // (today's only exit behavior — an absent object simply vanishes) are the
  // defaults, so no existing script's visual behavior changes. The extra
  // variants beyond fade/scale/slide exist because every scene defaulting to
  // the same fade/slide-up read as visually samey next to something like
  // CapCut's transition variety — "slide" keeps its original meaning
  // (glides up into place) for backward compatibility; "slideLeft"/
  // "slideRight" glide in horizontally, "rotate" eases in a slight tilt
  // alongside the fade, "blur" sharpens in from a soft focus, "zoomOut" is
  // the opposite feel from "scale" (starts LARGER than its final size and
  // settles down, vs. "scale" growing up from nothing). All still build on
  // motion.ts's settle/ease helpers — no spring/bounce/overshoot anywhere,
  // same calm-broadcast rule as the original three.
  enter: z.enum(["none", "fade", "scale", "slide", "slideLeft", "slideRight", "rotate", "blur", "zoomOut"]).default("fade"),
  exit: z.enum(["none", "fade", "scale", "slide", "slideLeft", "slideRight", "rotate", "blur"]).default("none"),
  // easeOutBack/anticipate (src/video/cinematicEasing.ts) are legal here on
  // top of motion.ts's original four, same as canvas-3d already allows —
  // resolved through keyframes.ts's exported resolveEasing. Only meaningful
  // on entrance (see Canvas.tsx); phase-to-phase glide/idle motion still
  // uses the original four via motion.ts directly, unchanged.
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "easeOutBack", "anticipate", "emphasized", "spring"]).default("easeOut"),
  // A fading ghost trail behind this object while it glides — same
  // technique as TacticalBoard's GHOST_TRAIL, opt-in per object.
  trail: z.boolean().default(false),
  // "line" type only — the segment draws itself from its start point to its
  // full length over its entrance (a self-drawing connector/underline, the
  // classic motion-graphics line reveal) instead of appearing at full
  // length. No-op on every other type.
  draw: z.boolean().default(false),
  // Frosted-glass styling instead of the object's normal flat fill — a
  // translucent tint, blurred backdrop, and a soft light-catching border.
  // For "rectangle"/"roundedRectangle"/"circle"/"ellipse" this replaces the
  // shape's own flat fill; for "icon" it adds a frosted tile panel behind
  // the glyph (icons themselves stay flat/opaque — a frosted glyph reads as
  // illegible, not stylish). No-op on every other type. `color` still
  // tints the glass (a faint wash of that hue) rather than being ignored.
  glass: z.boolean().default(false),
  // Continuous ambient motion, layered on top of everything above (entrance,
  // phase-to-phase glide, author-set rotation/scale/opacity) rather than
  // replacing it — built on motion.ts's `pulse()` helper, which already
  // existed and is used by 13 other compositions but was never wired into
  // Canvas. "none" (default) reproduces today's exact behavior: an object
  // sits fully still once its entrance settles. "spin" = continuous full
  // rotation (a processor/loading motif). "pulse" = gentle continuous scale
  // breathing (something "active"). "glow" = continuous opacity breathing
  // (a status indicator, a live connection). "drift" = genuine (small,
  // slow) POSITION movement rather than an in-place effect — a real "this
  // is alive" object for a long hold, not decoration; use it on the one or
  // two focal objects a beat is actually about, not blanket-applied to
  // everything on screen. Each object's own `id` seeds a phase offset so
  // multiple idle objects in the same scene don't breathe/drift in
  // lockstep.
  idle: z.enum(["none", "spin", "pulse", "glow", "drift"]).default("none"),
  // "label" type only — opt into a different text treatment than this
  // project's normal bold body/caption style, still the same Montserrat
  // family (no second display font — reverted after a real render showed
  // Anton's condensed letterforms reading cramped/wrong for a wordmark).
  // "wordmark" is heavier (800) with real letter-spacing, for an actual
  // brand-name moment (e.g. "TECHIJEST" on the channel intro card);
  // "subtitle" (`SUBTITLE_FONT_FAMILY`, Poppins 300) is a thin companion
  // weight for a tagline sitting under one. No-op on every other type;
  // "default" (the default) reproduces today's exact rendering.
  // "detail" — smaller than the default 46px body/caption size, same
  // weight/family, no uppercasing. For a subordinate line that needs to
  // read as SUBORDINATE to a nearby header/value rather than competing
  // with it for visual weight (e.g. a section header like "PAYMENT" vs. a
  // field value sitting under it) — composeSelect.ts's staged rebuild is
  // the first real user of this.
  fontStyle: z.enum(["default", "wordmark", "subtitle", "detail"]).default("default"),
  // "rectangle"/"roundedRectangle" only — sizes the box to fit its own
  // `label` text (a single-line measurement, padded) instead of the author
  // guessing `width`/`height` by hand. This is Canvas's answer to
  // diagramLayout.ts's `sizeNode`: a labeled card (a "GET /refund" request
  // card, a "200 OK" response card, a "SELECT * FROM users" query card) can
  // never overflow its own box or get clipped by a too-small authored width,
  // the exact failure class that made hand-placed Canvas text unreliable —
  // see feedback_canvas_authoring_geometry_gotchas and the doctrine at
  // project_shorts_visual_direction_doctrine. Authored `width`/`height` are
  // ignored entirely when this is true (computed fresh from `label` every
  // frame — cheap, and the box should always exactly fit its current text).
  // Defaults to false so every existing script's rectangles keep their
  // author-picked size unchanged.
  autoSize: z.boolean().default(false),
  })
  .refine((object) => object.anchor !== undefined || (object.x !== undefined && object.y !== undefined), {
    message: "CanvasObject needs either an `anchor` or both `x` and `y`",
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
  // Same fix as canvasObjectSchema's own revealAtSeconds, for the connector
  // itself — seconds from the start of the scene at which this arrow starts
  // drawing in, instead of the automatic array-index stagger. Author it to
  // land at or after whichever of `from`/`to` appears later, or the arrow
  // will visibly draw toward/from a node that hasn't appeared yet.
  revealAtSeconds: z.number().min(0).optional(),
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

// Easing vocabulary for Canvas timeline actions — motion.ts's calm four plus
// cinematicEasing.ts's full set. Timeline moves DEFAULT to "emphasized"
// (Material's fast-launch/long-settle feel) rather than easeOut: the whole
// point of authoring an evented timeline is choreographed, weighted motion,
// so the cinematic curve is the right baseline there — phase-based scenes
// keep their calm easeOut default untouched.
const canvasTimelineEasingSchema = z
  .enum(["linear", "easeIn", "easeOut", "easeInOut", "emphasized", "easeOutBack", "anticipate", "spring"])
  .optional();

// The Canvas sound-event vocabulary (src/cadence/canvasCadences.ts) reused
// here so a timeline action can request its OWN short cue at its OWN
// startSeconds, instead of the scene falling back to one generic whoosh
// stretched under its entire duration. `success`/`alert` cover a
// confirmation (a checkmark landing, a charge going through) and a
// warning/danger beat (a connection dropping, a TTL expiring) — distinct
// from the neutral `entrance`/`click`, since a checkmark shouldn't sound
// like a button press.
const canvasTimelineSoundEventSchema = z.enum(["entrance", "move", "zoom", "click", "highlight", "success", "alert", "typing"]).optional();

// Canvas's evented timeline — the same "per-actor timing instead of a shared
// per-phase clock" idea TacticalBoard's `timeline` already proved out, ported
// to the generic diagram canvas. Each action carries its own startSeconds
// (absolute, from the scene's start); any number can overlap or stagger, so a
// scene reads as choreography (this moves WHILE that fades WHILE the camera
// pushes in) rather than everyone re-arranging together. If both `phases`
// and `timeline` are present, `timeline` wins — mirroring TacticalBoard's
// own precedence convention.
const canvasTimelineActionSchema = z.discriminatedUnion("type", [
  // Glides any combination of an object's animatable properties to new
  // values. `path: "arc"` bends the position glide along a quadratic curve
  // (control point offset perpendicular to the straight line by `bow`
  // percent, sign picks the side — same convention as arrow bows elsewhere);
  // "line" (the default) is a straight glide.
  z.object({
    type: z.literal("move"),
    id: z.string(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(0.8),
    to: z.object({ x: z.number().min(0).max(100).optional(), y: z.number().min(0).max(100).optional() }).optional(),
    scale: z.number().optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    radius: z.number().min(0).max(100).optional(),
    path: z.enum(["line", "arc"]).default("line"),
    bow: z.number().optional(),
    easing: canvasTimelineEasingSchema,
    sound: canvasTimelineSoundEventSchema,
  }),
  // Tweens an object's color (real interpolation, not a hard swap) and/or
  // swaps its label text at `startSeconds`. Label swaps are instant by
  // design — text can't meaningfully interpolate.
  z.object({
    type: z.literal("style"),
    id: z.string(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
    color: z.string().optional(),
    label: z.string().optional(),
    easing: canvasTimelineEasingSchema,
    sound: canvasTimelineSoundEventSchema,
  }),
  // The object stays hidden until `startSeconds`, then plays its own `enter`
  // animation — the working (timeline-scoped) version of what the per-object
  // `revealAtSeconds` field promises.
  z.object({
    type: z.literal("appear"),
    id: z.string(),
    startSeconds: z.number().min(0),
    sound: canvasTimelineSoundEventSchema,
  }),
  // Fades the object out over `durationSeconds` and stops rendering it —
  // the exit-mid-scene that phase mode can only express by dropping the
  // object from a later phase's list.
  z.object({
    type: z.literal("disappear"),
    id: z.string(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(0.4),
    sound: canvasTimelineSoundEventSchema,
  }),
  // Pans/zooms the camera from wherever it currently is — any number of
  // these can fire across the scene, same as TacticalBoard's timeline
  // camera actions.
  z.object({
    type: z.literal("camera"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.2),
    x: z.number().min(0).max(100).optional(),
    y: z.number().min(0).max(100).optional(),
    zoom: z.number().min(0.5).max(6).optional(),
    easing: canvasTimelineEasingSchema,
    sound: canvasTimelineSoundEventSchema,
  }),
  // Directs attention WITHOUT moving the camera: the listed objects stay at
  // full strength while everything else recedes but stays visible for
  // context. This is the primary focus mechanic for a diagram that is being
  // built up cumulatively — reach for it before a camera zoom, which loses
  // the surrounding structure the viewer is meant to be placing things into.
  // An empty `ids` clears the focus and restores every object.
  z.object({
    type: z.literal("focus"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
    ids: z.array(z.string()),
    /** How far unfocused objects recede. 0.3 is a strong subordination that
     * still leaves shapes readable; raise it toward 1 for a gentler pass. */
    dimOpacity: z.number().min(0).max(1).default(0.28),
    easing: canvasTimelineEasingSchema,
    sound: canvasTimelineSoundEventSchema,
  }),
]);

// canvas-3d's object schema, restricted to the "core 6" v1 types (dot/
// circle/roundedRectangle/line/icon/label) — ellipse/polygon/sharp
// rectangle are deferred, see Canvas3D.tsx's docstring for the full scope-cut
// list. Adds an optional `z` (0-100, default 50 = mid-depth) for real camera
// parallax — the actual payoff of a 3D canvas over the pitch family's flat
// billboarded markers, which have no depth axis at all.
const canvasObject3DSchema = z.object({
  id: z.string(),
  type: z.enum(["dot", "circle", "roundedRectangle", "line", "icon", "label"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  z: z.number().min(0).max(100).default(50),
  label: z.string().optional(),
  color: z.string().optional(),
  icon: z.enum(CANVAS_ICON_KEYS).optional(),
  radius: z.number().min(0).max(100).optional(),
  width: z.number().min(0).max(100).optional(),
  height: z.number().min(0).max(100).optional(),
  // Opts a dot/circle/roundedRectangle into REAL volumetric geometry (a
  // sphere/puck/extruded block, not billboarded flat) instead of the
  // camera-facing cutout every object without this renders as — see
  // Canvas3D.tsx's rendering branch. Absent (the default) reproduces
  // today's exact flat-billboard rendering; icons/labels ignore this
  // entirely, they're legitimately flat content.
  depth: z.number().min(0).max(100).optional(),
  rotation: z.number().default(0),
  scale: z.number().default(1),
  opacity: z.number().min(0).max(1).default(1),
  filled: z.boolean().default(true),
  fillOpacity: z.number().min(0).max(1).optional(),
  strokeWidth: z.number().optional(),
  layer: z.number().default(0),
  enter: z.enum(["none", "fade", "scale", "slide"]).default("fade"),
  exit: z.enum(["none", "fade", "scale", "slide"]).default("none"),
  // easeOutBack/anticipate (src/video/cinematicEasing.ts) are legal here on
  // top of motion.ts's original four — resolved through keyframes.ts's
  // exported resolveEasing, which already knows both sets. Only meaningful
  // on entrance (see Canvas3D.tsx) — idle/glide motion still uses the
  // original four via motion.ts directly, unchanged.
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "easeOutBack", "anticipate", "emphasized", "spring"]).default("easeOut"),
  trail: z.boolean().default(false),
  // "orbit" is 3D-only (not added to Canvas's 2D idle enum) — continuously
  // revolves the object around its OWN authored (x,y) in the camera-facing
  // plane, radius/period given by `orbitRadius`/`orbitPeriodFrames` below.
  // The other three idle modes (spin/pulse/glow) animate the object IN
  // PLACE; this is the one idle mode that moves its position, for genuinely
  // orbital motion (a satellite around a planet) that a discrete `phases`
  // re-arrangement would only approximate choppily.
  idle: z.enum(["none", "spin", "pulse", "glow", "orbit"]).default("none"),
  // "orbit" idle only — percent-of-canvas radius of the revolution circle.
  orbitRadius: z.number().min(0).max(100).optional(),
  // "orbit" idle only — frames per full revolution (30fps: 150 = 5s/orbit).
  orbitPeriodFrames: z.number().min(1).optional(),
});

// No `flow` field (see Canvas3D.tsx's docstring — deferred, needs an
// imperative per-frame material mutation for what's ultimately a cosmetic
// detail on top of an already-working draw-in + traveling dot).
const canvasArrow3DSchema = z.object({
  from: z.string(),
  to: z.union([
    z.string(),
    z.object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
      z: z.number().min(0).max(100).default(50),
    }),
  ]),
  style: z.enum(["solid", "dashed", "dotted", "double"]).default("solid"),
  label: z.string().optional(),
  color: z.string().optional(),
  strokeWidth: z.number().optional(),
});

// Camera TARGET/ZOOM only — WHICH camera3D.ts style (sway/orbit/sideline-pan/
// dolly-in) drives the scene lives on the top-level `cameraStyle` field
// instead (same field name/convention as the pitch family's tactical-board-3d
// etc.), not here: switching styles mid-scene at a phase boundary would
// produce a discontinuous jump (each style's position formula is unrelated
// to the others'), so only WHERE a style's ambient motion is centered glides
// per phase, not the style itself.
const canvasCamera3DSchema = z.object({
  target: z
    .object({
      x: z.number().min(0).max(100).default(50),
      y: z.number().min(0).max(100).default(50),
      z: z.number().min(0).max(100).default(50),
    })
    .default({ x: 50, y: 50, z: 50 }),
  zoom: z.number().min(0.5).max(6).default(1),
});

const canvasPhase3DSchema = z.object({
  objects: z.array(canvasObject3DSchema).min(1),
  arrows: z.array(canvasArrow3DSchema).optional(),
  camera: canvasCamera3DSchema.optional(),
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
// The `diagram` medium's node shape. Nesting is spelled out to three explicit
// levels rather than expressed with `z.lazy`: `Visual` is derived from these
// schemas via `z.infer`, and a recursive schema infers as `any` there, which
// would silently switch off type-checking for every consumer of a diagram
// visual. Three levels covers the real cases in this register (region > cluster
// > node, or VPC > subnet > instance) — deepen it only when a script needs it.
const diagramNodeBase = {
  id: z.string().min(1),
  label: z.string().optional(),
  sublabel: z.string().optional(),
  shape: z.enum(["box", "service", "database", "queue", "user", "cloud", "gateway", "balancer", "group"]).optional(),
  icon: z.string().optional(),
  /** A real technology's name — "redis", "postgresql", "kafka", "Node.js".
   * Resolved during generation to the actual brand mark (Simple Icons, cached
   * locally); falls back to this node's `shape` glyph if it can't be fetched,
   * so an offline run still renders. Use it whenever a node IS a named
   * technology rather than a generic role. */
  brand: z.string().optional(),
  /** Filled in by the brand resolver — path relative to public/. Not authored
   * by hand. */
  logoPath: z.string().optional(),
  /** The brand's own colour, filled in by the resolver — tints the tile. */
  logoHex: z.string().optional(),
  /** Filled in by the resolver: false for a full-colour mark, which is drawn
   * as-is rather than tinted. */
  logoMonochrome: z.boolean().optional(),
  accent: z.enum(["neutral", "primary", "warn", "success", "danger"]).optional(),
  childDirection: z.enum(["horizontal", "vertical"]).optional(),
  /** N identical copies, drawn as one stacked node so they cannot drift apart
   * visually the way N hand-placed icons did. */
  replicas: z.number().int().min(1).max(12).optional(),
};

const diagramLeafSchema = z.object(diagramNodeBase);
const diagramMidSchema = z.object({ ...diagramNodeBase, children: z.array(diagramLeafSchema).optional() });
const diagramNodeSchema = z.object({ ...diagramNodeBase, children: z.array(diagramMidSchema).optional() });

// ---------------------------------------------------------------------------
// Stage — the Techijest Shorts medium. See src/script/stageLayout.ts for why
// this is a separate medium from `diagram` rather than a mode of it: diagram's
// layered layout can only ever emit a single flow axis, which in 9:16 means a
// vertical flowchart BY CONSTRUCTION, and its geometry is computed once so
// nothing can ever move, grow or recede.
// ---------------------------------------------------------------------------

/** The 3x3 stage. Regions are stable across scenes on purpose — an object put
 * in `center` sits in the same place in every scene that puts it there, which
 * is what lets a viewer learn the space across a series instead of re-reading
 * the frame every cut. */
const stageRegionSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

/** Visual weight. `lead` is the object being explained RIGHT NOW and grows to
 * dominate; `recede` is context the viewer must still see but must not read as
 * the subject, and genuinely shrinks (a purely dimmed object reads as "faded
 * out", a smaller one reads as "further away"). If everything is moving,
 * nothing feels important — this is the field that buys visual contrast. */
const stageEmphasisSchema = z.enum(["lead", "normal", "recede"]);

/** Semantic colour, not decoration: once a colour carries a meaning it keeps it
 * for the whole video, so the viewer reads the palette subconsciously.
 * neutral = structure and reality · primary = a digital signal · warn =
 * advertising and commercial intent · success = a control the viewer holds ·
 * danger = the misconception · profile = behavioural inference and prediction,
 * which is a distinct idea from "something has gone wrong" and needs its own
 * colour rather than borrowing danger's. */
const stageAccentSchema = z.enum(["neutral", "primary", "warn", "success", "danger", "profile"]);

/** What the object IS, chosen so the silhouette is recognisable WITHOUT its
 * label — a shape must be recognisable, not merely distinct. Everything here is
 * either a real-world object with a universal outline or an explicitly generic
 * card (`note`). Represent the actual thing being discussed: a browser is a
 * browser window, a database is a cylinder, a queue has real slots. */
const stageObjectKindSchema = z.enum([
  // devices — where a request starts
  "client",
  "browser",
  "phone",
  "tv",
  "laptop",
  // network & routing
  "cdn",
  "gateway",
  "loadBalancer",
  // compute
  "server",
  "service",
  "container",
  "worker",
  "function",
  // state
  "database",
  "cache",
  "storage",
  "table",
  "queue",
  // media & data
  "stream",
  "code",
  // security
  "token",
  "lock",
  // A QR CODE, drawn as a real module grid with its three finder squares.
  // The structure IS the subject whenever one is on screen — a scannable code
  // that survives being partly covered cannot be told with a rounded rectangle,
  // and it is among the most recognisable shapes anyone sees in a week.
  "qr",
  // A CITY DIVIDED INTO HEXAGONS. Not decoration: several real systems
  // (ride dispatch, surge pricing, delivery zones, coverage maps) price and
  // route by tile rather than by city, and the tiling itself is the mechanism.
  "hexmap",
  // QUANTITIES WITH A UNIVERSAL SHAPE. A duration, a distance and an amount of
  // money turn up in almost every explanation that involves a price, and a
  // generic card labelled "minutes" is a caption doing the work the silhouette
  // should be doing. All three of these are recognisable with the sound off and
  // the label removed, which is the bar every shape here has to clear.
  "clock",
  "road",
  "money",
  // WORDS AS THE SUBJECT. Not a code pane and not a label on a box: the text
  // itself is the thing being explained, set in display type with no chrome
  // around it. For scripts whose mechanism happens to a sentence — an
  // instruction being rewritten, a value being carried, a claim being quoted
  // forward — typography is the honest medium and a diagram is a detour.
  "phrase",
  // environments
  // A whole application, drawn as a product rather than as a window: the scene's
  // world, with screens that replace one another while the shell persists.
  "app",
  // THE MODEL'S OWN CONTEXT, as a place things accumulate.
  // The single most useful object for explaining why language models get things
  // wrong: everything the model knows arrives here as text, from wherever, with
  // nothing marking which part is the goal and which part is just something it
  // read. Showing that pile is showing the cause.
  "context",
  // THE PRIVATE-BROWSING MARK: the hat and glasses every browser uses for it.
  // A symbol the audience already associates with the promise being examined,
  // which makes it the right thing to put on screen while that promise is taken
  // apart.
  "incognito",
  // AN ACTUAL PHONE BOOK: covers, pages, entries, a found line.
  // Built because "DNS is the internet's phonebook" is the single best analogy
  // in networking and it is routinely thrown away by drawing a server rack.
  // A book that opens and is read explains the lookup with the sound off; a
  // labelled box does not.
  "phonebook",
  // THE SHAPE OF BEING TRACKED. Five things that recur in every explanation of
  // advertising, profiling and personalisation, and that are routinely drawn as
  // labelled rectangles because the engine had nothing better: a map you can
  // move across, a marker that sits somewhere, a cookie, a profile that fills
  // up, and a prediction that is explicitly a probability rather than a fact.
  "map",
  "pin",
  "cookie",
  "profile",
  "prediction",
  // ---- reference frames -------------------------------------------------
  /** A DIRECTION, drawn as an arrow with a head — a quantity that points.
   *
   * Its whole reason to exist is the `frame` field beside it. A vector fixed to
   * the WORLD keeps pointing the same way however the thing it is attached to
   * turns; a vector fixed to the BODY turns with it. Gravity stays down while a
   * phone spins, and the phone's own screen-up axis does not — showing those
   * two arrows on one rotating object teaches the difference between a local
   * and a global reference frame without a word of narration, which no
   * arrangement of static icons can do. */
  "vector",
  /** THE PLANET, drawn as a sphere with meridians rather than a flat disc —
   * the one object that establishes "this is happening in the world, not on a
   * screen". Its `states` carry what is being said about it: `field` draws the
   * dipole loops of a magnetic field around it, which is the difference between
   * asserting the Earth has a field and showing one. */
  "globe",
  /** A COMPASS ROSE with a needle. Not decoration: it is the everyday object
   * that already means "which way am I facing" to every viewer, so it can carry
   * a whole scene without a label explaining it. */
  "compass",
  // structure — a `region` is a CONTAINER, drawn as a quiet dashed frame
  // behind whatever declares it as `parent`
  "region",
  "note",
]);

/** ONE BLOCK OF PRODUCT UI. The vocabulary a believable application is built
 * from, rather than a generic row list — a date picker that is actually a
 * calendar, results that are actually cards, a seat map that is actually seats.
 * Fidelity is not decoration here: the mistake this medium exists to show is
 * only visible if the audience recognises the surface it happens on. */
const appBlockSchema = z.discriminatedUnion("kind", [
  /** A row of labelled inputs, the way every search form lays them out. */
  z.object({
    kind: z.literal("fields"),
    items: z
      .array(z.object({ id: z.string().min(1), label: z.string(), value: z.string().default("") }))
      .min(1)
      .max(4),
  }),
  /** A REAL MONTH GRID. `selected` is what the product has chosen; `requested`
   * is what the user actually asked for, drawn differently and left unselected.
   * Putting both on the same calendar is the whole tension of an agent taking a
   * default: the audience can see the two days at once. */
  z.object({
    kind: z.literal("calendar"),
    month: z.string().min(1),
    /** First weekday of the shown week row, 0 = Mon. */
    startDay: z.number().int().min(0).max(6).default(0),
    days: z.array(z.number().int()).min(5).max(14),
    selected: z.number().int().optional(),
    requested: z.number().int().optional(),
  }),
  /** Result cards — flights, rooms, options. */
  z.object({
    kind: z.literal("cards"),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string(),
          sub: z.string().optional(),
          value: z.string().optional(),
          badge: z.string().optional(),
        }),
      )
      .max(4),
  }),
  /** A seat grid, with one seat selectable. */
  z.object({
    kind: z.literal("seatmap"),
    rows: z.number().int().min(2).max(6).default(4),
    cols: z.number().int().min(3).max(8).default(6),
    selected: z.string().optional(),
  }),
  /** Line items with values — a checkout summary or a receipt. */
  z.object({
    kind: z.literal("summary"),
    items: z.array(z.object({ label: z.string(), value: z.string().optional(), state: z.enum(["plain", "good", "bad"]).default("plain") })).max(6),
  }),
  /** A process that is visibly running, then resolved. */
  z.object({
    kind: z.literal("status"),
    label: z.string(),
    state: z.enum(["processing", "approved", "failed"]).default("processing"),
  }),
  /** The big confirmation card a product shows when it is finished. */
  z.object({
    kind: z.literal("confirmation"),
    title: z.string(),
    route: z.string().optional(),
    date: z.string().optional(),
    reference: z.string().optional(),
  }),
  z.object({ kind: z.literal("button"), id: z.string().min(1), label: z.string() }),
  z.object({ kind: z.literal("heading"), text: z.string() }),
]);

const stageObjectSchema = z.object({
  id: z.string().min(1),
  kind: stageObjectKindSchema,
  label: z.string().optional(),
  sublabel: z.string().optional(),
  /** Home region — where this object sits until a `compose` moves it. */
  at: stageRegionSchema,
  emphasis: stageEmphasisSchema.optional(),
  accent: stageAccentSchema.optional(),
  /** Draws this object as a DARK ANCHOR rather than a tinted outline.
   *
   * On a cream canvas every object rendered as "dark outline + pale tint"
   * eventually flattens the frame: cream, then a slightly-less-cream card,
   * then more cream. A composition needs somewhere for the eye to land, and
   * the cheapest way to get it is to let a few objects be genuinely dark —
   * a profile card with a navy body, an ad in a dark frame — so the rhythm
   * runs cream -> dark anchor -> colour -> cream.
   *
   * Its label flips to light automatically; light text on a dark body is the
   * one place light text is correct here. Use it for the two or three objects
   * per video that carry the most weight, never as the default. */
  surface: z.enum(["default", "dark"]).optional(),
  /** `vector` only — WHICH REFERENCE FRAME this direction belongs to.
   *
   * "world" is fixed to the scene: gravity points down and magnetic north
   * points north no matter what the object it is drawn on is doing. "body" is
   * fixed to its host and turns with it, the way a phone's own screen-up axis
   * does. Drawing both on one rotating object is the entire demonstration of
   * local versus global reference frames. */
  frame: z.enum(["world", "body"]).optional(),
  /** `vector` only — the direction it points, in degrees clockwise from
   * straight up. For a "body" vector this is measured from its host's current
   * heading rather than from the screen. */
  dir: z.number().optional(),
  /** `vector` only — the object this direction belongs to. The arrow is drawn
   * from that object's centre, and a "body" vector inherits its rotation. */
  attachTo: z.string().optional(),
  /** Nests this object inside another (which should be a `region`). The parent
   * is SIZED FROM ITS CHILDREN and drawn behind them, so "this service lives in
   * us-east-1" is structural rather than two boxes placed near each other in
   * the hope the viewer infers it. One level of nesting only — deeper
   * hierarchies stop being legible at phone size. A nested object ignores its
   * own `at`. */
  parent: z.string().optional(),
  /** Draws N stacked copies instead of one box — a fleet, a replica set, a
   * hundred instances of one service. Identical is the point: N replicas must
   * look like N of the SAME thing. Occupies one box in layout regardless of N,
   * and caps its drawn stack so a large number stays legible. */
  replicas: z.number().int().min(1).max(50).optional(),
  /** A real brand mark, resolved from Simple Icons at generation time and
   * cached (see assets/brandRegistry.ts). Name it whenever the object IS a
   * recognisable product — "netflix", "cassandra", "kafka", "redis", "postgres",
   * "docker", "nginx". A generic silhouette is a last-resort fallback, never
   * the default representation of a technology a viewer would recognise, and an
   * invented or approximated logo is never acceptable. The mark participates in
   * the animation like any other property of the object; it is not a sticker. */
  brand: z.string().optional(),
  /** How a `hexmap` is drawn.
   *
   * `grid` is a city tiled into cells, each of which can light up on its own —
   * the honest picture of anything measured per tile rather than per city.
   * `neighbours` isolates ONE cell and its six touching cells, which is the
   * whole argument for hexagons over squares: every neighbour is the same
   * distance away, so a rider moving in any direction crosses into the next
   * cell on the same terms. */
  hex: z
    .object({
      mode: z.enum(["grid", "neighbours"]).default("grid"),
      /** Cells across. Ignored in `neighbours` mode. */
      cols: z.number().int().min(3).max(14).default(7),
    })
    .optional(),
  /** THE MODEL'S CONTEXT: everything it has been given, in the order it arrived.
   *
   * Entries carry a SOURCE, and that is the entire point — a viewer can see
   * that the instruction and the page text are the same kind of thing once they
   * are inside, differing only by a tag the model has no obligation to respect.
   * The value the model ends up using is shown at the foot, so "it picked this
   * one" is something that happens on screen rather than something narration
   * asserts. */
  context: z
    .object({
      label: z.string().default("context"),
      entries: z
        .array(
          z.object({
            id: z.string().min(1),
            source: z.enum(["user", "page", "tool", "model"]),
            text: z.string().min(1),
            /** Marks the entry as the value finally used. */
            hidden: z.boolean().default(false),
          }),
        )
        .max(8),
      /** Shown in the "value used" slot at the foot once something is chosen. */
      chosen: z.string().optional(),
    })
    .optional(),
  /** A WHOLE APPLICATION, as the scene's environment.
   *
   * Not a browser window with rows in it: a product with a wordmark, a nav, an
   * account, and SCREENS that replace one another the way a real one does.
   * The shell persists while the screen changes, which is what lets a sequence
   * stay in a single believable world and still recompose completely between
   * beats — search, then results, then seat selection, then checkout, then a
   * confirmation taking over the frame.
   *
   * The screen the audience sees is state, driven by the `screen` action, so
   * the loop the engine actually runs is: an actor interacts, the environment
   * responds, the state changes, and the composition changes with it. */
  app: z
    .object({
      brand: z.string().min(1),
      /** THE PRODUCT'S MARK. A fictional company still needs a real logo — a
       * generic square with a triangle in it reads as a placeholder, and a
       * placeholder tells the audience they are looking at a mockup instead of
       * a product. Chosen per product, so every invented brand in the library
       * gets its own identity: `wing` for travel and transport, `orbit` for
       * platforms and networks, `spark` for tools, `layers` for data and
       * storage, `pulse` for monitoring and health. Omit and one is picked from
       * the name, so a brand is never markless. */
      mark: z.enum(["wing", "orbit", "spark", "layers", "pulse", "incognito"]).optional(),
      nav: z.array(z.string()).max(4).default([]),
      account: z.string().optional(),
      /** Keyed by screen id; the first is shown until a `screen` action moves. */
      screens: z.record(
        z.string(),
        z.object({
          title: z.string().optional(),
          blocks: z.array(appBlockSchema).max(5),
        }),
      ),
      /** Which screen is showing at the start. */
      screen: z.string().min(1),
      /** A layer ABOVE the screen — a date picker, a dialog — which dims what
       * is behind it rather than replacing it. */
      overlay: z.string().optional(),
    })
    .optional(),
  /** REAL DATA to encode, for a `qr` object.
   *
   * The code on screen genuinely encodes this, at the stated error-correction
   * level, fetched and cached at generation time. That is not pedantry: a video
   * claiming a damaged code still scans is only true if the viewer can pause it
   * and scan the damaged frame. `correction` defaults to H, the level whose
   * ~30% recovery budget is the thing usually worth talking about. */
  qr: z
    .object({
      data: z.string().min(1),
      correction: z.enum(["L", "M", "Q", "H"]).default("H"),
    })
    .optional(),
  /** Filled in by the QR resolver — path relative to public/. Not authored. */
  qrPath: z.string().optional(),
  /** REAL SOURCE, for a `code` object. Code is a first-class medium, not an
   * illustration of code: give it the actual lines and let `highlightLine`
   * brighten the one being discussed while the rest dim. Keep lines short —
   * nothing wraps, and a 9:16 frame is narrow. */
  code: z.array(z.string()).max(14).optional(),
  /** Which half of a SPLIT stage this object lives in. Ignored unless the
   * scene declares `splitScreen`. */
  pane: z.enum(["a", "b"]).optional(),
  /** A REAL INTERFACE, for concepts that are user-facing.
   *
   * When the thing being explained is something a person does — logging in,
   * a permission prompt, a page failing to load — an architecture diagram is
   * the wrong register entirely. The viewer should see the click, the change,
   * and the consequence in the surface they actually recognise. Rows render
   * top to bottom inside browser or app chrome; `click` and `uiState` drive
   * them. */
  ui: z
    .object({
      /** `phone` draws a real handset screen — status bar, no window chrome,
       * a home indicator — for anything a viewer experiences in their hand.
       * A rideshare quote, a banking prompt or a 2FA code shown in a desktop
       * window is the wrong register: the viewer has never seen it there. */
      chrome: z.enum(["browser", "app", "phone"]).default("browser"),
      /** Address-bar text, for browser chrome. */
      url: z.string().optional(),
      /** Draws a LIVE MAP in the top half of a phone screen, with a route and
       * a car on it. Every ride-hailing, delivery and navigation app on a
       * phone is a map with a sheet of controls under it — showing one as a
       * list of rows on a blank screen is not that app, it is a form. */
      map: z.boolean().default(false),
      rows: z
        .array(
          z.object({
            id: z.string().min(1),
            kind: z.enum(["button", "input", "text", "row", "error", "success"]).default("text"),
            label: z.string(),
            /** Secondary line under the label — an arrival time, a seat count,
             * a status. Real app rows are two lines, and flattening them to one
             * is what makes a mock read as a form. */
            sub: z.string().optional(),
            /** Right-aligned value: a price, a count, a time. The left/right
             * split is most of what makes a list read as a chooser rather than
             * as a paragraph. */
            value: z.string().optional(),
            /** A leading glyph, asked for explicitly. Inferring one from the
             * row's KIND put a car beside every row that was not plain text —
             * including a question and a booking fee — which is how a mock
             * stops being believable. */
            icon: z.enum(["none", "car"]).default("none"),
            /** Hidden until a `uiState` reveals it — a result that appears
             * only after the click that caused it. */
            hidden: z.boolean().default(false),
          }),
        )
        .max(8),
    })
    .optional(),
  /** THE ENTITY'S LIFECYCLE, in order.
   *
   * "Stop thinking 'show object X', think 'show X changing from state A to
   * state B'." A cache is not `CACHE` — it is empty -> miss -> filling -> hit,
   * and the explanation IS that progression. Declaring the states makes the
   * lifecycle a property of the entity rather than a sequence of unrelated
   * recolours, which is what lets the engine catch a scene putting a cache into
   * `hit` without ever having filled it.
   *
   * The object shows its current state and how far through the lifecycle it is;
   * `phase` moves it. An accent is a colour, this is a state. */
  states: z.array(z.string().min(1)).min(2).max(8).optional(),
});

const stageEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  style: z.enum(["solid", "dashed"]).default("solid"),
  kind: z.enum(["request", "response", "data", "dependency"]).default("request"),
});

/** Canonical treatment per travelling-packet kind. The renderer, not each
 * script, decides what "this is a response" looks like, so request and response
 * can never read as the same thing moving in two directions. */
/** What a travelling thing IS. `encrypted` is drawn as a sealed packet rather
 * than a coloured one: encryption is the single most misexplained idea in
 * consumer privacy, and a padlock on the thing in transit says "the carrier can
 * see this going past and cannot read it" in one image. */
const stageFlowKindSchema = z.enum(["request", "response", "data", "success", "error", "retry", "encrypted"]);

/** A PERSISTENT packet — an object in its own right rather than a one-shot
 * animation. Declared once, then `send` moves it, `mutate` changes what it IS,
 * and it REMAINS on screen wherever it last arrived.
 *
 * This is the difference between "an animation of a request" and "a request".
 * A one-shot flow cannot express the beats that actually carry a Short: a
 * request that arrives and WAITS while something else happens; the same request
 * being retried; a `GET` that becomes a `POST`; one request duplicating into
 * two that then race each other. All of those need the packet to survive
 * between beats and carry state, which a fire-and-forget token cannot do. */
const stagePacketSchema = z.object({
  id: z.string().min(1),
  /** What it IS right now — "GET /orders", "auth token", "SELECT * FROM users".
   * Always concrete: the viewer should be able to pause on any frame and know
   * exactly what is moving and why. */
  label: z.string().min(1),
  kind: stageFlowKindSchema.default("request"),
  /** Where it starts out, if it is on stage before anything sends it. */
  at: z.string().optional(),
});

const stageTimelineActionSchema = z.discriminatedUnion("type", [
  /** An object arrives on the stage. Introduce components only when the
   * narration makes them relevant — showing the whole architecture at t=0 is
   * presentation; revealing it as it becomes relevant is discovery. */
  z.object({
    type: z.literal("enter"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
  }),
  z.object({
    type: z.literal("exit"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
  /** A connector draws itself between two objects. */
  z.object({
    type: z.literal("connect"),
    from: z.string().min(1),
    to: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.6),
  }),
  /** THE core action of this medium: a new composition state. Every object
   * glides to its new region/emphasis and connectors re-route from the moving
   * silhouettes, so the frame visibly reorganises as the explanation develops
   * instead of sitting still. `place`/`emphasis`/`hidden` are PARTIAL overrides
   * of what came before — state only what changed, so a four-act Short reads as
   * four short deltas rather than four re-declarations of the world.
   *
   * Prefer moving an existing object over creating a new one. A server that
   * already exists and is needed elsewhere should TRAVEL there; destroying it
   * and creating an identical copy in a new spot is a slideshow of unrelated
   * illustrations, not one system evolving. */
  z.object({
    type: z.literal("compose"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.9),
    place: z.record(z.string(), stageRegionSchema).optional(),
    emphasis: z.record(z.string(), stageEmphasisSchema).optional(),
    hidden: z.array(z.string()).optional(),
  }),
  /** Changes the viewer's relationship to the system — a documentary camera
   * observing it, not motion for its own sake. `focus` pushes in on one object;
   * omitting it with `zoom: 1` pulls back to reveal the whole stage. Use it
   * because the story needs a different view, not because the frame needs
   * something to look alive. */
  z.object({
    type: z.literal("camera"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(1),
    focus: z.string().optional(),
    zoom: z.number().min(0.6).max(3).default(1),
  }),
  /** Short punchy text as its OWN visual actor, landing at a specific beat and
   * clearing again ("ONE LINE." ... "THAT'S ENOUGH."). Deliberately the only
   * way to put a headline on a Stage: a title that sits on screen for the whole
   * scene stops being information and becomes furniture.
   *
   * Type here is a CO-EQUAL COMPOSITIONAL ELEMENT, not a caption bar — `at`
   * places it anywhere on the stage and `size: "huge"` lets it dominate the
   * frame outright, which is how a poster-style beat works: the words and the
   * graphics interlock rather than the words sitting in a reserved strip above
   * the picture. Use `huge` for the act-opening question ("WHY DOES POSTMAN
   * WORK BUT CHROME FAIL?") and the payoff line; keep the rest `normal`. */
  z.object({
    type: z.literal("beat"),
    text: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(1.8),
    tone: z.enum(["neutral", "alert", "reveal"]).default("neutral"),
    at: z.enum(["top", "center", "bottom"]).default("top"),
    size: z.enum(["normal", "huge"]).default("normal"),
  }),
  /** A packet travels the REAL routed connectors through `path`, so it can
   * never drift off the line or stop inside a box. ALWAYS give it a label
   * naming the actual thing in flight ("GET /refund", "200 OK", "SELECT * FROM
   * orders", "auth token") — animate the information, not the connection. An
   * unlabelled packet is the generic dot-on-a-line this medium exists to
   * replace. */
  z.object({
    type: z.literal("flow"),
    path: z.array(z.string().min(1)).min(2),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.4),
    label: z.string().optional(),
    kind: stageFlowKindSchema.default("request"),
    /** The destination REACTS when the packet lands instead of it just
     * vanishing into the box. */
    reactsOnArrival: stageAccentSchema.optional(),
    /** Stops the packet PART WAY along its path (0-1) instead of arriving —
     * a request blocked by a gate, rejected by a rate limiter, intercepted by
     * a cache. The single most important beat in most Shorts is a thing that
     * does NOT happen, and it cannot be shown by a packet that always
     * arrives. */
    blockedAt: z.number().min(0).max(1).optional(),
    /** ESCALATION. One packet becomes N, staggered down the same path — the
     * retry storm, the thundering herd, the accidental fan-out. Magnitude has
     * to be SEEN: a label reading "10,000 requests" is a claim, a screen
     * filling with them is a demonstration. Pair with `magnitude` for the
     * count nobody could read off the screen by counting. */
    copies: z.number().int().min(1).max(40).default(1),
    /** Odometer text that counts up alongside a `copies` fan-out ("10,000
     * REQUESTS"). Rendered on the packet trail, not as a separate caption. */
    magnitude: z.string().optional(),
  }),
  /** Recolours an object to show a state change. */
  z.object({
    type: z.literal("setState"),
    id: z.string().min(1),
    accent: stageAccentSchema,
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
  /** Brightens the named objects and dims the rest. Unfocused objects are
   * DIMMED, never hidden: the dim ones are the context the bright one is being
   * placed into, so removing them defeats the point. An empty `ids` restores
   * everything. */
  z.object({
    type: z.literal("focus"),
    ids: z.array(z.string()),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
  /** IMPACT. A scale punch plus a flash on one object — "THIS is the thing".
   * Deliberately separate from `setState` (which changes what an object IS)
   * and from `focus` (which changes what the viewer should look at): this
   * changes nothing, it just hits. Use it on a reveal, never as decoration —
   * an object that pops for no reason spends the emphasis budget and leaves
   * the real reveal with nothing left. */
  z.object({
    type: z.literal("pop"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.45),
  }),
  /** Frame shake on a disruption beat — a server falling over, a collision, a
   * queue bursting. Physical consequence the viewer feels rather than reads.
   * Short and rare by construction: the cap is deliberately low because a
   * shaky frame stops being an event and becomes a style within about two
   * uses per video. */
  z.object({
    /** RESERVED for force: a failure, a collision, a jam, a real vibration.
     *
     * Not an all-purpose emphasis. Used on any beat that merely CHANGES —
     * a price moving, a value updating, a state advancing — it stops meaning
     * anything and becomes the house punctuation mark. `pop` is the emphasis
     * primitive; this one says something went wrong or something hit. */
    type: z.literal("shake"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).max(1.2).default(0.4),
    intensity: z.enum(["light", "heavy"]).default("light"),
  }),
  /** An odometer on an object's sublabel — a number visibly counting from one
   * value to another. "Name numbers": a concrete count beats abstract language
   * every time, and a number that TICKS is a frame that is visibly resolving,
   * which is the actual retention mechanic (the viewer holds on to see it
   * finish). A static label reading "10,000 requests" is a claim; the same
   * number racing up to it is evidence. */
  z.object({
    type: z.literal("count"),
    id: z.string().min(1),
    /** Counts INSIDE a UI row instead of on the object — how a running total
     * climbs as line items land on a receipt. Without it a breakdown can only
     * show its final figure, which shows the answer while hiding the sum. */
    row: z.string().optional(),
    /** Leading text for the value: a currency symbol, a multiplier's "x". */
    prefix: z.string().optional(),
    /** Decimal places. Money needs two; a count of riders needs none. */
    decimals: z.number().int().min(0).max(2).default(0),
    from: z.number(),
    to: z.number(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.6),
    /** Appended after the number ("req/s", "ms", "%"). */
    suffix: z.string().optional(),
  }),
  /** A bar across the bottom of an object that visibly fills or drains. The
   * other half of "frames that keep resolving" — a TTL running out, a queue
   * filling, a cache warming. The viewer watches the budget go rather than
   * reading three static labels claiming it did. `from`/`to` are 0-1. */
  z.object({
    type: z.literal("meter"),
    id: z.string().min(1),
    from: z.number().min(0).max(1).default(0),
    to: z.number().min(0).max(1).default(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2),
  }),
  /** Moves a PERSISTENT packet along a path. Unlike `flow`, the packet stays
   * on screen at wherever it lands, so the next beat can act on the same
   * object instead of spawning a lookalike. */
  z.object({
    type: z.literal("send"),
    id: z.string().min(1),
    path: z.array(z.string().min(1)).min(2),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.4),
    blockedAt: z.number().min(0).max(1).optional(),
    reactsOnArrival: stageAccentSchema.optional(),
  }),
  /** Changes what a persistent packet IS, in place — the same card mutating
   * rather than a new card appearing beside the old one. `GET /refund` becoming
   * `POST /refund`; a request becoming an error. Transforming an existing object
   * is always preferable to creating another one. */
  z.object({
    type: z.literal("mutate"),
    id: z.string().min(1),
    label: z.string().optional(),
    kind: stageFlowKindSchema.optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
  /** Removes a persistent packet — consumed, dropped, expired. */
  z.object({
    type: z.literal("consume"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.35),
  }),
  /** Brightens specific lines of a `code` object and dims the rest — the core
   * teaching move for code: highlight the line while the narrator explains it.
   * Lines are 1-indexed. An empty array clears the highlight. */
  z.object({
    type: z.literal("highlightLine"),
    id: z.string().min(1),
    lines: z.array(z.number().int().min(1)),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.35),
  }),
  /** TRANSFORMATION — an entity literally BECOMING a different representation
   * of itself. The most important action in this vocabulary and the one that
   * separates "animate the system" from "animate the diagram".
   *
   * The same underlying thing has different representations at different levels
   * of explanation, and showing that chain is far more useful than drawing five
   * boxes joined by arrows. One HTTP request is, in turn: "Get my profile" ->
   * `GET /profile` -> an HTTP packet on the wire -> `req.user` in the handler ->
   * `SELECT * FROM users WHERE id = 42` -> and back up the chain. Authentication
   * is credentials -> SESSION -> a cookie in the browser -> `Cookie:
   * session_id=...` on the wire. Same state, four representations.
   *
   * Use this instead of hiding one object and showing another: a crossfade in
   * place says "this became that", whereas a swap says "here is a different
   * thing", which is a different and usually wrong claim. */
  z.object({
    type: z.literal("transform"),
    id: z.string().min(1),
    toKind: stageObjectKindSchema.optional(),
    toLabel: z.string().optional(),
    toSublabel: z.string().optional(),
    /** For a transform INTO code — a query, a handler, a config block. */
    toCode: z.array(z.string()).max(14).optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.7),
  }),
  /** An entity PRODUCES another entity out of itself — the browser emitting the
   * request it is about to send, a server constructing a response. The emitted
   * packet grows out of the emitter's own body rather than fading in beside it,
   * so causation is visible: this thing made that thing. Follow with `send` to
   * move it. */
  z.object({
    type: z.literal("emit"),
    /** The object doing the emitting. */
    from: z.string().min(1),
    /** The packet id (declared in `packets`) being produced. */
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
  }),
  /** A packet ENTERS an object and is taken in by it — consumed, stored,
   * processed — rather than parking beside it. The counterpart to `emit`: use
   * it when the point is that the thing was received, not that it is waiting. */
  z.object({
    type: z.literal("absorb"),
    id: z.string().min(1),
    into: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
  }),
  /** One entity DIVIDES into several — a fan-out, a retry duplicating, a
   * batch breaking into individual jobs. The children emerge from the parent's
   * own position and spread, so the viewer sees one thing becoming many rather
   * than several things appearing near each other. */
  z.object({
    type: z.literal("split"),
    id: z.string().min(1),
    into: z.array(z.string().min(1)).min(2),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.7),
  }),
  /** Several entities BECOME one — a scatter-gather collecting, a batch
   * forming, replicas agreeing on a value. The mirror of `split`. */
  z.object({
    type: z.literal("merge"),
    ids: z.array(z.string().min(1)).min(2),
    into: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.7),
  }),
  /** Two entities arrive at the SAME target at the SAME instant and impact.
   *
   * This is the race condition, and it is the clearest case for why a
   * relationship is not a line. "Two requests arrive at exactly the same time"
   * drawn as two arrows into a box says nothing — the simultaneity, which is
   * the entire concept, is invisible. Here both packets physically converge,
   * meet, and the target visibly takes the hit. The viewer sees the collision
   * rather than reading about it. */
  z.object({
    type: z.literal("collide"),
    ids: z.array(z.string().min(1)).length(2),
    at: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.4),
  }),
  /** An entity BECOMES THE STAGE — it grows to fill the frame while everything
   * else clears, so the viewer moves inside it. Use it when the explanation
   * descends a level: the request becomes the dominant object and fills the
   * screen; the camera moves into the server and the server becomes huge,
   * showing its own internals. `collapse` returns it to the system view, and
   * the pull-back is what re-establishes where the viewer just was. */
  z.object({
    type: z.literal("expand"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.9),
  }),
  z.object({
    type: z.literal("collapse"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.9),
  }),
  /** Moves an entity to the next state of its declared lifecycle. Skipping
   * states is reported, because a cache that reaches `hit` without passing
   * through `filling` is not a shortcut — it is a scene claiming something that
   * never happened. */
  z.object({
    type: z.literal("phase"),
    id: z.string().min(1),
    to: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
  }),
  /** The mascot changes expression, with a small pop as it lands.
   *
   * Time these to the BEAT, not to every event: a face that reacts constantly
   * stops reading as a reaction and becomes ambient motion competing with the
   * system. Roughly one per act — puzzled at the strange thing, alarmed as it
   * goes wrong, surprised at the reveal, pleased at the payoff. */
  z.object({
    type: z.literal("react"),
    to: z.enum(["puzzled", "alarmed", "surprised", "unimpressed", "pleased", "approving", "focused"]),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
  /** An object visibly FILLS with items — a queue backing up, memory rising,
   * a cache warming, logs piling. Accumulation deserves its own primitive
   * rather than being hand-assembled from a meter each time, because the thing
   * being taught is the pile getting bigger, and a bar sliding right does not
   * read as a pile. */
  z.object({
    type: z.literal("accumulate"),
    id: z.string().min(1),
    from: z.number().int().min(0).max(40).default(0),
    to: z.number().int().min(0).max(40),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2),
  }),
  /** The SAME packet cycles a path repeatedly, and each pass can get worse.
   *
   * Retries, polling, event loops and feedback systems are circular by nature,
   * and showing them as a row of separate attempts loses the one property that
   * matters — that it is the same thing coming back around. `degrade` makes
   * each lap visibly heavier, which is what turns a loop into a storm. */
  z.object({
    type: z.literal("loop"),
    id: z.string().min(1),
    path: z.array(z.string().min(1)).min(2),
    count: z.number().int().min(2).max(12).default(3),
    startSeconds: z.number().min(0),
    /** Seconds per lap. */
    intervalSeconds: z.number().min(0.2).default(1.2),
    /** Each lap adds copies and shifts the packet toward an error treatment. */
    degrade: z.boolean().default(false),
  }),
  /** A system visibly FAILING over time rather than flipping to red.
   *
   * An outage is a process: the thing works, then slows, then judders, then
   * stops. Showing it as a colour change asserts the failure; showing it
   * degrade demonstrates it. `to` is 0 (healthy) to 1 (gone). */
  z.object({
    type: z.literal("degrade"),
    id: z.string().min(1),
    from: z.number().min(0).max(1).default(0),
    to: z.number().min(0).max(1).default(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(3),
  }),
  /** ISOLATES ONE TILE of a hex map and mutes everything else, so a viewer can
   * see exactly how much ground a single tile covers.
   *
   * A grid laid over a city answers "it is divided" but not "divided into what
   * size?" — and the size is the whole point when the thing being explained is
   * measured per tile. Dimming everything outside one cell turns an abstract
   * tiling into a region with streets and blocks inside it. */
  z.object({
    type: z.literal("spotlight"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.8),
  }),
  /** A machine READING an object: a reticle closes around it, a bar sweeps
   * across it, and it locks on.
   *
   * The act of reading is usually invisible, which is why explanations of
   * scanning, parsing and recognition fall back to captions saying "scanning".
   * A sweep that visibly crosses the subject and then locks is the difference
   * between asserting that something was read and showing it. */
  /** TURNS an object in place, by a real angle, over real time.
   *
   * Not a `style` tweak and not decorative spin: rotation is the subject
   * whenever a thing's ORIENTATION is what is being explained. Everything
   * attached to the object in its own frame turns with it while everything
   * fixed to the world does not, so one `rotate` is what makes a `vector`'s
   * `frame` field mean something on screen.
   *
   * `trail` leaves the arc swept behind, which turns "it turned" into "it
   * turned by this much" — the difference between showing rotation and showing
   * angular displacement. */
  /** A physical SHOVE: the object lurches in a direction and springs back.
   *
   * The alternative was an arrow captioned "being shoved", which is the exact
   * failure this project exists to avoid — a label asserting a motion instead
   * of the motion happening. Force is something a viewer reads from movement,
   * and a thing that visibly lurches has been pushed whether or not anything is
   * written beside it. Reusable for impacts, taps, knocks and recoil. */
  z.object({
    type: z.literal("nudge"),
    id: z.string().min(1),
    direction: z.enum(["left", "right", "up", "down"]).default("right"),
    /** How far it travels, as a fraction of its own size. */
    amount: z.number().min(0.05).max(2).default(0.45),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(0.9),
  }),
  z.object({
    type: z.literal("rotate"),
    id: z.string().min(1),
    /** Absolute heading in degrees clockwise from upright, not a delta, so a
     * scene can be read at any moment without replaying what came before. */
    to: z.number(),
    trail: z.boolean().default(false),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.4),
  }),
  z.object({
    type: z.literal("scan"),
    id: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.6),
  }),
  /** RADIATES, as expanding rings leaving an object — or, with
   * `direction: "in"`, as rings converging onto it.
   *
   * `emit` and `send` both move a packet to a NAMED destination, which is the
   * wrong statement for a radio: a transmitter does not address anyone, it
   * fills the space around it, and a receiver does not fetch anything, it
   * simply sits in someone else's field. Reaching for `send` here would have
   * drawn an arrow to a tower and taught the opposite of the mechanism.
   *
   * The direction is the entire point wherever transmitting and receiving are
   * different acts — airplane mode, GPS, NFC, radar, sonar, a beacon, a
   * pub/sub broadcast. Outbound and inbound rings on the same board say which
   * radios talk and which only listen without a word of narration.
   *
   * `reach` scales how far the rings travel relative to the object, so a
   * short-range radio and a long-range one are visibly different radios. */
  z.object({
    type: z.literal("broadcast"),
    id: z.string().min(1),
    direction: z.enum(["out", "in"]).default("out"),
    /** Ring travel distance as a multiple of the object's own size. */
    reach: z.number().min(0.5).max(6).default(2.4),
    /** Rings in flight at once. More reads as busier traffic, not louder. */
    rings: z.number().int().min(1).max(5).default(3),
    accent: z.enum(["neutral", "primary", "warn", "success", "danger", "profile"]).optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2.4),
  }),
  /** COVERS part of an object, the way a sticker, a scratch, a thumb or a
   * redaction covers part of a real thing.
   *
   * Distinct from `degrade`, which is a thing failing. Here the object is
   * perfectly fine and the VIEW of it is obstructed — which is its own
   * explanation whenever the question is "how much of this can be missing and
   * still work?" `amount` is how opaque the covering is, so a patch can fade
   * on rather than snap. */
  z.object({
    type: z.literal("occlude"),
    id: z.string().min(1),
    area: z.enum(["corner", "band", "centre", "third"]).default("third"),
    amount: z.number().min(0).max(1).default(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.5),
  }),
  /** A PROTECTIVE BOUNDARY drawn around part of the stage, with a name.
   *
   * Built for the commonest shape in security and privacy explanations: people
   * believe a protection covers the whole system, and the teaching is showing
   * exactly where its edge is. Re-issuing it over a different set of objects
   * ANIMATES the boundary between them, so a shield the audience assumed
   * covered everything can visibly contract onto the one thing it actually
   * covers — which is a mechanism being corrected on screen rather than a
   * caption saying "actually, it only does this".
   *
   * `over` is a set of object ids; the boundary wraps whatever they occupy at
   * that moment, so it follows the composition rather than being drawn at fixed
   * coordinates. An empty list dismisses it. */
  z.object({
    type: z.literal("shield"),
    over: z.array(z.string().min(1)),
    label: z.string().optional(),
    /** `claimed` is what someone believes it protects — drawn provisionally,
     * in outline. `actual` is what it really protects. */
    tone: z.enum(["claimed", "actual"]).default("actual"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.9),
  }),
  /** THE ENVIRONMENT RESPONDS: an application moves to a different screen, or
   * opens/closes a layer above the current one.
   *
   * This is the composition change that a state change causes. A product does
   * not redraw itself into an unrelated picture between beats; it navigates,
   * and the shell stays put while the content underneath it is replaced. */
  z.object({
    type: z.literal("screen"),
    id: z.string().min(1),
    /** Screen to show. Omit when only changing the overlay. */
    to: z.string().optional(),
    /** Layer above the screen. Empty string closes it. */
    overlay: z.string().optional(),
    transition: z.enum(["slide", "fade", "expand"]).default("slide"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.7),
  }),
  /** WHAT AN ACTOR DOES. One action with a verb, rather than twenty actions.
   *
   * The verb set is deliberately behavioural rather than visual — `observe`,
   * `assume`, `call`, `retry` describe what is happening in the system, and the
   * renderer decides what that looks like for the representation the actor was
   * given. That separation is the point: a script says an agent assumed a value
   * it never verified, and it stays true whether that agent is drawn as a
   * cursor on a form, an avatar beside a service, or a process inside a
   * machine.
   *
   *   move     — go to something
   *   observe  — look at it, read a value, move on (no interaction)
   *   click    — press it
   *   type     — put `value` into it, character by character
   *   select   — choose it among options
   *   drag     — carry something to `to`
   *   wait     — hold, visibly, while something else happens
   *   decide   — commit to `value` (shown as a considered choice)
   *   assume   — adopt `value` WITHOUT verifying it (drawn as unverified: this
   *              is the verb most technical failures actually turn on)
   *   call     — invoke `target` as a tool and hand it work
   *   result   — receive what `target` returned
   *   send     — pass something to `to`
   *   receive  — take something from `target`
   *   hand     — give what it is holding to `to`
   *   modify   — change state on `target`
   *   retry    — do the last thing again
   *   succeed  — finish, correctly
   *   fail     — finish, incorrectly */
  z.object({
    type: z.literal("act"),
    actor: z.string().min(1),
    verb: z.enum([
      "move", "observe", "click", "type", "select", "drag", "wait", "decide",
      "assume", "call", "result", "send", "receive", "hand", "modify", "retry",
      "succeed", "fail",
    ]),
    /** What is being acted on. */
    target: z.string().optional(),
    /** A specific field or line within the target. */
    row: z.string().optional(),
    /** The value read, typed, decided or assumed. */
    value: z.string().optional(),
    /** Destination for drag / send / hand. */
    to: z.string().optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.8),
  }),
  /** THE AGENT'S HAND. Moves a visible cursor across an interface to a row and
   * arrives there.
   *
   * Without it, an interface fills itself in by magic and there is nobody in
   * the scene — which makes it impossible to show an agent READING something,
   * choosing something, or accepting a value it never questioned. The pointer
   * is what turns a form into a thing being operated by someone. Pair it with
   * `click` to land the press. */
  z.object({
    type: z.literal("pointer"),
    id: z.string().min(1),
    row: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.7),
    /** Pauses on the row without clicking — reading it, rather than using it. */
    reading: z.boolean().default(false),
  }),
  /** A click on a UI row, with the press visibly landing. */
  z.object({
    type: z.literal("click"),
    id: z.string().min(1),
    row: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.35),
  }),
  /** Reveals or hides a UI row — the response to the click. */
  z.object({
    type: z.literal("uiState"),
    id: z.string().min(1),
    row: z.string().min(1),
    visible: z.boolean().default(true),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.3),
  }),
  /** A PART of an object lifts out of it and becomes a packet.
   *
   * Distinct from `emit`, which spawns a new thing beside its maker. Here the
   * source visibly LOSES the piece: the browser's request panel detaches from
   * the browser and becomes the HTTP request; a line of code lifts off the page
   * and travels. That is a transformation with a cause, and it is the honest
   * alternative to a dot appearing on a wire — the viewer sees where the packet
   * came from because they watched it leave.
   *
   * Name `row` for a `ui` object or `line` for a `code` object to lift that
   * specific element; omit both to detach the object's body as a whole. */
  z.object({
    type: z.literal("detach"),
    from: z.string().min(1),
    id: z.string().min(1),
    row: z.string().optional(),
    line: z.number().int().min(1).optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.8),
  }),
  /** Compresses time, so something slow becomes watchable.
   *
   * Memory leaks, cache growth, log accumulation and technical debt are all
   * invisible at real speed — the concept IS that it creeps. Running the clock
   * fast, and SAYING so on screen, is more honest than animating a fast version
   * of a slow process and letting the viewer assume that is the real rate. */
  z.object({
    type: z.literal("timeLapse"),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(3),
    /** Shown on screen, e.g. "6 hours" or "x1000". */
    label: z.string().min(1),
    /** How much faster ambient motion runs while the clock is compressed. */
    factor: z.number().min(1).max(50).default(6),
  }),
  /** Re-frames the SAME system from a different participant's point of view.
   *
   * "I clicked Login" -> an HTTP request -> middleware and a controller -> a SQL
   * query. Same events, four vantage points, and moving between them is often a
   * stronger explanation than adding more components. Names whose view it is on
   * screen and brings that entity forward while the rest recede. */
  z.object({
    type: z.literal("perspective"),
    to: z.string().min(1),
    /** The entity whose viewpoint this is, brought forward. */
    focus: z.string().optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.8),
  }),
  /** Pins a short callout beside an object. */
  z.object({
    type: z.literal("annotate"),
    target: z.string().min(1),
    text: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0).default(0.4),
  }),
]);


// ---------------------------------------------------------------------------
// `spatial` — a REAL 3D stage.
//
// The 2D Stage medium can say that a phone turned. It cannot move a camera
// through anything, give an object a side profile, separate a device into its
// layers, or put a field in space with depth in front of and behind the thing
// it surrounds. Those are not polish on a flat renderer; they need volume, a
// camera that occupies a position, and lighting.
//
// Its reason to exist is the same distinction the 2D `vector` introduced, now
// in three dimensions and far more legible: a quantity fixed to the WORLD holds
// its direction while the body it is drawn on tumbles, and a quantity fixed to
// the BODY tumbles with it. In 3D the viewer can orbit that and see it from any
// side, which is the difference between being told a phone has an orientation
// and watching one have it.
// ---------------------------------------------------------------------------

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const spatialObjectSchema = z.object({
  id: z.string().min(1),
  /** What the thing physically IS. Every one of these is a real mesh with
   * volume — never a picture of the thing standing in for it. */
  kind: z.enum([
    /** The planet: sphere, graticule, spin axis, and a magnetic dipole tilted
     * off that axis when its state says so. */
    "globe",
    /** A body with solar panels and a dish — the object that makes an orbit
     * read as an orbit rather than as a dot going round a circle. */
    "satellite",
    /** A handset with real thickness, a glass face and a metal frame, so it can
     * be turned edge-on and still be a phone. */
    "phone",
    /** A labelled set of XYZ axes. Its `frame` decides whether it belongs to
     * the world or to the body it is attached to — showing both at once is the
     * whole lesson of orientation. */
    "axes",
    /** A direction with magnitude: shaft plus cone head. */
    "vector",
    /** A plain marker for a place in space. */
    "node",
    /** A FLAT SURFACE — a map, a table, a ground plane. Laid horizontally and
     * viewed at an angle it gives a scene a floor, which is what makes travel
     * across it read as travel rather than as a sprite sliding on glass. */
    "plane",
    /** A LOCATION PIN, standing up off whatever it is placed on. */
    "pin",
  ]),
  label: z.string().optional(),
  /** Where it sits, in scene units. */
  at: vec3Schema.default([0, 0, 0]),
  scale: z.number().min(0.05).max(20).default(1),
  accent: z.enum(["neutral", "primary", "warn", "success", "danger", "profile"]).optional(),
  /** `vector` and `axes` — which reference frame this belongs to. "world" holds
   * its direction however its host turns; "body" turns with it. */
  frame: z.enum(["world", "body"]).optional(),
  /** The object this is bound to, for `frame` and for `orbit`. */
  attachTo: z.string().optional(),
  /** `vector` — the direction it points, as a 3D vector. Normalised on use. */
  dir: vec3Schema.optional(),
  /** `vector` — its length in scene units. */
  length: z.number().min(0.1).max(20).default(2),
  /** Lifecycle states the mesh draws differently, e.g. a globe's "field". */
  states: z.array(z.string().min(1)).min(2).optional(),
});

const spatialActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), id: z.string().min(1), startSeconds: z.number().min(0), durationSeconds: z.number().min(0.1).default(0.7) }),
  z.object({ type: z.literal("exit"), id: z.string().min(1), startSeconds: z.number().min(0), durationSeconds: z.number().min(0.1).default(0.6) }),
  /** CONTINUOUS rotation about an axis — a planet turning, a rotor running.
   * Distinct from `rotate`, which goes to a stated attitude and stops. */
  z.object({
    type: z.literal("spin"),
    id: z.string().min(1),
    axis: vec3Schema.default([0, 1, 0]),
    turns: z.number().default(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(4),
  }),
  /** Rotates to an absolute attitude, in degrees, so a frame can be read on its
   * own without replaying everything before it. */
  z.object({
    type: z.literal("rotate"),
    id: z.string().min(1),
    to: vec3Schema,
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(1.6),
  }),
  /** Travels a closed path around another object. The inclination is what stops
   * every orbit looking like the same flat ring. */
  z.object({
    type: z.literal("orbit"),
    id: z.string().min(1),
    around: z.string().min(1),
    radius: z.number().min(0.2).default(4),
    /** Degrees the orbital plane is tipped out of the horizontal. */
    inclination: z.number().default(24),
    turns: z.number().default(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(6),
  }),
  /** Travels an object from where it is to a stated point, in scene units.
   * Straight-line movement through the space, as distinct from `orbit`, which
   * is a closed path around something else. */
  z.object({
    type: z.literal("travel"),
    id: z.string().min(1),
    to: vec3Schema,
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2),
  }),
  /** Moves the actual camera. Not a zoom on a flat picture: it occupies a
   * position in the scene and travels, which is what makes depth readable. */
  z.object({
    type: z.literal("camera"),
    /** orbit — swings around the subject; push/pull — closes on or backs off
     * it; frame — settles on a stated position. */
    move: z.enum(["orbit", "push", "pull", "frame"]).default("orbit"),
    /** What it looks at. Defaults to whatever it was already watching. */
    focus: z.string().optional(),
    /** Distance from the focus, in scene units. */
    distance: z.number().min(0.5).max(80).optional(),
    /** Degrees swept, for `orbit`. */
    degrees: z.number().optional(),
    /** Degrees above the horizon. */
    elevation: z.number().optional(),
    /** Where the camera stands around the subject, in degrees. Matters most for
     * a wide flat subject: a tilted plane always projects wider than it is
     * tall, so on a portrait frame its long axis has to run INTO the screen
     * rather than across it, and that is a choice of azimuth. */
    azimuth: z.number().optional(),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2.5),
  }),
  z.object({ type: z.literal("phase"), id: z.string().min(1), to: z.string().min(1), startSeconds: z.number().min(0) }),
  /** A short callout pinned to an object, for the one moment it is relevant.
   *
   * Deliberately an ACTION rather than a property of the object: in three
   * dimensions the mesh already says what the thing is, so a permanent label on
   * every object is clutter that fights the picture. Text earns its place by
   * saying something the shape cannot — and only while that is being said. */
  z.object({
    type: z.literal("annotate"),
    target: z.string().min(1),
    text: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2.4),
  }),
  z.object({
    type: z.literal("beat"),
    text: z.string().min(1),
    startSeconds: z.number().min(0),
    durationSeconds: z.number().min(0.1).default(2.2),
    tone: z.enum(["neutral", "alert", "reveal"]).default("neutral"),
    at: z.enum(["top", "center", "bottom"]).default("top"),
    size: z.enum(["normal", "huge"]).default("normal"),
  }),
]);


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
    kind: "tactical-board-3d",
    category: "pitch-tactics",
    label: "Tactical Board 3D",
    description:
      "3D counterpart to Tactical Board — a real camera arcs over billboarded player markers (always facing the camera, labels stay upright) on a genuine 3D pitch, instead of Tactical Board's 2D perspective-warp illusion. Same players/arrows/highlightZone/ball authoring shape, PLUS the same evented `timeline` (move/state/possession/camera/freeze) system and `tacticalObjects` (zone/line/lane/triangle) Tactical Board has — real gliding player runs, ball possession chains that track a moving receiver, and freeze-frame+circle+annotation callouts all work here too, rendered as real 3D geometry (a world-space bezier glide, a billboarded highlight ring, an Html-overlay annotation) instead of the 2D board's SVG path. `timeline`'s `camera` action type is not supported in 3D (camera framing here is driven by `cameraStyle` instead) — a `camera`-type timeline action is silently ignored if present. Still doesn't support `phases` (the older, pre-timeline multi-beat mechanism) — author multi-beat 3D choreography via `timeline` only.",
    sceneTypeKey: "tacticalboard3d",
    schema: z.object({
      kind: z.literal("tactical-board-3d"),
      title: z.string(),
      players: z.array(tacticalPlayerSchema).min(1),
      arrows: z.array(tacticalArrowSchema).optional(),
      highlight: z.array(z.string()).optional(),
      highlightZone: tacticalZoneSchema.optional(),
      ball: tacticalBallSchema.optional(),
      cameraStyle: cameraStyle3DSchema,
      timeline: z.array(timedActionSchema).min(1).optional(),
      tacticalObjects: z.array(tacticalObjectSchema).optional(),
    }),
  },
  {
    kind: "formation-3d",
    category: "pitch-tactics",
    label: "Formation 3D",
    description:
      "3D counterpart to Formation — the same auto-positioned lineup shape (FORMATION_TEMPLATES), rendered with a real arcing camera over billboarded markers instead of the 2D perspective board.",
    sceneTypeKey: "formation3d",
    schema: z.object({
      kind: z.literal("formation-3d"),
      title: z.string().optional(),
      sides: z.array(formationSideSchema).min(1).max(2),
      cameraStyle: cameraStyle3DSchema,
    }),
  },
  {
    kind: "shot-map-3d",
    category: "pitch-tactics",
    label: "Shot Map 3D",
    description:
      "3D counterpart to Shot Map — every shot as a billboarded marker on a genuine 3D pitch with a real arcing camera, styled by result and optionally sized by xG.",
    sceneTypeKey: "shotmap3d",
    schema: z.object({
      kind: z.literal("shot-map-3d"),
      title: z.string(),
      shots: z.array(shotSchema).min(1),
      cameraStyle: cameraStyle3DSchema,
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
    kind: "line-chart",
    category: "stats-dataviz",
    label: "Line Chart",
    description:
      "A real interpolated curve through an ordered series of values (time, distance, count) — not Bar Chart's flat category comparison. Reveals left-to-right at a CONSTANT pace along the X-axis (a clip-wipe, not a constant stroke-length draw), so a shape that's genuinely slow-then-sudden (compounding, viral growth) actually reads that way instead of the reveal speed fighting the data's own shape. An optional `highlightRange` shades a contiguous stretch under the curve with its own caption, for calling out one stretch (\"this felt like nothing\") on the same curve instead of a second, disconnected diagram. An optional second series (`points2`) draws a SECOND curve on the same axes — same X positions (both arrays must be the same length, sharing one set of point labels), different color, its own small legend — for the one explanation that actually needs two lines diverging live rather than a single shape: \"here's what a FLAT rate would look like, and here's what actually happens.\" Without `points2`, renders exactly as a single-series chart always has.",
    sceneTypeKey: "linechart",
    schema: z.object({
      kind: z.literal("line-chart"),
      title: z.string(),
      points: z.array(z.object({ label: z.string(), value: z.number() })).min(2),
      // A second curve sharing the same X-axis positions as `points` — for a
      // genuine "two mechanisms, same starting conditions" comparison (e.g.
      // simple vs compound interest). Author-supplied labels so each series
      // reads correctly regardless of which one is more dramatic.
      points2: z.array(z.object({ label: z.string(), value: z.number() })).min(2).optional(),
      series1Label: z.string().optional(),
      series2Label: z.string().optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      highlightRange: z
        .object({
          fromIndex: z.number().min(0),
          toIndex: z.number().min(0),
          label: z.string().optional(),
        })
        .optional(),
    }),
  },
  {
    kind: "kinetic-stat",
    category: "stats-dataviz",
    label: "Kinetic Stat",
    description:
      "A kinetic-typography stat beat: plain background, a short uppercase title, a climbing line chart, and a grid of icon cards that fills in as the same reveal plays — the metric climbing and the resource pool growing are ONE animated cause-and-effect, not two decorations on independent clocks (e.g. traffic climbing while server instances light up to match, or retries piling up while a connection pool fills). Reveals fast (well under 2s) then HOLDS its settled state for the rest of the scene's real narration — this is one short punchy beat, not a slow single-scene video; pair several Kinetic Stat scenes in a script for a multi-beat Short, the same way any other scene type chains. Word-synced karaoke captions (the currently-spoken word highlighted) run along the bottom automatically from this scene's own Narration — no separate Data field for caption text.",
    sceneTypeKey: "kineticstat",
    schema: z.object({
      kind: z.literal("kinetic-stat"),
      title: z.string(),
      points: z.array(z.object({ label: z.string(), value: z.number() })).min(2),
      unitIcon: z.enum(CANVAS_ICON_KEYS),
      unitCount: z.number().int().min(2).max(30),
      badgeLabel: z.string().optional(),
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
    description: "Two panels side by side, each a label/value/caption — for a qualitative or mixed-content comparison (a claim vs a claim, not just two numbers) that Stat Burst's numeric-only head-to-head can't carry. `left` always settles in near the start; `right` follows a short beat later by default (an 8-frame stagger) so the two never feel like a single flat image — set `revealRightAt` (0-1, a fraction of the scene's own on-screen time) to hold `right` back further, e.g. so a narration line can pose the question before `right` lands as the answer.",
    sceneTypeKey: "splitcards",
    schema: z.object({
      kind: z.literal("split-cards"),
      title: z.string().optional(),
      left: splitPanelSchema,
      right: splitPanelSchema,
      // Fraction (0-1) of the scene's own on-screen duration at which the
      // right panel starts revealing. Omitted (the default) keeps today's
      // exact fixed 8-frame stagger after the left panel — this only takes
      // over once explicitly set, so no existing script's timing shifts.
      revealRightAt: z.number().min(0).max(1).optional(),
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
      "A code-editor-style window — real monospace font, left-aligned, per-token syntax-highlight coloring (keyword/string/function/variable/comment/number/plain), traffic-light chrome, a filename tab. For narration that references actual code, JSON, or a config/log line — not a generic diagram (use Canvas for that, even if it also contains text). An optional `secondPanel` adds a second window — give it its own `filename`/`language` for a real second editor (e.g. clean vs dirty code, before vs after), or just a `label` for a plain console/output box — stacked below the first by default, or `side-by-side` in landscape. Either layout HOLDS the second panel back (empty/hidden) until `revealAt` (default 0.6 — 60% through the scene's own on-screen time, whatever that turns out to be with real narration) so a narration line that asks a question or sets up a 'before' can actually land before the answer/'after' appears — never reveal both halves together just because they're a comparison. Always falls back to stacked in portrait — two columns don't fit a 9:16 frame legibly.",
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
      lines: codeLinesSchema,
      // A second window — either a real second file (set `filename` and/or
      // `language`, renders with the same traffic-light editor chrome as the
      // primary panel — e.g. a clean-vs-dirty or before-vs-after comparison)
      // or a plain result box (leave both unset and optionally set `label`,
      // renders as a small uppercase tab with no traffic lights — an output
      // console). Which chrome it gets is inferred from which fields are
      // set, not a separate flag, since a script author already expresses
      // the intent by whether they're naming a file.
      secondPanel: z
        .object({
          filename: z.string().optional(),
          language: z.string().optional(),
          label: z.string().optional(),
          lines: codeLinesSchema,
        })
        .optional(),
      // "stacked" (default) or "side-by-side" — side-by-side only applies in
      // landscape (see description); ignored with no `secondPanel`.
      layout: z.enum(["stacked", "side-by-side"]).optional(),
      // Fraction (0-1) of the scene's own on-screen duration at which
      // `secondPanel` starts revealing — expressed as a fraction, not
      // seconds, specifically so it stays in sync automatically whether
      // this scene ends up using its estimated word-count Duration or a
      // real (and likely different) narration length: resolveSegmentAudio
      // only ever rescales a segment's TOTAL duration, it has no notion of
      // resyncing an absolute in-scene timestamp the way it does for
      // Canvas/TacticalBoard phase boundaries (see resolveAudio.ts's
      // `_canvasClipBoundaries` handling) — a fraction sidesteps needing
      // that entirely. Defaults to 0.6 when unset.
      revealAt: z.number().min(0).max(1).optional(),
      // Progressive reveals for the PRIMARY panel itself — each entry
      // swaps in a new `lines` array (its own fresh staggered fade-in,
      // same as the initial reveal) once the scene reaches `at` (0-1, a
      // fraction of the scene's own on-screen duration, same convention as
      // `revealAt` above). For a long scene that keeps building on the
      // same file (e.g. typing a lookup call in below an already-shown
      // line) rather than dumping every line at frame 0 and holding a
      // static frame for the rest of the scene. Entries should be given in
      // increasing `at` order; omitted (the default) reproduces today's
      // exact behavior — the full `lines` array revealed once at frame 0
      // with no further changes.
      revealSteps: z
        .array(
          z.object({
            at: z.number().min(0).max(1),
            lines: codeLinesSchema,
          }),
        )
        .optional(),
    }),
  },
  {
    kind: "browser-mock",
    category: "narrative-callouts",
    label: "Browser Mock",
    description:
      "A realistic browser-window-plus-DevTools mockup — traffic-light chrome and a real address bar (or a simpler flat 'API client' header when `chrome: \"tool\"`, for a Postman/Thunder-Client-style contrast frame), with a Network-tab request table or a Console-tab log underneath. For content that specifically needs to LOOK like a browser screen, not a generic diagram — CORS, network errors, console output, request/response inspection. Not for narration that's just about an HTTP request/response body or a code snippet (use `Code` for that). `revealSteps` progressively swaps in new `requests`/`consoleLines`/`panel`/`highlightIndex` at a fraction of the scene's own on-screen duration, same convention as Code's own `revealSteps` — for a request that starts `pending` and then resolves, or a console error that appears only after the request fails.",
    sceneTypeKey: "browsermock",
    schema: z.object({
      kind: z.literal("browser-mock"),
      // "browser" (default): full traffic-light + address-bar chrome, for
      // an actual browser tab. "tool": a simpler flat header (a colored
      // dot + `toolLabel`) with no address bar — for a non-browser HTTP
      // client (Postman, Thunder Client, curl) shown for contrast, since
      // those tools have no address bar and don't enforce CORS at all.
      chrome: z.enum(["browser", "tool"]).optional(),
      // Shown in the address bar (browser chrome). Ignored for "tool".
      url: z.string().optional(),
      // Shown in the flat header (tool chrome only), e.g. "Thunder Client".
      toolLabel: z.string().optional(),
      // Which DevTools-style panel is active. Only meaningful for
      // "browser" chrome — a "tool" client has no DevTools. Defaults to
      // "network".
      panel: z.enum(["network", "console"]).optional(),
      // Network-tab rows. `status` is a real 2xx/4xx/5xx number, or the
      // string "pending" (a request still in flight — rendered with a
      // pulsing indicator, no color verdict yet) or "blocked" (the
      // browser refused to hand the response to JS — rendered in red,
      // with a small "CORS" tag, distinct from a real HTTP error status).
      requests: z
        .array(
          z.object({
            method: z.string(),
            path: z.string(),
            status: z.union([z.number(), z.enum(["pending", "blocked"])]).optional(),
          }),
        )
        .optional(),
      // Console-tab lines — "error" renders red with a small warning
      // glyph, "warn" amber, "log" the default monospace grey/white.
      consoleLines: z
        .array(
          z.object({
            text: z.string(),
            level: z.enum(["error", "warn", "log"]).default("log"),
          }),
        )
        .optional(),
      // Index into `requests` (post any revealStep) to give a glowing red
      // outline — the one row narration is currently pointing at.
      highlightIndex: z.number().optional(),
      // Progressive reveal: each entry swaps in a new snapshot of
      // panel/requests/consoleLines/highlightIndex once the scene reaches
      // `at` (0-1, a fraction of the scene's own on-screen duration) — same
      // convention as Code's own `revealSteps`. Omitted (the default)
      // reproduces a single static screen for the whole scene.
      revealSteps: z
        .array(
          z.object({
            at: z.number().min(0).max(1),
            panel: z.enum(["network", "console"]).optional(),
            requests: z
              .array(
                z.object({
                  method: z.string(),
                  path: z.string(),
                  status: z.union([z.number(), z.enum(["pending", "blocked"])]).optional(),
                }),
              )
              .optional(),
            consoleLines: z
              .array(
                z.object({
                  text: z.string(),
                  level: z.enum(["error", "warn", "log"]).default("log"),
                }),
              )
              .optional(),
            highlightIndex: z.number().optional(),
          }),
        )
        .optional(),
    }),
  },
  {
    kind: "diagram",
    category: "narrative-callouts",
    label: "Diagram",
    description:
      "A structural architecture diagram — the medium for system design. You declare NODES (optionally nested inside each other) and EDGES between them; the engine computes every coordinate, sizes each box to its own label, and routes real connectors between box boundaries. Prefer this over `Canvas` for anything shaped like an architecture: clients, load balancers, gateways, services, databases, queues. Because relationships are declared as `edges`, a diagram can never render as disconnected floating icons — the failure Canvas allowed. Use `children` for containment (a node holding pods, a pool holding replicas) and `replicas` for N identical copies, which are drawn identically by construction. `direction` is \"horizontal\" (default) or \"vertical\"; use vertical for 9:16, which is a genuine recomposition rather than a squeeze. The `timeline` builds the diagram progressively in ABSOLUTE seconds: `addNode`/`addEdge` reveal structure as the narration introduces it, `flow` sends a token travelling along real edges, `focus` brightens some nodes and dims the rest, `setState` recolours a node to show a state change, and `annotate` pins a short callout beside a node.",
    sceneTypeKey: "diagram",
    schema: z.object({
      kind: z.literal("diagram"),
      title: z.string().optional(),
      direction: z.enum(["horizontal", "vertical"]).optional(),
      // A persistent "the system is live" backdrop — a street grid with
      // small vehicle dots drifting continuously, independent of narration
      // timing (see LiveMapBackdrop.tsx). For a scene that's literally about
      // live location/dispatch data (ride-hailing, delivery tracking, fleet
      // GPS) — not a generic ambient option for every diagram, most
      // architecture scenes want the plain panel so the diagram itself stays
      // the only moving subject.
      background: z.enum(["none", "liveMap"]).optional(),
      nodes: z.array(diagramNodeSchema).min(1),
      edges: z
        .array(
          z.object({
            from: z.string().min(1),
            to: z.string().min(1),
            label: z.string().optional(),
            style: z.enum(["solid", "dashed"]).default("solid"),
            kind: z.enum(["request", "response", "data", "dependency"]).default("request"),
          }),
        )
        .default([]),
      timeline: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("addNode"), id: z.string().min(1), startSeconds: z.number().min(0), durationSeconds: z.number().min(0).default(0.5) }),
            z.object({
              type: z.literal("addEdge"),
              from: z.string().min(1),
              to: z.string().min(1),
              startSeconds: z.number().min(0),
              /** The connector draws itself over this long. */
              durationSeconds: z.number().min(0).default(0.7),
            }),
            z.object({
              type: z.literal("flow"),
              /** Node ids to travel through, in order — the token follows the
               * real routed edges between them, so it can never drift off the
               * line or stop inside a box. */
              path: z.array(z.string().min(1)).min(2),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0.1).default(2),
              /** ALWAYS give the token a real label naming the actual thing
               * in flight ("GET /users", "200 OK", "AUTH TOKEN", "SELECT
               * users") — animate the information, not the connection. An
               * unlabeled flow renders as a bare dot, which is exactly the
               * generic "something is happening" the renderer's `kind`
               * styling exists to replace. */
              label: z.string().optional(),
              /** Explicit override. Leave unset and let `kind` pick a
               * canonical color instead, so request/response/error read
               * consistently across every scene rather than depending on
               * each script author picking hex values by hand. */
              color: z.string().optional(),
              /** What this token IS, not just what color it happens to be.
               * The renderer maps each kind to its own canonical color and
               * visual treatment: `request` (amber, forward motion) and
               * `response`/`success` (green, must never look like a
               * `request` going the other way) are the two that matter most
               * — Part 6/7 of the doctrine this exists for is exactly "a
               * request and a response must never look identical". `data` is
               * a neutral payload in transit (a query, a value) that isn't
               * specifically a request or response. `discover` is a
               * capabilities/schema query (teal — matches the "what can you
               * do?" MCP beat). `error` renders with a rejected treatment
               * (dashed, red) instead of arriving cleanly. `retry` marks a
               * repeated attempt. Omit entirely for a plain unstyled token
               * (falls back to `color`, then a neutral default). */
              kind: z.enum(["request", "response", "data", "success", "error", "discover", "retry"]).optional(),
              /** The destination REACTS when this token arrives, instead of
               * just vanishing into the box — Part 8 of the doctrine this
               * exists for. Pulses the path's last node to `accent` right as
               * the token lands, then settles back to whatever accent it had
               * before. Equivalent to hand-authoring a `setState` timed to
               * this flow's own end, offered here because that pairing is
               * the common case, not because setState stopped working. */
              reactsOnArrival: z
                .object({
                  accent: z.enum(["neutral", "primary", "warn", "success", "danger"]),
                  durationSeconds: z.number().min(0).default(0.4),
                })
                .optional(),
            }),
            z.object({ type: z.literal("focus"), ids: z.array(z.string()), startSeconds: z.number().min(0), durationSeconds: z.number().min(0).default(0.4) }),
            z.object({
              type: z.literal("setState"),
              id: z.string().min(1),
              accent: z.enum(["neutral", "primary", "warn", "success", "danger"]),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).default(0.4),
            }),
            z.object({
              type: z.literal("annotate"),
              target: z.string().min(1),
              text: z.string().min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).default(0.4),
            }),
            /** Removes a node — an evicted cache entry, a terminated instance.
             * The counterpart to `addNode`: without it a diagram can only ever
             * accumulate, which cannot express expiry. */
            z.object({
              type: z.literal("removeNode"),
              id: z.string().min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).default(0.5),
            }),
            /** Replaces a node's sublabel — a changing value, not just a
             * changing colour. */
            z.object({
              type: z.literal("setValue"),
              id: z.string().min(1),
              text: z.string(),
              startSeconds: z.number().min(0),
            }),
            /** A depleting (or filling) bar across the bottom of a node. This
             * is how a TTL is actually taught: the viewer watches the budget
             * run out, rather than reading three static labels claiming it
             * did. `from`/`to` are 0-1. */
            z.object({
              type: z.literal("meter"),
              id: z.string().min(1),
              from: z.number().min(0).max(1).default(1),
              to: z.number().min(0).max(1).default(0),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0.1).default(3),
              label: z.string().optional(),
            }),
          ]),
        )
        .optional(),
    }),
  },
  {
    kind: "stage",
    category: "narrative-callouts",
    label: "Stage",
    description:
      "The Techijest SHORTS medium — a 2D environment the viewer watches OPERATE, not a diagram they read. Objects live in named regions of a 3x3 stage (`top-left` .. `bottom-right`), and the whole composition REORGANISES across the scene: `compose` moves objects between regions and changes their `emphasis` (`lead` dominates, `recede` shrinks back), and every box glides to its new geometry while connectors re-route from the moving silhouettes. Use this instead of `Diagram` for any 9:16 Short. `Diagram` lays out in ONE flow axis, so in portrait it can only ever produce a vertical flowchart; a Stage uses the whole frame as a space (client left, server centre, database right; later the server expands and the database moves forward). Deliberately has NO `title` field: a headline is a timed actor (`beat`), not a permanent banner sitting on screen for the whole scene. Author the four-act arc (STRANGE THING -> INVESTIGATION -> REVEAL -> CONSEQUENCE) by declaring the scene's `act` and letting each act be its own composition.",
    sceneTypeKey: "stage",
    schema: z.object({
      kind: z.literal("stage"),
      /** This scene's role in the mandatory four-act arc. Every Techijest
       * video opens on something strange, unfair, broken or counterintuitive
       * and only then reveals the mechanism — the mystery is what earns the
       * attention, the explanation is the reward. Declared rather than
       * inferred so the arc is checkable: a script whose first scene is
       * `reveal` has started by explaining, which is the failure this field
       * exists to catch. */
      act: z.enum(["strange", "investigate", "reveal", "consequence"]).optional(),
      /** A persistent background layer, so no frame is ever visually dead
       * during a narration lull. `grid` is a slow technical grid; `liveMap` is
       * the street-grid/vehicle backdrop shared with the diagram medium, for
       * scenes literally about live location or dispatch data. Both are
       * BACKDROPS: they never compete with the stage for attention, and
       * neither is a substitute for the system itself doing something.
       * Usually leave this unset and let `world` choose. */
      backdrop: z.enum(["none", "grid", "liveMap", "scanlines", "field", "depth", "scanner", "streets", "branches"]).optional(),
      /** Divides the stage into two halves that run the SAME layout engine.
       *
       * The only honest way to show "both approaches perform the same
       * operation" or "without the index / with the index": both systems
       * actually do the work at the same time, and the difference emerges from
       * watching rather than from a label claiming it. Two boxes placed side by
       * side assert a comparison; a split stage demonstrates one.
       *
       * `labels` name the halves ("POLLING" / "WEBSOCKET", "BEFORE" / "AFTER"). */
      splitScreen: z
        .object({
          orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
          labels: z.tuple([z.string(), z.string()]).optional(),
        })
        .optional(),
      /** THE VISUAL STRATEGY this scene uses to explain its concept.
       *
       * Declared, not inferred, because the governing question is never "how do
       * I animate these components?" but "what is the best visual way to make
       * THIS concept understandable?" A scene that has not answered that
       * question falls back to the house default — component, line, component,
       * travelling dot — which is the repetition this field exists to break.
       *
       * Pick from the concept: a race condition wants `competition` +
       * `stateChange` + `collision`; caching wants `stateChange` +
       * `accumulation` + `absence`; rate limiting wants `simulation` +
       * `accumulation` + `comparison`; indexing wants `beforeAfter` + `zoom`.
       *
       * `absence` deserves special mention: sometimes the most powerful thing
       * on screen is something NOT happening. On a cache hit the database stays
       * completely dark, and that darkness is the explanation. */
      strategy: z
        .array(
          z.enum([
            "transformation",
            "stateChange",
            "physicalInteraction",
            "competition",
            "accumulation",
            "failure",
            "splitting",
            "merging",
            "expansion",
            "zoom",
            "codeExecution",
            "uiInteraction",
            "beforeAfter",
            "simulation",
            "comparison",
            "metaphor",
            "reveal",
            "causalChain",
            "timeLapse",
            "loop",
            "perspective",
            "detach",
            "scaleChange",
            "absence",
            // The only strategies for which a persistent connector is the
            // honest representation — the connection itself is the subject.
            "topology",
            "dependency",
            "lineage",
          ]),
        )
        .min(1)
        .optional(),
      /** LIGHT OR DARK GROUND.
       *
       * The medium was built dark-first, which suits systems and infrastructure
       * and is wrong for whole categories of subject — anything playful,
       * consumer-facing or illustrative reads better on a warm light canvas
       * with dark ink. This flips the ground, the ink, the plates and the
       * captions together, so a scene stays legible rather than becoming white
       * text on cream. Objects keep their accent colours either way. */
      theme: z.enum(["dark", "light"]).default("dark"),
      /** THE TOPIC'S VISUAL WORLD. A video about caching should not look like
       * a video about TLS or about image decoding — one uniform dark-grid
       * template across every topic is what makes a channel's output read as
       * a slide deck with different words in it. The world sets the palette,
       * the backdrop, and how much ambient motion the frame carries, so the
       * viewer can tell what KIND of thing they are watching within a second
       * of it starting.
       *
       * - `network`  request/response, APIs, protocols, CDNs. Cyan/amber, fast
       *              directional motion along wires.
       * - `storage`  databases, caches, disks, indexes. Amber/green, slower and
       *              heavier, blocks settling rather than darting.
       * - `security` auth, tokens, CORS, TLS, rate limits. Red/cyan, scanlines,
       *              motion that gets INTERRUPTED — the world where things get
       *              stopped.
       * - `compute`  concurrency, threads, queues, workers, schedulers. Green/
       *              violet, busy parallel motion.
       * - `data`     pipelines, ETL, streams, encoding, media. Violet/cyan,
       *              continuous flow that never fully stops.
       *
       * Defaults to `network` — the most common Techijest topic shape, and the
       * one whose grammar (something travels from A to B) the medium is built
       * around. */
      world: z.enum(["network", "storage", "security", "compute", "data", "scan", "city", "reasoning", "privacy"]).optional(),
      /** How alive the frame is between authored events. `calm` is nearly
       * static (for a scene where one thing must be read carefully), `busy`
       * keeps wires flowing and active objects breathing continuously.
       * Defaults to `active`. A Short should almost never be `calm`: dead air
       * between beats is the single most common reason a viewer scrolls. */
      energy: z.enum(["calm", "active", "busy"]).optional(),
      /** How much of the frame the system occupies. "full" is a poster
       * composition — the stage runs nearly edge to edge and the graphics fill
       * the frame, which is the default register for a Short. "inset" keeps
       * generous margins, for a scene where a large `beat` headline or a
       * caption needs to share the frame without crowding. Never solve a busy
       * frame by shrinking the system; solve it by removing objects. */
      composition: z.enum(["full", "inset"]).optional(),
      objects: z.array(stageObjectSchema).min(1),
      /** Persistent packets — see stagePacketSchema. Prefer these over one-shot
       * `flow` whenever the same thing appears in more than one beat. */
      packets: z.array(stagePacketSchema).optional(),
      /** ACTORS: things that DO something to the rest of the stage.
       *
       * An environment that fills itself in has nobody in it, and "nobody in
       * it" is why a system explanation collapses into a diagram. An actor is
       * whatever is operating the system — an agent, a user, a worker, a
       * garbage collector, a browser process — and it is declared once and then
       * driven by `act` verbs.
       *
       * `as` is REPRESENTATION, chosen per story rather than fixed: a cursor
       * for anything that operates an interface, an avatar when the actor is a
       * person or a service with an identity, a focus ring when the actor is
       * attention itself rather than a body, a process chip for something
       * running inside a machine. The same verbs drive all of them, so changing
       * how an actor looks never means rewriting what it does. */
      actors: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().optional(),
            as: z.enum(["cursor", "avatar", "focus", "process"]).default("cursor"),
            /** Object it starts at. Omit to start off-stage and enter on its
             * first move. */
            at: z.string().optional(),
          }),
        )
        .optional(),
      /** THE STANDING INSTRUCTION the actors are meant to satisfy, pinned in
       * the corner for the whole scene.
       *
       * This is what lets an audience see a mistake before the narration says
       * so: the asked-for value stays on screen while the system confidently
       * does something else with a different one. Without it, a wrong result
       * is only wrong once somebody says it is. */
      instruction: z
        .object({
          label: z.string().min(1),
          value: z.string().optional(),
        })
        .optional(),
      /** Puts the reacting mascot on screen, in the named corner, for this
       * scene. It sits OUTSIDE the stage's coordinate space and never takes
       * part in the mechanism — it is a storytelling device reacting to what
       * the system does, and the system stays the subject. Omit it entirely for
       * scenes where a face would only compete with the explanation. */
      mascot: z
        .object({
          at: z.enum(["bottom-left", "bottom-right", "top-left", "top-right"]).default("bottom-left"),
          /** The face it wears until a `react` changes it. */
          expression: z
            .enum(["puzzled", "alarmed", "surprised", "unimpressed", "pleased", "approving", "focused"])
            .default("puzzled"),
        })
        .optional(),
      edges: z.array(stageEdgeSchema).default([]),
      /** Absolute seconds from the start of the scene, exactly like Canvas's
       * and Diagram's — so the narration fitter can re-time every event onto
       * the real spoken audio. Never author a timing as a fraction of the
       * scene. */
      timeline: z.array(stageTimelineActionSchema).optional(),
    }),
  },
  {
    kind: "workspace",
    category: "narrative-callouts",
    label: "Workspace",
    description:
      "A real developer environment — one or more panes (a code editor with line numbers, and/or a terminal), choreographed against narration. This is the medium for teaching code: use it instead of `Code`/`TerminalMock` whenever the narration walks through a file line by line, runs a command and reads its output, or relates a config field to something else on screen. Panes are laid out `single` (one pane), `split` (side by side, 16:9) or `stacked` (one above the other, and the automatic choice in 9:16). The `timeline` drives everything in ABSOLUTE seconds, exactly like Canvas's: `reveal` shows lines up to `throughLine`; `highlight` brightens specific `lines` and dims the rest of that pane (the core teaching move — highlight the line while the narrator explains it); `clear` removes the highlight; `scroll` brings `toLine` into view in a long file; `focusPane` brightens one pane and dims the others. Because those times are absolute, the narration fitter re-times them onto the real spoken audio — never author a timing as a fraction of the scene.",
    sceneTypeKey: "workspace",
    schema: z.object({
      kind: z.literal("workspace"),
      title: z.string().optional(),
      layout: z.enum(["single", "split", "stacked"]).optional(),
      panes: z
        .array(
          z.discriminatedUnion("type", [
            z.object({
              type: z.literal("editor"),
              /** Referenced by every timeline action's `pane`. */
              id: z.string().min(1),
              filename: z.string().optional(),
              language: z.string().optional(),
              /** Same token model as the `Code` visual, so an author who can
               * write one can write the other — tag a token's ROLE and the
               * renderer owns what that role looks like. */
              lines: z.array(
                z.array(
                  z.object({
                    text: z.string(),
                    token: z.enum(["keyword", "string", "function", "variable", "comment", "number", "plain"]).default("plain"),
                  }),
                ),
              ),
              showLineNumbers: z.boolean().default(true),
              /** Line number of the FIRST line, for showing an excerpt from
               * partway down a real file rather than pretending it starts at 1. */
              startLine: z.number().int().min(1).default(1),
              // --- VS Code furniture. All optional, all derived when omitted,
              // because the point is that a lesson LOOKS like a real editor
              // without the author hand-dressing a set every scene.
              /** Other open tabs, shown inactive beside the active file. */
              tabs: z.array(z.string()).optional(),
              /** Explorer file tree. Prefix with "/" for a folder. Omit to hide
               * the sidebar entirely — on a narrow frame the code matters more. */
              files: z.array(z.string()).optional(),
              /** Status-bar branch name. */
              branch: z.string().optional(),
              /** Status-bar problem counts. */
              problems: z.object({ errors: z.number().int().min(0), warnings: z.number().int().min(0) }).optional(),
              showMinimap: z.boolean().default(true),
              /** How many lines are visible before the pane scrolls. Omit to
               * size the pane to its content. */
              visibleLines: z.number().int().min(1).optional(),
              flex: z.number().optional(),
            }),
            z.object({
              type: z.literal("terminal"),
              id: z.string().min(1),
              title: z.string().optional(),
              lines: z.array(
                z.object({
                  text: z.string(),
                  kind: z.enum(["command", "output", "success", "error", "comment"]).default("output"),
                }),
              ),
              showLineNumbers: z.boolean().default(false),
              visibleLines: z.number().int().min(1).optional(),
              flex: z.number().optional(),
            }),
            // A real browser window, not a code panel wearing a different
            // label. The page is DECLARED as semantic blocks and the renderer
            // owns what each one looks like — the same bargain the diagram
            // medium makes for nodes. Freeform HTML in a script would render
            // beautifully once and then be unreviewable and unfittable; a
            // screenshot cannot animate a button press or a form filling in.
            z.object({
              type: z.literal("browser"),
              id: z.string().min(1),
              /** Shown in the tab. */
              title: z.string().optional(),
              url: z.string().optional(),
              /** Real pages are light far more often than dark, and a light
               * page next to a dark editor is what sells it as a browser. */
              theme: z.enum(["light", "dark"]).default("light"),
              blocks: z.array(
                z.discriminatedUnion("kind", [
                  z.object({ kind: z.literal("nav"), brand: z.string().optional(), links: z.array(z.string()).default([]) }),
                  z.object({ kind: z.literal("heading"), text: z.string(), level: z.number().int().min(1).max(3).default(1) }),
                  z.object({ kind: z.literal("text"), text: z.string().optional(), lines: z.number().int().min(1).max(6).default(2) }),
                  z.object({ kind: z.literal("button"), text: z.string(), variant: z.enum(["primary", "secondary"]).default("primary") }),
                  z.object({ kind: z.literal("input"), label: z.string().optional(), placeholder: z.string().optional(), value: z.string().optional() }),
                  z.object({
                    kind: z.literal("cards"),
                    items: z.array(z.object({ title: z.string(), text: z.string().optional() })).min(1),
                  }),
                  z.object({ kind: z.literal("image"), label: z.string().optional(), heightRatio: z.number().min(0.1).max(3).default(0.5) }),
                  z.object({ kind: z.literal("list"), items: z.array(z.string()).min(1) }),
                  z.object({ kind: z.literal("spinner"), label: z.string().optional() }),
                  /** An API response rendered the way a browser shows JSON —
                   * the single most common "browser" shot in a backend lesson. */
                  z.object({ kind: z.literal("json"), lines: z.array(z.string()).min(1) }),
                ]),
              ),
              flex: z.number().optional(),
            }),
          ]),
        )
        .min(1),
      timeline: z
        .array(
          z.discriminatedUnion("type", [
            z.object({
              type: z.literal("reveal"),
              pane: z.string().min(1),
              /** 1-based, inclusive, counted within the pane's own `lines`
               * array (NOT affected by `startLine`, which is display only). */
              throughLine: z.number().int().min(0),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).optional(),
            }),
            z.object({
              type: z.literal("highlight"),
              pane: z.string().min(1),
              lines: z.array(z.number().int().min(1)).min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).optional(),
            }),
            // Keystroke-by-keystroke reveal, with the keyboard sound attached
            // automatically. USE SPARINGLY — it is the "let me walk you through
            // writing this" move, and it stops meaning anything if every block
            // of code arrives this way. `reveal` (instant) stays the default.
            z.object({
              type: z.literal("type"),
              pane: z.string().min(1),
              /** 1-based, inclusive. Types from wherever the pane is currently
               * revealed through, up to and including this line. */
              throughLine: z.number().int().min(1),
              startSeconds: z.number().min(0),
              /** Omit to type at the default fast speed; set it to make the run
               * land exactly on a narration beat. */
              durationSeconds: z.number().min(0).optional(),
              charsPerSecond: z.number().min(1).optional(),
            }),
            z.object({
              type: z.literal("clear"),
              pane: z.string().min(1),
              startSeconds: z.number().min(0),
            }),
            z.object({
              type: z.literal("scroll"),
              pane: z.string().min(1),
              toLine: z.number().int().min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).optional(),
            }),
            z.object({
              type: z.literal("focusPane"),
              pane: z.string().min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).optional(),
            }),
            // A real pointer landing on a browser block and pressing it. The
            // one interaction a mocked page needs in order to demonstrate
            // anything, rather than just sitting there being a picture.
            z.object({
              type: z.literal("click"),
              pane: z.string().min(1),
              /** 1-based index into the browser pane's `blocks`. */
              block: z.number().int().min(1),
              startSeconds: z.number().min(0),
              durationSeconds: z.number().min(0).optional(),
            }),
          ]),
        )
        .optional(),
    }),
  },
  {
    kind: "terminal-mock",
    category: "narrative-callouts",
    label: "Terminal Mock",
    description:
      "A realistic terminal/CLI window — traffic-light chrome, a monospace prompt, typed commands and their real output. For narration about a command-line tool (curl, git, npm, docker, a deploy log) — not for a code file (use `Code`) or a browser screen (use `BrowserMock`). Each line is a `kind`: \"command\" (rendered with a `$` prompt glyph), \"output\" (plain), \"success\" (green), \"error\" (red), or \"comment\" (dim, `#`-prefixed). `revealSteps` progressively appends/replaces lines at a fraction of the scene's own on-screen duration, same convention as Code's and BrowserMock's own `revealSteps` — for a command that's typed first and only shows its output a beat later.",
    sceneTypeKey: "terminalmock",
    schema: z.object({
      kind: z.literal("terminal-mock"),
      // Shown in the window's tab pill, e.g. "zsh" or "bash" — purely
      // cosmetic, same convention as Code's `filename`.
      title: z.string().optional(),
      lines: z
        .array(
          z.object({
            text: z.string(),
            kind: z.enum(["command", "output", "success", "error", "comment"]).default("output"),
          }),
        )
        .min(1),
      // Progressive reveal: each entry swaps in a new `lines` array (its
      // own fresh staggered fade-in) once the scene reaches `at` (0-1, a
      // fraction of the scene's own on-screen duration) — e.g. the typed
      // command lands first, then a later step adds its real output below
      // it. Omitted (the default) reveals the full `lines` array once at
      // frame 0, same as Code's own default.
      revealSteps: z
        .array(
          z.object({
            at: z.number().min(0).max(1),
            lines: z.array(
              z.object({
                text: z.string(),
                kind: z.enum(["command", "output", "success", "error", "comment"]).default("output"),
              }),
            ),
          }),
        )
        .optional(),
    }),
  },
  {
    kind: "canvas",
    category: "generic-diagrams",
    label: "Canvas",
    description:
      "A generic 2D scene: freely positioned objects (dot/circle/label/rectangle/roundedRectangle/ellipse/line/polygon), connected by arrows or object-tracking connectors, optionally rearranging across phases (every animatable property glides id-matched from one phase's value to the next) with per-object enter/exit animations, layering, trails, and an optional pan/zoom camera — the general-purpose diagram for anything a pitch/chart visual can't express (systems, physics, spatial relationships). For choreographed, cinematic motion (each element moving on its own clock, curved paths, mid-scene color shifts, multiple camera moves), prefer the evented `timeline` over `phases` — see canvasTimelineActionSchema; `timeline` wins when both are present.",
    sceneTypeKey: "canvas",
    schema: z.object({
      kind: z.literal("canvas"),
      title: z.string().optional(),
      objects: z.array(canvasObjectSchema).min(1),
      arrows: z.array(canvasArrowSchema).optional(),
      phases: z.array(canvasPhaseSchema).min(1).optional(),
      timeline: z.array(canvasTimelineActionSchema).min(1).optional(),
      snap: z.number().optional(),
      camera: canvasCameraSchema.optional(),
    }),
  },
  {
    kind: "canvas-3d",
    category: "generic-diagrams",
    label: "Canvas 3D",
    description:
      "3D counterpart to Canvas — the same generic diagram-building idea (freely positioned objects connected by arrows, optionally rearranging across phases), rendered in a real Three.js scene with an arcing camera instead of a flat pan/zoom plane. v1 covers 6 object types (dot/circle/roundedRectangle/line/icon/label) rather than Canvas's full 9, and adds an optional per-object z (depth) for genuine parallax as the camera moves — Canvas's flat plane has no such axis. See Canvas3D.tsx's docstring for the full list of v1 scope cuts (ellipse/polygon/rectangle, arrow flow, snap, Continue-Canvas folding).",
    sceneTypeKey: "canvas3d",
    schema: z.object({
      kind: z.literal("canvas-3d"),
      title: z.string().optional(),
      objects: z.array(canvasObject3DSchema).min(1),
      arrows: z.array(canvasArrow3DSchema).optional(),
      phases: z.array(canvasPhase3DSchema).min(1).optional(),
      camera: canvasCamera3DSchema.optional(),
      cameraStyle: cameraStyle3DSchema,
    }),
  },
  {
    kind: "spatial",
    category: "generic-diagrams",
    label: "Spatial",
    description:
      "A real 3D stage: volumetric objects (globe, satellite, phone, axes, vectors) in a lit scene with a camera that occupies a position and travels through it. Built for subjects where the physics IS three-dimensional — orientation, fields, orbits — and where the teaching move is that a world-fixed quantity holds its direction while the body it is drawn on tumbles. Unlike canvas-3d, which places flat billboards at 3D coordinates, every object here has volume and can be viewed from any side.",
    sceneTypeKey: "spatial",
    schema: z.object({
      kind: z.literal("spatial"),
      theme: z.enum(["light", "dark"]).default("dark"),
      objects: z.array(spatialObjectSchema).min(1),
      timeline: z.array(spatialActionSchema).default([]),
    }),
  },
] as const satisfies readonly VisualDefinition[];

export type VisualKind = (typeof VISUAL_DEFINITIONS)[number]["kind"];
