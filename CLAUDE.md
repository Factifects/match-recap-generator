# Engineering Doctrine — Script-to-Educational-Motion-Design Engine

This document is the permanent governing directive for this project. It outranks
convenience, it outranks the current implementation, and it is not scoped to any
single video, scene, or topic. Read it before designing any scene compiler,
visual primitive, renderer change, or generated script.

## What we are building

A **programmatic educational motion-design engine powered by Remotion**.

We are **not** building an animated infographic generator. We are not building a
system that puts icons on a canvas next to narration.

The quality bar is serious faceless technical-education channels (KodeKloud and
peers): the viewer is carried through the explanation because the visuals
**continuously demonstrate what is being taught**.

## The target: the KodeKloud channel model

Confirmed with the user 2026-08-10. The goal is not "borrow their look" — it is
the whole model: their visual production grammar, their lesson format, and their
course structure. Decomposed, that is six things:

1. **A cumulative canvas.** The diagram GROWS across a lesson — node, then a pod
   inside it, then a container inside that. It rarely cuts. One persistent frame,
   continuously extended, is the default shape of a lesson; a hard cut per scene
   is the exception.
2. **A fixed house vocabulary.** The same glyph means the same thing in every
   video, so viewers learn the visual language across a course. Not per-scene
   invented shapes, and not a generic Heroicon standing in for a domain concept.
3. **Real code, YAML and terminal as a co-equal medium**, side by side with the
   diagram, with the specific line highlighted while it is discussed and explicit
   correspondence between a config field and a diagram element.
4. **Focus by highlight-and-dim** on a largely static frame. Very little camera
   movement — almost no zooms or pans. The active element brightens, the rest
   recedes but stays visible for context.
5. **Narration-locked reveals** (the temporal spine — built).
6. **Lesson-shaped scripts and sequenced courses**: concept -> why it exists ->
   demo -> recap, with later videos building on earlier ones and reusing the
   same visual language throughout.

Note what this target does NOT require: elaborate composition grammars. KodeKloud
does not use radial diagrams, decision trees or network graphs. Nested boxes
built up cumulatively carry almost all of it. Build the grammar when a topic
genuinely demands one, not on principle.

## The governing principle

> **Visualize the mechanism.**
>
> Visuals must explain mechanisms, not decorate narration.

The question that drives scene generation is **never**:

> "What icons should I put on screen?"

It is:

> "What is physically or temporally happening in the concept being explained,
> and what visual behavior would demonstrate that to a viewer?"

## Semantic → visual mapping

| Semantics | Visual |
|---|---|
| Nouns | objects |
| Verbs | motion / state changes |
| Relationships | spatial relationships |
| Processes | temporal choreography |
| Data | actual values |
| Conditions | branching |
| Comparisons | simultaneous juxtaposition |
| Aggregation | objects/data physically combining |
| Distribution | objects/data splitting |
| Queues | continuous insertion / removal |
| Requests | request objects travelling through a system |
| Responses | response objects travelling back |
| Caching | lookup → HIT/MISS → alternate paths |
| Authentication | verification state transition |
| Retries | repeated request cycles |
| Polling | repeated request/response cycles |
| WebSockets | persistent bidirectional communication |
| REST | resource-oriented request choreography |
| GraphQL | query → resolver → selected-data choreography |
| Database queries | query → database → result |
| Load balancing | request distribution between servers |
| Code execution | execution flow, changing values, calls/returns |
| Algorithms | actual state transitions |
| Flowcharts | actual flowchart construction and traversal |

**These are examples, not a fixed list.** The system must generalize the
principle to concepts that were never explicitly hard-coded. Adding a
per-concept special case ("REST → the REST animation") is an anti-pattern.

## What is not a visualization

These are **rendering primitives**, not educational visualizations:

icons · text · boxes · dots · lines · arrows · simple movement · fade in/out

Assembling primitives into a scene does not make it an animation.

- `Client → API` with a moving dot is **not** an API explanation.
- Several icons and arrows is **not** a motion graphic.
- A label reading `"checking amount"` is **not** a visual demonstration of
  checking an amount.
- A nicer-looking line is still a line.

**Icon + line + label is never a legitimate fallback state.** When no
specialized behavior exists for a concept, compose one from existing primitive
behaviors (`send` / `branch` / `transform` / `compare` / …) — never collapse
back to the generic template.

## Animation is not movement

A 20-second scene where an icon appears and an arrow slowly crosses from A to B
is not acceptable merely because something moved.

A serious scene may contain: entrance, setup, anticipation, transformation,
interaction, branching, response, state change, camera movement, secondary
motion, looping motion, continuous processes, data changes, emphasis,
resolution.

Multiple things may happen **simultaneously and sequentially** within one scene.

Remotion is the motion-design / VFX execution layer. Use keyframes,
interpolation, spring physics, masks, transforms, camera choreography, paths,
morphing, clipping, reveals, state transitions, looping behavior, layered
composition, and particles **where they improve explanation**. Do not constrain
the system to the primitives that happen to exist today.

Caveat that is equally binding: **visual density ≠ educational density.** Do not
satisfy this doctrine by adding 20 icons, 15 boxes, and 30 arrows. One animated
request packet travelling through an architecture teaches more than fifteen
static icons.

## Narration is the timeline authority

Every visual event must correspond to something being said.

- "The client sends the request to the server" → the request visibly travels
  **during that statement**.
- "The server checks the cache" → the cache becomes the active visual subject
  **during that statement**.
- "If the cache misses, we query the database" → the visual branches into the
  database path **during that statement**.

Do not show an animation five seconds before the narration explains it. Do not
let the narration finish while the visual keeps doing unrelated work.

Scene duration is **derived from narration**, not padded to an arbitrary number.

**But not set equal to it.** Making `durationSeconds` exactly `narrationSeconds`
is too literal a reading of this rule and produces a real regression: the last
visual beat lands on the final syllable and cuts instantly, and because scenes
crossfade over 15 frames while the incoming scene's narration starts at its own
frame 0, one scene's last word runs straight into the next scene's first word.
Every scene needs a short DECLARED settle after narration ends
(`SCENE_SETTLE_SECONDS` in `fitSegmentsToNarration.ts`). The rule forbids
*unexplained* leftover activity, not a declared hold — the visual timeline still
ends with the narration; the scene simply holds its final state for a beat.

```
SCRIPT → NARRATION SEGMENTS → REAL TTS AUDIO DURATIONS → VISUAL TIMELINE → REMOTION
```

Scene duration and narration duration are **one coupled concern**, not two. If
narration ends at 44s, the visual does not run to 49s unless there is an
explicitly declared beat there (intro, outro hold, deliberate pause).

If a concept needs 8 seconds of visual explanation and narration gives it 3, the
system must know that **before rendering** and either compress the choreography
or flag the timing conflict.

**Rejected "fixes" — never do these:** trimming overflow, freeze-frame padding,
global playback-rate scaling, per-video special-casing. The correct mechanism is
timeline **fitting**: beats expand, contract, or overlap while the visual story
stays intact.

### Narration alignment score

For every narration beat the compiler must be able to answer:

1. What entity is being discussed?
2. What action is being described?
3. What state change should occur?
4. What relationship is being established?
5. What visual behavior demonstrates it?

If the answer to (5) is "show an icon," the visual plan is insufficient and the
scene is not ready.

## Behavior vocabulary

The Timeline IR must support *semantic* behaviors, not generic movement:

travel · follow · trace · connect · disconnect · branch · merge · split ·
transform · morph · accumulate · drain · fill · empty · pulse · highlight ·
inspect · compare · filter · reject · select · enqueue · dequeue · request ·
respond · retry · cache-hit · cache-miss · execute · return · loop · stream ·
replicate · synchronize · expand · collapse · zoom/focus

Each compiles into real choreography:

- `compare` is **not** text reading "compare." It is: move values into a
  comparison relationship → align them → visibly evaluate → resolve → return to
  original context.
- `request` is **not** drawing an arrow. It is: construct request → send →
  travel → receive → process → respond.

**Having primitives is not the same thing as having a motion-design language.**
Never conclude "the renderer already has move/appear/style, therefore we have
enough." The missing layer is the semantic one that knows *why* and *how* those
primitives should be choreographed.

## Progressive disclosure

Do not read "more educational" as "more objects on screen." The viewer should
**continually gain information**:

```
t=0   establish the system
t=3   introduce the request
t=6   show processing
t=9   show the decision
t=12  show the resulting branch
t=15  show the consequence
```

A 20-second scene where one ball moves from A to B is not acceptable. A
20-second scene should contain a sequence of meaningful states and interactions.

## Quality bar

**Not this:** PowerPoint animation · static infographic with moving arrows ·
icon slideshow · generic dots moving along lines · boxes appearing one after
another · random camera zooms · decorative particles · text describing what
supposedly happened.

**This:** technical motion graphics · KodeKloud-style instructional
visualization · mechanism-driven diagrams · meaningful object choreography ·
progressive disclosure · code + architecture interaction · cinematic camera
choreography · real transformations · continuous motion where appropriate.

A scene should feel authored by a motion designer who understands the technical
concept.

## Aspect ratio is part of composition

16:9 and 9:16 are **separate composition targets**, not one layout at two
resolutions. Never solve portrait by cropping or squeezing a horizontal layout.

The engine must support: vertical pipelines, vertical flowcharts, stacked cards,
radial diagrams, branching trees, centered compositions, scrolling/code-focused
layouts, split-screen compositions, zoomed detail compositions.

Establish a **layout model before generating objects** — safe area, title zone,
primary visual zone, supporting-info zone, caption zone — then compute bounds,
text widths, connector clearance, and minimum spacing before placing anything.
Do not place objects and hope a validator catches the overflow afterward.

## Real assets

When a recognizable technology, product, or company is discussed, use the **real
brand asset** where legally and technically appropriate. Maintain a reusable,
normalized, cached brand-asset registry sourced from Simple Icons and other
official/open sources. A generic icon is a last-resort fallback, never the
default representation of a recognizable technology, and an invented or
approximated logo is never acceptable.

Logos **participate in the animation** — they are entities in the visual
language, not stickers.

## Code is a first-class visual medium

A code tutorial must look like a code tutorial. Required capabilities:
realistic multi-line code, syntax highlighting, line emphasis, scrolling,
line-by-line execution, variable/value changes, cursor movement,
code-to-diagram relationships, highlighting the exact line being discussed,
annotations, before/after transformations, realistic file/project context.

Do not use tiny meaningless snippets because that is what the renderer currently
supports.

## Diagrams are first-class visualizations

The engine must construct and animate: pipelines, flowcharts, branching flows,
decision trees, state machines, sequences, hierarchies, networks, cycles,
matrices, comparisons, timelines, architecture diagrams, system diagrams, data
flows.

Crucially, **the structures themselves animate**: nodes appear, connections
draw, data travels, branches activate, states change, nodes transform, paths
repeat, the camera follows the active region.

## Architecture direction

Evolve toward:

```
Narration → Semantic representation → Visual plan → Timeline → Remotion
```

Not:

```
Narration → hard-coded scene composer → icons + arrows
```

**Do not build this as 100 special-case composers.** We need a reusable semantic
visual grammar and behavior vocabulary beneath the script compiler. A script
describes *meaning*; the compiler determines representation and choreography;
the renderer executes it.

## Acceptance test

Before considering a generated scene successful, answer:

1. If I mute the narration, can I understand what is happening?
2. Is the visual actually demonstrating the mechanism?
3. Does the visual change when the concept changes?
4. Is every significant animation motivated by the narration?
5. Does the viewer have a reason to keep watching the next 5 seconds?
6. Does the scene contain meaningful temporal progression, rather than a static
   composition with one moving object?
7. Would a professional educational YouTube channel actually use this animation?

If the answer is no, **do not rationalize the scene as "technically correct."**

Related standing rule: a scene is never "done" on schema validation alone.
Render it, pull real frames, and look at them.

## The most important instruction

**Do not optimize for the current implementation. The current implementation is
the thing we are evolving.**

If the renderer lacks a capability required to properly demonstrate a concept,
**identify the missing capability and build the reusable primitive** rather than
degrading the visualization into icons and arrows.

Think in terms of what a professional motion designer would need to communicate
the concept, then implement the reusable system that lets the compiler produce
it.

The failure mode this document exists to prevent:

> *"Why are all the scenes still boxes and arrows?"*
> *"We can add a `boxVariant` and a `connectorStyle`…"*

Never answer a structural complaint with a cosmetic option.

---

## Current state (keep this section honest — update it as work lands)

Snapshot as of 2026-08-10. Verify before relying on any line here.

**Built and working:**
- Evented timeline engine in `src/video/compositions/Canvas.tsx` — move / style /
  appear / disappear / camera actions, per-action easing, arc paths, sequential
  chaining, continuous idle motion, camera pan/zoom/drift, animated arrow flow,
  per-action SFX cues.
- Timeline IR (`src/script/timelineIR.ts`), proven by three compilers.
- Mechanism behavior vocabulary (`src/script/mechanismBehaviors.ts`) with
  REST+DB, cache hit/miss, and GraphQL choreography proven by render.
- Static pre-render geometry checks (`src/script/validateGeometry.ts`),
  scene contracts, scene diagnostics.
- Aspect-ratio *dimensions* (`src/video/Root.tsx`: 16:9 and 9:16 canvases).
- **The `holdings` medium (landed 2026-08-29).** A wall of small panes, each
  one everything a single participant holds, for the class of subject whose
  answer to scale is that NO complete picture exists anywhere. Its signature
  move is an assembly that fails: panes slide toward the one frame they would
  occupy in a complete picture, land on top of each other where two of them
  hold the same thing, and leave holes where nobody does. The rule that makes
  it worth having: `holdingsLayout.ts` computes every number the medium shows
  (coverage, contradictions, how many participants a change touches) from the
  generated population, so a script can ask for a statistic but can never
  assert one. Built after three rendered attempts at depicting a city failed
  for the same reason each time — a depiction has to compete with the real
  thing the viewer already knows, and loses. See "Recognizability before
  sophistication" below.
- **Cross-scene continuity for every timeline medium.** `**Continue Canvas:**`
  / `Board` / `Diagram` / `Stage` / `Spatial` / `Holdings` fold a run of scenes into ONE
  segment — one persistent object set, one unbroken timeline, one camera —
  while each original scene keeps its own measured narration clip. The renderer
  divides a continuous world into production boundaries, rather than the scene
  boundary deciding what the world is. `mergeSpatialContinuity.ts` (landed
  2026-08-29) closed the last and most costly gap: Spatial holds the only real
  camera and the only distance-driven representation (`LivingMap.tsx`), so
  before it, an author who wanted a second beat about the same 3D world had to
  abandon the world and redraw the idea as a flat Stage scene — which is exactly
  what the Maps script did. Spatial-specific: a continuing scene may declare no
  objects at all, and any it does declare without an `enter` are entered at
  ITS narration rather than at the top of the passage.
- **Narration temporal spine (Phase 1, landed 2026-08-10).**
  `src/script/narrationFit.ts` derives semantic beats from a flat timeline and
  refits them onto the real TTS duration — pauses compress before meaningful
  actions, beats expand before the scene is allowed to freeze, per-action
  perceptual minimums are never violated, beat order and internal causality are
  preserved, and `anchors` pin an authored moment to the narration moment it
  illustrates. `fitSegmentsToNarration.ts` applies it per segment (timeline +
  caption `phases` + `sfxClips` + `durationSeconds` +
  `visualMinDurationSeconds` all move together). `validateNarrationSync.ts`
  reports overrun / uncovered narration / unvisualized narration beats /
  unnarrated visual beats. Wired into `generate.ts` between
  `resolveSegmentAudio` and validation, and into `previewScene`.

**Not built — the real gaps:**
- **Composers still author against the estimate.** The spine now corrects them
  after the fact, which is a real fix (and every composer inherits it without
  being rewritten), but it is still correction rather than intent: compilers
  emit a flat action array and beats are *derived* from it. The next step is
  compilers emitting declared semantic beats with narration anchors, so
  `narrationFit` schedules stated intent instead of inferring it from timestamps.
  `composeMechanism.ts:549` still discards `estimatedDurationSeconds` outright.
- **The fit only runs with real audio.** A no-`--audio` render still shows
  estimate timing, by design — there is no clock to fit to.
- **Composition grammar.** No flowchart / decision-tree / hierarchy / network /
  matrix / timeline / lineage primitives. Composition is effectively
  left-to-right icon-and-line.
- **Responsive recomposition.** 9:16 changes the canvas size only; the same
  layout is reused. No per-aspect-ratio composition.
- **Brand asset registry.** Brand marks are hand-inlined SVG paths in
  `src/video/canvasIcons.tsx`. No registry, no Simple Icons sourcing, no cache,
  no provenance/licence tracking.
- **Code as a real medium.** `CodeSnippetCard.tsx` is capped at two panels with
  whole-snippet swaps — no line highlight, scroll, cursor, or execution stepping.
  `TerminalMockCard` / `BrowserMockCard` are unrelated components rather than one
  integrated dev-environment system.
- **Script contract layer** (hook / curiosity / central question / narrative arc,
  locked before scene contracts) and a **motion-design layer** coordinating
  multiple visual engines within one scene.

**Priority order — REVISED 2026-08-10 once the KodeKloud channel model became
the explicit target. The earlier order (spine -> composition grammar -> code)
was set before that, and composition grammar is the weakest fit for this
target; do not revert to it.**

1. ~~**Narration temporal spine.**~~ Built — the clock underneath everything else.
2. **Code as a first-class medium, plus a first-class focus/dim operation.**
   The largest gap against the target and roughly half of KodeKloud's screen
   time. `CodeSnippetCard.tsx` has no line numbers at all, no per-line
   highlight, a two-panel cap and no scrolling; `TerminalMockCard` is an
   unrelated component with no link to the editor or the diagram. Rebuild as a
   real dev-environment medium (its own design pass, NOT an extension of
   CodeSnippetCard), and add a `focus` operation that brightens a subject while
   dimming the rest — the diagram-side half of the same mechanic.
3. **Cumulative canvas + house vocabulary.** `Continue Canvas:`
   (`mergeCanvasContinuity.ts`) is already the persistent-canvas primitive, but
   it drives passages through legacy `phases` rather than `timeline`, so they
   bypass both the timeline engine AND the narration fit. Move it onto the
   timeline path, then give it a real domain vocabulary.
4. **Composition grammar + responsive layout.** Deferred deliberately — build a
   grammar when a topic demands one.

Brand asset registry runs alongside as needed; it is not blocking.

**Recognizability before sophistication (learned the hard way, 2026-08-29).**
Three separate attempts to carry an episode on a rendered city — flat, then 3D,
then 3D with distance-driven detail — all failed the same test: a viewer had to
be TOLD it was a map. If a visual does not read as what it represents within a
second, no amount of camera work, ambient motion or continuity will rescue it,
because the problem is the representation and not its execution. Deliberate
abstraction beats attempted realism every time; and a capability existing in the
engine is never a reason to use it. When a medium is failing, change the visual
thesis, not the renderer.

**Text never sits directly on content (2026-08-29).** Every caption, readout
and beat must be drawn together with its own backing — a plate in the scene's
ground colour, or a full scrim where the content behind is meant to recede.
What an overlay lands on changes every frame, so contrast cannot be left to
chance: a grey caption over green bars, or a white numeral half behind a card,
is invisible in exactly the frames that carry the point. Enforce it structurally
by making text-and-plate ONE component (see `TextOnPlate` in HoldingsWall.tsx),
so a bare text node over content is not something a later edit can reintroduce
by accident. Small text needs MORE contrast than large text, not less.

**Standing constraint for every new medium:** anything that carries its own
timeline MUST be schedulable by `narrationFit`. A second medium that ignores the
clock would reintroduce exactly the desync the spine was built to remove.

## Proof strategy

Do not build twenty mechanisms blindly — and do not shrink the ambition to one
isolated scene either. Prove that the architecture generalizes using four
deliberately different mechanisms:

1. REST + database
2. GraphQL field selection
3. WebSocket persistent bidirectional stream
4. Cache hit/miss branching

For each: generate narration → generate visual plan → compile → render →
inspect at narration beat boundaries → verify visual/narration alignment →
verify 16:9 composition → verify 9:16 *recomposition*. Only after these pass
should the vocabulary be generalized further.

**Working discipline for this project:**
- Finish the phase in flight to a clean stopping point before starting the next
  large mandate. Do not fold a second architecture initiative into the tail of an
  already-large session.
- Prove new capability with 2–4 deliberately *different* cases, rendered and
  inspected, before generalizing into a large vocabulary.
- When a render exposes a bug, generalize the root cause into a permanent static
  check with a regression test. A one-off fix is not done.
