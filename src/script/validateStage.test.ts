import { describe, expect, it } from "vitest";
import { diagnoseStageScenes, diagnoseSceneMedia } from "./validateStage";
import type { TimedSegment } from "../model/Segment";

// The renderer resolves every id by map lookup and does nothing when one
// misses, so a mistyped name costs a whole beat in total silence. These are the
// regression tests for catching that statically — the render never will.

type Loose = Record<string, unknown>;

function stageScene(visual: Loose): TimedSegment {
  return {
    type: "statement",
    text: "a scene",
    durationSeconds: 8,
    narrationSeconds: 8,
    visual: { kind: "stage", edges: [], objects: [], timeline: [], ...visual },
  } as unknown as TimedSegment;
}

function categories(segment: TimedSegment): string[] {
  return diagnoseStageScenes([segment]).map((d) => d.category);
}

function messagesFor(segment: TimedSegment, category: string): string[] {
  return diagnoseStageScenes([segment])
    .filter((d) => d.category === category)
    .map((d) => d.message);
}

const object = (id: string, extra: Loose = {}) => ({ id, kind: "service", label: id.toUpperCase(), at: "center", ...extra });

describe("diagnoseStageScenes — ids that resolve to nothing", () => {
  it("reports an action naming an object the scene never declares", () => {
    const scene = stageScene({
      objects: [object("api")],
      timeline: [
        { type: "enter", id: "api", startSeconds: 0.2, durationSeconds: 0.5 },
        { type: "pop", id: "databse", startSeconds: 2, durationSeconds: 0.45 },
      ],
    });
    const messages = messagesFor(scene, "unresolved-id");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("`databse`");
    // The message must name what IS declared — that is what makes a typo
    // obvious at a glance instead of sending the author back to the script.
    expect(messages[0]).toContain("`api`");
  });

  it("groups every use of one missing name into a single finding", () => {
    const scene = stageScene({
      objects: [object("api")],
      timeline: [
        { type: "enter", id: "cache", startSeconds: 0.2, durationSeconds: 0.5 },
        { type: "pop", id: "cache", startSeconds: 1, durationSeconds: 0.45 },
        { type: "annotate", target: "cache", text: "warm", startSeconds: 2, durationSeconds: 0.4 },
      ],
    });
    const messages = messagesFor(scene, "unresolved-id");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("annotate.target, enter, pop");
  });

  it("separates the packet population from the object population", () => {
    // `send` names a packet AND a path of objects. A packet id that happens to
    // match an object must still be reported: they are different populations,
    // and the renderer looks each up in its own map.
    const scene = stageScene({
      objects: [object("browser"), object("api")],
      packets: [{ id: "req", label: "GET /users", kind: "request" }],
      timeline: [
        { type: "send", id: "browser", path: ["browser", "api"], startSeconds: 1, durationSeconds: 1.4 },
        { type: "send", id: "req", path: ["browser", "edge"], startSeconds: 3, durationSeconds: 1.4 },
      ],
    });
    const messages = messagesFor(scene, "unresolved-id");
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.includes("`browser`") && m.includes("no packet with that id"))).toBe(true);
    expect(messages.some((m) => m.includes("`edge`") && m.includes("no object with that id"))).toBe(true);
  });

  it("checks the ids on edges and on a packet's resting place too", () => {
    const scene = stageScene({
      objects: [object("api")],
      packets: [{ id: "req", label: "GET /users", kind: "request", at: "browser" }],
      edges: [{ from: "api", to: "db", style: "solid", kind: "request" }],
      timeline: [{ type: "enter", id: "api", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    const messages = messagesFor(scene, "unresolved-id");
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.includes("`db`") && m.includes("edges.to"))).toBe(true);
    expect(messages.some((m) => m.includes("`browser`") && m.includes("packets.req.at"))).toBe(true);
  });

  it("stays quiet when every name resolves", () => {
    const scene = stageScene({
      objects: [object("browser"), object("api")],
      packets: [{ id: "req", label: "GET /users", kind: "request" }],
      timeline: [
        { type: "enter", id: "browser", startSeconds: 0.2, durationSeconds: 0.5 },
        { type: "emit", id: "req", from: "browser", startSeconds: 1, durationSeconds: 0.5 },
        { type: "send", id: "req", path: ["browser", "api"], startSeconds: 2, durationSeconds: 1.4 },
        { type: "absorb", id: "req", into: "api", startSeconds: 4, durationSeconds: 0.5 },
      ],
    });
    expect(categories(scene)).not.toContain("unresolved-id");
  });
});

describe("diagnoseStageScenes — rows and lines inside an object", () => {
  it("reports a click on a row the UI does not have", () => {
    const scene = stageScene({
      objects: [
        object("app", {
          ui: { chrome: "browser", url: "app.dev", rows: [{ id: "submit", kind: "button", label: "Log in", hidden: false }] },
        }),
      ],
      timeline: [{ type: "click", id: "app", row: "signin", startSeconds: 1, durationSeconds: 0.35 }],
    });
    const messages = messagesFor(scene, "unknown-ui-row");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("`submit`");
  });

  it("reports a click on an object carrying no UI at all", () => {
    const scene = stageScene({
      objects: [object("app")],
      timeline: [{ type: "uiState", id: "app", row: "result", visible: true, startSeconds: 1, durationSeconds: 0.3 }],
    });
    expect(categories(scene)).toContain("row-without-ui");
  });

  it("reports a highlighted line past the end of the snippet", () => {
    const scene = stageScene({
      objects: [object("editor", { code: ["const a = 1;", "const b = 2;"] })],
      timeline: [{ type: "highlightLine", id: "editor", lines: [2, 7], startSeconds: 1, durationSeconds: 0.4 }],
    });
    const messages = messagesFor(scene, "line-out-of-range");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("line 7");
    expect(messages[0]).toContain("2 line(s)");
  });

  it("judges a line against the code the object is showing AT THAT MOMENT", () => {
    // `transform` with `toCode` swaps the whole snippet mid-scene — how a scene
    // walks a URL down to its bare address. Judging every line against the
    // DECLARED code reported all four real scripts that do this, and all four
    // were correct.
    const scene = stageScene({
      objects: [object("url", { kind: "code", code: ["shop.com/p/lamp"] })],
      timeline: [
        { type: "highlightLine", id: "url", lines: [1], startSeconds: 1, durationSeconds: 0.4 },
        {
          type: "transform",
          id: "url",
          toCode: ["shop.com/p/lamp", "?utm_source=instagram", "&fbclid=IwAR2x9", "&gclid=Cj0KCQ"],
          startSeconds: 3,
          durationSeconds: 0.9,
        },
        { type: "highlightLine", id: "url", lines: [3, 4], startSeconds: 5, durationSeconds: 0.4 },
      ],
    });
    expect(categories(scene)).not.toContain("line-out-of-range");
  });

  it("still reports a line addressed BEFORE the transform that would create it", () => {
    const scene = stageScene({
      objects: [object("url", { kind: "code", code: ["shop.com/p/lamp"] })],
      timeline: [
        { type: "highlightLine", id: "url", lines: [4], startSeconds: 1, durationSeconds: 0.4 },
        { type: "transform", id: "url", toCode: ["a", "b", "c", "d"], startSeconds: 3, durationSeconds: 0.9 },
      ],
    });
    expect(categories(scene)).toContain("line-out-of-range");
  });

  it("reports a detached line on an object with no code", () => {
    const scene = stageScene({
      objects: [object("editor")],
      packets: [{ id: "call", label: "fetch()", kind: "request" }],
      timeline: [{ type: "detach", id: "call", from: "editor", line: 3, startSeconds: 1, durationSeconds: 0.8 }],
    });
    expect(categories(scene)).toContain("line-without-code");
  });
});

describe("diagnoseSceneMedia — the medium has to change, not only the strategy", () => {
  const codeScene = (strategy: string[]) =>
    stageScene({
      strategy,
      objects: [object("url", { kind: "code", code: ["shop.com/p/lamp"] })],
      timeline: [{ type: "highlightLine", id: "url", lines: [1], startSeconds: 1, durationSeconds: 0.4 }],
    });

  it("reports a video that is one surface throughout, however its strategies vary", () => {
    // The URL-tracking script's exact shape: four different declared strategies,
    // one code pane the whole way down.
    const found = diagnoseSceneMedia([
      codeScene(["reveal"]),
      codeScene(["splitting", "transformation"]),
      codeScene(["transformation", "perspective"]),
      codeScene(["absence", "beforeAfter"]),
    ]).filter((d) => d.category === "single-medium-video");
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("code -> code -> code -> code");
    expect(found[0].message).toContain("4 scenes");
  });

  it("reports three of one surface running even when the video varies elsewhere", () => {
    const uiScene = stageScene({
      objects: [
        object("app", { ui: { chrome: "browser", url: "app.dev", rows: [{ id: "go", kind: "button", label: "Log in", hidden: false }] } }),
      ],
      timeline: [{ type: "click", id: "app", row: "go", startSeconds: 1, durationSeconds: 0.35 }],
    });
    const categoriesFound = diagnoseSceneMedia([codeScene(["reveal"]), codeScene(["zoom"]), codeScene(["absence"]), uiScene]).map(
      (d) => d.category,
    );
    expect(categoriesFound).toContain("repeated-medium");
    expect(categoriesFound).not.toContain("single-medium-video");
  });

  it("stays quiet when the surface actually changes scene to scene", () => {
    const uiScene = stageScene({
      objects: [
        object("app", { ui: { chrome: "browser", url: "app.dev", rows: [{ id: "go", kind: "button", label: "Launch", hidden: false }] } }),
      ],
      timeline: [{ type: "click", id: "app", row: "go", startSeconds: 1, durationSeconds: 0.35 }],
    });
    const entityScene = stageScene({
      objects: [object("host", { kind: "server" }), object("guest", { kind: "container" })],
      timeline: [{ type: "enter", id: "host", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    const splitScene = stageScene({
      splitScreen: { orientation: "vertical", labels: ["BEFORE", "AFTER"] },
      objects: [object("before", { pane: "a" }), object("after", { pane: "b" })],
      timeline: [{ type: "enter", id: "before", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    const categoriesFound = diagnoseSceneMedia([uiScene, entityScene, splitScene, codeScene(["codeExecution"])]).map((d) => d.category);
    expect(categoriesFound).not.toContain("repeated-medium");
    expect(categoriesFound).not.toContain("single-medium-video");
  });

  it("counts a code object that gets its lines from a transform, not just a declared one", () => {
    // Scenes 2-4 of the failed script declared `kind: "code"` with no `code`
    // array at all — the pane was filled by `transform`. Classifying off the
    // declaration alone would have missed every one of them.
    const inherited = stageScene({
      objects: [object("url", { kind: "code" })],
      timeline: [{ type: "transform", id: "url", toCode: ["a", "b"], startSeconds: 1, durationSeconds: 0.9 }],
    });
    const found = diagnoseSceneMedia([inherited, inherited, inherited]).filter((d) => d.category === "single-medium-video");
    expect(found).toHaveLength(1);
  });

  it("lets a lead surface outweigh scenery that merely shares the frame", () => {
    // A code pane with a couple of receding servers behind it is a code scene,
    // not an entity scene — otherwise a video could hide monotony behind props.
    const scene = stageScene({
      objects: [
        object("editor", { kind: "code", code: ["SELECT 1"], emphasis: "lead" }),
        object("db", { kind: "database", emphasis: "recede" }),
        object("api", { kind: "server", emphasis: "recede" }),
      ],
      timeline: [{ type: "highlightLine", id: "editor", lines: [1], startSeconds: 1, durationSeconds: 0.4 }],
    });
    const found = diagnoseSceneMedia([scene, scene, scene]).filter((d) => d.category === "single-medium-video");
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("a code pane");
  });
});

describe("diagnoseStageScenes — mechanics declared on one side only", () => {
  it("reports a pane on an undivided stage", () => {
    const scene = stageScene({
      objects: [object("polling", { pane: "a" }), object("socket", { pane: "b" })],
      timeline: [{ type: "enter", id: "polling", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    expect(categories(scene)).toContain("pane-without-split");
  });

  it("reports a split stage whose second half nothing occupies", () => {
    const scene = stageScene({
      splitScreen: { orientation: "vertical", labels: ["BEFORE", "AFTER"] },
      objects: [object("polling", { pane: "a" })],
      timeline: [{ type: "enter", id: "polling", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    expect(categories(scene)).toContain("empty-split-pane");
  });

  it("accepts a split stage with both halves occupied", () => {
    const scene = stageScene({
      splitScreen: { orientation: "vertical" },
      objects: [object("polling", { pane: "a" }), object("socket", { pane: "b" })],
      timeline: [{ type: "enter", id: "polling", startSeconds: 0.2, durationSeconds: 0.5 }],
    });
    const found = categories(scene);
    expect(found).not.toContain("empty-split-pane");
    expect(found).not.toContain("pane-without-split");
  });

  it("reports a react beat with no mascot on screen to perform it", () => {
    const scene = stageScene({
      objects: [object("api")],
      timeline: [
        { type: "enter", id: "api", startSeconds: 0.2, durationSeconds: 0.5 },
        { type: "react", to: "surprised", startSeconds: 2, durationSeconds: 0.4 },
      ],
    });
    expect(categories(scene)).toContain("react-without-mascot");
  });

  it("accepts a react beat once the scene declares a mascot", () => {
    const scene = stageScene({
      objects: [object("api")],
      mascot: { at: "bottom-left", expression: "puzzled" },
      timeline: [
        { type: "enter", id: "api", startSeconds: 0.2, durationSeconds: 0.5 },
        { type: "react", to: "surprised", startSeconds: 2, durationSeconds: 0.4 },
      ],
    });
    expect(categories(scene)).not.toContain("react-without-mascot");
  });
});
