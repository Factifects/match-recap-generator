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
