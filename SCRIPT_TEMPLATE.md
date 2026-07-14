# Scene Specification Script — Template

This is the exact, required format for every match-recap-generator script from
here on. `src/script/parseSceneScript.ts` parses this format literally — it
does not guess at field names or invent missing data. A script that doesn't
match this template exactly will have scenes silently fail to render their
intended graphic (falling back to nothing shown for that scene), the same
failure mode that produced a short, incomplete video before this template
existed. Follow it exactly rather than improvising field names.

## Philosophy: presentation slides, not dashboard panels

Think of every scene as one slide in an Apple keynote or a Bloomberg segment, not a Power BI
dashboard tile. A viewer should be able to mute the video and still get the point from the graphic
and its on-screen text alone. That means:

- **One idea per scene, one dominant graphic.** A scene earns its Duration by making exactly one
  point land — it is not a place to also gesture at two or three other facts.
- **Never default to Icon.** Icon (a single fact + a small symbolic glyph) is the right choice only
  when the scene genuinely is one small fact with nothing more to say. Before typing `Scene Type:
Icon`, ask what the information is actually trying to communicate, and reach for the richer type
  that matches it:
  - Pricing/packages → **Tier Cards** (a ladder of named tiers with prices) or **Treemap**
    (proportional size tells the story, e.g. four wildly different price points)
  - A collection of related items (rumors, nominees, top scorers) → **Grid**
  - A single number that deserves the whole frame → **Hero Metric**, not Single Stat — see below
  - A magnitude/distribution across several items → **Packed Circles** or **Bar Chart**
  - A hierarchy or drop-off (a process narrowing stage to stage) → **Funnel**
  - A qualitative or mixed-content comparison (a claim vs. a claim, not just two numbers) →
    **Split Cards**, not two separate Icon scenes
  - A genuine timeline of connected moments → **Sequence** (minutes) or **Career Path** (years)
  - A dense multi-stat readout → **KPI Panel**
    Icon still exists for what it's actually for (a save, a card, a single clean fact) — it's the
    default that's the problem, not the type itself.
- **More visual hierarchy, less flat text.** A bare number floating in the middle of the frame
  (`$11.2M`) is weaker than the same number given a build-up: a small eyebrow label, a proportional
  bar showing scale, THEN the giant number, then a subtext line. That's exactly what **Hero
  Metric** (see its Data shape below) is for — reach for it instead of Single Stat whenever one
  number is the entire point of the scene, not just A fact among several.
- **Less narration, more graphic.** If the viewer can already read the numbers on screen, the
  Narration doesn't need to restate them. "FIFA are selling pieces of the pitch. There are four
  editions, priced at $450, $900, $1,200 and $3,000" duplicates a Treemap that already shows all
  four numbers — "Four editions. Same pitch. Four very different prices." lets the graphic do the
  counting. Write narration that reacts to or frames the graphic, not narration that transcribes it.
- **Analytical, not literal, Annotations.** An Annotation/title like "Price Tiers" describes the
  data type; "Scarcity Drives Value" or "Limited Release" states the analytical point the data is
  making. Prefer the latter — every on-screen title is a chance to add a verdict, not just a label.
- **Restraint over density.** Plenty of whitespace, minimal on-screen labels, smooth and
  restrained animation (the existing calm fade/slide/settle vocabulary in `motion.ts` — never
  spring/bounce). A scene that feels like it's straining to fit in one more stat is a sign to split
  it into two scenes, not to cram a second visual into one.

## Scene progression: build a story, don't just sequence facts

Consecutive scenes should read as a chain where each answers a question the previous one raised,
not as independent facts placed one after another. A pricing story, for example, should progress
like: Tier Cards (here are the prices) → Grid or Icon (here's how limited each edition is) → Hero
Metric (here's the revenue potential if every edition sells) → Split Cards (here's how that
compares to a rival's pricing) → Statement (a question or hook for what's next) — every scene
handing off to the next rather than each one starting cold.

**Story Beat** (optional field, any Scene Type) names which job a scene is doing in that chain —
`Reveal`, `Comparison`, `Evidence`, `Escalation`, `Explanation`, `Payoff`, `Reflection`, or
`Question`. It isn't rendered as on-screen text; instead it picks a sensible default
`Transition Style` for that scene (a `Reveal` zooms in, a `Comparison` slides, `Evidence` zooms
out and settles, `Escalation` slides up, the calmer beats default to a plain fade) so a script's
narrative shape is felt in how scenes connect, not just what they show. An explicit
`Transition Style` field always overrides the Story Beat default when both are set.

```
**Story Beat:** Reveal
```

## Story structure and pacing

Every script follows a consistent pacing arc, not an arbitrary scene order:
**entrance** (a settling/establishing scene — team news, formations, the occasion) → **a light
stat/graphic** (something simple and quick, not deep analysis yet) → **the analysis proper**,
switching between TacticalBoard, stat cards, Sequence, and the other visual types rather than
clustering many scenes of the same kind in a row.

- Open with an entrance beat (Formation reveal, a scene-setting stat, team news) even in a
  "Part 2"-style continuation — don't assume the viewer remembers exactly where Part 1 left off;
  a one-scene recap/bridge is enough.
- Follow the entrance with something light (a single Stat, an Icon fact) before diving into
  TacticalBoard/Analysis-level scenes.
- No two consecutive scenes of the same Scene Type. `why-morocco-lost-part1.txt` is the working
  example of the diversified shape this produces: Formation → Icon → ShotMap → Sequence → Icon →
  TacticalBoard → Zone → Stat → TacticalBoard → ShotMap.
- Narration itself should read as a tactical investigation ("why did this happen") rather than a
  play-by-play recap ("what happened, drawably") — push toward what each team was trying to
  achieve, how the opponent reacted, what changed after key events, who benefited, and whether
  the plan worked. Never state an inferred mechanism with more confidence than the `Evidence`
  field claims — hedge `Medium`/`Low`-evidence claims explicitly in the Narration text itself
  (e.g. "Whether this was a deliberate coaching instruction or simply his natural movement is
  difficult to prove, but the pattern appeared several times"), not just in the metadata. The
  `Analysis` Scene Type (below) exists specifically for the "reveal what the defense's attention
  missed" version of this beat.

## Overall structure

```
### SCENE 1

**Scene Type:** <one of the types below>

**Narration:**
<the sentence(s) that get spoken/read on screen — this is what's captioned
and what drives duration when real audio is generated>

**Subject:** <a person's name>    (optional — see Background silhouettes/
photos below. Icon, Stat, Sequence, and Quote render background art from
this (along with TacticalBoard/Formation/GoalSequence, which already infer
their own subject and don't need it). Setting Subject on any other Scene
Type — BarChart, MomentumTimeline, PlayerComparison, Radar, StatBurst, Zone,
ShotMap, LeagueTable, CareerPath, PassNetwork — is parsed but silently has no
visual effect; their cards don't render background art yet.)

**Subject Kind:** player | manager | fans    (optional, only meaningful with
Subject — picks which generic silhouette a Subject with no real photo yet
falls back to; defaults to `player`. Use `manager` for a manager/coach story.)

**Image Side:** Left | Right | Center    (optional, defaults to Right. Only
Icon and Stat reposition their own text to avoid a Center image — see
Background silhouettes/photos below.)

**Panel Color:** Neutral | Red | Blue | Yellow    (optional, defaults to
Neutral — today's exact background. A bold Tifo Football-style color block
in place of the neutral dark background, for any Scene Type.)

**Board Position:** Left | Right | Center    (optional, defaults to Center —
TacticalBoard and Formation only. Both always render on the vertical
perspective board — see "Pitch orientation" below — so in a landscape video
`Center` puts the board in the middle with the title (Formation) or the
active phase's caption/dataPoint (TacticalBoard) placed as it is today; `Left`
/`Right` instead offsets the board to that edge and moves that same text into
a side panel next to it, mirroring VerticalTacticalBoard's board+sideText
layout. Ignored in a portrait video, where the board already fills the frame.)

**Focus:** <primary player name>              (TacticalBoard only)

**Supporting Players:** <comma-separated names, up to 2>   (TacticalBoard only)

**Pattern:** <a name from the Pattern Library below>       (TacticalBoard only — optional; see
    the note below the table about writing the concept straight into Narration instead)

**Camera:** <camera directive — see Camera Language below>

**Animation:** <free text, not parsed — for a human reader's reference only>

**Data:** <compact single-line JSON — required for every Scene Type except
TacticalBoard-with-Pattern>

**Annotation:** "<short on-screen title, e.g. SPACE CREATED>"

**Duration:** <N> seconds

**Transition:** Hard Cut | Cross Dissolve | Fade to Black

**Story Beat:** Reveal | Comparison | Evidence | Escalation | Explanation | Payoff | Reflection | Question
    (optional — see Scene progression above)

**Evidence:** High | Medium | Low — Source/Reason: <short note>

---

### SCENE 2
...
```

Rules:

- Blocks are separated by `### SCENE N` headers and `---` dividers.
- Field order doesn't matter, but field **names must match exactly** (case and
  spacing are forgiving for `Scene Type` only — everywhere else, match the
  names above exactly, especially inside `Data` JSON keys).
- `Narration` and `Data` may span multiple lines; every other field should be
  a single line.
- `Data` must be **valid, single-line JSON** (no trailing commas, no
  comments). Multi-line JSON is not supported by the parser.
- Every scene needs `Scene Type`, `Narration`, `Duration`, and `Transition` at
  minimum. `Annotation` is used as the on-screen title for every kind except
  `StatBurst`/`Icon`/`Zone` (see their Data shapes below — they don't use
  Annotation as a title) **and `Chapter`, where Annotation is spoken aloud
  instead of Narration (see the Chapter section below) — the opposite
  problem.** For Icon/StatBurst/Zone specifically: **setting Annotation on
  these three does nothing at all** — it's parsed but never rendered or
  spoken. This has bitten me before (day-anchor labels like "TODAY — July
  11" written into an Icon scene's Annotation, never actually visible to a
  viewer) — for those three types, put anything you want the viewer to see
  into the type's own Data fields (`headline`/`caption` for Icon, `label` for
  StatBurst/Zone) instead.

## Scene Types and what each one needs

Every Scene Type below (except Chapter/Statement, which aren't graphics at all) belongs to one of
three categories — this grouping is now the actual visual registry
(`src/model/visualDefinitions.ts`), not just documentation structure, so a new visual type added
to the registry gets a `category` and shows up under the matching heading here too.

- **Pitch & Tactics** — pitch-diagram visuals: TacticalBoard, VerticalTacticalBoard, Formation,
  ShotMap, PassNetwork, HeatMap, Zone, GoalSequence, Analysis.
- **Stats & Data Viz** — numbers/charts with no pitch: StatBurst, BarChart, Donut, Radar, Stat,
  MomentumTimeline, LeagueTable, KpiPanel, PlayerComparison, Hero Metric, Treemap, Tier Cards,
  Funnel, Packed Circles, Split Cards.
- **Narrative & Callouts** — text/story beats: Sequence, Quote, CareerPath, Grid, Icon.

### Chapter

A section-divider swoosh card (a colored bar wipes across, the title slides
in as it passes center) — for an intro, an outro, or a section break between
two very different parts of a video. Structurally different from every
other Scene Type: it has no visual/Data at all, and — unlike everywhere
else — **Annotation is what gets spoken aloud, not Narration**. Keep it
SHORT (2-5 words): it renders at a giant fixed size with no wrapping, so a
full sentence will overflow the frame.

```
**Narration:** This Week In Football
**Annotation:** "This Week In Football"
**Duration:** 3 seconds
**Transition:** Cross Dissolve
**Evidence:** High
```

`Narration` is still required by the format (every block needs one to parse
at all) but its content is otherwise unused for Chapter — just repeat the
same short phrase in both fields to avoid confusion. Follow a Chapter card
with a normal scene (Icon/Statement) for the actual longer welcome or
sign-off line you want spoken — Chapter itself is the title beat, not the
place for a full sentence.

### Statement

Kinetic-typography text over the Narration itself (StatementCard) — no
Data, no graphic. For a welcome line, a sign-off/CTA, or any other beat
that's just spoken words on screen, not a visual. Numeric words in the
Narration highlight in accent color automatically; a keyword match (goal/
card/save/etc) pairs a small icon above the text, same as Statement always
has — nothing extra to set.

```
**Narration:** That's everything from the last seven days — stay tuned, and subscribe for every headline before anyone else.
**Duration:** 6 seconds
**Transition:** Fade to Black
**Evidence:** High
```

No `Data` field at all — omit it. Pairs naturally after a Chapter divider
(Chapter for the short title beat, Statement right after for the actual
full sentence — see the Chapter section above).

### Pitch & Tactics

#### TacticalBoard

Two ways to place players on the pitch — pick one:

**A. Pattern-based** (no coordinates needed — the pattern supplies them):

```
**Focus:** Mbappé
**Supporting Players:** Mazraoui
**Pattern:** Half-space
```

Pattern must be one of (case-insensitive): `Half-space`, `Full-back Dragged
Inside`, `Wing Overload`, `Penalty Duel`, `Save`, `Decoy Run`, `Late Arrival`,
`Compact Block`, `Penalty Delay`, `Half-space Overload`. Ask me before using a
tactical concept not in this list — I'll add a new pattern rather than have
the scene fail silently.

**B. Data-based** (exact control, or when Focus isn't a single named player —
e.g. a recap montage):

```
**Data:** {"players":[{"id":"a","x":78,"y":15,"team":"home","label":"Mbappé"},{"id":"b","x":75,"y":20,"team":"away","label":"Mazraoui"}],"arrows":[{"from":"a","to":{"x":68,"y":32}}],"highlightZone":{"x":70,"y":4,"width":22,"height":20}}
```

`x`/`y` are 0-100 pitch-percent (0 = own goal line, 100 = opponent's goal
line; 0 = one touchline, 100 = the other). `arrows` and `highlightZone` are
optional. A `Data` block always wins over Pattern if both are present.

**Always include at least one opposition-team player**, even on a "recap the
mechanism" board with no single Focus. A board with only one team's markers
reads as disconnected dots with no defender to beat, no matter how clear the
arrows are — the pattern only reads as a _tactical_ mechanism when the team
being exploited is visibly on the pitch too (see the Pattern Library table:
every built-in pattern places at least one `home` and one `away` role for
exactly this reason).

**Arrows must be direction-consistent.** Before writing a Data-based board's
`arrows`, decide explicitly which x-direction (toward x=0 or toward x=100) is
"forward" for the attacking side in _this_ scene, then check every arrow's
start→end against it: an attacker's arrow must end further toward that goal
than it started, and a reacting defender's arrow must move along the _same_
physical direction (defenders retreat toward their own goal — the same
direction the ball is traveling, not the opposite one). A backward-reading
arrow ("attacking run" that decreases x toward the attacker's own goal) is a
real, easy-to-miss bug, not just a style nitpick — see the Pattern Library
audit note below for a concrete example of this exact mistake shipping
undetected.

**Multi-phase demonstrations.** A board with only one arrangement of players
draws its arrows once and then just sits there for the rest of the scene —
fine for a single moment, wrong for anything you'd actually call a
"breakdown." For a real multi-beat tactical demonstration, add `phases`: an
ordered array of follow-on beats after the board's own top-level players/
arrows (which become phase 1). Each phase re-arranges the pitch — players
glide from their previous position to their new one, that phase's own arrows
then draw, and its `caption`/`dataPoint` fade in — instead of staying static:

```
**Data:** {"players":[...],"arrows":[...],"phases":[{"players":[...],"arrows":[...],"caption":"Norway drop into a back five","dataPoint":"5 defenders inside their own box"},{"players":[...],"caption":"England overload the half-space","dataPoint":"3v2 out wide"}]}
```

Each phase's `players` is a **full** player list (id/x/y/team/label), not a
delta — the board matches players across phases by `id` to know who glides
where, so give every player's real new position each phase, including ones
that didn't move. `arrows`/`highlightZone`/`caption`/`dataPoint` are all
optional per phase. Only reach for `phases` when there's a genuinely
different arrangement to show at each beat (a pressing trap that then
collapses, a build-up shape that then breaks a line) — a board that's just
one static idea doesn't need one.

#### VerticalTacticalBoard

A separate, additive Scene Type from TacticalBoard — a portrait pitch (goal-
to-goal running top-to-bottom) next to a text side-panel, role-pill player
labels, and curved movement arrows, matching the FM/FPL-style vertical board
reference. Not a replacement for TacticalBoard — use whichever fits the
scene; this one is Data-based only, no Pattern library.

```
**Data:** {"players":[{"id":"a","x":50,"y":30,"team":"home","role":"ST","label":"Mbappé"},{"id":"b","x":40,"y":55,"team":"away","label":"Defender"}],"arrows":[{"from":"a","to":{"x":55,"y":70},"curve":true}],"sideText":"A short secondary caption shown beside the pitch."}
```

Same `x`/`y` 0-100 percent space as TacticalBoard, except `y`: 0 is the
_bottom_ of the frame (own goal/near end), 100 is the _top_ (opponent's
goal/far end) — "further up the pitch" reads as "further up the frame".
`role` is optional (shown as a prefix on the pill, e.g. "ST MBAPPÉ" — omit it
for a plain name pill). Each arrow's `curve` defaults to `true` (set `false`
for a straight line); `bow` (optional, default 40) controls how pronounced
the curve is. `sideText` is optional — when present, renders as a caption to
the right of the pitch. Same opposition rule as TacticalBoard: include at
least one player from each side.

#### Formation

```
**Data:** {"sides":[{"team":"France","formationName":"4-2-3-1","side":"home","players":[{"name":"Maignan"}, ...11 total]},{"team":"Morocco","formationName":"4-2-3-1","side":"away","players":[{"name":"Bounou"}, ...]}]}
```

`formationName` is one of `4-3-3`, `4-2-3-1`, `3-4-2-1`, `5-4-1`, `4-4-2`.
1 or 2 `sides` entries. Two sides each get compressed into their own half of
the pitch, facing each other. **`players` must be listed in the same order as
that formation's slots below** (GK, then defenders low-y-to-high-y, then
midfield low-y-to-high-y, then forwards) — the renderer has no concept of
position names, it just maps array index straight to slot index. Listing a
back four as anything other than RB, CB, CB, LB (in that order) puts the
full-backs on the wrong flank (or worse) — this exact bug shipped once
already, see `feedback_formation_slot_order_bug` in memory.

**Formation-position reference** (`x`/`y` in the same 0-100 pitch space every
other pitch visual uses — `x`=goal-to-goal, low=own goal; `y`=touchline-to-
touchline, low=traditionally the "right" side). This is the exact table
`FORMATION_TEMPLATES` in `src/video/formations.ts` renders from — when a
TacticalBoard/VerticalTacticalBoard scene depicts a player in their base/
starting position (before whatever movement the scene demonstrates), anchor
that starting `x`/`y` to the matching role below instead of picking new
numbers freehand, so a bespoke scene never contradicts the Formation scene
(or another bespoke scene) earlier in the same script. Once the scene's
narration puts a player in motion, their position naturally diverges from
this table — that's expected, only the *starting* point needs to match.

- **4-4-2**: GK `5,50` · RB `20,15` · CB `20,38` · CB `20,62` · LB `20,85` ·
  RM `50,15` · CM `50,38` · CM `50,62` · LM `50,85` · ST `80,35` · ST/CAM `80,65`
- **4-3-3**: GK `5,50` · RB `20,15` · CB `20,38` · CB `20,62` · LB `20,85` ·
  RCM `45,30` · CM/DM `45,50` · LCM `45,70` · RW `75,20` · ST `80,50` · LW `75,80`
- **4-2-3-1**: GK `5,50` · RB `20,15` · CB `20,38` · CB `20,62` · LB `20,85` ·
  DM `38,35` · DM/CM `38,65` · RW/RAM `60,20` · CAM `60,50` · LW/LAM `60,80` · ST `85,50`
- **3-4-2-1**: GK `5,50` · CB(R) `20,25` · CB(C) `20,50` · CB(L) `20,75` ·
  RWB `45,12` · CM(R) `45,38` · CM(L) `45,62` · LWB `45,88` ·
  10/second-striker(R) `65,35` · 10/second-striker(L) `65,65` · ST `85,50`
- **5-4-1**: GK `5,50` · RWB `20,10` · CB(R) `20,30` · CB(C) `20,50` ·
  CB(L) `20,70` · LWB `20,90` · RM `50,15` · CM(R) `50,40` · CM(L) `50,60` ·
  LM `50,85` · ST `85,50`

Coordinates given are for the `home` side attacking toward `x=100`; mirror
`x` (100-x) for `away`, same as `Formation.tsx` already does automatically.

**Pitch orientation:** TacticalBoard and Formation always render on the
vertical perspective board (touchline axis running left/right on screen,
pitch length running top-to-bottom) regardless of the video's own
orientation — this is what makes RW/LW etc. actually land on the screen's
right/left instead of top/bottom. The table above is unaffected by this — its
`x`/`y` values are semantic percent-space coordinates (length, width), not
pixels, so they mean the same thing no matter which board renders them. See
**Board Position** above for landscape placement (center vs. offset to a
side). Every other pitch visual (ShotMap, PassNetwork, HeatMap, Zone,
GoalSequence) still uses the flat horizontal pitch, with small "Right
Side"/"Left Side" and "Home/Away Attacks" labels on the pitch itself as an
orientation cue.

#### ShotMap

```
**Data:** {"shots":[{"x":92,"y":45,"team":"home","result":"saved","xg":0.3}]}
```

`result` is one of `goal`, `saved`, `blocked`, `off-target`. `xg` is optional
(0-1, scales the marker size).

#### PassNetwork

Nodes (players) connected by weighted lines — for "how the team actually
built play" narration, not just where shots/players ended up (ShotMap/
TacticalBoard don't show connections between players at all).

```
**Data:** {"nodes":[{"id":"a","x":30,"y":50,"team":"home","label":"Rodri"},{"id":"b","x":50,"y":40,"team":"home","label":"Bernardo"}],"links":[{"from":"a","to":"b","weight":8}]}
```

`weight` is relative, not a literal pass count — it only controls line
thickness against the other links in the same scene (the heaviest link in
the scene is drawn thickest, others scale proportionally against it).
Minimum 2 nodes, 1 link. Same opposition rule as TacticalBoard applies if
the scene is illustrating one team being bypassed, not just one team's own
shape.

#### HeatMap

Where a player/team operated most, as a gradient of blurred color blobs —
more nuance than Zone's flat third-highlight, and for when there's no
discrete connection to show between specific players (that's PassNetwork).

```
**Data:** {"zones":[{"x":25,"y":30,"intensity":0.9},{"x":40,"y":50,"intensity":0.5},{"x":60,"y":70,"intensity":0.2}]}
```

`intensity` is 0-1, **pre-decided by you** — same "you choose the scale"
philosophy as Radar's values, not a literal recorded metric. Low intensity
renders as a cool, barely-there blue glow; high intensity as a hot red core
— color communicates "how much," not just opacity. Minimum 1 zone (though a
single zone reads more like a spotlight than a heat map — 3+ is usually the
point).

#### Zone

An abstract pitch diagram (no players) with one third highlighted.

```
**Data:** {"zone":"attacking","label":"Final Third Domination","caption":"France spent 70% of the half here"}
```

`zone` is one of `defensive`, `middle`, `attacking`. Note: `label`/`caption`
are the on-screen text here, not `Annotation`.

#### GoalSequence

```
**Data:** {"shooter":"Mbappé","from":{"x":88,"y":50},"to":{"x":100,"y":15},"keeper":"Bounou","keeperAt":{"x":96,"y":32},"curve":true}
```

`keeper`/`keeperAt` optional. Keep `keeperAt` within roughly 20-25 pitch-percent
of `to` — the camera zooms tight on `to`, and a keeper placed far from it
will render mostly off-frame.

`curve` also accepts `"bounce"` — the ball arcs through real up-down hops
(touching ground between each) instead of one smooth glide, for a loose
ball, a lofted through-ball, or a deflection:

```
**Data:** {"shooter":"Bellingham","from":{"x":40,"y":50},"to":{"x":85,"y":45},"curve":"bounce","bouncePoints":[{"x":60,"y":55},{"x":75,"y":40}]}
```

`bouncePoints` is optional (each an `{x,y}` the ball bounces through between
`from` and `to`) — omit it for a single implied bounce at the midpoint.

#### Analysis

Doesn't introduce a new moment (that's TacticalBoard) — revisits one already
shown, answering "why": freeze the shape, draw thin gaze lines showing what
the defense was focused on, then fade in the one element that explains what
that focus missed. Use this for the follow-up beat after a TacticalBoard
scene, not as an opening scene.

```
**Data:** {"players":[{"id":"a","x":80,"y":55,"team":"home","label":"Marker"},{"id":"b","x":78,"y":50,"team":"away","label":"Fullback"},{"id":"c","x":85,"y":70,"team":"away","label":"Runner","revealed":true}],"gazeLines":[{"from":"b","to":{"x":80,"y":55}}],"revealCaption":"But while both defenders watched the ball, Dembélé had already made the run in behind."}
```

Players with `"revealed":true` fade in LATE (after the gaze lines have made
their point), with a highlight ring — that's the "why," the runner the
defense's attention missed. Everyone else renders as the frozen baseline
immediately. `gazeLines` (optional) are dotted and muted, deliberately unlike
TacticalBoard's solid movement arrows — a gaze line is "this is what they
were watching," not a movement claim. `revealCaption` (optional) is a second
line of text under the pitch, timed to land with the reveal.

### Stats & Data Viz

#### StatBurst

Two-value head-to-head with a proportional bar (simpler than
PlayerComparison's multi-row table — use this for one single stat).

```
**Data:** {"label":"Shots on Target","leftLabel":"France","leftValue":8,"rightLabel":"Morocco","rightValue":1,"format":"integer"}
```

Note: `label` is the on-screen title here, **not** `Annotation` — include it
explicitly. `format` is `"integer"` or `"decimal"`. `prefix`/`suffix`
(optional strings) attach directly to both big numbers — e.g.
`"prefix":"£","suffix":"m"` renders `£215m`, not a bare `215` with the unit
left implicit. Use this for any money value: StatBurst has no caption field
at all, so without a prefix/suffix a currency amount reads as an unlabeled
number with no unit anywhere on screen.

```
**Data:** {"label":"The Bid Liverpool Rejected","leftLabel":"Al Ittihad Bid","leftValue":215,"rightLabel":"Accepted","rightValue":0,"prefix":"£","suffix":"m"}
```

#### BarChart

```
**Data:** {"bars":[{"label":"France Shots","value":22},{"label":"Morocco Shots","value":5}]}
```

Minimum 2 bars. `prefix`/`suffix` (optional, chart-level — every bar shares
the same unit) attach to each bar's value label the same way as StatBurst's,
e.g. `"prefix":"$"` for a set of price-tier bars.

#### Donut

Proportional segments of a whole (a possession split, a goals-by-half
breakdown) — for a share-of-100% claim, not a two-value head-to-head
(that's StatBurst) or an arbitrary category count (that's BarChart).

```
**Data:** {"segments":[{"label":"First Half","value":68},{"label":"Second Half","value":44}]}
```

Minimum 2 segments. Values don't need to sum to 100 — the ring always
normalizes to the segments' own total, so this also works for counts (goals,
cards) not just percentages.

#### Radar

A multi-axis profile — a team or player's shape across several metrics at
once (3 or more), or two profiles overlaid for a head-to-head. For "how does
this team compare across many stats simultaneously," not a single number or
a simple two-value comparison.

```
**Data:** {"axes":["Shots","xG","Progressive Passes","Tackles","Aerials Won"],"series":[{"label":"Real Madrid","values":[85,78,92,40,55]},{"label":"Atlético","values":[45,50,60,88,70]}]}
```

1 or 2 `series` entries. Every value is 0-100 — **pre-normalized by you**, not
a raw stat. Decide what "100" means for each axis yourself (e.g. a season
high, or the better of the two sides being compared) — the component has no
way to know the right scale for shots vs. xG vs. tackles, and won't guess
one. `color` per series is optional (defaults to the accent color, then a
deterministic per-name color for a second series).

#### Stat

A single climbing counter (e.g. an xG total) — for one number, not a
comparison.

```
**Data:** {"value":1.87,"context":"Still 0-0"}
```

`context` is optional secondary text (e.g. a frozen scoreline). `prefix`/
`suffix` (optional strings) attach directly to the giant number itself —
e.g. `"prefix":"£","suffix":"m"` renders `£449m`. Use these for any money
value instead of leaving the unit to `context`'s small text below — the
giant number is the whole point of this card, so it should carry its own
unit, not read as an ambiguous bare number.

#### MomentumTimeline

A match's rhythm across the whole minute axis — each named stretch gets its
own arch, rising above the baseline in green for a stretch where threat
built ("rise"), dipping below it in red for a stretch where it drained away
("fall"). One phase reads as a single highlighted stretch (the old
behavior); 2+ phases read as the match's actual back-and-forth.

```
**Data:** {"matchMinutes":90,"phases":[{"startMinute":45,"endMinute":70,"direction":"fall","label":"Belgium Control It"},{"startMinute":80,"endMinute":90,"direction":"rise","label":"Spain's Late Surge"}]}
```

Minimum 1 phase. `direction` defaults to `"rise"` if omitted.

#### LeagueTable

A full ranked multi-row table (standings, top-scorer charts) — for more than
the two entries PlayerComparison/StatBurst handle.

```
**Data:** {"columnLabel":"Pts","rows":[{"rank":1,"label":"Inter","value":24},{"rank":2,"label":"Roma","value":24},{"rank":3,"label":"Milan","value":22,"highlight":true}]}
```

Minimum 2 rows. `highlight` (optional, per row) picks out the team the
narration is actually about — e.g. a mid-table side the story is focused on,
not necessarily the leader. `rowLabel` (optional, defaults to `"Team"`) is
the header above each row's name — set it to `"Player"` for a top-scorer/
Golden Boot-style leaderboard where rows are people, not clubs.

For a real multi-stat table (actual standings, not just one column), add
`columnLabels` plus a `columns` array per row:

```
**Data:** {"columnLabel":"Pts","columnLabels":["MP","W","D","L","GD","Pts"],"rowLabel":"Team","rows":[{"rank":1,"label":"Inter","value":24,"columns":[10,7,3,0,14,24]},{"rank":2,"label":"Roma","value":24,"columns":[10,7,3,0,9,24]}]}
```

`columnLabel`/`value` are still required (kept as the sort/legacy single-value
fields) even in multi-column mode; `columns` should have one entry per
`columnLabels` entry, in the same order.

#### KpiPanel

3-5 small stat tiles in one card — Power BI's "multi-row card" pattern, for
a dense analytics readout (xG, progressive passes, PPDA, distance covered,
duels won, ...) instead of thinning several real facts down into one
StatBurst's two numbers or spreading them across separate Icon scenes.

```
**Data:** {"title":"Second-Half Numbers","stats":[{"label":"xG","value":"2.1","delta":"+0.8 vs 1st half","deltaDirection":"up"},{"label":"Progressive Passes","value":"34","trend":[40,55,60,72,80]},{"label":"PPDA","value":"8.2","delta":"Down from 11.4 — pressing harder","deltaDirection":"up"},{"label":"Distance","value":"108km"}]}
```

2-5 `stats`. `trend` (optional) is a short run of values, each **pre-
normalized 0-100** — same convention as Radar's axis values — rendered as a
tiny sparkline; omit it when there's no real recent trend to show. `delta`
(optional) is a plain-language string, not a signed number — write it so it
already reads as good or bad, since the component can't infer which
direction is "good" for an arbitrary stat (a dropping PPDA is good, a
dropping xG isn't). `deltaDirection` (optional: `"up"`/`"down"`/`"neutral"`)
drives a small colored triangle next to `delta` — set it to the _verdict_
("is this good?"), not literally whether the number rose or fell: a PPDA
that dropped from 11.4 to 8.2 is `"up"` (green, more pressing), even though
the number itself went down.

#### PlayerComparison

```
**Data:** {"leftPlayer":"Mbappé","rightPlayer":"Doué","stats":[{"label":"Goals","left":1,"right":0}]}
```

Only use this for two players in genuinely comparable roles (two forwards,
two full-backs, a player against their direct opponent) where every stat row
applies to both. Don't use it to force a comparison between players in
unrelated roles by padding in zeros for whichever stat the other player
doesn't have (e.g. a striker's goals/assists against a goalkeeper's saves) —
that's not a real comparison, just two unrelated facts sharing a layout. Two
separate `Stat`/`Icon` scenes represent that better.

#### Hero Metric

One number given the entire frame — an eyebrow label, an optional proportional bar, the giant
value, then subtext — for the single number a scene is actually about, not a fact that shares
billing with others (that's Single Stat or KPI Panel).

```
**Data:** {"label":"Revenue","value":11.2,"prefix":"$","suffix":"M","barProgress":0.82,"subtext":"Potential Revenue If Every Edition Sells"}
```

`barProgress` (optional, 0-1) is **author-decided**, same "you choose the scale" convention as
Radar/HeatMap — there's no universal 100% for an arbitrary metric. Omit it to render without a
bar. `prefix`/`suffix`/`subtext` all optional.

#### Treemap

Proportionally-sized rectangles for a set of values — the story is in the relative SIZE of each
block (four ticket editions at wildly different prices), not a ranked axis (that's Bar Chart or
League Table).

```
**Data:** {"title":"Pitch Editions","segments":[{"label":"Standard","value":450},{"label":"Premium","value":900},{"label":"VIP","value":1200},{"label":"Ultimate","value":3000}],"prefix":"$"}
```

Minimum 2 segments. `prefix`/`suffix` optional, applied to every rectangle's value label.

#### Tier Cards

A row of pricing/package tiers, each a name + price + tagline — for "here's the ladder of
options" beats a Treemap's relative sizing can't caption with per-tier text.

```
**Data:** {"title":"Pitch Editions","tiers":[{"name":"Standard","price":"$450","tagline":"Turf only"},{"name":"Ultimate","price":"$3,000","tagline":"Center circle, signed","featured":true}]}
```

2-5 tiers. `tagline` optional. `featured` (optional, one tier at most makes sense) raises and
highlights that tier instead of every tier competing for the same visual weight.

#### Funnel

Ordered stages narrowing top to bottom, each stage's width proportional to its value — for a
hierarchy or drop-off (a transfer process, a knockout draw), not a flat category comparison
(that's Bar Chart).

```
**Data:** {"title":"Transfer Process","stages":[{"label":"Scouted","value":40},{"label":"Shortlisted","value":12},{"label":"Bid Accepted","value":3},{"label":"Signed","value":1}],"shape":"funnel"}
```

2-6 stages, listed in the order they should narrow (usually widest/first-stage first). `shape` is
`"funnel"` (continuous trapezoid bands, no gaps — a real funnel silhouette) or `"pyramid"`
(discrete centered bands with a gap between each — a stepped-levels feel); defaults to `"funnel"`.

#### Packed Circles

A cluster of circles sized by value (area, not radius, scales with value) — for a distribution or
magnitude comparison across more entries than Stat Burst's two values, without Bar Chart's implied
ranking axis.

```
**Data:** {"title":"Transfer Fees","circles":[{"label":"Mbappé","value":180},{"label":"Haaland","value":150},{"label":"Bellingham","value":120}],"prefix":"$","suffix":"m"}
```

2-8 circles. `prefix`/`suffix` optional.

#### Split Cards

Two panels side by side, each a label/value/caption — for a qualitative or mixed-content
comparison (a claim vs. a claim, a text verdict vs. a text verdict) that Stat Burst's numeric-only
head-to-head can't carry. `value` is a string on purpose — this card never counts up, it settles
in as two whole panels at once.

```
**Data:** {"left":{"label":"Messi","value":"36","caption":"Goals + Assists"},"right":{"label":"Mbappé","value":"41","caption":"Goals + Assists"}}
```

### Narrative & Callouts

#### Grid

A grid of small items, each an optional icon + label + caption — for a COLLECTION of related facts
(this week's transfer rumors, top-scorer nominees) shown together in one beat. Distinct from Icon
(one single fact) and League Table (a ranked list sharing one numeric column).

```
**Data:** {"title":"This Week's Transfer Rumors","items":[{"label":"Salah","caption":"Linked with Al-Ittihad","icon":"star"},{"label":"Bellingham","caption":"New release clause reported","icon":"clock"}]}
```

2-9 items. `icon` (optional, one of the Icon Scene Type's keys — see Icon below) and `caption`
(optional) per item.

#### Sequence

A chain of connected moments/minutes building on each other.

```
**Data:** {"beats":[{"marker":"60'","label":"Mbappé opens body"},{"marker":"60'","label":"Curling shot, far corner"}]}
```

Minimum 1 beat. Uses `Annotation` as its title.

#### Quote

A quoted statement with attribution — for reporting what someone SAID, not a
fact/stat about them (that's Icon/Stat). A direct quote reads as more
credible than paraphrasing it into narration.

```
**Data:** {"quote":"I think we make a mistake thinking that positional play means you have to always be in the space that they tell you.","attribution":"Xabi Alonso"}
```

Pairs well with **Subject**/**Image Style: Featured** for a portrait beside
the quote (the Tifo Football manager-quote reference).

#### CareerPath

A player's or manager's history as a left-to-right journey (a managerial CV,
a transfer history) — distinct from Sequence's vertical stacked-beats layout
for connected in-match moments; use CareerPath when the story spans years,
not minutes.

```
**Data:** {"stops":[{"label":"Mainz","period":"2001-2008"},{"label":"Dortmund","period":"2008-2015"},{"label":"Liverpool","period":"2015-2024"},{"label":"Germany","period":"2026-"}]}
```

Minimum 2 stops. Uses `Annotation` as its title.

#### Icon

A single fact paired with a matching symbolic icon (goal/card/save/etc).

```
**Data:** {"icon":"save","headline":"Bounou","caption":"Penalty saved, 28th minute"}
```

`icon` is one of `goal`, `card`, `save`, `whistle`, `clock`, `star`, `assist`,
`sub`. Note: `headline`/`caption` are the on-screen text here, not
`Annotation`. If a real image exists at `public/assets/icons/<icon>.png` (or
.jpg/.jpeg/.webp) it's used automatically in place of the built-in hand-drawn
stroke icon — no script field needed, same auto-resolution as jerseys/badges.

## Pattern Library (TacticalBoard)

Every entry below is defined in `src/video/tacticalPatterns.ts` and was audited on 2026-07-11 —
each pattern was actually rendered and visually checked (not just reasoned about) against the
arrow-direction and opposition-marker rules above. That audit found and fixed real bugs: `half-space`
and `half-space overload` both glided the focus player _behind_ the marker they were supposed to
beat into space (a backward arrow); `half-space overload` also had three `home` players and zero
opposition; `full-back dragged inside`'s arrow never actually exited its own highlighted zone;
`wing overload` and `late arrival` had endpoints crowding or disconnected from where the story
needed them. If you add a new named pattern, apply the same render-and-look check before trusting
the coordinates — reasoning about x/y numbers in the abstract is exactly how the original bugs
shipped undetected.

| Pattern                  | Concept                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Half-space               | A player drifts from a wide position into the half-space between the opponent's back line and midfield                                                  |
| Full-back Dragged Inside | A full-back steps inside to track the half-space runner, vacating the wide channel behind                                                               |
| Wing Overload            | A player receives in the vacated wide channel, isolated 1v1                                                                                             |
| Penalty Duel             | Taker mid run-up, keeper set on the line                                                                                                                |
| Save                     | Keeper parries the ball away from the taker                                                                                                             |
| Decoy Run                | A player draws a marker before continuing a run past them                                                                                               |
| Late Arrival             | A player arrives unmarked into space defenders just vacated                                                                                             |
| Compact Block            | An isolated attacker with no support, facing a settled defensive line                                                                                   |
| Penalty Delay            | Same physical setup as Penalty Duel — for scenes about the psychology of a delayed kick                                                                 |
| Half-space Overload      | Recap pattern: a half-space run plus a wide runner arriving late                                                                                        |
| Overlap                  | A full-back runs around the OUTSIDE of the winger holding the ball, ending wider and further forward                                                    |
| Underlap                 | Same starting shape as Overlap, but the run goes UNDER (inside), into the half-space, instead                                                           |
| Third-Man Run            | A run timed to arrive beyond the two players directly involved in the build-up, unmarked                                                                |
| Pressing Trigger         | The defending team closes down instantly the moment the ball-carrier takes a heavy touch                                                                |
| Low Block                | A settled, deep, narrow defensive line absorbing pressure from distance — no arrows, a static shape                                                     |
| High Line                | The defense pushes high up the pitch; an attacker then runs beyond it into the space it leaves behind                                                   |
| Inverted Full-back       | A full-back tucks into central midfield in possession instead of holding width                                                                          |
| False Nine               | The nominal striker drops off the front line to link play, dragging a marker out of the back line                                                       |
| Double Pivot             | Two central midfielders sit side by side screening the zone in front of the back four                                                                   |
| Channel Run              | A run forward into the gap between a center-back and a full-back                                                                                        |
| Switch of Play           | A 2-phase pattern: play builds on one side while the far-side winger sits isolated, then the ball switches and the winger attacks the isolated defender |
| Counter Press            | A 2-phase pattern: the ball is lost, then the losing team immediately swarms the new ball-carrier                                                       |
| Aerial Duel              | Two players contest a cross near the six-yard box; the focus player wins it and clears                                                                  |
| Covering Run             | A center-back shifts across to cover the wide channel a full-back has vacated                                                                           |
| Building From The Back   | A defender carries/passes forward from deep, splitting the opposition's first press line                                                                |
| Tracking Run             | A defender tracks an attacker's run goal-side, staying tight rather than losing them                                                                    |

Every entry above is defined in `src/video/tacticalPatterns.ts` and was audited the same way (each
one rendered via `remotion still` and visually checked, not just reasoned about) — see that file's
comments for what the 2026-07-13 batch's render check actually caught (six of the twelve new
patterns had their opposition marker silently vanish because it lived on `supporting2`, which only
renders with an explicit 2nd name, instead of the guaranteed-fallback `supporting3`). The four
"educational demonstration" patterns (Aerial Duel, Covering Run, Building From The Back, Tracking
Run) were added specifically because they're reusable across MULTIPLE positions (a center-back and
a striker both contest aerial duels; a goalkeeper and a center-back both build from the back) — see
"Educational demonstration scripts" below.

**You don't have to name a Pattern explicitly.** The parser also scans `Narration` itself for any
pattern name above (case-insensitive, e.g. writing "Hakimi overlaps down the right" auto-selects
`Overlap`) whenever the `Pattern` field is absent — an explicit `Pattern` field always wins if both
are present. This is a plain substring match, not real language understanding — a pattern name
that happens to appear in prose describing something else will still fire, so use an explicit
`Pattern` field (or reword the sentence) if that's ever a problem in practice.

## Educational demonstration scripts

A different shape of script from a match recap or a news roundup: instead of narrating what
happened in a specific game, the script teaches a football CONCEPT (a position, a role, a tactical
idea) by demonstrating it. The format doesn't change — it's still `### SCENE N` blocks — but the
structure and pacing do:

- **One responsibility per scene, not one scene per position.** "What does a center-back do?"
  isn't one TacticalBoard scene with five labels on it — it's five-to-six separate scenes, each
  demonstrating ONE responsibility (holding the line, covering a full-back, winning an aerial
  duel, building from the back, tracking a runner), the same "one idea per scene" rule from the
  Philosophy section above, just applied to teaching rather than analysis.
- **Chapter, then Statement, then one TacticalBoard scene per responsibility.** Open each
  position with a Chapter card naming it ("Center-Back") and a short Statement introducing the
  role in one sentence, then move straight into the demonstration scenes — don't spend a whole
  scene on introduction before the viewer sees anything move.
- **Reuse Pattern Library entries wherever a responsibility matches one.** Aerial Duel, Covering
  Run, Building From The Back, and Tracking Run exist specifically because they're common across
  multiple positions — check the table above before hand-authoring Data coordinates for a
  responsibility that might already have a name. Fall back to a Data-based board (see TacticalBoard
  above) for anything genuinely position-specific that isn't in the library yet — ask before adding
  a new named pattern for something likely to recur across other positions later, the same rule as
  every other Pattern Library addition.
- **The narration should name the responsibility, not describe the diagram.** "The center-back
  shifts across to cover the space" (naming what's being taught) reads better than "the blue player
  moves down and left" (describing the picture) — same "narration frames the graphic, doesn't
  transcribe it" rule as the Philosophy section, applied to teaching content instead of a stat.
- **Mute-test it.** The stated bar for this kind of scene ("if the narration is teaching why a
  full-back overlaps, the viewer should be able to mute the video and still understand the concept
  from the animation alone") applies literally here — if a responsibility's demonstration only
  makes sense with the narration explaining it, the diagram isn't doing its job yet.

See `analyses/center-back-role-explained.txt` for a fully worked example covering all six
responsibilities from the original brief for this position (holding the line, stepping into
midfield, covering a full-back, winning aerial duels, building from the back, tracking runners),
built entirely from existing Pattern Library entries.

## Camera Language

`Camera` accepts one stage, or two joined with `→` (e.g. `Zoom Left Half →
Follow Doué`) for a pan/zoom across the scene:

- `Wide Tactical View` / `Zoom Out` / `Full Pitch` — full pitch, no zoom
- `Zoom Left Half` / `Zoom Right Half` — zooms onto the wing the scene's focus
  player is on (uses the scene's own Focus/Data position, not a fixed point)
- `Central Channel` — zoomed on the middle of the pitch
- `Zoom Box` / `Close-up on Spot` / `Close Tactical View` — tight zoom on the
  focus point
- `Goal Line` — tight-ish zoom on the focus point, slightly wider than a
  standard close-up (a full close-up zoom on a point at the pitch's edge
  would push half the frame past the boundary into empty space)
- `Follow <Name>` / `Pan Left` / `Pan Right` — zoom on the focus point

## Transition and Evidence

`Transition` is `Hard Cut` (no crossfade) or anything else (treated as a
dissolve — `Cross Dissolve` and `Fade to Black` both read as a plain
crossfade, since the shared near-black background makes a true through-black
effect visually redundant). This controls timing only (a hard cut is a single
frame; anything else is the normal ~0.5s crossfade duration).

**Transition Style** (optional field, independent of `Transition`) picks
_which_ presentation plays for the non-cut case — `Hard Cut` still forces a
plain cut regardless of this. One of: `Zoom In`, `Zoom Out`, `Slide Left`,
`Slide Right`, `Slide Up`, `Slide Down`. Defaults to a plain `Fade` (today's
only behavior) when absent — Tifo Football-style dynamic scene changes,
usable on any Scene Type. Note "Zoom In"/"Zoom Out" here are a custom plain
CSS scale+fade, not Remotion's built-in WebGL-shader zoom presentations —
chosen deliberately for render reliability, not because the shader versions
don't exist.

`Evidence` is authoring metadata only (not rendered) — keep using it to flag
confidence, and phrase `Medium`/`Low`-evidence claims in the Narration itself
with appropriate hedging (see the tactical-investigation guidance: never
state an inferred mechanism with more confidence than the evidence supports).

## Background silhouettes/photos

Most scenes with a single named subject (a TacticalBoard Focus, a GoalSequence
shooter, a Formation side) automatically get a faded background image if a
matching asset exists — you don't request this per scene, it's resolved
automatically from `public/assets/{players,silhouettes,flags,badges}/`. For
every other Scene Type (Icon, Stat, Sequence, StatBurst, PlayerComparison...)
add an explicit **Subject:** field with the person's name instead — it's
looked up the same way (a real photo if you've added one, else the generic
`player`/`manager` silhouette). Two standing rules for that art:

- Low contrast against the main content — it's set-dressing, not a second
  focal point. Rendered desaturated and at low opacity on purpose; don't
  reference or rely on it being clearly visible in a still frame.
- Always top-anchored, so a bigger/closer crop only ever eats into the
  legs/feet, never the head — the head must stay visible no matter how large
  the silhouette is sized.

By default this art is always the low-contrast "faded" treatment above. When a
scene is specifically ABOUT one named person (not just a scene that happens to
feature them — e.g. a transfer story, an injury update, a manager
appointment), add **Image Style:** Featured to switch that same image to a
clear, full-color, larger presentation instead — closer to a real reference
photo than background dressing. Leave `Image Style` out (or set it to
`Background`) for every other case; it only ever affects whichever image
`Subject`/the scene's own visual already resolved, it doesn't add a second
image. Note today's `silhouettes/` assets are flat solid-color cutouts with no
facial detail — Featured mode is built and ready, but won't look like a real
reference photo until a real player/manager photo (or a detailed illustration,
per the Tifo Football style reference) is added for that specific person.

**Positioning a Featured image** — use `Image Side`:

- `Right` (default) / `Left` — a fixed-width panel flush against that edge,
  full height. Works on Icon, Stat, Sequence, TacticalBoard, Formation, and
  GoalSequence.
- `Center` — the image is centered and shortened (leaves the bottom ~30% of
  the frame empty on purpose). Only Icon and Stat currently move their own
  headline/caption down into that empty band to match (`stackedLayout`) —
  this is the "clear portrait, name below it" look from the Tifo reference
  screenshots. Using `Center` on any other Scene Type still centers the
  image, but that card's own text stays where it always was and can overlap.

**Featured entrance sequencing** — on Icon and Stat, a Featured image is
timed to visibly land first; the headline/caption are delayed until just
after it settles, rather than everything fading in at once. Faded-mode
scenes are unaffected (the image is too subtle for sequencing to matter).
