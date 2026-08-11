import { describe, expect, it } from "vitest";
import { parseSceneScript } from "./parseSceneScript";
import { diagnoseScenes, checkContractRealization } from "./validateScene";
import type { SceneContract } from "./sceneContract";
import type { CanvasData } from "../video/sharedVisualProps";

// Regression fixtures: verbatim from analyses/reverse-proxy-short-2026-08-07.txt
// — the exact scenes that motivated this whole validation pass (see
// project_video_engine_architecture_assessment memory). Scene 1 and Scene 5
// are the two bad scenes from the original bug report (zero arrows/zero
// explanatory motion, and a single floating icon respectively); Scene 2 is
// the ONE proven-good scene from the same script (a real moving token) and
// exists here specifically to guard against a checker so blunt it condemns
// genuinely good scenes too.

const SCENE_1_BAD = `### SCENE 1

**Scene Type:** Canvas

**Narration:** Your API might be live at api.yoursite.com right now, and here's the part that surprises people: that address has never once pointed directly at your actual server. Every request lands on something else first — something whose entire job is to look exactly like your backend, without being it. That's a reverse proxy.

**Duration:** 21 seconds

**Story Beat:** question

**Panel Color:** blue

**Data:** {"title": "", "objects": [{"id": "urlLabel", "type": "label", "x": 50, "y": 12, "label": "api.yoursite.com"}, {"id": "clientIcon", "type": "icon", "icon": "device", "x": 22, "y": 45, "radius": 8, "color": "#5b8def", "label": "client", "enter": "slideLeft"}, {"id": "proxyIcon", "type": "icon", "icon": "shield", "x": 50, "y": 45, "radius": 10, "color": "#5b8def", "label": "reverse proxy", "enter": "scale", "idle": "glow"}, {"id": "hiddenZone", "type": "roundedRectangle", "x": 82, "y": 45, "width": 22, "height": 50, "radius": 4, "color": "#2a2f33", "fillOpacity": 0.5, "label": "your real server", "enter": "scale"}, {"id": "backendIcon", "type": "icon", "icon": "server", "x": 82, "y": 45, "radius": 6, "color": "#8a8f98"}], "timeline": [{"type": "appear", "id": "urlLabel", "startSeconds": 0.3}, {"type": "appear", "id": "clientIcon", "startSeconds": 0.9}, {"type": "appear", "id": "hiddenZone", "startSeconds": 1.3}, {"type": "appear", "id": "backendIcon", "startSeconds": 1.6}, {"type": "appear", "id": "proxyIcon", "startSeconds": 8.0, "sound": "entrance"}, {"type": "move", "id": "proxyIcon", "startSeconds": 8.4, "durationSeconds": 0.25, "scale": 1.15, "sound": "highlight"}, {"type": "move", "id": "proxyIcon", "startSeconds": 8.65, "durationSeconds": 0.3, "scale": 1.0, "easing": "spring"}, {"type": "move", "id": "backendIcon", "startSeconds": 16.0, "durationSeconds": 0.25, "scale": 1.15, "sound": "highlight"}, {"type": "move", "id": "backendIcon", "startSeconds": 16.25, "durationSeconds": 0.3, "scale": 1.0, "easing": "spring"}]}`;

const SCENE_2_GOOD = `### SCENE 2

**Scene Type:** Canvas

**Narration:** Here's what it actually does on every request: it receives the connection instead of your real server, decides where to forward it, passes the request through, waits for the response, and relays it back to the client. Your real server's IP is never exposed, never in a DNS record, never reachable directly from the internet.

**Duration:** 26 seconds

**Story Beat:** explanation

**Panel Color:** blue

**Data:** {"title": "One request, step by step", "objects": [{"id": "clientIcon2", "type": "icon", "icon": "device", "x": 16, "y": 45, "radius": 8, "color": "#5b8def", "label": "client", "enter": "slideLeft"}, {"id": "proxyIcon2", "type": "icon", "icon": "shield", "x": 48, "y": 45, "radius": 10, "color": "#5b8def", "label": "reverse proxy", "enter": "scale"}, {"id": "hiddenZone2", "type": "roundedRectangle", "x": 82, "y": 45, "width": 22, "height": 40, "radius": 4, "color": "#2a2f33", "fillOpacity": 0.5, "enter": "scale"}, {"id": "serverIcon", "type": "icon", "icon": "server", "x": 82, "y": 45, "radius": 6, "color": "#8a8f98", "label": "IP hidden"}, {"id": "lockBadge", "type": "icon", "icon": "lock", "x": 90, "y": 32, "radius": 4, "color": "#e0a020"}, {"id": "requestDot", "type": "dot", "x": 16, "y": 45, "color": "#3ecf8e", "opacity": 0}], "timeline": [{"type": "appear", "id": "clientIcon2", "startSeconds": 0.3}, {"type": "appear", "id": "proxyIcon2", "startSeconds": 0.7}, {"type": "appear", "id": "hiddenZone2", "startSeconds": 1.1}, {"type": "appear", "id": "serverIcon", "startSeconds": 1.4}, {"type": "appear", "id": "lockBadge", "startSeconds": 1.7}, {"type": "style", "id": "requestDot", "startSeconds": 3.0, "durationSeconds": 0.2, "opacity": 1}, {"type": "move", "id": "requestDot", "startSeconds": 3.3, "durationSeconds": 0.8, "to": {"x": 48, "y": 45}, "sound": "move"}, {"type": "move", "id": "proxyIcon2", "startSeconds": 4.2, "durationSeconds": 0.25, "scale": 1.1, "sound": "highlight"}, {"type": "move", "id": "proxyIcon2", "startSeconds": 4.45, "durationSeconds": 0.3, "scale": 1.0, "easing": "spring"}, {"type": "move", "id": "requestDot", "startSeconds": 8.0, "durationSeconds": 0.8, "to": {"x": 82, "y": 45}, "sound": "move"}, {"type": "move", "id": "serverIcon", "startSeconds": 8.9, "durationSeconds": 0.25, "scale": 1.2, "sound": "highlight"}, {"type": "move", "id": "serverIcon", "startSeconds": 9.15, "durationSeconds": 0.3, "scale": 1.0, "easing": "spring"}, {"type": "move", "id": "requestDot", "startSeconds": 13.0, "durationSeconds": 0.8, "to": {"x": 48, "y": 45}, "sound": "move"}, {"type": "move", "id": "requestDot", "startSeconds": 16.0, "durationSeconds": 0.8, "to": {"x": 16, "y": 45}, "sound": "move"}, {"type": "style", "id": "clientIcon2", "startSeconds": 17.0, "durationSeconds": 0.3, "color": "#3ecf8e", "sound": "success"}, {"type": "disappear", "id": "requestDot", "startSeconds": 17.3, "durationSeconds": 0.3}, {"type": "move", "id": "lockBadge", "startSeconds": 19.5, "durationSeconds": 0.25, "scale": 1.3, "sound": "highlight"}, {"type": "move", "id": "lockBadge", "startSeconds": 19.75, "durationSeconds": 0.3, "scale": 1.0, "easing": "spring"}]}`;

const SCENE_5_BAD = `### SCENE 5

**Scene Type:** Canvas

**Narration:** So next time you hit an API and it responds instantly and cleanly, you're not talking to the server that did the work. You're talking to the one standing in front of it.

**Duration:** 13 seconds

**Story Beat:** reflection

**Panel Color:** blue

**Data:** {"title": "", "objects": [{"id": "proxyFinal", "type": "icon", "icon": "shield", "x": 50, "y": 40, "radius": 10, "color": "#5b8def", "enter": "scale", "easing": "spring", "idle": "glow"}, {"id": "finalLabel", "type": "label", "x": 50, "y": 62, "label": "the one standing in front"}], "timeline": [{"type": "appear", "id": "proxyFinal", "startSeconds": 0.3, "sound": "entrance"}, {"type": "appear", "id": "finalLabel", "startSeconds": 4.0}]}`;

describe("diagnoseScenes — regression fixtures from analyses/reverse-proxy-short-2026-08-07.txt", () => {
  it("flags Scene 1 (client/proxy/server, zero arrows, zero explanatory motion) as low-richness", () => {
    const [segment] = parseSceneScript(SCENE_1_BAD);
    const diagnostics = diagnoseScenes([segment]);
    const richness = diagnostics.find((d) => d.category === "low-richness");
    expect(richness).toBeDefined();
    expect(richness?.severity).toBe("hard");
    expect(richness?.level).toBe(3);
  });

  it("flags Scene 5 (single floating icon, huge unused canvas) as low-density via validateGeometry", () => {
    // Density is validateGeometry.ts's check (level 2, composition) —
    // imported separately to keep this file's regression fixtures paired
    // with whichever module actually owns each check.
    return import("./validateGeometry").then(({ autoFixGeometry }) => {
      const [segment] = parseSceneScript(SCENE_5_BAD);
      const { diagnostics } = autoFixGeometry([segment]);
      const density = diagnostics.find((d) => d.category === "low-density");
      expect(density).toBeDefined();
      expect(density?.level).toBe(2);
    });
  });

  it("flags Scene 5 as low-richness too (an entrance-only timeline demonstrates nothing)", () => {
    const [segment] = parseSceneScript(SCENE_5_BAD);
    const diagnostics = diagnoseScenes([segment]);
    const richness = diagnostics.find((d) => d.category === "low-richness");
    expect(richness).toBeDefined();
    expect(richness?.severity).toBe("hard"); // 13s scene, well over the 8s threshold
  });

  it("does NOT flag Scene 2 (the one proven-good scene: a real moving token) as low-richness", () => {
    const [segment] = parseSceneScript(SCENE_2_GOOD);
    const diagnostics = diagnoseScenes([segment]);
    expect(diagnostics.find((d) => d.category === "low-richness")).toBeUndefined();
  });

  it("does NOT flag Scene 2 as unconnected-entities (it has real explanatory motion, even with zero arrows)", () => {
    return import("./validateGeometry").then(({ autoFixGeometry }) => {
      const [segment] = parseSceneScript(SCENE_2_GOOD);
      const { diagnostics } = autoFixGeometry([segment]);
      expect(diagnostics.find((d) => d.category === "unconnected-entities")).toBeUndefined();
    });
  });
});

describe("validateGeometry — checkUnconnectedEntities (fixed to require explanatory motion)", () => {
  it("flags Scene 1 as unconnected-entities (zero arrows AND zero explanatory motion — the exact bug this was fixed for)", () => {
    return import("./validateGeometry").then(({ autoFixGeometry }) => {
      const [segment] = parseSceneScript(SCENE_1_BAD);
      const { diagnostics } = autoFixGeometry([segment]);
      const unconnected = diagnostics.find((d) => d.category === "unconnected-entities");
      expect(unconnected).toBeDefined();
      expect(unconnected?.severity).toBe("hard");
    });
  });
});

describe("checkContractRealization", () => {
  const contract: SceneContract = {
    entities: [
      { id: "client", label: "Client" },
      { id: "proxy", label: "Proxy" },
      { id: "server", label: "Server" },
    ],
    edges: [
      { from: "client", to: "proxy", verb: "request" },
      { from: "proxy", to: "server", verb: "forwards" },
    ],
  };

  it("realizes an edge via a real transport (a token whose trajectory goes from A's position to B's position)", () => {
    const visual: CanvasData = {
      kind: "canvas",
      objects: [
        { id: "client", type: "dot", x: 10, y: 50 },
        { id: "proxy", type: "dot", x: 50, y: 50 },
        { id: "server", type: "dot", x: 90, y: 50 },
        { id: "token", type: "dot", x: 10, y: 50 },
      ],
      timeline: [
        { type: "move", id: "token", startSeconds: 1, durationSeconds: 0.8, to: { x: 50, y: 50 } },
        { type: "move", id: "token", startSeconds: 3, durationSeconds: 0.8, to: { x: 90, y: 50 } },
      ],
    } as CanvasData;
    const result = checkContractRealization(contract, visual);
    expect(result.realizedCount).toBe(2);
    expect(result.unrealizedEdges).toHaveLength(0);
  });

  it("realizes an edge via a static arrow even with no token movement", () => {
    const visual: CanvasData = {
      kind: "canvas",
      objects: [
        { id: "client", type: "dot", x: 10, y: 50 },
        { id: "proxy", type: "dot", x: 50, y: 50 },
        { id: "server", type: "dot", x: 90, y: 50 },
      ],
      arrows: [
        { from: "client", to: "proxy" },
        { from: "proxy", to: "server" },
      ],
    } as CanvasData;
    const result = checkContractRealization(contract, visual);
    expect(result.realizedCount).toBe(2);
  });

  it("reports an edge as unrealized when nothing connects or transports between the two positions (Scene 1's actual bug, reproduced directly)", () => {
    const visual: CanvasData = {
      kind: "canvas",
      objects: [
        { id: "client", type: "dot", x: 10, y: 50 },
        { id: "proxy", type: "dot", x: 50, y: 50 },
        { id: "server", type: "dot", x: 90, y: 50 },
      ],
      timeline: [
        { type: "appear", id: "client", startSeconds: 0 },
        { type: "appear", id: "proxy", startSeconds: 0.5 },
        { type: "appear", id: "server", startSeconds: 1 },
      ],
    } as CanvasData;
    const result = checkContractRealization(contract, visual);
    expect(result.realizedCount).toBe(0);
    expect(result.unrealizedEdges).toHaveLength(2);
  });
});
