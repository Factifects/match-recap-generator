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
] as const satisfies readonly VisualDefinition[];

export type VisualKind = (typeof VISUAL_DEFINITIONS)[number]["kind"];
