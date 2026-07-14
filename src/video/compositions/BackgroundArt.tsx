import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { fadeIn } from "../motion";
import type { Orientation } from "../theme";

const FEATURED_WIDTH = 620;
// 620px is 32% of the 1920px landscape frame — the same proportion at 1080px
// portrait width would be ~350px, too narrow to register as a real portrait.
// Sized a bit more generously instead (~41% of 1080) since a narrower frame
// still needs the image to read as substantial, at the cost of leaving less
// width for whatever text sits beside it.
const FEATURED_WIDTH_PORTRAIT = 440;

/** How long BackgroundArt's own entrance takes (frames, at 30fps) — exported
 * so a card can delay its own headline/caption until after a "featured"
 * image has visibly landed, instead of both fading in at once. Only worth
 * respecting for "featured" — at "faded" opacity the sequencing is
 * imperceptible anyway. */
export const FEATURED_ENTRANCE_FRAMES = 20;

/** Two very different jobs share this component, picked via `mode`:
 * - "faded" (default): cinematic set-dressing behind a scene's main content —
 *   low opacity, desaturated, sized by the source image's own aspect ratio
 *   (width: auto, positioned via the parent's flex alignment plus a further
 *   translateX push off toward the edge) since at ~10% opacity it never
 *   competes with anything on top of it regardless of exactly how wide it
 *   renders. Unchanged from before "featured" existed.
 * - "featured": the image IS the point of the scene (a manager/player the
 *   narration is specifically about) — full color, near-full opacity. This
 *   needs a FIXED width panel rather than width: auto — a wide-aspect source
 *   photo at this opacity and size would otherwise bleed toward the center
 *   and sit directly under a card's centered headline/caption text
 *   (confirmed via a still render: a real portrait photo at width:auto
 *   stretched most of the way across the frame and made a headline
 *   unreadable). A fixed width means the photo always occupies a bounded
 *   strip, no matter its own aspect ratio — flush against an edge for
 *   "left"/"right", or centered for "center" (a caller using "center" is
 *   responsible for moving its own text out of the way, e.g. below the
 *   image — see IconInfographicCard/SingleStatCard's `stackedLayout`).
 * Renders nothing when no path is given (every caller resolves this from
 * src/video/assets.ts, which only ever returns a path when a real file
 * exists — never a placeholder).
 *
 * `heightPercent` (faded only) lets a scene size the art beyond the mode's
 * own default — always anchored to the top (objectPosition "top") rather
 * than centered, so a taller crop only ever eats into the legs/feet, never
 * the head, no matter how large it's scaled.
 *
 * `opacityOverride` (0-1) replaces the mode's own default (0.1 faded / 0.96
 * featured) — for a photo that should read as more than pure set-dressing
 * but isn't a full "featured" reference shot either (e.g. a real photo at
 * ~60% opacity behind stat text, splitting the difference). */
export const BackgroundArt: React.FC<{
  src?: string;
  side?: "left" | "right" | "center";
  heightPercent?: number;
  mode?: "faded" | "featured";
  orientation?: Orientation;
  opacityOverride?: number;
}> = ({ src, side = "right", heightPercent, mode = "faded", orientation = "landscape", opacityOverride }) => {
  const frame = useCurrentFrame();
  const featured = mode === "featured";
  const featuredWidth = orientation === "portrait" ? FEATURED_WIDTH_PORTRAIT : FEATURED_WIDTH;
  // Faded stays low and slightly desaturated on purpose — it's set-dressing,
  // not a second focal point. Featured goes almost fully opaque and full
  // color, since the whole point is that this scene IS about this person.
  const baseOpacity = opacityOverride ?? (featured ? 0.96 : 0.1);
  const opacity = fadeIn(frame, 0, FEATURED_ENTRANCE_FRAMES) * baseOpacity;

  if (!src) return null;

  if (featured) {
    // "center" is a fundamentally different layout from "left"/"right", not
    // just a horizontal-position variant — it has no edge to stay flush
    // against, so it gets a real flexbox-centered box sized generously (72%
    // width, 66% height — the ~30% left under that is stackedLayout's own
    // text band) instead of the narrow fixed-width panel below. A still
    // render of the first version of this (440px wide, top-anchored) showed
    // exactly the failure mode you'd expect from those two choices combined:
    // a "contain"-fit photo has no reason to fill a box that narrow, so it
    // rendered tiny and stranded at the top with dead space under it.
    if (side === "center") {
      return (
        <AbsoluteFill style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Img
            src={staticFile(src)}
            style={{ width: "92%", height: "66%", opacity, objectFit: "contain", objectPosition: "center" }}
          />
        </AbsoluteFill>
      );
    }

    // "left"/"right" stay a fixed-width edge panel, full height, flush
    // against that edge — the bounded strip that keeps a wide source photo
    // from bleeding toward the center text (see the mode docstring above).
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            top: 0,
            [side === "right" ? "right" : "left"]: 0,
            width: featuredWidth,
            height: "100%",
            opacity,
            objectFit: "contain",
            objectPosition: "top",
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", justifyContent: side === "left" ? "flex-start" : "flex-end" }}>
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          top: 0,
          height: `${heightPercent ?? 135}%`,
          width: "auto",
          opacity,
          objectFit: "cover",
          objectPosition: "top",
          filter: "grayscale(45%)",
          transform: side === "left" ? "translateX(-18%)" : "translateX(18%)",
        }}
      />
    </AbsoluteFill>
  );
};
