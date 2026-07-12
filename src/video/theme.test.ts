import { describe, expect, it } from "vitest";
import { colorForCharacter } from "./theme";

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
