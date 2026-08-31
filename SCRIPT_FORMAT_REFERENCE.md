# Scene Script Format — Reference

Generated 2026-07-16 directly from the live source of truth: `src/model/Segment.ts`,
`src/model/visualDefinitions.ts`, `src/script/parseSceneScript.ts`, `src/video/formations.ts`,
and `src/video/tacticalPatterns.ts`. If the parser or registry changes, re-derive this doc from
those files rather than hand-editing around drift — they're what actually runs.

The "YouTube publishing & engagement guidelines" section near the end is sourced from this
project's `CLAUDE.md` instead (added 2026-07-17) — it's channel/publishing policy, not script
format, so it doesn't get re-derived from the parser/schema files above. If that policy changes,
update `CLAUDE.md` first and mirror the change here.

**Purpose of this file:** for use by tools/models *outside* this project (or a human) drafting a
script to paste into the app. It is not meant to be re-read every session inside this repo — treat
it like an API reference, not a live dependency.

## What this is for

A script is plain text made of `### SCENE N` blocks, fed into `generateVideo()` (via `npm run
generate`, `npm run ui`, or the `/generate`/`/parse` HTTP endpoints). Each scene becomes one beat
of narration with an on-screen visual. The parser auto-detects this format by looking for a
`### SCENE \d+` marker anywhere in the text — if it's absent, the input is treated as the older,
simpler `[INTRO]`/`[STAT: x]`/`[MOMENT: n]` tag format instead (see the bottom of this doc; that
format is legacy and shouldn't be used for new scripts).

## Basic syntax

```
### SCENE 1

**Scene Type:** Chapter

**Narration:** What gets spoken aloud and, for non-visual scene types, what's shown as kinetic
typography on screen.

**Duration:** 7 seconds

---

### SCENE 2

**Scene Type:** Statement
...
```

- Scenes are separated by a `### SCENE N` line (the number itself isn't used for anything —
  scenes are processed in the order they appear in the file, not by the number you write).
- Every other field is a `**Field Name:** value` line. A field's value can wrap across multiple
  lines (everything until the next `**Field:**` line, blank line, or `---` is folded into the same
  value, space-joined) — this is how a multi-line **Data:** JSON block or a multi-sentence
  **Narration:** works.
- `---` on its own line is just a visual separator between scenes; it's optional and ignored by
  the parser (scenes are actually delimited by the `### SCENE N` marker, not by `---`).
- Field names are case-sensitive exact matches (`**Scene Type:**`, not `**scene type:**`).

## Universal fields (every scene type)

| Field | Required | What it does |
|---|---|---|
| `Scene Type` | Yes | Picks the visual — see the table below. `Chapter` and `Statement` are special (no `Data` needed). |
| `Narration` | Yes | Spoken aloud (real narration audio) or shown as kinetic-typography text (`Chapter`/`Statement`, and as the fallback when a visual can't resolve — see "Graceful degradation" below). |
| `Duration` | No (defaults to 5s) | A number of seconds, e.g. `7 seconds`. This is a *minimum*/estimate, not the final word: once real narration audio is generated, the segment's actual on-screen duration comes from the real audio length (never shorter than a small internal floor), not this field. It only becomes the literal duration when generating without real narration (word-count-estimate mode). |
| `Transition` | No (defaults to a dissolve) | Only one distinction actually matters here: does the string contain "hard cut" (case-insensitive)? If yes → an instant cut. Anything else (`Cross Dissolve`, `Fade In`, `Wipe Left`, whatever you write) → a dissolve of the same fixed length. **The specific wording beyond "hard cut" has no effect** — which visual transition style plays is controlled by `Transition Style` (or `Story Beat`'s default) below, not by this field's text. |
| `Transition Style` | No | One of: `fade`, `zoom in`, `zoom out`, `slide left`, `slide right`, `slide up`, `slide down` (case-insensitive). Explicit value always wins over `Story Beat`'s default. |
| `Story Beat` | No | One of: `hook`, `reveal`, `comparison`, `evidence`, `escalation`, `explanation`, `payoff`, `reflection`, `question`. Pure authoring metadata (no on-screen badge) *except* it supplies a default `Transition Style` when that field is absent: reveal/payoff→zoom-in, comparison→slide-left, evidence→zoom-out, escalation→slide-up, explanation/reflection/question→fade. `hook` has no explicit default mapping (falls through to plain fade). |
| `Panel Color` | No (defaults to neutral) | One of: `neutral`, `red`, `blue`, `yellow` — a bold background color-block, works on every scene type. |
| `Camera` | No | Pitch-based visuals only (TacticalBoard/VerticalTacticalBoard/Formation/ShotMap/GoalSequence/Analysis) — ignored otherwise. One stage, or several joined with `→` or `->` for a pan/zoom sequence. Recognized phrases: `wide`/`full pitch`/`zoom out` (full pitch), `left half`/`right half`, `central channel`, `goal line`, `box`/`close-up`/`close tactical` (tight zoom), `follow <name>`/`pan` (uses a named player if mentioned). A player's name anywhere in the phrase (e.g. `Follow Gordon`) always wins over the keyword guesses. |
| `Subject` | No | A player/manager/fans name to resolve a real photo/silhouette as a faded background image. Falls back to an inferred subject from the visual's own content (e.g. TacticalBoard's focus player) when absent. |
| `Subject Kind` | No (defaults to `player`) | One of: `player`, `manager`, `fans` — which silhouette fallback to use if no real photo exists for `Subject`. |
| `Image Style` | No (defaults to `faded`) | `featured` (full-color, prominent — the scene IS about this person) or `faded` (low-contrast set-dressing). |
| `Image Side` | No (defaults to `right`) | `left`, `right`, or `center`. |
| `Board Position` | No (defaults to `center`) | TacticalBoard/Formation only. `left`/`right`/`center` — moves the caption into a side panel instead of overlaying the board. |
| `Pattern` | No | TacticalBoard only — see "TacticalBoard specifics" below. |
| `Focus` / `Supporting Players` | Pattern-mode only | TacticalBoard only — see below. |
| `Data` | Depends | Required (as valid JSON matching the exact schema below) for every Scene Type except `Chapter`, `Statement`, and Pattern-mode TacticalBoard. |
| `Animation` | No | JSON object controlling *how* a visual's existing `Data` gets revealed — not a change to the data itself. Shape: `{ staggerSeconds?: number, focusOrder?: number[], pulse?: boolean }`. `staggerSeconds` overrides the per-item reveal delay; `focusOrder` is a permutation of item indices controlling reveal ORDER (any index left out is appended afterward in natural order) — indices always refer to each visual's own authored item array (`items`/`bars`/`rows`/`tiers`/`stages`/`circles`/`stats`/`segments`/`phases`/`series`, not any internal re-sorted/re-packed order); `pulse` layers a gentle continuous breathing motion on top of each item once its entrance settles. **Read by `Grid`, `BarChart`, `LeagueTable`, `TierCards`, `Funnel`, `PackedCircles`, `KpiPanel`, `Treemap`, `MomentumTimeline`, and `Radar`** — every other Scene Type ignores it. (`MomentumTimeline`'s markers already pulse continuously by default, independent of this field, so `pulse` has no additional effect there — `staggerSeconds`/`focusOrder` still apply.) Malformed/non-JSON values (including free-text notes) are silently ignored, same as a missing field. Not available on `Chapter`/`Statement`, or on any Scene Type not listed above (a named preset like `"style": "assemble"` isn't supported yet either). |
| `Phases` | No | JSON array of `{ caption: string, startSeconds?: number }`, works on **every** Scene Type with a visual (not `Chapter`/`Statement`) — renders as a caption overlay that cross-fades between entries over the scene's own duration, independent of whichever visual is showing. Without `startSeconds`, phases split the scene's duration evenly; an explicit `startSeconds` on any entry pins that entry's start. Not to be confused with `TacticalBoard`'s own nested `Data.phases` (full player-position choreography, a different field at a different scope). |

**Fields that look real but do nothing:** `Annotation` is only used by `Chapter` (as its on-screen
title) and pitch-tactics visuals (as their `title`) — on every other scene type it's silently
ignored. `Evidence` is not read by the parser at all, on any scene type — it's pure authoring
notes for whoever's writing the script, with zero effect on the render. Neither will cause an
error; they just don't do anything outside those specific cases.

## Graceful degradation

If `Scene Type` doesn't match anything below, or the `Data` field is missing/malformed/doesn't
match that type's schema, the scene does **not** disappear — it renders as a plain `Statement`
(narration as kinetic typography, no graphic) instead. So a mismatched or malformed scene always
still speaks its line; you just won't get the specific visual you asked for. Fix by either
correcting `Data` to match the schema, or deliberately using `Statement` if no registry visual
actually fits the content (see "Chapter and Statement" below).

## Chapter and Statement

- **`Chapter`** — a section-divider card with a swoosh-wipe transition. On-screen title comes from
  `Annotation` if set, else falls back to the full `Narration` text. No `Data` needed.
- **`Statement`** — narration rendered as bold kinetic typography over a plain background, no
  graphic. No `Data` needed. This is the right choice whenever your content doesn't fit any
  registry visual below (e.g. general narration that isn't about football stats/tactics) — it's
  also exactly what the graceful-degradation fallback uses.

## Every other Scene Type

`Scene Type:` matching is case-insensitive and ignores spaces (`Hero Metric`, `HeroMetric`, and
`hero metric` all match the same entry). The key column below is the simplest form to type.

### Pitch & Tactics

| Scene Type (key) | Data JSON shape |
|---|---|
| `TacticalBoard` | See "TacticalBoard specifics" — supports a hand-authored `Data` block, a named-`Pattern` shortcut, or (new, see "TacticalBoard evented timeline" below) an evented `timeline`. `{ title: string, players: [{id, x, y, team: "home"\|"away", label, state?, facing?}] (min 1), arrows?: [{from, to: {x,y}, kind?: "run"\|"pass", style?: "standard"\|"press"\|"recovery"\|"third-man-run"}], highlight?: string[], highlightZone?: {x,y,width,height}, annotations?: [{text,x,y}], phases?: [{players, arrows?, highlightZone?, caption?, dataPoint?}] (min 1), ball?: {x,y,belongsTo?}, timeline?: TimelineAction[] (min 1), tacticalObjects?: TacticalObject[] }` |
| `VerticalTacticalBoard` | `{ title: string, players: [{id, x, y, team, label, role?}] (min 1), arrows?: [{from, to:{x,y}, curve?: bool, bow?: number}], sideText?: string }` |
| `Formation` | `{ title?: string, sides: [{team: string, formationName: "4-3-3"\|"4-2-3-1"\|"3-4-2-1"\|"5-4-1"\|"4-4-2", players: [{name}] (min 1), side?: "home"\|"away"}] (1-2 entries) }` — see "Formation position reference" below; `players` array order must match that formation's canonical slot order. |
| `ShotMap` | `{ title: string, shots: [{x, y, team: "home"\|"away", result: "goal"\|"saved"\|"blocked"\|"off-target", xg?: 0-1}] (min 1) }` |
| `PassNetwork` | `{ title: string, nodes: [{id, x, y, team, label}] (min 2), links: [{from, to, weight: number>=0}] (min 1) }` |
| `HeatMap` | `{ title: string, zones: [{x, y, intensity: 0-1}] (min 1) }` |
| `Zone` | `{ zone: "defensive"\|"middle"\|"attacking", label: string, caption: string }` |
| `GoalSequence` | `{ title: string, shooter: string, from: {x,y}, to: {x,y}, keeper?: string, keeperAt?: {x,y}, curve?: boolean \| "bounce", bouncePoints?: [{x,y}] }` |
| `Analysis` | **Football-specific** — freezes a moment, draws gaze lines, reveals what was missed. `{ title: string, players: [{id,x,y,team,label,revealed?:bool}] (min 1), gazeLines?: [{from, to:{x,y}}], revealCaption?: string }`. Not a generic "explain a concept" visual — use `Statement` for non-football explanatory content. |

All pitch coordinates are `0-100` in both x/y (attacking left-to-right, higher x = more advanced).

### Stats & Data Viz

| Scene Type (key) | Data JSON shape |
|---|---|
| `StatBurst` | `{ label, leftLabel, leftValue: number, rightLabel, rightValue: number, format?: "integer"\|"decimal", prefix?, suffix? }` |
| `BarChart` | `{ title, bars: [{label, value: number}] (min 2), prefix?, suffix? }` |
| `LineChart` | `{ title, points: [{label, value: number}] (min 2), prefix?, suffix?, highlightRange?: {fromIndex, toIndex, label?} }` — a REAL interpolated curve through `points` (Catmull-Rom smoothing), for an ordered series (time/count/distance). Never fake a curve out of several rotated Canvas `line` objects — use this instead. `points[i].label` left as `""` renders no axis tick for that point (draw as many points as the curve needs for smoothness; label only the ones worth calling out). `highlightRange` shades a contiguous stretch under the curve with its own caption — for "this stretch felt like nothing" directly on the same curve, instead of a second disconnected diagram. |
| `Donut` | `{ title, segments: [{label, value: number}] (min 2) }` (note: JSON `kind` is `"shape"` if you're constructing raw JSON by hand instead of just using this table) |
| `Radar` | `{ title, axes: string[] (min 3), series: [{label, values: number[0-100][], color?: string}] (1-2 entries) }` |
| `Stat` (Single Stat) | `{ title, value: number, context?, prefix?, suffix? }` — **`value` must be a real number**, not a string/symbolic value. |
| `MomentumTimeline` | `{ title, matchMinutes: number>=1, phases: [{startMinute, endMinute, direction?: "rise"\|"fall", label}] (min 1) }` |
| `LeagueTable` | `{ title, columnLabel: string, columnLabels?: string[], rowLabel?: string, rows: [{rank, label, value: number, columns?: number[], highlight?: bool}] (min 2) }` |
| `KpiPanel` | `{ title, stats: [{label, value: string, trend?: number[0-100][], delta?: string, deltaDirection?: "up"\|"down"\|"neutral"}] (2-5 entries) }` — note `value` here is a **string**, unlike Stat/HeroMetric. |
| `HeroMetric` | `{ label, value: number, prefix?, suffix?, subtext?, barProgress?: 0-1 }` — **`value` must be a real number.** For a symbolic result that isn't naturally numeric (an equation, a formula), consider whether the *actual resolved number* can be the `value` with the symbolic part folded into `prefix`/`subtext` instead of forcing a non-numeric value in (which will fail validation and silently fall back to Statement). |
| `Treemap` | `{ title?, segments: [{label, value: number>=0}] (min 2), prefix?, suffix? }` |
| `TierCards` | `{ title?, tiers: [{name, price, tagline?, featured?: bool}] (2-5 entries) }` |
| `Funnel` | `{ title?, stages: [{label, value: number>=0}] (2-6 entries), shape?: "funnel"\|"pyramid" }` |
| `PackedCircles` | `{ title?, circles: [{label, value: number>=0}] (2-8 entries), prefix?, suffix? }` |
| `SplitCards` | `{ title?, left: {label, value: string, caption?}, right: {label, value: string, caption?} }` |
| `PlayerComparison` | `{ leftPlayer, rightPlayer, stats: [{label, left: number, right: number}] (min 1) }` |

### Narrative & Callouts

| Scene Type (key) | Data JSON shape |
|---|---|
| `Sequence` | `{ title, beats: [{marker, label}] (min 1) }` |
| `Quote` | `{ quote: string, attribution: string }` |
| `CareerPath` | `{ title, stops: [{label, period}] (min 2) }` |
| `Grid` | `{ title?, items: [{label, caption?, icon?: <icon key>}] (2-9 entries) }` |
| `Icon` | `{ icon: <icon key>, headline: string, caption: string }` |

### Dynamic Diagrams

| Scene Type (key) | Data JSON shape |
|---|---|
| `Canvas` | `{ title?, objects: [CanvasObject] (min 1), arrows?: [CanvasArrow], phases?: [{objects, arrows?, camera?}] (min 1), snap?: number, camera?: {x,y,zoom} }` — good for diagrams built from Canvas's own primitives (dot/circle/rectangle/polygon/**icon**, the last being real Heroicons via `CANVAS_ICON_KEYS` — the chessboard-doubling "one grain of rice" scene is a real example: growing icon objects, not a fake curve). Do **not** approximate a smooth data curve out of several rotated `line` objects — use `LineChart` (above) for any actual growth/trend curve. |

A generic, non-pitch 2D scene — for spatial/systems explanations no pitch or chart visual can
express (two planes converging, a radar bubble growing until it touches another, a supply chain, a
network). Coordinates are `0-100` percent of the canvas (not pixel-precise, same convention as
pitch coordinates elsewhere). Every field below besides `id`/`type`/(`x`+`y`, or `anchor`) is
optional with a default that reproduces the plainest possible rendering.

**CanvasObject**: `{ id, type: "dot"|"circle"|"label"|"rectangle"|"roundedRectangle"|"ellipse"|"line"|"polygon", x?, y?, anchor?: <anchor key>, label?, color?, radius?, width?, height?, points?: [{x,y}], rotation?: number (default 0), scale?: number (default 1), opacity?: number 0-1 (default 1), filled?: bool (default true), fillOpacity?: number, strokeWidth?: number, layer?: number (default 0), enter?: "none"|"fade"|"scale"|"slide" (default "fade"), exit?: "none"|"fade"|"scale"|"slide" (default "none"), easing?: "linear"|"easeIn"|"easeOut"|"easeInOut" (default "easeOut"), trail?: bool (default false) }`

- **Position — `x`/`y` OR `anchor`, one of the two is required.** Freehanding `x`/`y` numbers is how
  Canvas scenes have historically ended up with overlapping or lopsided layouts — nothing checked the
  math, it was just mental arithmetic against a flat 0-100 plane. `anchor` is the fix: name one of 15
  positions on a grid spanning the full safe area (spread edge-to-edge, not clustered toward the
  middle) instead of picking numbers. **Prefer `anchor` by default** for anything that just needs "a
  zone" — a label, an icon, a static shape. Fall back to explicit numeric `x`/`y` only when you
  actually need precision `anchor` can't give: an arrow endpoint, a position a `phases` entry glides
  to/from, or anything camera-relative. If both are somehow given on the same object, explicit `x`/`y`
  wins.
  Valid anchor keys (`CANVAS_ANCHOR_KEYS`, row-major top→bottom, left→right): `topFarLeft`, `topLeft`,
  `topCenter`, `topRight`, `topFarRight`, `middleFarLeft`, `middleLeft`, `middleCenter`, `middleRight`,
  `middleFarRight`, `bottomFarLeft`, `bottomLeft`, `bottomCenter`, `bottomRight`, `bottomFarRight`.

- `type: "dot"` — a small colored marker + label below it (the generic "thing" in a diagram: a
  plane, a node). `type: "circle"`/`"ellipse"` — a stroked/filled ring sized by `radius` (circle) or
  `width`/`height` (ellipse, full diameters). `type: "rectangle"`/`"roundedRectangle"` — sized by
  `width`/`height`, centered on `(x,y)`; `roundedRectangle` reuses `radius` for its corner radius.
  `type: "line"` — a straight segment starting at `(x,y)`, `width` long, at `rotation` degrees.
  `type: "polygon"` — vertices from `points` (offsets from `(x,y)`, NOT absolute coordinates, so the
  whole shape still repositions by changing `x`/`y` alone). `type: "label"` — free floating text, no
  marker — for a callout ("Safe"/"Warning") appearing mid-diagram. Every shape's `(x,y)` is its own
  rotation/scale anchor.
- **Polygons genuinely morph.** `points` glides per-vertex phase-to-phase exactly like `x`/`y`/
  `rotation` do — give the same-id polygon a different `points` array in a later phase and its shape
  actually transforms (a triangle becoming a star, an arrow becoming a diamond), it doesn't hard-cut.
  A phase can even change the vertex COUNT; the shorter side just holds its last point steady for the
  extra vertices instead of erroring.
- `rotation`/`scale`/`opacity` (and `width`/`height` where relevant) are animatable exactly like
  `x`/`y`/`radius` — they glide phase-to-phase the same generalized way, so e.g. a shape can rotate
  and grow across a phase transition with no extra syntax.
- `enter`/`exit` control how an object animates in when it first appears (phase 0, or newly present
  in a later phase) and out (present in the previous phase but absent from this one). Default
  behavior is unchanged from before this existed: new objects fade in, and an object that drops out
  of a later phase's list simply disappears with no animation — set `exit` to `"fade"`/`"scale"`/
  `"slide"` to animate it out instead.
- `easing` picks the curve driving that object's own `enter` (fade/scale/slide/slideLeft/slideRight
  specifically). `"easeOut"` (a gentle, decelerating settle) is the default used everywhere else in
  this project. `"easeOutBack"` (overshoots slightly past its final size/position, then settles back —
  a punchy, deliberate arrival) and `"anticipate"` (a small backward dip before the real motion, like a
  wind-up) are also legal here — reach for these on the one focal object an entrance is actually about,
  not on every object in a scene. Phase-to-phase glide and `idle` motion always stay on the calm
  original four regardless of what `easing` says, on purpose.
- `trail: true` leaves a fading trail of recent positions behind an object while it glides between
  phases — off by default.
- `idle: "none"|"spin"|"pulse"|"glow"|"drift"` (default `"none"`) — continuous ambient motion, layered
  on top of everything else the object is doing, for a beat that holds for a while and shouldn't sit
  dead still. `"spin"`/`"pulse"`/`"glow"` are in-place effects (rotation/scale-breathe/opacity-breathe).
  `"drift"` is the one that's actual MOVEMENT — a small, slow wander in position, not decoration. Use
  it on the one or two objects a held beat is actually about, not on everything in the scene at once —
  several objects all drifting independently reads as busy, not cinematic. Independent of `idle`, every
  Canvas scene's camera now has a small always-on drift of its own, so even a scene that never touches
  `idle` at all still doesn't sit perfectly frozen for the length of a hold.
- `layer` controls stacking order (higher draws on top) — useful for keeping a label or connector
  visually above/below markers regardless of the order they're written in `objects`.
- `arrows` are directional connectors from an object's current (phase-interpolated) position — `to`
  is either a fixed `{x,y}` point, or another object's `id`, in which case the connector tracks that
  object live and keeps pointing at it even while it's mid-glide. `style` is
  `"solid"|"dashed"|"dotted"|"double"`; optional `label`/`color`/`strokeWidth` per arrow. Arrows
  never themselves move an object — movement comes from `phases`.
- `phases` works like `TacticalBoard`'s: the top-level `objects`/`arrows`/`camera` are phase 0, each
  entry in `phases` is a full snapshot of every object's new properties (matched by `id` — an object
  present in both phases glides there; one absent from the previous phase plays its `enter`
  animation). Each phase holds a fixed ~3-second slot regardless of the scene's real narration-driven
  duration (a multi-phase Canvas scene's `Duration`/audio floor accounts for this automatically).
- `camera: {x, y, zoom}` (top-level and/or per-phase) pans/zooms the view — phases glide the camera
  the same generalized way as any object property. Omitted entirely renders the full, unzoomed
  canvas exactly as before this existed.
- `snap` (top-level, a grid size in percent) rounds every object's resolved `x`/`y` to the nearest
  grid line before rendering, for a cleaner, aligned-looking diagram.
- **Canvas has no caption field of its own** — pair it with the universal `Phases:` field (see
  above) for on-screen captions during a multi-phase diagram. Since `Phases:`'s captions divide the
  scene's real duration while Canvas's own `phases` are fixed ~3s slots, give a caption an explicit
  `startSeconds` if you want it to land on a specific Canvas phase rather than an even split.
- **Canvas evented `timeline`** (added 2026-08-03 — supersedes the old "per-object start/duration
  timeline overrides aren't supported" note): for choreographed, cinematic motion, add `timeline`
  (an array of actions, each with its own absolute `startSeconds`) instead of `phases` — `timeline`
  wins when both are present, mirroring TacticalBoard's convention. Actions:
  - `{"type": "move", "id", "startSeconds", "durationSeconds"?: 0.8, "to"?: {x?, y?}, "scale"?,
    "rotation"?, "opacity"?, "radius"?, "path"?: "line"|"arc", "bow"?, "easing"?}` — glides any
    combination of properties; `path: "arc"` bends position travel along a curve (control point
    perpendicular at `bow` percent, sign picks the side, default a quarter of the distance).
    Sequential actions on the same object chain (each starts from where the last landed).
  - `{"type": "style", "id", "startSeconds", "durationSeconds"?: 0.5, "color"?, "label"?}` — REAL
    color interpolation (not a hard swap) and/or an instant label-text swap.
  - `{"type": "appear", "id", "startSeconds"}` — object hidden until then, then plays its own
    `enter` animation. `{"type": "disappear", "id", "startSeconds", "durationSeconds"?: 0.4}` —
    fades out and stops rendering.
  - `{"type": "camera", "startSeconds", "durationSeconds"?: 1.2, "x"?, "y"?, "zoom"?}` — any number
    of camera moves across the scene.
  Timeline moves default to a cinematic `emphasized` easing (fast launch, long soft settle —
  Material's motion feel); `easing` also accepts `linear`/`easeIn`/`easeOut`/`easeInOut`/
  `easeOutBack`/`anticipate`/`spring` (damped-spring arrival — overshoots and settles with one
  faint oscillation, the Figma-Motion-style springy feel; also legal on a per-object `easing` for
  entrances). The scene's minimum duration floor derives from the last action's
  end + a settle buffer, same as TacticalBoard timelines. Per-object/per-arrow `revealAtSeconds`
  is also genuinely wired now (absolute seconds from scene start, wins over the automatic entrance
  stagger), and `line` objects accept `"draw": true` to draw themselves out from their start point.
  `move`/`style`/`appear`/`disappear`/`camera` actions all accept an optional `"sound"` cue — see
  **Sound effects** below.
- **Sound effects** (ElevenLabs-generated, cached by prompt+duration hash — never regenerates an
  identical request; there is no "cadence" concept to pick from anymore — one fixed, techy/
  futuristic-leaning palette, always on, see `src/cadence/canvasCadences.ts`): add `"sound":
  "entrance" | "move" | "zoom" | "click" | "highlight" | "success" | "alert" | "typing"` to
  individual timeline actions. Each cue plays as its own short clip AT that action's own
  `startSeconds`, not stretched across the whole scene. Match the event to what's actually
  happening, not just the action TYPE:
  - `"click"` is a REAL press only — tie it to the moment of CONTACT (a button's own press-down
    `move`, not the cursor's move toward it, which starts earlier and would make the sound land
    before the visual click). Never attach it to an icon that's just being emphasized/activated —
    that reads as a sound with no visible cause ("I kept hearing a click and nothing warranted it").
  - `"highlight"` is for exactly that instead — a short, distinct ping for "this is the thing the
    narration is talking about right now" (an icon's own small scale-bump), with no implication a
    press happened.
  - `"success"` for a checkmark/confirmation landing (a confirmation shouldn't sound like a button
    press), `"alert"` for a warning/danger beat (a connection dropping, a TTL expiring).
  Cue every beat that's actually meaningful — a scene with taps, confirmations, and state changes
  should have several distinct cues, not one. A `timeline` scene with zero `sound`-tagged actions
  falls back to one whole-scene cue inferred from its content (has `move` actions → `move`;
  multi-phase or `camera.zoom > 1.05` → `zoom`; has objects → `highlight`; else → `entrance`) — the
  older, coarser behavior; always prefer tagging real actions instead. Chapter beats always get a
  short page-turn/book-flip sound under their swoosh-wipe transition, independent of any of the
  above.
- Still deliberately not supported: groups/children, parent/constraint attachment, bezier-curve
  arrows, masks/clip reveals — each is its own subsystem, left for a later round if actually
  needed.
- A post-parse pass checks every phase's objects for overlap. Two objects placed at the exact same
  position (a copy-paste mistake, not a deliberate layout) get nudged apart automatically. Anything
  else that overlaps is only ever logged as a warning, never moved — resolving it safely would require
  understanding what the diagram is trying to say, so if you see that warning, fix the layout by hand
  (ideally by switching the crowded objects to different `anchor`s).

Valid Canvas icon keys (`CANVAS_ICON_KEYS`): `jet`, `rocket`, `server`, `database`, `cloud`, `globe`,
`device`, `camera`, `signal`, `wifi`, `shield`, `bolt`, `lock`, `search`, `warning`, `check`, `cross`,
`chip`, `target`, `scale`, `factory`, `person`, `flask`, `cash`, `wallet`, `chart`, `mic`, `speaker`,
`mute`, `trash`, `document`, `cursor`, `sparkle`, `scissors`, `envelope`, `key`, `identification`,
`funnel`, `tag`, `clock`, `refresh`, `laptop`, `githubLogo`, `googleLogo`, `chromeLogo`,
`javascriptLogo`, `youtubeLogo`, `thumbsUp`, `bell`, `chat`. (The `goal`/`card`/`save`/... list is a
*different* vocabulary — `ICON_KEYS`, for the football-specific `Icon` scene type above, not Canvas.)

## Holdings specifics

`Holdings` is for one specific class of subject: a system whose answer to scale is
that **no complete picture exists anywhere** — millions of participants each holding
a small, partial, slightly-disagreeing view. Clock synchronisation, DNS resolvers,
gossip protocols, sensor fleets, distributed caches. It has no geography and is not a
view of a place; do not reach for it to draw a map.

```
**Scene Type:** Holdings
**Continue Holdings:** true      (folds this scene into the preceding passage)
**Data:** {"kind": "holdings", "theme": "dark", "seed": 7, "subject": "MACHINE",
           "holds": "PEERS", "refPrefix": "P", "betterWhen": "low", "timeline": [...]}
```

| Field | Meaning |
|---|---|
| `seed` | Which population. Same seed, same devices, every render. Never change it mid-passage. |
| `subject` | What ONE pane is, singular: `MACHINE`, `PHONE`, `RESOLVER`, `BRANCH`. |
| `holds` | What the rows inside a pane are readings of: `PEERS`, `RECORDS`, `SEGMENTS`. |
| `refPrefix` | Display prefix for a row id (`P` renders `S12` as `P12`). Display only — actions still target `S12`. |
| `betterWhen` | `high` (a road's speed) or `low` (a clock's error in ms). Gets the colour ramp the right way round. |

**Timeline actions**

| Action | What it does |
|---|---|
| `panes` | `{count}` — grows or shrinks the wall. Pane detail drops on its own as they shrink. |
| `inspect` | `{pane}` — brings ONE participant forward, full size, and dims the rest. |
| `compare` | `{panes: [i, j]}` — two side by side (stacked in portrait), rows they both hold marked. |
| `assemble` | The signature move: every pane slides toward the frame a complete picture would need, lands on top of its neighbours, and leaves holes. |
| `scatter` | They fall back to their own slots. |
| `agree` | `{ref}` — every reading of one thing, outliers set aside, resolved to one number. |
| `change` | `{ref}` — only the participants holding it light up; everything else stays dark. |
| `readout` | `{show: "coverage"|"gaps"|"conflicts"|"affected"|"devices"}` — a large number the MEDIUM computes. |
| `beat` | On-screen line, same shape as Stage/Spatial. |

**The rule that makes this medium worth having: a script can ask for a statistic but
can never assert one.** Coverage, contradictions and blast radius are computed from
the generated population, so the claims are properties of what is on screen. The
corollary is a new way to be wrong — narration that promises something the population
does not show. `validateHoldings.ts` reports that at authoring time (e.g. "the
assembly beat runs on 40 machines, whose holdings cover everything and contradict
nothing — the picture will simply COMPLETE, which is the opposite of the point").
Check the generation log before assuming a beat landed.

## TacticalBoard specifics

`TacticalBoard` is the one Scene Type with two authoring paths:

1. **Hand-authored `Data`** (recommended default — see the project's own preference for bespoke
   choreography over pattern shortcuts): write the full `Data` JSON shape from the table above
   directly, with your own exact player positions/arrows/phases.
2. **Named `Pattern` shortcut**: set `**Pattern:** <pattern name>` (e.g. `half-space overload`,
   `false nine`, `switch of play`) plus `**Focus:** <player name>` and optionally
   `**Supporting Players:** name, name` (comma-separated, up to two, matched to the pattern's own
   role slots) — the pattern supplies pre-built relative positions/arrows/phases, and Focus/
   Supporting Players just substitute in real names. If neither `Pattern` nor a recognized
   tactical-concept phrase appears in `Narration`, this path produces nothing (falls to
   Statement). The full named-pattern list lives in `src/video/tacticalPatterns.ts` — check there
   for the current set and each pattern's exact role layout before using one; don't guess a name.
   An explicit `Data` block always overrides a `Pattern` field if both are present.

### TacticalBoard evented timeline (real per-actor timing, ball possession, run identities)

For a demonstration that needs actions to start at different, author-chosen moments (a press
trigger, a build-up sequence, a rotation) rather than everyone re-arranging together on a fixed
per-phase clock, add `timeline` (and optionally `ball`/`tacticalObjects`) to the `Data` block
instead of `phases`. `players`/`arrows`/`highlight`/`highlightZone`/`annotations` still mean
exactly what they always have and still work unchanged — `timeline` is a new, independent way to
animate the same roster. If both `phases` and `timeline` are present, `timeline` wins.

`timeline` is an array of actions, each with its own `startSeconds` (seconds from the scene's
start) — several can overlap or stagger arbitrarily:

| `type` | Fields | What it does |
|---|---|---|
| `move` | `actorId`, `startSeconds`, `durationSeconds?` (default 0.6), `to: {x,y}`, `runType?` (see below, default `standard`), `bow?` (override the runType's default curvature) | Glides that player's own marker to `to`, drawing a matching curved trail arrow alongside it. |
| `state` | `actorId`, `startSeconds`, `state?`, `facing?` (degrees, 0 = attacking-direction "up") | Sets that player's behavior badge and/or body-orientation wedge from this moment on — this is also how you express a "trigger" ("the press begins the instant the ball arrives" = a `state` action timed to fire right then, no conditional logic needed). |
| `possession` | `startSeconds`, `durationSeconds?` (default 0.6), `fromId?`, `toId?`, `toPoint?` (for a shot/clearance with no receiving player), `action?`: `"pass"\|"carry"\|"shot"\|"clearance"` (default `"pass"`) | Reassigns the ball; while in-flight the ball visibly travels between the *current* live positions of `fromId`/`toId` (or `toPoint`). Add a top-level `ball: {x, y, belongsTo?}` for the starting position/owner. |
| `camera` | `startSeconds`, `durationSeconds?` (default 1), `focus`: `"full"\|"left-half"\|"right-half"\|"box-left"\|"box-right"` or `{x,y}`, `zoom` | Pans/zooms from wherever the camera currently was into this framing. Any number of these can fire across the scene (not limited to 2 stages like the scene-level `**Camera:**` field). Keep zoom conservative (~1.1-1.3x) for anything with multiple players still in play — a tighter zoom (1.4x+) is safest reserved for a moment already narrowed to one or two actors (e.g. paired with a `freeze`), since the camera clamps to the pitch's own edges but does NOT guarantee any particular player stays in frame. |
| `freeze` | `startSeconds`, `durationSeconds` (min 0.5), `annotations?: [{text,x,y}]`, `circles?: [{x,y,radius}]` | Pauses every other action at this instant, dims the board, and draws the given circles/callouts — the "pause, then draw over it" coaching-analysis technique. Everything resumes exactly where it left off afterward. |

`state` values: `pressing`, `marking`, `covering`, `holdingWidth`, `receiving`, `overlapping`,
`underlapping`, `screening`, `dropping`, `checkingShoulder`, `waiting`, `carrying`.

`runType` values (each renders with its own curve/dash so different runs read as visually
distinct, not identical straight lines): `standard`, `overlap`, `underlap`, `blindsideRun`,
`thirdManRun`, `recoveryRun`, `counterRun`, `dummyRun`, `supportRun`, `diagonalRun`, `channelRun`,
`halfSpaceRun`.

`tacticalObjects` (optional array, each entry also takes `appearSeconds?` default 0 and
`disappearSeconds?`): `{shape:"zone", x,y,width,height}` (a highlighted area, like `highlightZone`
but with its own appear/disappear timing), `{shape:"line", x, label?}` (a defensive/compactness
line at that length-axis position, spanning the full width), `{shape:"lane", from:{x,y},
to:{x,y}, closesAtSeconds?}` (a dashed passing lane that can fade closed), `{shape:"triangle",
points:[{x,y},{x,y},{x,y}]}` (a build-up-shape callout).

A scene's on-screen floor duration for a `timeline` board is derived from the last action's own
end time (+ a short settle buffer) — you don't need to separately calculate a `Duration` field to
match; a real `Duration` still drives the no-`--audio` estimate render.

See `analyses/gegenpressing-press-trigger-demo-2026-07-16.txt` for a fully worked example
exercising every action type.

## Formation position reference

`Formation`'s `players` array must be given in each formation's own canonical slot order
(goalkeeper → defense → midfield → attack, low-to-high index) — this is positional, not
name-matched, so the Nth name you list fills the Nth slot below. Home team renders as-is; the away
team automatically mirrors x (`100 - x`).

| Formation | Slot order (x, y) — 0-100 pitch space |
|---|---|
| `4-3-3` | (5,50) GK · (20,15)(20,38)(20,62)(20,85) DEF · (45,30)(45,50)(45,70) MID · (75,20)(80,50)(75,80) FWD |
| `4-2-3-1` | (5,50) GK · (20,15)(20,38)(20,62)(20,85) DEF · (38,35)(38,65) DM · (60,20)(60,50)(60,80) AM · (85,50) FWD |
| `3-4-2-1` | (5,50) GK · (20,25)(20,50)(20,75) DEF · (45,12)(45,38)(45,62)(45,88) MID · (65,35)(65,65) AM · (85,50) FWD |
| `5-4-1` | (5,50) GK · (20,10)(20,30)(20,50)(20,70)(20,90) DEF · (50,15)(50,40)(50,60)(50,85) MID · (85,50) FWD |
| `4-4-2` | (5,50) GK · (20,15)(20,38)(20,62)(20,85) DEF · (50,15)(50,38)(50,62)(50,85) MID · (80,35)(80,65) FWD |

## YouTube publishing & engagement guidelines

Standing rules for how a finished video (rendered from a script in this format) gets published/
promoted on YouTube — not part of the script format itself, but relevant to anyone drafting a
script with the finished upload in mind (the hook-first rule below, in particular, shapes how
Scene 1 should be written). Canonical source is this project's own `CLAUDE.md`; revise there first
if the approach changes, then mirror the change here.

**Thumbnail/banner/DP art style for The Tactical Debrief** (the football channel): a low-poly/
faceted geometric "shard" art style — vibrant multi-color palette (electric blue, magenta, gold,
teal), sharp triangular facets, flat color per facet (no gradients within a shard), near-black
background, high contrast.

**Banner/DP art style for Second Order Synce** (the multi-topic business/finance/tech/aerospace/
football channel): dark near-black background (`#111315`), electric blue (`#4f6bff`) accent, flat
professional/corporate style — no gradients, no glossy/3D effects. DP: a single smooth curved arc
resolving into a straight line (the "looks complicated, is actually simple once revealed" motif).
Banner: subtle overlapping schematic linework (flight paths, tactical arrows, growth curves,
circuit traces) behind a centered wordmark + tagline.

Default to the matching style above for a thumbnail/banner/DP prompt for either channel; don't mix
the two channels' styles, or invent a different one, unless asked to.

- **Thumbnail/title is the primary lever, not the video itself.** One clear focal point, 3-5 words
  of huge/legible text (test shrunk to ~120px wide — if unreadable there, it's too busy), a
  specific curiosity-driving claim in the title (not a flat description). This matters more than
  almost any in-video change.
- **No real athlete/public-figure photos in thumbnails without a confirmed license.** A real,
  identifiable photo of a real player (broadcast photography, sponsor branding visible, etc.) is
  someone else's copyrighted image and a likeness/publicity-rights risk. Use a licensed photo,
  generated generic-player art, or a photo with confirmed rights instead.
- **Hook-first, no throat-clearing.** The first 15 seconds decide whether YouTube keeps
  recommending the video — cut straight to the surprising claim before any branding/intro card.
  Write Scene 1 (or whichever scene opens the video) to land the hook immediately; don't let a
  title card or logo bumper delay it.
- **Diagnose retention with real data, not guesses.** YouTube Studio → Analytics → a specific
  video → Audience Retention shows the exact second viewers drop off. Use that to find which scene
  is the problem before changing pacing/structure generally.
- **Session time compounds.** End screens linking to the next most-relevant video, and playlists
  grouping related topics, matter because YouTube rewards keeping viewers on the platform, not
  just finishing one video.
- **Clip a Short from the single most striking beat** (a freeze-frame reveal, a sharp stat) per
  video — cheap discovery channel, can pull in subscribers who'd never find the long-form video.
- **First 48 hours after publish get disproportionate algorithmic weight** (YouTube test-launches
  to a small sample first) — time any external promotion (community post, social share) to that
  window, not days later.
- **One channel, many topics is fine as long as the *format* is the consistent brand** — the "why
  does X actually work" hook + clean graphic-card style is what should read as consistent across
  topics, not the subject matter. Don't expect YouTube's suggested/browse algorithm to
  cross-pollinate a viewer from one topic into another automatically — the thumbnail/title has to
  do that work.

## Legacy tag format (do not use for new scripts)

If a script has no `### SCENE N` marker anywhere, it's parsed as the older, simpler format
instead:

```
[INTRO]
Free text.

[STAT: possession]
Free text.

[MOMENT: 17]
Free text.

[OUTRO]
Free text.
```

This exists only so old scripts still work — it has none of the visual richness above (no Data,
no Camera, no per-scene visual selection). Don't use it for anything new.
