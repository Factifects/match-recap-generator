import { describe, expect, it } from "vitest";
import {
  blendLayouts,
  contentBounds,
  defaultSafeArea,
  layoutStage,
  pointOnStageEdge,
  resolveCamera,
  routeStageEdges,
  STAGE_REGIONS,
  type StageEdgeInput,
  type StageObjectInput,
} from "./stageLayout";

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

function objectsFor(regions: StageObjectInput["at"][]): StageObjectInput[] {
  return regions.map((at, i) => ({ id: `n${i}`, kind: "service" as const, label: `Node ${i}`, at }));
}

/** Boxes are CENTRE-anchored, so "inside the safe area" means the whole
 * silhouette, not just its centre — the exact distinction that let
 * hand-authored Canvas rectangles run half off-canvas. */
function isInside(box: { x: number; y: number; width: number; height: number }, safe: ReturnType<typeof defaultSafeArea>): boolean {
  const slack = 0.5; // sub-pixel float tolerance
  return (
    box.x - box.width / 2 >= safe.x - slack &&
    box.x + box.width / 2 <= safe.x + safe.width + slack &&
    box.y - box.height / 2 >= safe.y - slack &&
    box.y + box.height / 2 <= safe.y + safe.height + slack
  );
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  const slack = 0.5;
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 - slack && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - slack;
}

describe("layoutStage", () => {
  it("keeps every box fully inside the safe area, in both orientations", () => {
    for (const frame of [PORTRAIT, LANDSCAPE]) {
      const safe = defaultSafeArea(frame);
      const layout = layoutStage(objectsFor(STAGE_REGIONS), [], {}, { frame });
      for (const box of layout.boxes) {
        expect(isInside(box, safe), `${box.id} escaped the safe area in ${frame.width}x${frame.height}`).toBe(true);
      }
    }
  });

  it("never overlaps two visible boxes, even when every object is dumped in one region", () => {
    const objects = objectsFor(new Array(6).fill("center"));
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    for (let i = 0; i < layout.boxes.length; i++) {
      for (let j = i + 1; j < layout.boxes.length; j++) {
        expect(overlaps(layout.boxes[i], layout.boxes[j]), `${layout.boxes[i].id} overlaps ${layout.boxes[j].id}`).toBe(false);
      }
    }
  });

  it("keeps a lead object clear of everything even at 1.5x scale", () => {
    const objects: StageObjectInput[] = [
      { id: "browser", kind: "browser", label: "Browser", at: "top" },
      { id: "api", kind: "server", label: "API Server", at: "center", emphasis: "lead" },
      { id: "db", kind: "database", label: "Database", at: "bottom" },
    ];
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const safe = defaultSafeArea(PORTRAIT);
    for (const box of layout.boxes) expect(isInside(box, safe)).toBe(true);
    for (let i = 0; i < layout.boxes.length; i++) {
      for (let j = i + 1; j < layout.boxes.length; j++) {
        expect(overlaps(layout.boxes[i], layout.boxes[j])).toBe(false);
      }
    }
  });

  it("keeps a real-world silhouette's proportions no matter how long its label is", () => {
    // The bug this guards: growing a phone until "Their phone" fitted inside it
    // turned the phone into a wide rectangle, and every kind converged on the
    // same rectangle as labels got longer.
    const shortLabel = layoutStage([{ id: "a", kind: "phone", label: "Me", at: "center" }], [], {}, { frame: PORTRAIT });
    const longLabel = layoutStage([{ id: "a", kind: "phone", label: "Their phone over here", at: "center" }], [], {}, { frame: PORTRAIT });
    const ratio = (b: { width: number; height: number }) => b.width / b.height;
    expect(ratio(longLabel.boxes[0])).toBeCloseTo(ratio(shortLabel.boxes[0]), 5);
    expect(longLabel.boxes[0].captionBelow).toBe(true);
  });

  it("separates two objects by their caption footprint, not just their silhouettes", () => {
    const layout = layoutStage(
      [
        { id: "a", kind: "phone", label: "Their phone", at: "left" },
        { id: "b", kind: "phone", label: "Your phone", at: "right" },
      ],
      [],
      {},
      { frame: PORTRAIT },
    );
    const [a, b] = layout.boxes;
    const gap = Math.abs(a.x - b.x);
    expect(gap).toBeGreaterThan((Math.max(a.width, a.captionWidth) + Math.max(b.width, b.captionWidth)) / 2);
  });

  it("still grows a card kind to fit its own text", () => {
    const short = layoutStage([{ id: "a", kind: "service", label: "API", at: "center" }], [], {}, { frame: PORTRAIT });
    const long = layoutStage(
      [{ id: "a", kind: "service", label: "Authentication Gateway Service", at: "center" }],
      [],
      {},
      { frame: PORTRAIT },
    );
    expect(long.boxes[0].width).toBeGreaterThan(short.boxes[0].width);
  });

  it("is a pure function of its inputs", () => {
    const objects = objectsFor(["top-left", "center", "bottom-right"]);
    const a = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const b = layoutStage(objects, [], {}, { frame: PORTRAIT });
    expect(a.boxes.map((n) => [n.x, n.y, n.width, n.height])).toEqual(b.boxes.map((n) => [n.x, n.y, n.width, n.height]));
  });

  it("moves an object when a composition places it elsewhere", () => {
    const objects = objectsFor(["top-left", "bottom-right"]);
    const home = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const moved = layoutStage(objects, [], { place: { n0: "bottom-right" }, emphasis: { n0: "lead" } }, { frame: PORTRAIT });
    expect(moved.boxes[0].y).toBeGreaterThan(home.boxes[0].y);
    expect(moved.boxes[0].width).toBeGreaterThan(home.boxes[0].width);
  });

  it("does not let a hidden object push a visible one around", () => {
    const objects = objectsFor(["center", "center", "center"]);
    const all = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const some = layoutStage(objects, [], { hidden: ["n1", "n2"] }, { frame: PORTRAIT });
    const safe = defaultSafeArea(PORTRAIT);
    // With its two neighbours hidden, the surviving object should sit on the
    // region anchor rather than displaced by objects the viewer cannot see.
    expect(Math.abs(some.boxes[0].y - (safe.y + safe.height * 0.5))).toBeLessThan(1);
    expect(Math.abs(all.boxes[0].y - (safe.y + safe.height * 0.5))).toBeGreaterThan(1);
  });
});

describe("routeStageEdges", () => {
  const objects: StageObjectInput[] = [
    { id: "a", kind: "client", label: "Client", at: "top" },
    { id: "b", kind: "server", label: "Server", at: "bottom" },
  ];

  it("anchors both endpoints on the box boundary, never at its centre", () => {
    const edges: StageEdgeInput[] = [{ from: "a", to: "b" }];
    const layout = layoutStage(objects, edges, {}, { frame: PORTRAIT });
    const [edge] = layout.edges;
    const a = layout.boxes.find((n) => n.id === "a")!;
    const b = layout.boxes.find((n) => n.id === "b")!;
    // Endpoint sits on the silhouette: not inside the box, and not far outside.
    expect(Math.abs(edge.points[0].y - a.y)).toBeGreaterThan(a.height / 2 - 1);
    expect(Math.abs(edge.points[1].y - b.y)).toBeGreaterThan(b.height / 2 - 1);
  });

  it("fans N connectors between the same pair into N distinct lines", () => {
    const edges: StageEdgeInput[] = [
      { from: "a", to: "b", kind: "request" },
      { from: "a", to: "b", kind: "response" },
      { from: "a", to: "b", kind: "data" },
    ];
    const layout = layoutStage(objects, edges, {}, { frame: PORTRAIT });
    const startXs = layout.edges.map((e) => e.points[0].x);
    expect(new Set(startXs.map((x) => Math.round(x))).size).toBe(3);
  });

  it("drops an edge naming an object that does not exist rather than throwing", () => {
    const layout = layoutStage(objects, [{ from: "a", to: "ghost" }], {}, { frame: PORTRAIT });
    expect(layout.edges).toHaveLength(0);
  });
});

describe("pointOnStageEdge", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    const [edge] = routeStageEdges(
      [
        { id: "a", kind: "client", accent: "neutral", emphasis: "normal", replicas: 1, isContainer: false, captionBelow: false, captionHeight: 0, captionWidth: 0, hidden: false, x: 100, y: 100, width: 50, height: 50 },
        { id: "b", kind: "server", accent: "neutral", emphasis: "normal", replicas: 1, isContainer: false, captionBelow: false, captionHeight: 0, captionWidth: 0, hidden: false, x: 400, y: 100, width: 50, height: 50 },
      ],
      [{ from: "a", to: "b" }],
      1080,
    );
    expect(pointOnStageEdge(edge, 0)).toEqual(edge.points[0]);
    expect(pointOnStageEdge(edge, 1)).toEqual(edge.points[1]);
    expect(pointOnStageEdge(edge, 0.5).x).toBeCloseTo((edge.points[0].x + edge.points[1].x) / 2, 5);
  });
});

describe("blendLayouts", () => {
  const objects: StageObjectInput[] = [
    { id: "a", kind: "browser", label: "Browser", at: "top" },
    { id: "b", kind: "server", label: "Server", at: "center" },
  ];
  const edges: StageEdgeInput[] = [{ from: "a", to: "b" }];

  it("reproduces each end exactly at t=0 and t=1", () => {
    const from = layoutStage(objects, edges, {}, { frame: PORTRAIT });
    const to = layoutStage(objects, edges, { place: { a: "bottom-left" }, emphasis: { b: "lead" } }, { frame: PORTRAIT });
    const at0 = blendLayouts(from, to, 0, edges, 1080);
    const at1 = blendLayouts(from, to, 1, edges, 1080);
    expect(at0.boxes.map((b) => [b.x, b.y])).toEqual(from.boxes.map((b) => [b.x, b.y]));
    expect(at1.boxes.map((b) => [b.x, b.y])).toEqual(to.boxes.map((b) => [b.x, b.y]));
  });

  it("re-routes connectors from the tweened boxes so they stay glued mid-move", () => {
    const from = layoutStage(objects, edges, {}, { frame: PORTRAIT });
    const to = layoutStage(objects, edges, { place: { a: "bottom-left", b: "top-right" } }, { frame: PORTRAIT });
    const mid = blendLayouts(from, to, 0.5, edges, 1080);
    const a = mid.boxes.find((b) => b.id === "a")!;
    const [edge] = mid.edges;
    // The connector's start must lie on the half-way box, not on either end's.
    const dx = Math.abs(edge.points[0].x - a.x);
    const dy = Math.abs(edge.points[0].y - a.y);
    expect(dx <= a.width / 2 + 1 && dy <= a.height / 2 + 1).toBe(true);
  });

  it("keeps an object visible for the whole move when it is present at either end", () => {
    const from = layoutStage(objects, edges, { hidden: ["a"] }, { frame: PORTRAIT });
    const to = layoutStage(objects, edges, {}, { frame: PORTRAIT });
    expect(blendLayouts(from, to, 0.5, edges, 1080).boxes.find((b) => b.id === "a")!.hidden).toBe(false);
  });
});

// Regression tests for two bugs caught by rendering the CORS proof Short and
// looking at real frames, rather than by any schema check passing.

describe("filling the frame (regression: composition stranded mid-frame)", () => {
  it("fills most of the safe area even when every object sits in the middle band", () => {
    // The exact shape that failed: nothing placed in a top region, so the top
    // 45% of a 9:16 frame rendered as dead black.
    const objects: StageObjectInput[] = [
      { id: "postman", kind: "client", label: "Postman", at: "left" },
      { id: "chrome", kind: "browser", label: "Chrome", at: "bottom-left" },
      { id: "api", kind: "server", label: "API", at: "right" },
    ];
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const safe = defaultSafeArea(PORTRAIT);
    const bounds = contentBounds(layout.boxes)!;
    const usedH = (bounds.maxY - bounds.minY) / safe.height;
    const usedW = (bounds.maxX - bounds.minX) / safe.width;
    expect(Math.max(usedW, usedH)).toBeGreaterThan(0.75);
  });

  it("still keeps everything inside the safe area after filling", () => {
    const objects: StageObjectInput[] = [
      { id: "a", kind: "client", label: "Client", at: "left" },
      { id: "b", kind: "server", label: "API", at: "right" },
    ];
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const safe = defaultSafeArea(PORTRAIT);
    for (const box of layout.boxes) expect(isInside(box, safe)).toBe(true);
  });

  it("does not magnify a single sparse object into a giant empty rectangle", () => {
    const one = layoutStage([{ id: "a", kind: "service", label: "API", at: "center" }], [], {}, { frame: PORTRAIT });
    const safe = defaultSafeArea(PORTRAIT);
    expect(one.boxes[0].width).toBeLessThan(safe.width * 0.95);
  });

  it("preserves left-of / above relationships while filling", () => {
    const objects: StageObjectInput[] = [
      { id: "l", kind: "client", label: "L", at: "top-left" },
      { id: "r", kind: "server", label: "R", at: "bottom-right" },
    ];
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const l = layout.boxes.find((b) => b.id === "l")!;
    const r = layout.boxes.find((b) => b.id === "r")!;
    expect(l.x).toBeLessThan(r.x);
    expect(l.y).toBeLessThan(r.y);
  });
});

describe("resolveCamera (regression: zoom cropped live content out of frame)", () => {
  const objects: StageObjectInput[] = [
    { id: "chrome", kind: "browser", label: "Chrome", at: "center", emphasis: "lead" },
    { id: "api", kind: "server", label: "API", at: "right" },
  ];

  it("caps a requested zoom so no visible object is pushed out of shot", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const chrome = layout.boxes.find((b) => b.id === "chrome")!;
    const camera = resolveCamera(layout.boxes, { x: chrome.x, y: chrome.y }, 1.3, PORTRAIT);
    const bounds = contentBounds(layout.boxes)!;

    // Project every corner of the content through the resolved camera; nothing
    // may land outside the frame.
    const project = (x: number, y: number) => ({
      x: PORTRAIT.width / 2 + (x - camera.x) * camera.zoom,
      y: PORTRAIT.height / 2 + (y - camera.y) * camera.zoom,
    });
    for (const [x, y] of [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.minX, bounds.maxY],
      [bounds.maxX, bounds.maxY],
    ]) {
      const p = project(x, y);
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(PORTRAIT.width + 1);
      expect(p.y).toBeGreaterThanOrEqual(-1);
      expect(p.y).toBeLessThanOrEqual(PORTRAIT.height + 1);
    }
  });

  it("allows a genuine push-in once the stage has been cleared", () => {
    const crowded = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const cleared = layoutStage(objects, [], { hidden: ["api"] }, { frame: PORTRAIT });
    const focus = cleared.boxes.find((b) => b.id === "chrome")!;
    const crowdedZoom = resolveCamera(crowded.boxes, { x: focus.x, y: focus.y }, 1.6, PORTRAIT).zoom;
    const clearedZoom = resolveCamera(cleared.boxes, { x: focus.x, y: focus.y }, 1.6, PORTRAIT).zoom;
    expect(clearedZoom).toBeGreaterThan(crowdedZoom);
  });

  it("never zooms below 1 just because the stage is full", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    expect(resolveCamera(layout.boxes, { x: 540, y: 960 }, 1, PORTRAIT).zoom).toBeGreaterThanOrEqual(1);
  });
});

describe("containment (regions holding services)", () => {
  const objects: StageObjectInput[] = [
    { id: "region", kind: "region", label: "us-east-1", at: "center" },
    { id: "svc1", kind: "service", label: "Playback", at: "center", parent: "region" },
    { id: "svc2", kind: "service", label: "Search", at: "center", parent: "region" },
    { id: "client", kind: "tv", label: "TV", at: "top" },
  ];

  it("sizes a region from its children and keeps every child inside it", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const region = layout.boxes.find((b) => b.id === "region")!;
    for (const id of ["svc1", "svc2"]) {
      const kid = layout.boxes.find((b) => b.id === id)!;
      expect(kid.x - kid.width / 2).toBeGreaterThanOrEqual(region.x - region.width / 2 - 0.5);
      expect(kid.x + kid.width / 2).toBeLessThanOrEqual(region.x + region.width / 2 + 0.5);
      expect(kid.y - kid.height / 2).toBeGreaterThanOrEqual(region.y - region.height / 2 - 0.5);
      expect(kid.y + kid.height / 2).toBeLessThanOrEqual(region.y + region.height / 2 + 0.5);
    }
  });

  it("does not let children collide with each other inside the region", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const a = layout.boxes.find((b) => b.id === "svc1")!;
    const b = layout.boxes.find((b) => b.id === "svc2")!;
    expect(overlaps(a, b)).toBe(false);
  });

  it("keeps a child clear of the region's own header label", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const region = layout.boxes.find((b) => b.id === "region")!;
    const kid = layout.boxes.find((b) => b.id === "svc1")!;
    expect(kid.y - kid.height / 2).toBeGreaterThan(region.y - region.height / 2);
  });

  it("still places non-nested objects in their own regions", () => {
    const layout = layoutStage(objects, [], {}, { frame: PORTRAIT });
    const tv = layout.boxes.find((b) => b.id === "client")!;
    const region = layout.boxes.find((b) => b.id === "region")!;
    expect(tv.y).toBeLessThan(region.y);
  });

  it("marks a region as a container and carries replicas through", () => {
    const layout = layoutStage(
      [{ id: "fleet", kind: "service", label: "Playback", at: "center", replicas: 6 }],
      [],
      {},
      { frame: PORTRAIT },
    );
    expect(layout.boxes[0].replicas).toBe(6);
    expect(layout.boxes[0].isContainer).toBe(false);
  });
});
