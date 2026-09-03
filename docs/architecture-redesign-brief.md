# MASTER PROMPT — REDESIGN MY AI MOTION-GRAPHICS / EXPLAINER VIDEO ENGINE

> Paste this as the first message of a new Claude session. It is self-contained.
> It carries the full context of the project, the failure mode I have observed,
> the research I did on comparable products, the architecture I want to move
> toward, a concrete test case, and exactly what I want you to do once I hand you
> the codebase.
>
> Do not start rewriting anything. First read this whole brief, then read the
> repo's `CLAUDE.md` and `.claude` memory, then inspect the code, then map the
> proposed architecture onto what already exists. Only after that do you propose
> an implementation.

---

## 0. TL;DR — the one idea

My engine tries to generate animation **directly from concepts**. Comparable
products appear to run a **production pipeline**: understand → storyboard →
design visual assets → animate those assets → compose → render.

That difference is the reason my generated animations are weak.

The problem is **not** "the renderer can't animate." The renderer can already
move, transform, camera, sequence, and time things. The missing intelligence is
the layer that decides **what visual event should happen** before anything
decides **how to animate it**.

So the central question for this whole redesign is:

> **How do we make the system decide what the viewer should see, why they should
> see it, what should happen to it, and what they should understand when it is
> over — before it ever touches an animation primitive?**

---

## 1. The product I am building

An application that takes educational narration or a script and automatically
produces **serious, professional motion-graphics educational videos**.

The target is the quality bar of serious faceless technical-education channels
(KodeKloud and peers): the viewer is carried through the explanation because the
visuals **continuously demonstrate the mechanism being taught**.

It is **not**:

- slideshow / animated-PowerPoint generation
- a generic AI video generator
- icons floating around a screen
- static diagrams with elements fading in
- objects moving "because motion graphics need movement"
- an animated infographic generator — putting icons on a canvas next to narration

It **is** a visual storytelling engine where the screen behaves like a visual
explanation of what the narrator is saying. Every important idea in the narration
should cause something **meaningful** to happen visually. The video should feel
like a sequence of **events unfolding**, not a sequence of illustrated nouns.

Wrong shape:

```
Narrator says something
  → relevant icon appears
  → another icon appears
  → arrow moves
  → text fades in
```

Right shape:

```
Narrator introduces an idea
  → a recognizable visual situation is established
  → the narrator creates an expectation
  → something happens that challenges / demonstrates / transforms / reveals it
  → the visual consequence helps the viewer understand the narration
  → that consequence leads naturally into the next idea
```

The screen must visualize **events, causality, transformations, consequences,
processes, and changes in understanding** — not merely illustrate the nouns that
were mentioned.

---

## 2. The main problem with the current engine

The engine already has real infrastructure: scenes, mediums, a Timeline IR, an
evented timeline (move / style / appear / disappear / camera, arc paths,
sequential chaining, continuous idle motion, per-action SFX), sequence and
parallel structures, camera choreography, a narration temporal spine that refits
the visual timeline onto measured TTS audio, geometry validation, scene
diagnostics, a structural Diagram medium, a brand-asset (Simple Icons) registry,
and even a visual-critique pass that renders stills and asks a multimodal model
what it sees.

**The deeper problem is that the AI makes bad visual decisions before animation
even begins.**

Example. Narration:

> "Your computer is full of files. Photos. Videos. Documents."

The current pipeline decides:

- show a folder icon
- show an image icon
- show a video icon
- show a PDF icon

…then distributes those glyphs across the frame.

This is wrong. The AI has confused **"things mentioned in narration"** with
**"the visual event that should happen."** Even if those glyphs then animate, the
scene has no event. There is no before/after, no transformation, nothing the
viewer understands at the end that they did not at the start.

The engine's own doctrine already says this ("Visualize the mechanism", "icon +
line + label is never a legitimate fallback", the BEFORE / TRIGGER / EVENT /
AFTER beat design). The problem is that nothing in the pipeline **structurally
forces** a visual event to be designed before primitives are chosen. The doctrine
is prose in a prompt; it needs to become a representation the pipeline cannot
skip.

---

## 3. A concrete failure example — the opening of "THERE IS NO SUCH THING AS A FILE"

Intended opening progression:

```
NORMALITY → RECOGNITION → FOCUS → SUSPICION → REVELATION
```

The scene should begin with a **recognizable file browser** containing e.g.
`Work/`, `Photo.png`, `Video.mp4`, `report.pdf`, `notes.txt`. The viewer
instantly recognizes: *"I am looking at files on a computer."*

Then:

1. The environment is established.
2. Visual attention moves through the familiar files.
3. `report.pdf` becomes important — a cursor selects it.
4. Other objects become secondary (highlight-and-dim).
5. The camera pushes toward `report.pdf`.
6. Narrator: *"But here's the strange part."* — motion becomes restrained.
7. Narrator: *"Your disk doesn't actually have this."*
8. **Only now** does the familiar representation begin to transform. The file
   browser becomes the doorway into the hidden system underneath:

```
report.pdf selected
  → camera pushes into it
  → the familiar UI loses its authority
  → the filename separates from the icon
  → the familiar representation is inspected, layer by layer
  → the file breaks down into data
  → the data travels into scattered storage blocks
```

The point: **the file icon is not the animation.** The file is an object
**participating in an event**. The current engine would render step 0 (four icons
in a frame) and call it done.

---

## 4. The core principle the new architecture must enforce

> **An asset is a noun. An animation is a verb. The storyboard decides what
> happens.**

Worked example:

| | |
|---|---|
| **ASSET** | `report.pdf` |
| **VIEWER BELIEF** | This is one physical object stored somewhere. |
| **TRIGGER** | The narrator challenges that belief. |
| **ACTION** | The object is inspected. |
| **TRANSFORMATION** | The filename separates from the familiar representation. |
| **REVEAL** | The object breaks into underlying data. |
| **CONSEQUENCE** | The data is distributed across different storage locations. |
| **VIEWER REALIZATION** | The familiar file is an abstraction, not one physical object. |

*That* is a scene. `PDF icon + folder icon + arrow + fade` is not. The engine
must be architected around the first model, and it must be impossible to render a
scene that has no such event.

---

## 5. Research: what comparable products appear to be (and the disclaimer)

I researched products in this category, especially **Brainrot Shorts**, from the
angle of *how you would build a system like theirs*, not how a user operates the
product.

**Disclaimer, binding:** I do **not** have their private source code, schema, or
stack. No public repo credibly contains their production app. Everything below is
a **hypothesis reconstructed from public docs, the API surface, product
workflows, and output descriptions.** Do not treat any of it as fact. Where I say
"appears to" / "probably", keep that uncertainty.

### 5.1 It is not one video generator — it is a platform of production systems

The public product separates: simple voice-over videos, Reddit videos, character
videos, document-to-explainer videos, motion graphics, image generation, video
generation, image-to-video, motion control, overlays/editing. These share
infrastructure, but **each format has its own production workflow**. Contrast
with my engine, which tries to be one universal animation engine where the AI
picks a medium (diagram / canvas / sequence / stat / splitcards / stage / …).

Their shape looks like:

```
INPUT → FORMAT-SPECIFIC WORKFLOW → SCENES → ASSETS → ANIMATION → RENDER
```

Not:

```
SCRIPT → LLM → generic animation commands → render
```

### 5.2 The motion-graphics workflow is the most relevant

Their public motion-graphics description says the generator: accepts a
script/narration → **storyboards** the content → **designs every frame** →
animates titles, numbers and diagrams → synchronizes narration and captions →
adds music and SFX → renders. Frames are described as **designed for the
narration**, not pulled from templates.

Implication: there is almost certainly an **intermediate representation between
the script and the animation**:

```
SCRIPT → SEMANTIC ANALYSIS → STORYBOARD → VISUAL DESIGN → TIMELINE → RENDER
```

My engine collapses too many of these steps into `SCRIPT → AI → SCENE SPEC →
TIMELINE`.

### 5.3 The explainer workflow exposes an editable storyboard

Their explainer flow is described as: **Distill → Storyboard → Illustrate →
Narrate → Caption → Export**, with scenes **reviewable and editable before
rendering** — rewrite scene text, swap illustrations, reorder scenes, regenerate
illustrations. That means a **real storyboard object** exists as a first-class
artifact, not a transient prompt.

### 5.4 Their newer generative-media workflow separates asset generation from video production

Standalone image/video workspaces are separate from the guided studio; the studio
manages scripts, scenes, captions, voices, timing and final assembly. So: **the
model does not directly create a finished visual.** Assets are generated/collected
first; a later layer decides how those assets form an event.

### 5.5 The API implies an async job pipeline

Public API exposes: projects, scenes/blocks, asynchronous audio jobs, renders,
render-status polling, output URLs, project-type-specific endpoints. Lifecycle:

```
PROJECT → APPROVE → RENDER JOB → ASYNC PROCESSING → POLL STATUS → OUTPUT URL
```

Audio generation is also async. Reasonable (not confirmed) backend model:

```
Project DB → Job Queue → { Script, Asset, Image, Video, Audio, Caption workers }
           → Scene Assembly → Render Worker → Object Storage / CDN
```

### 5.6 What the evidence does NOT support

There is **no public evidence that the motion-graphics generator scrapes Google
Images or the open web for every visual.** The explainer flow emphasizes
**generating custom illustrations**; the generative-media flow uses image/video
**models** as asset generators. So do not assume "their secret is web scraping."
The likelier model is an **asset router**:

```
ASSET REQUIREMENT → ASSET ROUTER →
  ┌ existing asset (icon / logo / SVG / overlay)
  ├ generated asset (AI illustration / generated scene / generated video)
  └ user asset (uploaded image / custom video / character / brand asset)
```

---

## 6. The architecture I want to move toward

```
USER SCRIPT / NARRATION
        │
        ▼
SEMANTIC UNDERSTANDING          ← what does the narration MEAN (no render concepts)
        │
        ▼
CONCEPT / BEAT GRAPH            ← conceptual beats, not sentence-split scenes
        │
        ▼
STORYBOARD DIRECTOR            ← meaning → visual EVENT plan
        │
        ▼
VISUAL EVENT PLAN
        │
        ├───────────────┬────────────────┐
        ▼               ▼                ▼
ASSET DIRECTOR     EVENT DIRECTOR    STYLE DIRECTOR
        │               │                │
        ▼               ▼                ▼
ASSET MANIFEST     EVENT GRAPH      DESIGN TOKENS
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                VISUAL COMPOSER          ← objects, layout, composition per aspect ratio
                        │
                        ▼
                  TIMELINE IR            ← existing IR, extended
                        │
                        ▼
                    RENDERER (Remotion)
                        │
                        ▼
                     VIDEO
```

I need you to determine **how this maps onto the existing codebase** — not to add
layers blindly where a module already partly does the job.

---

## 7. Layer 1 — Semantic Understanding

Understands **meaning**, with **zero knowledge** of Remotion / Canvas / diagram /
splitcards / timeline verbs.

Input:

> "Your computer doesn't actually have a file called report.pdf."

Output (schema is illustrative, not prescriptive):

```json
{
  "concept": "file abstraction",
  "claim": "a filename is not a physical object stored as a single thing",
  "viewerExpectation": "the file exists somewhere as one identifiable object",
  "misconception": "a file is physically stored as a single contiguous object",
  "reveal": "the file system represents data through metadata and storage references",
  "visualOpportunity": "challenge and dismantle a familiar representation"
}
```

---

## 8. Layer 2 — Concept / Beat Graph

Narration is **not** split into scenes on sentence boundaries. The system
identifies **conceptual beats**. For each beat:

- What does the viewer know **before** this beat?
- What does the narrator **introduce**?
- Does it create an expectation / question / contradiction / comparison /
  process / transformation / consequence / reveal?
- What should the viewer understand **after** the beat?

Example:

```
BEFORE:        viewer sees report.pdf as a familiar object
EXPECTATION:   viewer assumes it physically exists as one thing on disk
TRIGGER:       narrator says the disk does not actually have that object
EVENT:         the familiar representation is inspected and dismantled
AFTER:         viewer understands the familiar file is an abstraction
```

This beat graph is the **conceptual backbone** of the whole video, and later
videos in a course build on earlier ones using the same visual language.

---

## 9. Layer 3 — Storyboard Director

Converts semantic meaning into a **visual event**. A scene should carry roughly:

```ts
type ScenePlan = {
  narration: string;

  semanticGoal: string;

  viewerKnowledgeBefore: string;
  viewerKnowledgeAfter: string;

  visualWorld: string;        // the recognizable situation on screen
  primarySubject: string;     // the one thing the scene is about
  viewerExpectation?: string;

  event: {
    setup: string;
    trigger: string;
    action: string;
    transformation?: string;
    consequence: string;
  };

  visualNarrative: { beginning: string; middle: string; end: string };

  assets: AssetRequirement[];
  cameraIntent: CameraIntent[];
  transitionIntent: TransitionIntent[];
  emotionalProgression?: string[];
  animationStrategy: string;
};
```

Do **not** adopt this exact interface if the existing scene format has a better
fit — but the **information** it represents must exist somewhere, and today most
of it does not.

---

## 10. Every scene must have a visual event

Strong rule: **a scene must not exist merely to display objects.** Every scene
answers: *what changes between its beginning and its end?*

```
STATE A → TRIGGER → ACTION → TRANSFORMATION → STATE B
```

Bad:

> Narration: "FAT uses linked blocks." → several blocks appear with arrows.

Better:

```
STATE A:     a file's data is distributed across storage
TRIGGER:     the viewer needs to find where the next piece is
ACTION:      the camera follows a pointer from one block to the next
ESCALATION:  the journey gets longer and more scattered
STATE B:     the viewer understands that reaching a later block means
             following every link before it
```

The motion itself demonstrates the architecture.

---

## 11. Model information changes, not objects

Narration: *"The request checks the cache first."*

Not: `cache icon + database icon + arrow`.

Instead, model the state transition first:

```
STATE:    a request exists
EVENT:    the request reaches the cache
DECISION: is the data present?
OUTCOME A: return the result
OUTCOME B: continue to the database
```

Only after the transition is modelled does the visual system choose how to
represent it. Favor `state → event → consequence → representation`, never
`nouns → icons → animation`.

---

## 12. A formal VisualEvent model

```ts
type VisualEvent = {
  before: string;
  viewerExpectation?: string;
  trigger: string;
  action: string;
  transformation?: string;
  consequence: string;
  viewerRealization: string;
};
```

Not necessarily a rigid API if the code suggests something better — but there
must be an explicit representation of BEFORE / EXPECTATION / TRIGGER / ACTION /
CONSEQUENCE / REALIZATION, and **no scene may compile from narration straight to
primitives without one.**

---

## 13. The Director must be separate from the Animator

**DIRECTOR** decides: what visual situation should exist? what should the viewer
experience? what event should happen? what should change? what is the
consequence?

**ANIMATOR / COMPILER** decides: how do we implement that event with the engine's
primitives? which primitives? how is the timeline built? what enters, transforms,
exits? how does the camera move?

The animator must **not** invent the story. The director must **not** need to
know low-level rendering details. This separation is the point.

---

## 14. Asset architecture — the AssetManifest

Before rendering, the system identifies assets required by the storyboard:

```ts
type AssetManifest = {
  entities: Entity[];
  logos: LogoRequirement[];
  icons: IconRequirement[];
  images: ImageRequirement[];
  generatedImages: GeneratedImageRequirement[];
  generatedVideo?: GeneratedVideoRequirement[];
  proceduralGraphics: ProceduralGraphicRequirement[];
};
```

Example:

```json
{
  "logos": ["Windows", "Linux", "Apple"],
  "icons": ["pdf", "folder", "trash", "usb-drive"],
  "generatedImages": ["abstract representation of storage blocks"]
}
```

Hard constraint: assets are **resources**, not the visual idea. They appear only
when they contribute to the visual event. Never "we retrieved five logos, put
them all on screen."

---

## 15. Asset routing priority

An **asset router** chooses in roughly this order:

1. **Local asset library** — Simple Icons, Lucide, existing SVGs, custom
   illustrations, brand assets, reusable components. Handles a large share of
   technical visuals.
2. **Official assets** — logos, product imagery, OS visuals — where licensing
   allows.
3. **Licensed / permitted media providers** — contextual photographs,
   environments, real-world imagery via a proper provider API, **preserving
   source + licence metadata**. Not built around indiscriminate scraping.
4. **AI-generated media** — when the concept has no library asset and is not
   better done procedurally (e.g. "a computer system as a city of
   interconnected warehouses").
5. **Procedural graphics** — data structures, file-system blocks, network flows,
   database relationships, memory allocation, algorithms. These are
   **constructed by the engine**, not retrieved as images, because they need
   precision and they need to animate.

---

## 16. Separate assets from events (worked example)

```
ASSET:        a 10 GB movie file, a USB drive
EVENT:        the user tries to move the movie onto the drive
EXPECTATION:  there is plenty of free space (drive shows 60 GB FREE)
CONTRADICTION: the transfer fails
REVEAL:       the drive's filesystem has a maximum single-file size limit
```

The animation is **not** `USB icon + movie icon + error icon`. It is: the movie
physically moves toward the drive, the viewer sees `60 GB FREE`, it should
obviously fit, and then the transfer stops dead against an invisible wall. **The
contradiction is experienced before it is explained.** Then the narrator says
why.

---

## 17. Asset suitability must be validated

An asset can match the query and still be visually wrong. The system should be
able to reject assets that are too small, low quality, stylistically
incompatible, overly busy, badly cropped, irrelevant, confusing, or likely to
dominate the composition. Rank candidates on: semantic relevance, visual clarity,
composition suitability, style compatibility, resolution, licence/source
confidence.

---

## 18. Semantic visual components ("Worlds")

The engine has primitives (Card, Icon, Arrow, Text, Box, Diagram). It also needs
**reusable semantic visual systems** so the AI does not re-derive basic visual
storytelling every video:

- **FileBrowserWorld** — create folder, create file, select file, navigate,
  focus file, inspect file, open file, transition into the file's internal
  representation.
- **StorageWorld** — divide storage into blocks, allocate data, scatter data,
  overwrite blocks, link blocks, highlight allocation, reconstruct fragments.
- **SystemComparisonWorld** — establish two systems, feed the same input,
  synchronize the transformations, show diverging outcomes, collapse the
  comparison into a conclusion.

These encode visual grammar. Build one when a class of topic genuinely needs it,
not on principle.

---

## 19. The Event Graph

The director produces a conceptual sequence; the compiler translates it into
concrete Timeline IR:

```
[report.pdf exists]
  → [viewer believes it is one object]
  → [narrator challenges belief]
  → [file is inspected]
  → [filename separates]
  → [data representation revealed]
  → [data distributes into storage blocks]
  → [file system reconstructs the relationship]
```

`[file inspected]` might compile to: camera push-in + focus transition + a
scanning action + UI-context suppression + reveal-layer activation.

**Assess whether an Event Graph fits the existing Timeline IR** and, if so, how
to introduce it. Do not create a second parallel representation if the IR can be
cleanly extended.

---

## 20. Timeline must come LATE

Creative order of operations:

```
IDEA → VISUAL EVENT → VISUAL OBJECTS → SCENE COMPOSITION → TIMELINE ACTIONS
```

Not:

```
IDEA → available animation verbs → AI picks a verb → timeline
```

If the AI sees `scatter / split / travel / collapse / reveal` early, it treats
those verbs as creativity. They are **compiler instructions produced after
creativity has already happened.** The current pipeline likely exposes timeline
capability to the model too early — check this.

---

## 21. Narration style

Must not sound like an AI assistant or a tutorial built from bullet points. It
should sound like a strong human explainer: natural sentence variation,
curiosity, conversational explanation, occasional short sentences, rhetorical
setup, contrast, timing, pauses, consequences, concrete examples.

Technical terms are introduced **after** the viewer understands the idea, as a
label for something they have already seen. Not *"This is called an extent"*
before the concept — instead: show thousands of individual blocks being tracked,
show how absurd that becomes, compress the range to `100–4000`, let the viewer
get it, **then** *"This is called an extent."* These explanatory micro-scenes are
connective tissue, not glossary slides.

Also cut chat scaffolding like *"here's the strange part"* from the taught text
where the memory/doctrine already says so — the animation is the evidence, the
narration is the meaning; don't narrate what the viewer can already see.

---

## 22. Animation style requirements

Active does not mean everything is always moving. **Do not** default to glow /
pulse / bob / float / generic scale-in / generic fade-in / decorative particles.
Those are not animation.

Meaningful motion: opening, closing, splitting, assembling, disassembling,
following, travelling, colliding, failing, transforming, sorting, compressing,
expanding, being inspected, copied, overwritten, connected, disconnected,
reconstructed, compared, consumed, produced. Every motion answers *"what is
physically or conceptually happening?"*

Caveat, equally binding: **visual density ≠ educational density.** One animated
request packet travelling through an architecture teaches more than fifteen
static icons.

---

## 23. Camera as a storytelling tool

No random zooms. Camera movement has semantic intent:

- **Push in** → discovery, inspection, importance, reveal
- **Pull back** → scale, context, consequence, comparison
- **Follow** → process, journey, causality
- **Hold** → suspicion, impact, realization, contradiction

The engine already has camera/timeline concepts — determine whether they can
express these **intentions** rather than raw pan/zoom values.

---

## 24. A scene is not one static composition

Scenes must have internal progression — a beginning, a middle, and an end:

```
BEGINNING: normal file browser
MIDDLE:    report.pdf becomes selected
LATER:     camera focuses, the rest dims
END:       the familiar representation starts to lose its integrity
```

The viewer has travelled through the scene.

---

## 25. Mediums are output strategies, not creative ideas

`diagram / sequence / splitcards / terminalmock / stat / code / tiercards /
stage / holdings / spatial` must not be the first creative decision. First:
*what must the viewer experience?* Then: *what medium best represents that?*

- need: viewer follows a long chain → **sequence**
- need: show structural relationships → **diagram**
- need: two outcomes from one action → **split comparison**

Medium rotation is good for variety, but variety **never** overrides meaning.
Medium selection is editorial, not schema-checkable — the memory already records
two AI-authored scenes that passed every validator and still rendered as "three
labels in a void" and "an unrecognizable stick" because the medium was wrong for
the concept.

---

## 26. Full test case — "THERE IS NO SUCH THING AS A FILE"

Redesigned architecture must be tested conceptually against this long-form video.

**Thesis:** a file is not a physical object on your disk; it is an abstraction
created by the file system.

**Covers:** FAT / FAT32, NTFS, ext4, APFS, storage blocks, fragmentation,
deletion, recovery, extents, journaling, copy-on-write, clones, snapshots.

**ACT 1 — THE LIE.** Establish a familiar file browser. Focus `report.pdf`.
Challenge its physical existence. The file representation becomes the doorway into
the storage system underneath.

**ACT 2 — DELETION.** The name↔index relationship disappears; the underlying data
remains. A recovery process detects fragments. Then new data overwrites the old
blocks. Viewer experiences: **FILE DISAPPEARS, BUT DATA REMAINS.**

**ACT 3 — FAT.** Data blocks are linked. The camera physically follows the chain;
the journey gets long; the viewer feels why walking the chain is inefficient.
Then the max-file-size problem as a physical contradiction: `USB DRIVE: 60 GB
FREE`, `MOVIE: 5 GB`, `TRANSFER: FAILS` — contradiction first, limit explained
after.

**ACT 4 — NTFS.** Transition from a chaotic chain into structured records. Show
the Master File Table conceptually. A small file is visually absorbed into its
own metadata record. Journaling as an event: `INTENTION RECORDED → CHANGE BEGINS
→ CRASH → RESTART → RECORD RESTORES CONSISTENCY`. The crash is an **event**, not a
lightning icon next to the word "journaling."

**ACT 5 — EXT4 / EXTENTS.** Start with the absurdity of tracking `Block 100, 101,
102, … 4000`. Let the list overwhelm the frame. Compress to `100–4000`. Viewer
understands the compression **before** the word `extent` appears.

**ACT 6 — APFS / COPY-ON-WRITE.** A large file is duplicated. Viewer expects data
to move. The duplicate appears — nothing moved. Reveal: both references point to
the same underlying data. One copy changes; only the changed portion splits away
and gets new storage. Viewer understands copy-on-write visually before hearing
the term.

**ACT 7 — PAYOFF.** Compare the file systems as different answers to *"how does
the computer remember what belongs to a file?"* Visual callbacks explain: why
recovery software works, why fragmentation exists, why FAT32 refuses some files,
why old systems need defragmentation, why some duplicates are near-instant.

---

## 27. External asset retrieval architecture

The app should eventually retrieve external media — but **not** as uncontrolled
scraping. Propose a sound architecture:

```
Entity detection
  → asset requirements
  → asset search-query generation
  → source routing
  → candidate retrieval
  → candidate ranking
  → licence / source metadata
  → scene-suitability evaluation
  → asset placement
```

Asset classes: logos, icons, official product imagery, photographs,
illustrations, screenshots, video clips, SVGs, generated images, generated video,
procedural graphics.

**Retrieval never decides the story.** It satisfies requirements created by the
storyboard. `STORYBOARD: a user inserts a USB drive` → `REQUIREMENT: USB drive
visual` → router satisfies from existing → official → licensed → generated →
procedural. Retrieval must not independently add unrelated imagery.

---

## 28. Current technical context (verify against the repo — do not trust filenames)

The repo's `CLAUDE.md` is the governing engineering doctrine — **read it first**,
along with the `.claude` memory index. Known landmarks as of this brief (confirm
each still exists and does what's claimed):

- **Timeline IR** — `src/script/timelineIR.ts`; evented timeline engine in
  `src/video/compositions/Canvas.tsx` (move / style / appear / disappear /
  camera, per-action easing, arc paths, sequential chaining, continuous idle
  motion, per-action SFX cues).
- **Mechanism behavior vocabulary** — `src/script/mechanismBehaviors.ts`
  (REST+DB, cache hit/miss, GraphQL choreography).
- **Narration temporal spine** — `src/script/narrationFit.ts`,
  `fitSegmentsToNarration.ts` (`SCENE_SETTLE_SECONDS`),
  `validateNarrationSync.ts`. Derives semantic beats from a flat timeline and
  refits onto measured TTS duration. Only runs with real audio.
- **AI authoring pipeline** — `src/ai/` (`authorScript.ts`, `doctrine.ts` /
  `ENGINE_DOCTRINE`, `mediumCatalog.ts` with `EXCLUDED_FROM_AUTHORING` /
  `SPECIALIZED_MEDIUMS`, `provider.ts`). Two-stage: outline picks a medium per
  scene; per-scene calls see only that medium's JSON Schema + mined examples.
  Validator-driven self-repair (Zod tier + assemble/`parseSceneScript` →
  `autoFixGeometry` → `diagnoseScenes` tier). Entry points: `npm run author`
  and `POST /author`.
- **Parse / validate path** — `parseSceneScript`, `autoFixGeometry`,
  `diagnoseScenes`, `src/script/validateGeometry.ts`. Diagnostics are
  **advisory, not blocking** — do not restore a hard gate.
- **Mediums** — structural **Diagram** (`Scene Type: Diagram`, declare
  nodes/nesting/edges, engine computes geometry; real shape silhouettes:
  cylinder/cloud/queue/chip/phone), **Stage** (Shorts), **holdings**
  (`holdingsLayout.ts` computes every statistic it shows), **spatial**
  (`LivingMap.tsx`, `SpatialStage.tsx` ~2600 lines, flagged for breakup).
- **Cross-scene continuity** — `Continue Canvas:` / `Board` / `Diagram` /
  `Stage` / `Spatial` / `Holdings` fold a run of scenes into one persistent
  segment (`mergeCanvasContinuity.ts`, `mergeSpatialContinuity.ts`). Continue
  Canvas still drives passages through legacy `phases`, bypassing the timeline
  engine and the narration fit — known gap.
- **Brand assets** — Simple Icons fetched at generation + cached + shape
  fallback; local override for AWS marks. Marks currently hand-inlined in
  `src/video/canvasIcons.tsx`; no real registry / provenance yet.
- **Visual critique** — `critiqueScene.ts` renders 3 stills at 25/55/85% via
  `renderProbeStills` / `renderStill` (never `renderMedia`), sequentially, and
  asks a multimodal model: readability, mechanism, text legibility, progression,
  `looksEmpty`. Opt-in (`--critique`).
- **Choreography** — `src/video/choreography.ts` (anticipation, follow-through,
  overlapping action, secondary motion, stagger, squash-stretch, arcs) as a
  separate module from `motion.ts` (deliberately spring-free easing for
  captions). Wired into `StageCard` in two places.
- **Generated motion components** — `Scene Type: motion` writes a real Remotion
  component; three-gate loop (static contract sweep / narration-fit sweep /
  scoped `tsc`). **Disabled by default** — output is weak on affordable models;
  quality lives in the medium, not the generation.
- **Machine constraints (from memory, binding):** no local models — the machine
  overheats on renders alone; use hosted APIs; prefer `renderStill` over
  `renderMedia`; any render-spending pass is opt-in. Do not compete with the
  user's renders (no generate/preview/TTS/`public/` writes while they render;
  source edits + tests are fine). Audio cache writes must be atomic
  (temp+rename); delete unparseable cache entries.

The narration/timeline direction to preserve and integrate with:

```
narration duration → derive visual beats → fit animation timeline
  → respect perceptual minimums → preserve anchors
  → validate visual activity does not overrun narration
```

Do not discard this work. The redesign integrates with it.

---

## 29. Do not patch one-off failures

If a rendered scene exposes a **class** of failure, generalize it: what scene
constraint allowed it? can a static check detect it? can a regression test
prevent recurrence? Architectural fixes, not scene-specific hacks. (The repo
already does this in `validateGeometry.ts` — follow that pattern.)

---

## 30. Visual validation categories

Consider which are automatable vs. which need AI visual critique:

- Does the scene have a primary subject?
- Does the scene have a visual event? Does something meaningful change?
- Are unrelated objects competing for attention?
- Does the narration correspond to the visual action?
- Is the visual event completed before the narration moves on?
- Does the visual timeline overrun the narration?
- Are objects overlapping? Is the composition empty? Overloaded?
- Is the selected medium appropriate?
- Are there too many unrelated assets?
- Are camera movements semantically justified?

---

## 31. Do NOT replace everything without analysis

When I give you the codebase:

1. Understand the existing architecture. Map the real pipeline:
   `input → script generation → scene parsing → scene IR → composition →
   timeline → rendering`. Trace it in code; do not infer responsibilities from
   filenames.
2. Identify **where the AI currently makes visual decisions** and **where those
   decisions become concrete animation actions**.
3. Compare existing vs. desired architecture as a table:

   | Desired responsibility | Existing module | Status (missing / partial / exists) | Recommendation |
   |---|---|---|---|
   | Semantic understanding | … | … | … |
   | Beat graph | … | … | … |
   | Storyboard director | … | … | … |
   | Visual event model | … | … | … |
   | Asset manifest | … | … | … |
   | Asset routing | … | … | … |
   | Visual composition | … | exists | extend |
   | Timeline compiler | … | exists | preserve / refactor |
   | Renderer | … | exists | preserve |

4. Only then recommend implementation. Preserve working infrastructure. Identify
   obsolete abstractions, abstractions that are too low-level, and abstractions
   that should become semantic. Design concrete interfaces/types. Show data
   flowing through the new pipeline end to end. Give a migration order. Identify
   the tests each architectural change needs.

---

## 32. Incremental migration plan (propose against the real code)

- **Phase 1 — minimum architectural change.** Smallest change that lets a scene
  represent `semanticGoal`, `visualEvent`, `primarySubject`, `before`, `after` —
  and that improves generated scenes immediately.
- **Phase 2 — Storyboard Director.** A real intermediate storyboard
  representation, editable before render (mirrors the comparable-product finding).
- **Phase 3 — Asset Manifest.** Separate asset requirements from visual events.
- **Phase 4 — Semantic visual components.** Reusable Worlds / higher-level visual
  grammar.
- **Phase 5 — Event compilation.** Compile event graphs into Timeline IR.
- **Phase 6 — Asset retrieval.** Local / official / licensed / generated /
  procedural routing with provenance.
- **Phase 7 — Visual validation.** Reject bad scenes before spending a render.

Do **not** recommend a full rewrite.

---

## 33. Success criterion

Given: *"Your disk doesn't actually have a file called report.pdf."*

The system must **not** produce: PDF icon + folder icon + image icon + video
icon + decorative background.

It must produce something like:

```
VISUAL WORLD:     recognizable file browser
PRIMARY SUBJECT:  report.pdf
VIEWER BELIEF:    this is a normal physical file
TRIGGER:          narrator challenges that belief
EVENT:            the file is selected and inspected
TRANSFORMATION:   the familiar representation separates into layers
CONSEQUENCE:      the viewer is prepared to enter the hidden storage representation
VIEWER REALIZATION: the file was never one physical thing
```

…and then compile that into real Timeline IR the existing renderer can execute.

---

## 34. What I want from you now

1. Confirm you have read this brief, `CLAUDE.md`, and the `.claude` memory.
2. Trace and describe the **actual** current pipeline in code.
3. Produce the **existing-vs-desired responsibility table** from §31.
4. Recommend the **smallest coherent architectural evolution** and a concrete
   Phase 1, with types/interfaces and the tests it needs.
5. Flag anything in this brief that the code makes a bad idea, and say why.

Do not begin editing until we have agreed on the Phase 1 shape.
