// What colour the square behind a brand mark should be.
//
// A single-shape mark is drawn masked WHITE on a tile filled with the brand's
// own colour, which works right up until the brand's colour is black. Anthropic
// ships #181818, OpenAI and GitHub are effectively #000000, and this project's
// panels are near-black — so the tile vanished into the background and the mark
// floated with no shape behind it, looking broken next to the brands that
// happened to be bright.
//
// The brand colour is kept whenever it can actually be seen, because that is
// what makes a logo recognizable at a glance. It is only swapped for a neutral
// slate when it is too dark to separate from the panel it sits on.

/** Relative luminance, sRGB, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const clean = hex.trim().replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 1;
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Below this, a tile is indistinguishable from the panel behind it. */
const MIN_TILE_LUMINANCE = 0.05;

/** Neutral slate, the same treatment a full-colour mark already gets. */
export const NEUTRAL_TILE = "rgba(148, 163, 184, 0.22)";

/**
 * @param logoHex   the brand's own colour, if the registry resolved one
 * @param monochrome whether the mark is a single shape (masked white) or a
 *                   full-colour asset that carries its own identity
 * @param fallback  the node's accent stroke, used when there is no brand colour
 */
export function brandTileColor(logoHex: string | undefined, monochrome: boolean | undefined, fallback: string): string {
  // A full-colour mark is drawn as-is, so it never wants a brand-coloured tile.
  if (monochrome === false) return NEUTRAL_TILE;
  if (!logoHex) return fallback;
  return luminance(logoHex) < MIN_TILE_LUMINANCE ? NEUTRAL_TILE : logoHex;
}
