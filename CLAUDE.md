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

## Designing a beat: BEFORE / TRIGGER / EVENT / AFTER

Added 2026-09-01, from a direction note that corrected two earlier drafts of the
file-systems script. It is the operational form of "Visualize the mechanism" —
that principle says WHAT to aim at; this says HOW to design one beat.

Every important visual beat is designed before its narration is written:

| | |
|---|---|
| **BEFORE** | What does the viewer currently believe they are looking at? |
| **TRIGGER** | What new information or action changes the visual world? |
| **EVENT** | Exactly what happens on screen — objects moving with intention, transforming for a reason, producing a visible consequence. |
| **AFTER** | What does the viewer now understand that they did not before? |

**The EVENT is written as a physical description, never as a timeline verb.** A
verb describes movement; it does not describe a comprehensible event. "Bytes
scatter into blocks" is not an instruction — "the file surface tears apart, its
contents separate into byte fragments, each travels deliberately into a numbered
cell, and the motion stops only once one apparently single file is visibly
pieces in scattered locations" is. **The verb is an implementation detail chosen
last.**

Creative order of operations — the renderer's vocabulary comes SIXTH:

1. What invisible mechanism is being explained?
2. What physical event would make it intuitive?
3. What does the viewer expect beforehand?
4. Can the animation deliberately violate that expectation?
5. What visual consequence proves the explanation?
6. *Only then* choose timeline actions.

Never choose a visual idea because the engine has a convenient action for it.

Three rules that follow from this, all now in `ENGINE_DOCTRINE`
(`src/ai/doctrine.ts`) so authoring inherits them:

- **Transform the world; do not replace it.** When one idea leads to the next,
  transform the existing frame rather than clearing it for an unrelated
  composition. The transition IS part of the explanation — a chain reorganising
  into structured records explains an architectural difference better than any
  label. Resetting the stage every scene is what makes a video a slideshow.
- **Do not narrate what the viewer can already see.** The animation is the
  evidence; the narration is the meaning. Not "the blocks are connecting" but
  "reaching the last block means following every connection before it."
- **The animation may lead the narration** — anticipate the sentence, contradict
  what the viewer expects, then reveal. Showing a consequence before naming it is
  usually stronger than explaining first and illustrating after.

A NOTE ON COST: this material more than doubled the doctrine prompt (1,184 ->
~2,500 tokens). It is the cached prefix of every authoring call, so
`authorScript.ts` derives its per-call token reserve from `ENGINE_DOCTRINE`'s
actual length rather than hardcoding it — a constant there goes stale the next
time this section grows, and the failure it produces is a 413 no retry can clear.

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

- **AI script authoring with validator-driven self-repair (landed 2026-09-01).**
  `src/ai/` closes the loop the engine never had: a topic in, a validated
  `analyses/*.txt` script out, with no human authoring a `Data:` block. Two
  entry points, one pipeline: `npm run author -- --topic "..."` from the
  terminal, and an "Author with AI" prompt box at the top of the generator UI
  (`POST /author` -> the same SSE job/progress plumbing the render jobs use).
  The UI path writes its result straight into the existing script box, so the
  parse, timeline preview, diagnostics panel and Generate button all light up
  with no further wiring — authoring feeds the pipeline that already exists
  rather than becoming a second way to make a video. `/author` is deliberately
  NOT behind the render mutex: it spawns no headless Chrome, so a script can be
  written while another video renders. Two stages, split on a context
  budget: the outline call sees only the one-line medium catalog derived from
  `VISUAL_DEFINITIONS` and picks a MEDIUM PER SCENE (which is also what makes
  medium rotation checkable); each scene call then sees only its own medium's
  JSON Schema plus the two richest real examples of that medium mined from the
  existing `analyses/` corpus. Nothing restates the spec by hand — the schemas
  ARE the prompt, derived from the registry, so a new medium becomes authorable
  the moment it lands there and the prompt can never drift from the parser.

  The property that makes this work with a cheap model: **the model is never
  trusted, it is measured.** Repair runs in two tiers — tier 1 validates against
  the same Zod schema the parser uses and hands back the exact failing field
  paths; tier 2 assembles the script, runs the real `parseSceneScript ->
  autoFixGeometry -> diagnoseScenes` path (identical to `POST /parse`), and
  routes each HARD diagnostic back to the scene that caused it for a targeted
  re-author. Soft findings are reported and never block, per the standing
  advisory-diagnostics position. First live run: 14 hard geometry findings on
  one scene, re-authored once, script came back clean.

  **Medium selection is editorial, not schema-checkable (learned 2026-09-01).**
  The first rendered AI-authored script had four good scenes and two dead ones:
  `channels` chosen for a concept with no day-shaped structure rendered as three
  labels in an empty frame, and `spatial` chosen for a concept needing no 3D
  rendered as an unrecognizable stick. Both passed every validator, because
  "schema-valid and geometrically sound" and "reads as anything at all" are
  different questions and only the first is automatable. The fix lives in the
  authoring layer, not the engine: `mediumCatalog.ts` now holds an EDITORIAL
  list separate from the registry's capability list — `EXCLUDED_FROM_AUTHORING`
  drops the football heritage (still renderable, still hand-authorable, never a
  thing a model should reach for on a tech lesson), and `SPECIALIZED_MEDIUMS`
  keeps the dangerous-but-valuable ones available while forcing each to state
  the condition under which it is the right answer. A medium is not offered or
  withheld on whether it works — it is offered on whether a model choosing it
  casually would produce something a viewer can read.

  Provider-agnostic behind one narrow interface (`src/ai/provider.ts`), because
  correctness comes from the repair loop rather than the model. Defaults to
  Gemini's free tier deliberately — the expensive model must be an explicit
  choice (`--llm anthropic`) for a video that matters, never the thing an
  unattended queue silently runs on.

- **Generated motion components — bespoke animation per concept (landed 2026-09-01).**
  The ceiling on the schema path above is that it can only ASSEMBLE mediums that
  already exist, so every video is built from the same ~30 looks and a concept
  fitting none of them gets shoehorned into the nearest one. `Scene Type: motion`
  removes that ceiling: the model writes an actual Remotion component
  (`src/ai/authorMotion.ts` -> `src/video/generated/<id>.tsx`), so the animation
  can use anything Remotion offers rather than anything the registry happens to
  contain.

  What replaces Zod as the correctness signal is a three-gate loop, each gate
  catching a class the previous one cannot see:
  1. **A static contract sweep** (`generatedComponentStore.ts`) — an IMPORT
     ALLOWLIST rather than a blocklist (only react / remotion / generatedMotion /
     theme), no dynamic escapes, and no `Date.now`/`Math.random`, which compile
     fine and make every frame render differently. Nothing unsafe is ever
     written to disk, not even transiently.
  2. **A narration-fit sweep** (`findTimingViolations`) — beats must be
     expressed as fractions of `durationInFrames`. Prose was demonstrably not
     enough here: the first component generated against a prompt stating this
     rule hard-coded three milestones anyway, which compiles, renders, looks
     fine at the estimated length, and then silently stops finishing once the
     scene is re-fitted to measured audio.
  3. **The TypeScript compiler**, scoped to the generated file so pre-existing
     errors elsewhere don't send the model chasing problems it didn't cause.

  A component that never compiles is DELETED rather than left on disk — the
  barrel imports every `.tsx` in the directory, so one broken file breaks the
  bundle for every scene, not just its own.

  **DISABLED BY DEFAULT after being rendered and looked at (2026-09-01).** The
  machinery all works — generate, gate, compile, repair, register, render. The
  OUTPUT does not. On the models this pipeline can afford, a generated component
  renders as a few tiny shapes on an empty ground with no text; the critique
  pass scored one 2/10 readable, 0/10 text, `looksEmpty: true`. A frontier model
  DID produce good component code earlier the same day, then hit a 20/day quota
  — which is the whole problem: raw codegen needs a model that defeats the point
  of running free, and constraining components to fit a free tier's token budget
  makes them worse.

  The lesson is the one the doctrine already implies: quality lives in the
  MEDIUM, not in the generation. A hand-built medium produces a good scene from
  a cheap model every time. `motion` stays in the registry and still renders;
  it is simply removed from `authorableMediums()` so nothing unattended reaches
  for it. Re-enable by dropping it from `EXCLUDED_FROM_AUTHORING` if a frontier
  model ever becomes the default.

- **Visual critique — the first check that looks at the picture (landed 2026-09-01).**
  Every other gate verifies STRUCTURE: Zod checks shape, `validateGeometry`
  checks overlap, `tsc` checks types. A scene passes all of them and can still
  be an empty black frame. That is not hypothetical — the first AI-authored
  script shipped a `channels` scene that rendered as three labels in a void and
  a `spatial` scene that rendered as an unrecognizable stick, both structurally
  perfect. Nothing in the engine could see the problem, because seeing was never
  something it did.

  `critiqueScene.ts` renders three frames and asks a multimodal model what it
  sees, scoring readability, mechanism, text legibility and progression, plus a
  `looksEmpty` flag for the failure static checks are blindest to. Validated
  against those two exact scenes: the empty one came back `weak` /
  `looksEmpty: true` (readable 4, mechanism 3) with "the vast majority of the
  frame is wasted empty dark background"; the good one came back `good`
  (readable 9, mechanism 8) — and independently caught a label collision a human
  had spotted by eye.

  Two deliberate design decisions, both about this machine rather than about
  correctness. It renders SINGLE STILLS via `renderProbeStills`, not a short
  video: `renderMedia` holds browser workers plus the compositor plus an encoder
  for its whole duration, while `renderStill` renders one frame and tears down.
  And frames are captured strictly sequentially — three in parallel would be
  three simultaneous browsers, which is exactly the RAM contention the
  concurrency policy in `renderVideo.ts` exists to avoid. Sampling is at 25/55/85%
  rather than the edges, because the first and last frames mostly capture
  entrance and exit transitions, which look alike in every scene and say nothing
  about whether the middle did any work.

  OPT-IN (`--critique`), because it is the only gate that spends a render.
  Everything cheaper runs first and unconditionally.

- **Word-perfect caption timing (landed 2026-09-01).** `wordCaptions.ts` used to
  state, in its own header, that "there is no per-word ASR/alignment available
  from either TTS provider this project uses". That was wrong, and it was
  load-bearing — it is why every caption in this engine was ESTIMATED by
  distributing a clip's duration across words by character weight.

  Both providers report real timings. Edge TTS emits WordBoundary events on
  every synthesis and the installed client already requests
  `wordBoundaryEnabled` and parses them to milliseconds — the engine was
  generating exact timings on every render and discarding them; `saveSubtitles`
  now keeps them in a `.words.json` sidecar beside the cached audio. ElevenLabs
  exposes `/with-timestamps`, whose character-level alignment is folded into
  words by `wordTimingsFromAlignment`. Both flow through `GeneratedSpeech.wordTimings`
  -> the segment -> `buildWordCaptionLinesFromTimings`, with the estimator kept
  only as the fallback for audio cached before this existed.

  Why it matters more than it sounds: for a subtitle under a diagram, an
  estimate is fine. For short-form, where the caption IS the content, a word
  landing 200ms off the voice is the whole difference between reading as
  produced and reading as generated. A word's highlight is also held until the
  NEXT word starts rather than ending at its own measured end — the measured gap
  is the natural pause, and switching off during it makes the highlight blink
  between every pair of words.

- **Choreography: the animation principles `motion.ts` excludes (landed 2026-09-01).**
  `motion.ts` opens by declaring "deliberately no spring()/bounce/overshoot
  anywhere in this file — that's the whole point", and offers four cubic easing
  curves. That is right for a subtitle and wrong for anything that should feel
  physical, and it is the reason the visual vocabulary bottomed out at boxes
  changing colour and dots travelling along lines: an object that eases politely
  from A to B reads as a value being interpolated, because that is exactly what
  it is.

  `choreography.ts` adds what it excludes — anticipation, follow-through,
  overlapping action, secondary motion, staggered timing, squash-and-stretch,
  arcs — as a SEPARATE module, because both vocabularies are correct for
  different jobs and nothing existing should change under it. Wired into
  `StageCard` so far in two places: entrances now settle with a spring on the
  raw entrance ramp (opacity deliberately keeps the plain ease — an overshooting
  opacity flickers), and objects declared to enter on the same beat cascade a
  few frames apart instead of arriving in unison. Simultaneous arrival reads as
  a diagram being switched on; a cascade has a direction and the eye follows it.

**Not built — the real gaps:**
- **Level 5 is now partly checkable — see the visual critique pass below.** What
  remains uncovered is taste and pedagogy: the critique can tell you a frame is
  empty or a label is unreadable, not whether the explanation is the right one.
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
