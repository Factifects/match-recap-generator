import { describe, expect, it } from "vitest";
import { COLORS, LIGHT_FILL_THRESHOLD, colorForCharacter, labelColorOnFill } from "./theme";

describe("colorForCharacter", () => {
  it("returns a valid hex color for any name", () => {
    const color = colorForCharacter("Player1");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("is deterministic — the same name always gets the same color", () => {
    const a = colorForCharacter("Player1");
    const b = colorForCharacter("Player1");
    expect(a).toBe(b);
  });

  it("gives different names a reasonable chance of different colors", () => {
    // Hash collisions across the small palette are expected and fine — this just
    // confirms it's not always returning the same single color.
    const a = colorForCharacter("Player1");
    const b = colorForCharacter("Villain");
    expect(a).not.toBe(b);
  });
});

// Regression cover for a bug a render exposed: Canvas rectangles assumed a
// bright fill and hard-coded dark text, so a DARK filled rect rendered
// near-black text on near-black and vanished. The root cause was assuming
// contrast from an object's type instead of reading it from its color, so the
// rule is tested here as a shared function rather than re-checked per caller.
describe("labelColorOnFill", () => {
  it("uses dark text on a light fill", () => {
    expect(labelColorOnFill("#ffffff")).toBe(COLORS.textOnLight);
    expect(labelColorOnFill("#f5f5f5")).toBe(COLORS.textOnLight);
  });

  it("uses light text on a dark fill — the case that regressed", () => {
    // #0f172a is the exact slate the generated battery scene used for its
    // electrolyte container, which rendered an invisible label.
    expect(labelColorOnFill("#0f172a")).toBe(COLORS.text);
    expect(labelColorOnFill("#000000")).toBe(COLORS.text);
  });

  it("gives the tie to light text on a mid fill", () => {
    // White-on-mid is comfortable; dark-on-mid is not. The threshold sits
    // above the midpoint deliberately, so assert the asymmetry rather than
    // the constant's value.
    expect(LIGHT_FILL_THRESHOLD).toBeGreaterThan(0.4);
    expect(labelColorOnFill("#808080")).toBe(COLORS.text);
  });

  it("falls back to light text when no fill is known", () => {
    expect(labelColorOnFill(undefined)).toBe(COLORS.text);
  });

  it("never returns the same color for a fill and its inverse", () => {
    expect(labelColorOnFill("#ffffff")).not.toBe(labelColorOnFill("#000000"));
  });
});
