import { describe, it, expect } from "vitest";
import { brandTileColor, luminance, NEUTRAL_TILE } from "./brandTile";

describe("a brand mark always has a tile you can see", () => {
  it("keeps a bright brand colour, because that is what makes the logo recognizable", () => {
    expect(brandTileColor("#76b900", true, "#5b6b8c")).toBe("#76b900"); // NVIDIA green
    expect(brandTileColor("#FFD21E", true, "#5b6b8c")).toBe("#FFD21E"); // Hugging Face yellow
    expect(brandTileColor("#8E75B2", true, "#5b6b8c")).toBe("#8E75B2"); // Gemini violet
  });

  it("swaps a near-black brand colour for neutral slate, so the tile does not vanish", () => {
    expect(brandTileColor("#181818", true, "#5b6b8c")).toBe(NEUTRAL_TILE); // Anthropic
    expect(brandTileColor("#000000", true, "#5b6b8c")).toBe(NEUTRAL_TILE); // OpenAI / GitHub
  });

  it("puts a full-colour mark on neutral slate whatever its hex says", () => {
    expect(brandTileColor("#0081fb", false, "#5b6b8c")).toBe(NEUTRAL_TILE); // Meta
  });

  it("falls back to the node's accent when no brand colour resolved", () => {
    expect(brandTileColor(undefined, true, "#5b6b8c")).toBe("#5b6b8c");
  });

  it("treats a malformed hex as bright rather than blanking the tile", () => {
    expect(brandTileColor("not-a-colour", true, "#5b6b8c")).toBe("not-a-colour");
  });

  it("orders luminance the way human eyes do", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 3);
    expect(luminance("#000000")).toBeCloseTo(0, 3);
    expect(luminance("#FFD21E")).toBeGreaterThan(luminance("#8E75B2"));
    expect(luminance("#181818")).toBeLessThan(0.05);
  });
});
