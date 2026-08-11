// Plays every Canvas SFX cue in sequence so the palette can be judged by ear
// without rendering a video — see src/cadence/canvasCadences.ts's own header
// comment for why guessing at prompt wording is a dead end (two failed
// rounds already, an explicit "don't keep iterating blind" note). This tool
// exists to make the OTHER lever visible: which cues already have a real
// file in public/assets/sfx/ (used verbatim) versus which are still falling
// back to ElevenLabs generation (the ones worth replacing with a real file).
//
// Usage: npm run sfx:audition [event...]
//   npm run sfx:audition                  # every cue, in palette order
//   npm run sfx:audition entrance move    # just these two

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CANVAS_SOUND_EFFECTS, type CanvasSoundEvent } from "../src/cadence/canvasCadences";
import { generateSoundEffect } from "../src/audio/elevenLabs";
import { findSfxAsset } from "../src/video/assets";

const execFileAsync = promisify(execFile);

async function play(absolutePath: string): Promise<void> {
  // afplay is macOS-only (matches this project's dev environment — see the
  // Environment block in CLAUDE.md/session context). A cross-platform player
  // isn't worth the dependency for a dev-only audition tool.
  await execFileAsync("afplay", [absolutePath]);
}

async function main() {
  const requested = process.argv.slice(2) as CanvasSoundEvent[];
  const events = (requested.length > 0 ? requested : (Object.keys(CANVAS_SOUND_EFFECTS) as CanvasSoundEvent[])).filter((event) => {
    if (CANVAS_SOUND_EFFECTS[event]) return true;
    console.error(`Unknown cue "${event}" — valid cues: ${Object.keys(CANVAS_SOUND_EFFECTS).join(", ")}`);
    return false;
  });

  for (const event of events) {
    const realFile = findSfxAsset(event);
    if (realFile) {
      console.log(`${event.padEnd(10)} [real file: public/${realFile}]`);
      await play(`public/${realFile}`);
      continue;
    }
    const cue = CANVAS_SOUND_EFFECTS[event];
    console.log(`${event.padEnd(10)} [generating from prompt: "${cue.prompt}"]`);
    const asset = await generateSoundEffect(cue.prompt, cue.durationSeconds);
    await play(asset.audioFilePath);
  }

  const missing = events.filter((event) => !findSfxAsset(event));
  if (missing.length > 0) {
    console.log(`\nStill generation-only (no public/assets/sfx/<event>.mp3): ${missing.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("auditionSfx failed:", err);
  process.exit(1);
});
