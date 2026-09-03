import { describe, it, expect } from "vitest";
import { PUNCH_PRESETS, PUNCH_PRESET_NAMES, resolvePunchStyle, DEFAULT_PUNCH_STYLE } from "./PunchCaptions";

describe("caption presets", () => {
  it("ships the looks the format is actually built around", () => {
    expect(PUNCH_PRESET_NAMES).toEqual(expect.arrayContaining(["tiktok", "hormozi", "clean", "neon"]));
  });

  it("gives every preset a complete style, so none inherits a hole", () => {
    for (const [name, style] of Object.entries(PUNCH_PRESETS)) {
      for (const key of Object.keys(DEFAULT_PUNCH_STYLE)) {
        expect(style[key as keyof typeof style], `${name}.${key}`).toBeDefined();
      }
    }
  });

  it("makes hormozi the loud one and clean the quiet one", () => {
    // The presets have to differ along the axis that actually changes how a
    // caption reads, not just in colour.
    expect(PUNCH_PRESETS.hormozi.treatment).toBe("plate");
    expect(PUNCH_PRESETS.hormozi.uppercase).toBe(true);
    expect(PUNCH_PRESETS.clean.treatment).toBe("none");
    expect(PUNCH_PRESETS.clean.uppercase).toBe(false);
    expect(PUNCH_PRESETS.clean.fontScale).toBeLessThan(PUNCH_PRESETS.hormozi.fontScale);
  });

  it("falls back to the default for an unknown preset name", () => {
    // A typo in a CLI flag must not render an undefined style.
    expect(resolvePunchStyle("nonsense")).toEqual(DEFAULT_PUNCH_STYLE);
  });

  it("lets explicit overrides win over the preset", () => {
    expect(resolvePunchStyle("hormozi", { uppercase: false }).uppercase).toBe(false);
    expect(resolvePunchStyle("hormozi", { uppercase: false }).treatment).toBe("plate");
  });
});
