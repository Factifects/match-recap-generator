// Canvas pacing + sound-effect palette — previously a set of named, pickable
// "cadence" presets (steady/cinematic/pulse/breathe/minimal/suspense), each
// bundling its own pacing numbers AND its own sound-prompt wording. Removed
// at the user's explicit request ("remove this cadence feature, it is
// wack") — picking a cadence name never reliably improved anything and was
// one more thing to get wrong in a script (see the `**Cadence:**`-field-vs-
// Data-JSON footgun this used to have). One fixed, always-on palette now
// covers every scene — no field, no picking, no per-script pacing tuning.
// `click` is reserved for a REAL tap/press interaction (a cursor landing on a
// button) — never attach it to an icon just "activating"/being emphasized
// while narration mentions it, that's what `highlight` is for. Attaching
// `click` to something that isn't visually a press reads as a sound with no
// motivated cause (confirmed directly: "I kept hearing a click sound effect
// and nothing warranted it").
export type CanvasSoundEvent = "entrance" | "move" | "zoom" | "click" | "highlight" | "success" | "alert" | "typing";

export const CANVAS_PHASE_TIMING = {
  phaseDurationFrames: 90,
  glideDurationFrames: 20,
  cameraDriftAmplitudePercent: 1.1,
  cameraDriftPeriodFramesX: 300,
  cameraDriftPeriodFramesY: 380,
};

// Short, concrete prompts — sound-generation models do better with a plain
// description of the actual sound than a string of stacked adjectives.
// 2026-08-06: a full rewrite toward "techy/futuristic" wording (entrance/
// move/click/highlight/success/alert/typing all rephrased in one pass) was
// reverted almost immediately — the user only ever had a problem with
// `entrance` (twice: "sounds like a bounce", then "sounds like a ball
// dropped in a bucket of water"). Direct correction: "why did you even
// replace all of the sfx, the former ones were okay, i just did not like the
// entrance sfx." Lesson: when one cue is reported wrong, fix that one cue —
// rewriting the whole palette "while I'm in there" throws away known-good
// prompts and reintroduces risk nobody asked to take. `entrance` below is
// intentionally left as a plain, conservative placeholder rather than a
// third guess — the user is providing an exact list of ElevenLabs sound
// effects to use instead of continued prompt-wording guessing; swap these
// prompts for their actual picks once given, don't keep iterating blind.
export const CANVAS_SOUND_EFFECTS: Record<CanvasSoundEvent, { prompt: string; durationSeconds: number }> = {
  entrance: { prompt: "soft quiet pop, gentle, brief, low volume", durationSeconds: 0.6 },
  move: { prompt: "gentle soft glide, muted and smooth, low volume, no swoosh or wind noise", durationSeconds: 0.5 },
  zoom: { prompt: "short low riser, camera push in", durationSeconds: 0.5 },
  click: { prompt: "single crisp mechanical click, like a keyboard key press, short and dry, no pop, no whoosh, no reverb", durationSeconds: 0.5 },
  // Icon/card "this is what's being talked about right now" emphasis —
  // distinct from `click` (a real press) so it never implies an interaction
  // that isn't actually happening. New event, no "former" version to revert
  // to — kept deliberately plain/simple rather than elaborately described.
  highlight: { prompt: "soft micro click, very small and quiet, brief", durationSeconds: 0.5 },
  success: { prompt: "short bright confirmation chime, two ascending notes, success ding", durationSeconds: 0.6 },
  alert: { prompt: "short low warning blip, subtle and brief, not alarming", durationSeconds: 0.5 },
  // "two quick soft keyboard taps" kept generating a TYPEWRITER — the metallic
  // strike-and-return with a carriage bell, reported directly. The exclusions
  // matter more than the description here: sound models reach for a typewriter
  // whenever they see "typing", so the modern laptop keyboard has to be named
  // and the typewriter ruled out explicitly.
  typing: {
    prompt:
      "soft rapid key presses on a modern laptop keyboard, quiet muted plastic clicks, close and dry, " +
      "no typewriter, no carriage return, no bell, no ding, no metallic ring, no mechanical clatter, no reverb",
    durationSeconds: 0.5,
  },
};

export function getCanvasSoundCue(event: CanvasSoundEvent): { prompt: string; durationSeconds: number } {
  return CANVAS_SOUND_EFFECTS[event];
}
