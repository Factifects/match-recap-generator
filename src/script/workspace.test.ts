import { describe, it, expect } from "vitest";
import { visualSchema } from "../model/Segment";
import { fitSegmentsToNarration } from "./fitSegmentsToNarration";
import { actionMinSeconds } from "./narrationFit";
import { computeVisualMinDurationSeconds } from "./parseSceneScript";
import type { TimedSegment } from "../model/Segment";

// The `workspace` medium is the code half of the KodeKloud target: a file stays
// on screen while the narrator walks it line by line. These tests pin the two
// properties that make it a MEDIUM rather than another card — that it validates
// as a real visual, and that it is scheduled by the same narration clock as
// every diagram (the standing constraint in CLAUDE.md).

function workspaceVisual(timeline?: unknown[]) {
  return {
    kind: "workspace",
    title: "Reading a Pod spec",
    panes: [
      {
        type: "editor",
        id: "spec",
        filename: "pod.yaml",
        language: "yaml",
        lines: [
          [{ text: "apiVersion: v1", token: "plain" }],
          [{ text: "kind: Pod", token: "keyword" }],
          [{ text: "metadata:", token: "plain" }],
          [{ text: "  name: nginx", token: "string" }],
        ],
      },
      {
        type: "terminal",
        id: "shell",
        lines: [
          { text: "kubectl apply -f pod.yaml", kind: "command" },
          { text: "pod/nginx created", kind: "success" },
        ],
      },
    ],
    timeline,
  };
}

describe("workspace visual schema", () => {
  it("validates a two-pane editor + terminal workspace", () => {
    const result = visualSchema.safeParse(workspaceVisual());
    expect(result.success).toBe(true);
  });

  it("defaults line numbers on for an editor and off for a terminal", () => {
    const parsed = visualSchema.parse(workspaceVisual()) as { panes: { showLineNumbers: boolean }[] };
    expect(parsed.panes[0].showLineNumbers).toBe(true);
    expect(parsed.panes[1].showLineNumbers).toBe(false);
  });

  it("accepts the full timeline vocabulary in absolute seconds", () => {
    const result = visualSchema.safeParse(
      workspaceVisual([
        { type: "reveal", pane: "spec", throughLine: 2, startSeconds: 0.5 },
        { type: "highlight", pane: "spec", lines: [2], startSeconds: 2, durationSeconds: 3 },
        { type: "clear", pane: "spec", startSeconds: 5 },
        { type: "scroll", pane: "spec", toLine: 4, startSeconds: 6, durationSeconds: 1 },
        { type: "focusPane", pane: "shell", startSeconds: 8, durationSeconds: 0.5 },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a pane with no id, since the timeline addresses panes by id", () => {
    const broken = workspaceVisual() as unknown as { panes: { id?: string }[] };
    delete broken.panes[0].id;
    expect(visualSchema.safeParse(broken).success).toBe(false);
  });
});

describe("workspace duration floor", () => {
  it("derives its scene floor from its own timeline, like Canvas does", () => {
    const visual = visualSchema.parse(
      workspaceVisual([{ type: "highlight", pane: "spec", lines: [2], startSeconds: 10, durationSeconds: 4 }]),
    );
    // Without this the estimate-only render would cut the walkthrough short.
    expect(computeVisualMinDurationSeconds(visual)).toBeGreaterThan(14);
  });
});

describe("workspace inherits the narration spine", () => {
  const segment = (): TimedSegment =>
    ({
      type: "statement",
      text: "This is the Pod spec. The kind field tells Kubernetes what to create. Applying it creates the pod.",
      durationSeconds: 30,
      narrationSeconds: 12,
      visualMinDurationSeconds: 30,
      visual: visualSchema.parse(
        workspaceVisual([
          { type: "reveal", pane: "spec", throughLine: 4, startSeconds: 0.5, durationSeconds: 1 },
          { type: "highlight", pane: "spec", lines: [2], startSeconds: 8, durationSeconds: 6 },
          { type: "focusPane", pane: "shell", startSeconds: 22, durationSeconds: 1 },
        ]),
      ),
    }) as unknown as TimedSegment;

  it("re-times a workspace timeline onto real narration, not just Canvas ones", () => {
    const { segments, outcomes } = fitSegmentsToNarration([segment()]);
    expect(outcomes).toHaveLength(1);
    const timeline = (segments[0] as { visual: { timeline: { startSeconds: number; durationSeconds?: number }[] } }).visual.timeline;
    const end = Math.max(...timeline.map((a) => a.startSeconds + (a.durationSeconds ?? 0)));
    // The VISUAL still ends with the narration...
    expect(end).toBeLessThanOrEqual(12.25);
    // ...while the SCENE holds briefly afterwards, so the last highlight can be
    // read before the cut and one scene's last word doesn't collide with the
    // next scene's first. See SCENE_SETTLE_SECONDS.
    expect(segments[0].durationSeconds).toBeGreaterThan(12);
    expect(segments[0].durationSeconds).toBeLessThan(13);
  });

  it("keeps a highlight readable rather than compressing it away", () => {
    const { segments } = fitSegmentsToNarration([segment()]);
    const timeline = (segments[0] as { visual: { timeline: { type: string; durationSeconds?: number }[] } }).visual.timeline;
    const highlight = timeline.find((a) => a.type === "highlight")!;
    // A line the viewer is meant to READ has the strictest floor in the table.
    expect(highlight.durationSeconds).toBeGreaterThanOrEqual(1.2 - 1e-6);
  });

  it("preserves timeline order through the fit", () => {
    const { segments } = fitSegmentsToNarration([segment()]);
    const timeline = (segments[0] as { visual: { timeline: { startSeconds: number }[] } }).visual.timeline;
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].startSeconds).toBeGreaterThanOrEqual(timeline[i - 1].startSeconds - 1e-6);
    }
  });
});

describe("canvas focus action", () => {
  it("validates as a scene-level action with no object id", () => {
    const result = visualSchema.safeParse({
      kind: "canvas",
      objects: [
        { id: "a", type: "icon", icon: "server", x: 30, y: 50, radius: 8 },
        { id: "b", type: "icon", icon: "database", x: 70, y: 50, radius: 8 },
      ],
      timeline: [{ type: "focus", startSeconds: 2, ids: ["a"] }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults to a strong but still-legible dim", () => {
    const parsed = visualSchema.parse({
      kind: "canvas",
      objects: [{ id: "a", type: "icon", icon: "server", x: 30, y: 50, radius: 8 }],
      timeline: [{ type: "focus", startSeconds: 2, ids: ["a"] }],
    }) as { timeline: { dimOpacity: number }[] };
    expect(parsed.timeline[0].dimOpacity).toBeGreaterThan(0);
    expect(parsed.timeline[0].dimOpacity).toBeLessThan(0.5);
  });

  it("allows an empty ids array to mean 'restore everything'", () => {
    const result = visualSchema.safeParse({
      kind: "canvas",
      objects: [{ id: "a", type: "icon", icon: "server", x: 30, y: 50, radius: 8 }],
      timeline: [{ type: "focus", startSeconds: 5, ids: [] }],
    });
    expect(result.success).toBe(true);
  });

  it("is cheap to compress — it is a cue, not something to be read", () => {
    expect(actionMinSeconds({ type: "focus", startSeconds: 0, durationSeconds: 0.4 })).toBe(0);
  });
});
