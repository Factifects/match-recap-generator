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

export interface DiagramBrandResult {
  segments: TimedSegment[];
  resolved: BrandAsset[];
  unresolved: string[];
}

export async function resolveDiagramBrands(segments: TimedSegment[]): Promise<DiagramBrandResult> {
  const wanted: string[] = [];
  for (const segment of segments) {
    if (segment.type !== "statement" || segment.visual?.kind !== "diagram") continue;
    eachNode(segment.visual.nodes, (node) => {
      if (node.brand) wanted.push(node.brand);
    });
  }
  if (wanted.length === 0) return { segments, resolved: [], unresolved: [] };

  const { resolved, unresolved } = await resolveBrandAssets(wanted);
  // Deep-copies only the segments that actually carry diagram brands, so
  // everything else keeps its identity (cheap, and easy to reason about).
  const next = segments.map((segment) => {
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
