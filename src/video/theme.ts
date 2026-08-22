export const FPS = 30;

/** Derived once in AnalysisVideo.tsx from the actual rendered composition
 * dimensions and passed explicitly to every card, rather than each card
 * independently calling useVideoConfig(). Lives here (not in AnalysisVideo.tsx)
 * so every card can import it without a circular dependency back on the file
 * that imports all of them. */
export type Orientation = "landscape" | "portrait";

// Football Manager-inspired dark analysis palette — modern, minimal, premium,
// no gradients/glossy effects. Pitch/team/movement tokens are for the
// tactical component family (TacticalBoard, Formation, ShotMap, etc).
export const COLORS = {
  background: "#111315",
  panel: "#1a1d20",
  border: "#2a2f33",
  text: "#ffffff",
  textDim: "#b0bec5",
  // Counterpart to `text` for use on a light `PANEL_COLORS.light` panel —
  // white text/drop-shadows (this project's default everywhere else) go
  // illegible on a light background, so anything rendering actual copy
  // switches to this when `backgroundColor === "light"` (see Canvas.tsx's
  // `isLightPanel`). Not a general dark-mode toggle — every other panel
  // color stays on the white-text path unchanged.
  textOnLight: "#14181c",
  accent: "#4f6bff",

  // Dark-grey pitch, not literal grass green (2026-07-22 request) — a flat
  // charcoal fill with a barely-there mow-stripe and solid light-grey line
  // art, reading as a clean tactics-board diagram rather than a broadcast
  // pitch graphic. pitchLines dropped its rgba alpha (was 0.15, nearly
  // invisible) for a real opaque grey; callers that want it dimmer (e.g.
  // ZoneMapCard's dashed thirds dividers) apply their own `opacity` prop.
  // pitchVoid is a deliberately darker step below `pitch` (not a repeat of
  // `background`, which is a much bigger jump toward black) — for the space
  // around a 3D board's canvas (see TacticalBoard3D.tsx's CSS backdrop) so
  // that surrounding "empty space" reads as a distinct layer behind the
  // pitch rather than the two blending into one flat mass at the same tone.
  pitch: "#2f3034",
  pitchStripe: "#34363b",
  pitchLines: "#7a8290",
  pitchVoid: "#202124",
  homeTeam: "#4da3ff",
  awayTeam: "#ff5a5f",
  ball: "#ffffff",
  movement: "#3ddc97",
  passes: "#f8d24a",
  danger: "#ff5252",
  highlight: "#ffd54f",
};

// Montserrat for both headlines/captions and body/dialogue — one family,
// weight does the differentiating (800/900 for display, 500-700 for body).
// Previously Bebas Neue + Barlow Condensed; switched project-wide per user
// request. Every card imports DISPLAY_FONT_FAMILY/FONT_FAMILY from here
// rather than hardcoding a font, so this one file is the whole swap.
import { loadFont, fontFamily as montserratFontFamily } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppinsFont, fontFamily as poppinsFontFamily } from "@remotion/google-fonts/Poppins";

loadFont("normal", { weights: ["500", "600", "700", "800", "900"] });
loadPoppinsFont("normal", { weights: ["300"] });

export const DISPLAY_FONT_FAMILY = `"${montserratFontFamily}", sans-serif`;
export const FONT_FAMILY = `"${montserratFontFamily}", sans-serif`;

// Scoped exception to the "one family" rule above — for a subtitle/tagline
// moment (e.g. under the Techijest wordmark on the channel intro card) —
// a thin (300) weight reads as intentional editorial contrast against bold
// headline text, where Montserrat 700 (the normal label weight, tuned for
// small-diagram legibility) just reads as another bold caption. Opt in via
// a Canvas label's `fontStyle: "subtitle"`, default path untouched.
export const SUBTITLE_FONT_FAMILY = `"${poppinsFontFamily}", sans-serif`;

// Shared "eyebrow" title style for every card's small header line (e.g.
// "INSIDE CHANNEL", "FIRST-HALF SHOT CLUSTER") — bigger/bolder/brighter than
// the old small textDim label so it reads as a headline, not a caption.
// fontWeight is explicit (Bebas Neue was inherently heavy at any weight;
// Montserrat needs it stated or it renders as a weak regular 400).
export const TITLE_STYLE = {
  fontFamily: DISPLAY_FONT_FAMILY,
  fontWeight: 800,
  fontSize: 54,
  letterSpacing: 2,
  color: COLORS.text,
  textAlign: "center" as const,
  textTransform: "uppercase" as const,
};

// Football Manager-style player tag: a short, tight, uppercase label under a
// small disc — not a full name in a normal-weight font, which is what caused
// the "big blob + big name" look and label overlap when two players sit close
// together. Weight dropped from 700->600 specifically to buy back the size
// increase (16 vs the old 14) without regressing into that same overlap —
// thinner glyphs at a larger size still take up less width than bold glyphs
// did at the smaller one. Verify against a dense player cluster after any
// further change here, same as the tacticalPatterns.ts audit note.
export const PLAYER_LABEL_STYLE = {
  fontFamily: FONT_FAMILY,
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
};

// Bold per-scene backgrounds for a scene that wants to stand out from the
// default neutral panel (Tifo Football-style color-blocking) — kept muted
// enough to hold white text legibly, not literal saturated red/blue/yellow.
// "neutral" is exactly today's COLORS.background, so a scene with no Panel
// Color specified renders byte-for-byte identical to before this existed.
export const PANEL_COLORS = {
  neutral: COLORS.background,
  red: "#3a1f22",
  blue: "#1c2b45",
  yellow: "#3a3320",
  // Light-white-grey, not pure white — for brand/title-card moments (the
  // Techijest intro scene) that want to read as a clean logo card rather
  // than blend into the dark palette used everywhere else. Any scene using
  // this MUST use dark (`COLORS.textOnLight`) text — Canvas.tsx switches
  // automatically based on `backgroundColor === "light"`.
  light: "#f8f3e8",
  // A COOL MACHINE GREY, for subjects that live on a computer rather than on a
  // page — desktops, system monitors, operating-system surfaces. Distinct from
  // `light` on purpose: the ground is the first thing a viewer reads, and two
  // videos about different worlds should not open on the same paper.
  cool: "#eceef2",
};

export type PanelColorKey = keyof typeof PANEL_COLORS;

const CHARACTER_PALETTE = ["#4f6bff", "#e6a24f", "#4dcf94", "#b596ff", "#f2726f", "#38bdf8"];

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Deterministic color per character name, so a script never needs to specify
 * colors explicitly — the same character name always gets the same color. */
export function colorForCharacter(name: string): string {
  return CHARACTER_PALETTE[hashString(name) % CHARACTER_PALETTE.length];
}
