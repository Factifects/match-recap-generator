// Resolves every `brand` named by a diagram node to a real, locally cached
// brand mark — the generation-time step that turns `brand: "redis"` into an
// actual Redis logo on screen.
//
// Sits alongside resolveSegmentAudio in the pipeline for the same reason: it is
// the one place in generation that touches the network, so it happens once, up
// front, with its results written to disk. See brandRegistry.ts for why this
// must not happen at render time.
//
// Degrades rather than fails. A brand that can't be fetched — offline, unknown
// slug, timeout — simply keeps no `logoPath`, and the renderer draws that
// node's `shape` glyph instead. The diagram still reads; it just shows a
// cylinder where the Postgres elephant would have been.

import type { TimedSegment } from "../model/Segment";
import { resolveBrandAssets, normalizeSlug, normalizeIconifyName, type BrandAsset } from "../assets/brandRegistry";
import { resolveQrAssets, type QrErrorCorrection } from "../assets/qrRegistry";

// `visual` only exists on the "statement" arm of the TimedSegment union.
type StatementSegment = Extract<TimedSegment, { type: "statement" }>;
type DiagramVisual = Extract<NonNullable<StatementSegment["visual"]>, { kind: "diagram" }>;
type DiagramNode = DiagramVisual["nodes"][number];

/** Walks a node and its (up to two levels of) children. */
function eachNode(nodes: readonly DiagramNode[], visit: (node: { brand?: string; logoPath?: string; logoHex?: string; logoMonochrome?: boolean }) => void): void {
  for (const node of nodes) {
    visit(node);
    const children = (node as { children?: { brand?: string; logoPath?: string; logoHex?: string; logoMonochrome?: boolean; children?: unknown[] }[] }).children;
    if (!children) continue;
    for (const child of children) {
      visit(child);
      const grandchildren = (child as { children?: { brand?: string; logoPath?: string; logoHex?: string; logoMonochrome?: boolean }[] }).children;
      if (grandchildren) for (const grandchild of grandchildren) visit(grandchild);
    }
  }
}

/** Every real QR code a script asks for, fetched and written back onto the
 * objects that declared them — the same generation-time, cache-to-disk contract
 * as brand marks and mascot faces, for the same reason: a render must never
 * depend on a network round trip. */
export async function resolveStageQrCodes(
  segments: TimedSegment[],
): Promise<{ segments: TimedSegment[]; resolved: number; unresolved: string[] }> {
  const wanted: { data: string; correction: QrErrorCorrection }[] = [];
  for (const segment of segments) {
    if (segment.type !== "statement" || segment.visual?.kind !== "stage") continue;
    for (const object of segment.visual.objects) {
      if (object.qr) wanted.push({ data: object.qr.data, correction: (object.qr.correction ?? "H") as QrErrorCorrection });
    }
  }
  if (wanted.length === 0) return { segments, resolved: 0, unresolved: [] };

  const { resolved, unresolved } = await resolveQrAssets(wanted);
  const next = segments.map((segment) => {
    if (segment.type !== "statement" || segment.visual?.kind !== "stage") return segment;
    const objects = segment.visual.objects.map((object) => {
      if (!object.qr) return object;
      const correction = object.qr.correction ?? "H";
      const asset = resolved.find((a) => a.data === object.qr!.data && a.correction === correction);
      return asset ? { ...object, qrPath: asset.staticPath } : object;
    });
    return { ...segment, visual: { ...segment.visual, objects } };
  });
  return { segments: next, resolved: resolved.length, unresolved };
}

/** Expressions a stage scene's mascot uses, so the generator can fetch them
 * once before rendering. */
export function mascotExpressionsIn(segments: TimedSegment[]): string[] {
  const used: string[] = [];
  for (const segment of segments) {
    if (segment.type !== "statement" || segment.visual?.kind !== "stage") continue;
    const mascot = segment.visual.mascot;
    if (!mascot) continue;
    used.push(mascot.expression ?? "puzzled");
    for (const action of segment.visual.timeline ?? []) {
      if (action.type === "react") used.push(action.to);
    }
  }
  return [...new Set(used)];
}

export interface DiagramBrandResult {
  segments: TimedSegment[];
  resolved: BrandAsset[];
  unresolved: string[];
}

export async function resolveDiagramBrands(segments: TimedSegment[]): Promise<DiagramBrandResult> {
  const wanted: string[] = [];
  for (const segment of segments) {
    if (segment.type !== "statement") continue;
    if (segment.visual?.kind === "diagram") {
      eachNode(segment.visual.nodes, (node) => {
        if (node.brand) wanted.push(node.brand);
      });
    }
    // The `stage` medium resolves brands through exactly the same registry and
    // cache. Wiring it here rather than building a parallel resolver is the
    // whole point of the registry existing — a second lookup path would drift
    // on provenance and licence tracking.
    if (segment.visual?.kind === "stage") {
      for (const object of segment.visual.objects) if (object.brand) wanted.push(object.brand);
    }
  }
  if (wanted.length === 0) return { segments, resolved: [], unresolved: [] };

  const { resolved, unresolved } = await resolveBrandAssets(wanted);
  // Deep-copies only the segments that actually carry diagram brands, so
  // everything else keeps its identity (cheap, and easy to reason about).
  const next = segments.map((segment) => {
    if (segment.type === "statement" && segment.visual?.kind === "stage") {
      const objects = segment.visual.objects.map((object) => {
        if (!object.brand) return object;
        const asset = resolved.find((a) => a.slug === slugFor(object.brand!));
        if (!asset) return object;
        return { ...object, logoPath: asset.staticPath, logoHex: asset.hex, logoMonochrome: asset.monochrome };
      });
      return { ...segment, visual: { ...segment.visual, objects } };
    }
    if (segment.type !== "statement" || segment.visual?.kind !== "diagram") return segment;
    const nodes = JSON.parse(JSON.stringify(segment.visual.nodes)) as DiagramNode[];
    let touched = false;
    eachNode(nodes, (node) => {
      if (!node.brand) return;
      const asset = resolved.find((a) => a.slug === slugFor(node.brand!));
      if (asset) {
        node.logoPath = asset.staticPath;
        node.logoHex = asset.hex;
        node.logoMonochrome = asset.monochrome;
        touched = true;
      }
    });
    if (!touched) return segment;
    return { ...segment, visual: { ...segment.visual, nodes } };
  });

  return { segments: next, resolved, unresolved };
}

/** Mirrors the registry's own cache-key rule, including the set prefix, so a
 * pinned `carbon:datastore` matches the asset the registry stored. */
function slugFor(name: string): string {
  const match = /^([a-z0-9-]+):(.+)$/i.exec(name.trim());
  if (match) return `${match[1].toLowerCase()}-${normalizeIconifyName(match[2])}`;
  return normalizeSlug(name);
}
