import { CANVAS_ANCHOR_POSITIONS } from "../model/visualDefinitions";
import type { CanvasData } from "./sharedVisualProps";

// Shared, pure (no React/Remotion import) position/footprint logic for the
// Canvas scene type — used by BOTH the renderer (Canvas.tsx) and the
// script-layer overlap lint (validateGeometry.ts), so there's exactly one
// implementation of "where does this object actually sit" instead of two
// copies that can drift apart. Kept a plain .ts file, same convention as
// motion.ts/theme.ts/camera.ts, so script/ (no React at all) can import it
// the same way it already imports ../video/formations.ts.

type CanvasObjectT = CanvasData["objects"][number];

/** Resolves an object's position from its authored `anchor` (looked up in
 * CANVAS_ANCHOR_POSITIONS) or its own explicit `x`/`y` — explicit numbers
 * win if somehow both are given, matching the schema's own documented
 * "specific beats general" precedence. The schema's own `.refine()`
 * guarantees at least one is present, so this never has to guess. */
export function resolveObjectPosition(object: CanvasObjectT): { x: number; y: number } {
  if (object.x !== undefined && object.y !== undefined) return { x: object.x, y: object.y };
  if (object.anchor) return CANVAS_ANCHOR_POSITIONS[object.anchor];
  // Unreachable given the schema's refine, but keeps this function total
  // (a caller working from unvalidated/hand-built data, e.g. a test) rather
  // than throwing.
  return { x: 50, y: 50 };
}

// Calibrated against Canvas.tsx's own AVG_CHAR_WIDTH_RATIO (0.72) at its
// typical ~36px bold label size on the 1400px-wide landscape default —
// (36 * 0.72) / 1400 ≈ 1.85% of canvas width per character. Intentionally
// approximate: this file has no access to the actual render width/
// orientation a script will end up using (that's resolved much later, at
// render time), so this is calibrated for "catch an obvious overlap," not
// pixel-perfect measurement — the renderer's own fitText is still the real
// per-frame guarantee against overflow.
const LABEL_CHAR_WIDTH_PERCENT = 1.85;
const LABEL_HEIGHT_PERCENT = 4;
const DOT_FOOTPRINT_PERCENT = 3.5;

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function labelBoxBelow(centerX: number, bottomY: number, label: string | undefined): BoundingBox | null {
  if (!label) return null;
  const halfWidth = (label.length * LABEL_CHAR_WIDTH_PERCENT) / 2;
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minY: bottomY,
    maxY: bottomY + LABEL_HEIGHT_PERCENT,
  };
}

function union(a: BoundingBox, b: BoundingBox | null): BoundingBox {
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) };
}

/** Approximate footprint (percent-of-canvas units, same space x/y/radius/
 * width/height are already authored in) for every Canvas object type —
 * used to flag likely overlaps before render, not to guarantee pixel-exact
 * bounds. `x`/`y` should already be resolved (see resolveObjectPosition). */
export function estimateObjectBoundingBox(object: CanvasObjectT, x: number, y: number): BoundingBox {
  switch (object.type) {
    case "circle":
    case "icon":
    case "lottie":
    case "gif": {
      const r = object.radius ?? DOT_FOOTPRINT_PERCENT;
      const core = { minX: x - r, maxX: x + r, minY: y - r, maxY: y + r };
      return union(core, labelBoxBelow(x, y + r, object.label));
    }
    case "dot": {
      const r = DOT_FOOTPRINT_PERCENT / 2;
      const core = { minX: x - r, maxX: x + r, minY: y - r, maxY: y + r };
      return union(core, labelBoxBelow(x, y + r, object.label));
    }
    case "rectangle":
    case "roundedRectangle":
    case "ellipse": {
      const halfW = (object.width ?? DOT_FOOTPRINT_PERCENT * 2) / 2;
      const halfH = (object.height ?? DOT_FOOTPRINT_PERCENT * 2) / 2;
      return { minX: x - halfW, maxX: x + halfW, minY: y - halfH, maxY: y + halfH };
    }
    case "line": {
      // Axis-aligned approximation of a rotated segment — a known
      // simplification (a true rotated bbox needs the actual angle math),
      // acceptable for a lint that's flagging likely overlaps rather than
      // asserting exact geometry.
      const length = object.width ?? DOT_FOOTPRINT_PERCENT * 2;
      return { minX: x - length / 2, maxX: x + length / 2, minY: y - 1, maxY: y + 1 };
    }
    case "polygon": {
      const offsets = object.points ?? [];
      if (offsets.length === 0) {
        const r = DOT_FOOTPRINT_PERCENT;
        return { minX: x - r, maxX: x + r, minY: y - r, maxY: y + r };
      }
      const xs = offsets.map((p) => x + p.x);
      const ys = offsets.map((p) => y + p.y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    case "label":
    default: {
      const box = labelBoxBelow(x, y - LABEL_HEIGHT_PERCENT / 2, object.label ?? "");
      return box ?? { minX: x, maxX: x, minY: y, maxY: y };
    }
  }
}

/** True when two boxes overlap by more than a small tolerance (percent
 * units) — a hairline touch isn't worth flagging, a real overlap is. */
export function boxesOverlap(a: BoundingBox, b: BoundingBox, tolerance = 0.5): boolean {
  return a.minX < b.maxX - tolerance && a.maxX > b.minX + tolerance && a.minY < b.maxY - tolerance && a.maxY > b.minY + tolerance;
}
