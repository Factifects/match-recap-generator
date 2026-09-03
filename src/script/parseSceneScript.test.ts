import { describe, expect, it } from "vitest";
import { parseSceneScript } from "./parseSceneScript";

function tacticalBoardVisual(script: string) {
  const segments = parseSceneScript(script);
  expect(segments).toHaveLength(1);
  const segment = segments[0];
  if (segment.type !== "statement") throw new Error("expected a statement segment");
  if (segment.visual?.kind !== "tactical-board") throw new Error("expected a tactical-board visual");
  return segment.visual;
}

describe("parseSceneScript — tactical-board", () => {
  it("still parses a legacy full-snapshot `phases` Data block unchanged", () => {
    const script = `### SCENE 1

**Scene Type:** TacticalBoard

**Narration:** Legacy phases still work exactly as before.

**Data:** {"players":[{"id":"a","x":30,"y":50,"team":"home","label":"A"},{"id":"b","x":70,"y":50,"team":"away","label":"B"}],"phases":[{"players":[{"id":"a","x":40,"y":50,"team":"home","label":"A"},{"id":"b","x":60,"y":50,"team":"away","label":"B"}],"caption":"Beat one"}]}

**Duration:** 5 seconds
`;
    const visual = tacticalBoardVisual(script);
    expect(visual.players).toHaveLength(2);
    expect(visual.timeline).toBeUndefined();
    expect(visual.ball).toBeUndefined();
    expect(visual.phases).toHaveLength(1);
    expect(visual.phases?.[0].players).toHaveLength(2);
    expect(visual.phases?.[0].caption).toBe("Beat one");
  });

  it("parses the new evented `timeline`/`ball`/`tacticalObjects` fields", () => {
    const script = `### SCENE 1

**Scene Type:** TacticalBoard

**Narration:** The evented timeline drives a real press trigger.

**Data:** {"players":[{"id":"gk","x":8,"y":50,"team":"home","label":"GK"},{"id":"cb","x":20,"y":38,"team":"home","label":"CB"},{"id":"lw","x":35,"y":12,"team":"away","label":"LW","state":"pressing"}],"ball":{"x":8,"y":50,"belongsTo":"gk"},"timeline":[{"type":"possession","startSeconds":0.3,"fromId":"gk","toId":"cb"},{"type":"move","actorId":"lw","startSeconds":1,"to":{"x":22,"y":30},"runType":"blindsideRun"},{"type":"state","actorId":"cb","startSeconds":1,"state":"covering"},{"type":"camera","startSeconds":1,"focus":{"x":22,"y":30},"zoom":1.4},{"type":"freeze","startSeconds":2,"durationSeconds":1,"annotations":[{"text":"Trigger","x":22,"y":30}]}],"tacticalObjects":[{"shape":"lane","from":{"x":8,"y":50},"to":{"x":20,"y":38},"closesAtSeconds":1.5}]}

**Duration:** 8 seconds
`;
    const visual = tacticalBoardVisual(script);
    expect(visual.players?.find((p) => p.id === "lw")?.state).toBe("pressing");
    expect(visual.ball).toMatchObject({ x: 8, y: 50, belongsTo: "gk" });
    expect(visual.timeline).toHaveLength(5);
    expect(visual.timeline?.map((a) => a.type)).toEqual(["possession", "move", "state", "camera", "freeze"]);
    expect(visual.timeline?.[1]).toMatchObject({ actorId: "lw", runType: "blindsideRun", to: { x: 22, y: 30 } });
    expect(visual.tacticalObjects).toHaveLength(1);
    expect(visual.tacticalObjects?.[0]).toMatchObject({ shape: "lane", closesAtSeconds: 1.5 });
  });

  it("parses a Data block containing both `timeline` and legacy `phases` without error (renderer decides precedence)", () => {
    const script = `### SCENE 1

**Scene Type:** TacticalBoard

**Narration:** Both fields present on the same Data block.

**Data:** {"players":[{"id":"a","x":30,"y":50,"team":"home","label":"A"}],"phases":[{"players":[{"id":"a","x":40,"y":50,"team":"home","label":"A"}]}],"timeline":[{"type":"state","actorId":"a","startSeconds":0,"state":"waiting"}]}

**Duration:** 5 seconds
`;
    const visual = tacticalBoardVisual(script);
    expect(visual.timeline).toBeDefined();
    expect(visual.phases).toBeDefined();
  });
});

describe("parseSceneScript — Continue Canvas", () => {
  it("sets continuesCanvasFrom when the field is 'true'", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** First beat.

**Data:** {"objects":[{"id":"a","type":"dot","x":50,"y":50}]}

**Duration:** 4 seconds

---

### SCENE 2

**Scene Type:** Canvas

**Narration:** Second beat, continues the first.

**Continue Canvas:** true

**Data:** {"objects":[{"id":"b","type":"dot","x":60,"y":60}]}

**Duration:** 4 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments).toHaveLength(2);
    expect(segments[0].continuesCanvasFrom).toBeUndefined();
    expect(segments[1].continuesCanvasFrom).toBe(true);
  });

  it("leaves continuesCanvasFrom unset when the field is absent or not 'true'", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** No continuation field at all.

**Data:** {"objects":[{"id":"a","type":"dot","x":50,"y":50}]}

**Duration:** 4 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments[0].continuesCanvasFrom).toBeUndefined();
  });
});

describe("parseSceneScript — Visual Event (beat plan)", () => {
  const plan = {
    semanticGoal: "A file is a name, not one object on the disk.",
    primarySubject: "report.pdf",
    visualWorld: "A desktop file browser window.",
    viewerKnowledgeBefore: "A file lives in one place on the disk.",
    viewerKnowledgeAfter: "The browser is presenting a name, not the thing.",
    representationNeed: "watch-one-thing-transform",
    event: {
      before: "The viewer reads the window as their own computer.",
      trigger: "The narration says the disk has no such file.",
      action: "report.pdf lifts out and grows while the browser recedes.",
      consequence: "A floating name beside a scatter of unlabelled pieces.",
      viewerRealization: "The name and the contents are two different things.",
    },
  };

  it("reads a **Visual Event:** field back onto segment.beatPlan", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** But your disk does not actually have a file called report.pdf.

**Visual Event:** ${JSON.stringify(plan)}

**Data:** {"objects":[{"id":"a","type":"dot","x":50,"y":50}]}

**Duration:** 6 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments[0].beatPlan?.primarySubject).toBe("report.pdf");
    expect(segments[0].beatPlan?.event?.trigger).toContain("no such file");
  });

  it("leaves beatPlan undefined when the field is absent (every pre-Phase-1 script)", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** A scene with no beat plan at all.

**Data:** {"objects":[{"id":"a","type":"dot","x":50,"y":50}]}

**Duration:** 4 seconds
`;
    expect(parseSceneScript(script)[0].beatPlan).toBeUndefined();
  });

  it("degrades a malformed **Visual Event:** to undefined without failing the parse", () => {
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** The beat plan JSON is broken here.

**Visual Event:** {"semanticGoal": "only this field", not json}

**Data:** {"objects":[{"id":"a","type":"dot","x":50,"y":50}]}

**Duration:** 4 seconds
`;
    const segments = parseSceneScript(script);
    expect(segments).toHaveLength(1);
    expect(segments[0].beatPlan).toBeUndefined();
    expect(segments[0].type).toBe("statement");
  });

  it("keeps the beat plan even when the **Data:** block is malformed and the scene degrades", () => {
    // The most useful case to preserve: a scene declared a Visual Event, its
    // Data failed to parse, and it fell back to a plain statement. Dropping the
    // beat plan here would hide "you declared an event and its Data didn't
    // parse" — the exact disconnect the field exists to expose.
    const script = `### SCENE 1

**Scene Type:** Canvas

**Narration:** The Data is broken but the event was declared.

**Visual Event:** ${JSON.stringify(plan)}

**Data:** {"objects":[{"id":"a","type":"line","points":[[10,10],[20,20]]}]}

**Duration:** 6 seconds
`;
    const [segment] = parseSceneScript(script);
    expect(segment.type).toBe("statement");
    expect("visual" in segment && segment.visual).toBeFalsy(); // Data didn't resolve
    expect(segment.beatPlan?.primarySubject).toBe("report.pdf"); // ...but the plan survived
  });
});

