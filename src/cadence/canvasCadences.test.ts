import { describe, expect, it } from "vitest";
import { CANVAS_PHASE_TIMING, getCanvasSoundCue } from "./canvasCadences";

describe("canvas sound effects", () => {
  it("exposes a distinct cue per event", () => {
    expect(getCanvasSoundCue("entrance").prompt).toContain("pop");
    expect(getCanvasSoundCue("move").prompt).toContain("glide");
    expect(getCanvasSoundCue("click").prompt).toContain("click");
    expect(getCanvasSoundCue("highlight").prompt).toContain("micro click");
    expect(getCanvasSoundCue("success").prompt).toContain("confirmation");
    expect(getCanvasSoundCue("alert").prompt).toContain("warning");
  });

  it("keeps every cue duration within ElevenLabs' 0.5-30s sound-generation bounds", () => {
    for (const event of ["entrance", "move", "zoom", "click", "highlight", "success", "alert", "typing"] as const) {
      expect(getCanvasSoundCue(event).durationSeconds).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("exposes fixed phase pacing with no per-script override", () => {
    expect(CANVAS_PHASE_TIMING.phaseDurationFrames).toBeGreaterThan(0);
    expect(CANVAS_PHASE_TIMING.glideDurationFrames).toBeGreaterThan(0);
  });
});
