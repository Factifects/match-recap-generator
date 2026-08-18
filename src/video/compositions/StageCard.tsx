import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { SceneFrame } from "./SceneFrame";
import { LiveMapBackdrop } from "./LiveMapBackdrop";
import { DISPLAY_FONT_FAMILY } from "../theme";
import {
  blendLayouts,
  defaultSafeArea,
  layoutStage,
  pointOnStageEdge,
  tangentOnStageEdge,
  resolveCamera,
  routeStageEdges,
  type StageAccent,
  type StageBox,
  type StageComposition,
  type StageEdgeInput,
  type StageLayout,
  type StageObjectInput,
} from "../../script/stageLayout";
import { Silhouette, BrandMark, boxZones, labelOffsetFor } from "./stageSilhouettes";
import { tokenizeLine, CODE_COLORS } from "../../script/tokenizeCode";
import type { SharedVisualProps, StageData } from "../sharedVisualProps";

// Renderer for the `stage` medium — the Techijest Shorts visual language.
// Every coordinate here comes from stageLayout.ts; this file draws, it never
// decides where anything goes. Same split as DiagramCard/diagramLayout, and for
// the same reason: layout is a pure function with property tests proving no
// overlaps, nothing off-canvas and boundary-anchored connectors, none of which
// can be guaranteed while a renderer is free to nudge things.
//
// THE ONE STRUCTURAL DIFFERENCE FROM DiagramCard: geometry here is a function
// of TIME. The scene declares composition states and this file lays each one
// out, then blends between consecutive layouts every frame — which is what lets
// the server expand into the centre while the browser recedes and the database
// moves forward, instead of the whole frame being frozen at whatever the
// layout engine computed once at t=0.
//
// EVERYTHING SPATIAL RENDERS INSIDE ONE TRANSFORMED <g>. Objects, connectors,
// packets, annotations and labels all share a single coordinate space and a
// single camera transform. This is deliberate and load-bearing: Canvas.tsx
// renders icons in a camera-transformed layer but labels in a fixed overlay, so
// any non-neutral camera there visually separates a glyph from its own caption
// even when the authored coordinates never overlapped. A stage cannot develop
// that bug because there is no second coordinate space to drift against. Only
// the beat headline sits outside the camera, and that is intentional — it is an
// overlay actor addressing the viewer, not an object in the system.

const STAGE_FONT = DISPLAY_FONT_FAMILY;
/** Technical text (endpoints, values, payloads) is monospace, per the Techijest
 * identity — a `GET /refund` set in a proportional face stops reading as a real
 * request and starts reading as a caption about one. */
const MONO_FONT = '"JetBrains Mono", "SF Mono", "Menlo", monospace';

type AccentSet = Record<StageAccent, { stroke: string; fill: string; glow: string }>;

function accentSet(primary: string, primaryRgb: string, neutral: string, neutralRgb: string): AccentSet {
  return {
    neutral: { stroke: neutral, fill: `rgba(${neutralRgb}, 0.14)`, glow: `rgba(${neutralRgb}, 0)` },
    primary: { stroke: primary, fill: `rgba(${primaryRgb}, 0.13)`, glow: `rgba(${primaryRgb}, 0.32)` },
    warn: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.14)", glow: "rgba(245, 158, 11, 0.30)" },
    success: { stroke: "#22c55e", fill: "rgba(34, 197, 94, 0.14)", glow: "rgba(34, 197, 94, 0.30)" },
    danger: { stroke: "#f43f5e", fill: "rgba(244, 63, 94, 0.16)", glow: "rgba(244, 63, 94, 0.34)" },
  };
}

/** THE TOPIC'S VISUAL WORLD.
 *
 * One dark grid and one blue-grey palette across every topic is what makes a
 * channel's whole output read as the same slide deck with different words in
 * it. A caching video and a TLS video should not open on the same picture. Each
 * world sets its own palette, backdrop and ambient motion character, so the
 * viewer can tell what KIND of thing they are watching before reading a single
 * label — while all five stay inside the same house identity (near-black
 * ground, restrained glow, mono technical text), so it still reads as one
 * channel rather than five.
 *
 * `flow` is how fast data visibly moves along a live wire; `pulse` how much
 * an active object breathes. Those two numbers are most of what separates
 * "storage feels heavy" from "network feels quick". */
const WORLDS: Record<
  string,
  { accents: AccentSet; backdrop: "grid" | "scanlines" | "field" | "depth"; edge: string; tint: string; flow: number; pulse: number }
> = {
  network: {
    accents: accentSet("#22d3ee", "34, 211, 238", "#4a5a72", "74, 90, 114"),
    backdrop: "grid",
    edge: "rgba(147, 167, 212, 0.55)",
    tint: "rgba(34, 211, 238, 0.05)",
    flow: 1,
    pulse: 1,
  },
  storage: {
    accents: accentSet("#f5a524", "245, 165, 36", "#5c5443", "92, 84, 67"),
    backdrop: "field",
    edge: "rgba(212, 186, 147, 0.5)",
    tint: "rgba(245, 165, 36, 0.05)",
    // Heavier and slower: blocks settle, they do not dart.
    flow: 0.55,
    pulse: 0.7,
  },
  security: {
    accents: accentSet("#f43f5e", "244, 63, 94", "#5a4a58", "90, 74, 88"),
    backdrop: "scanlines",
    edge: "rgba(200, 160, 180, 0.5)",
    tint: "rgba(244, 63, 94, 0.05)",
    // The world where things get STOPPED — motion is quick but interruptible.
    flow: 1.15,
    pulse: 1.25,
  },
  compute: {
    accents: accentSet("#a78bfa", "167, 139, 250", "#4c5068", "76, 80, 104"),
    backdrop: "depth",
    edge: "rgba(170, 175, 220, 0.5)",
    tint: "rgba(167, 139, 250, 0.05)",
    // Busy parallel work.
    flow: 1.4,
    pulse: 1.4,
  },
  data: {
    accents: accentSet("#2dd4bf", "45, 212, 191", "#445c5c", "68, 92, 92"),
    backdrop: "field",
    edge: "rgba(150, 200, 196, 0.5)",
    tint: "rgba(45, 212, 191, 0.05)",
    // Continuous flow that never fully stops.
    flow: 1.25,
    pulse: 0.95,
  },
};

const ENERGY: Record<string, number> = { calm: 0.25, active: 1, busy: 1.7 };

/** Canonical packet treatment. A request and a response must NEVER read as the
 * same object moving in two directions, so they differ on three axes at once —
 * colour, silhouette (chevron vs pill) and leading glyph — not just colour. */
const FLOW_STYLES: Record<string, { color: string; shape: "chevron" | "pill" | "card"; dashed?: boolean; glyph?: string }> = {
  request: { color: "#f59e0b", shape: "chevron", glyph: "→" },
  response: { color: "#22c55e", shape: "pill", glyph: "←" },
  success: { color: "#22c55e", shape: "pill", glyph: "✓" },
  data: { color: "#38bdf8", shape: "card" },
  error: { color: "#f43f5e", shape: "card", dashed: true, glyph: "✕" },
  retry: { color: "#fb923c", shape: "chevron", glyph: "↻" },
};

const DIMMED = 0.28;
/** How long a callout holds at full strength before clearing. Long enough to
 * read a short phrase, short enough that the next beat starts clean. */
const ANNOTATION_HOLD_SECONDS = 2.2;

function ease(t: number): number {
  return interpolate(t, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
}

/** Overshoot. A composition change eased with plain cubic-out is CORRECT and
 * reads as soft — objects glide politely into place and the frame feels like a
 * slide transition. Short-form motion lands: it goes slightly past its mark and
 * settles back, which is what makes a move read as a decision rather than a
 * drift. This is the default for anything that MOVES (compositions, entrances,
 * impacts); plain `ease` stays the default for anything that FADES, because
 * overshooting an opacity just flickers. */
function easeSnap(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.max(0, Math.min(1, t));
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function progress(atSeconds: number, start: number, duration: number): number {
  if (duration <= 0) return atSeconds >= start ? 1 : 0;
  return ease(Math.max(0, Math.min(1, (atSeconds - start) / duration)));
}

/** Linear 0-1, for callers that need to apply their own curve. */
function rawProgress(atSeconds: number, start: number, duration: number): number {
  if (duration <= 0) return atSeconds >= start ? 1 : 0;
  return Math.max(0, Math.min(1, (atSeconds - start) / duration));
}

type StageAction = NonNullable<StageData["timeline"]>[number];

/** One layout keyframe: a full composition snapshot and when the stage starts
 * moving into it.
 *
 * Both `compose` AND visibility changes produce keyframes, because an object
 * entering or leaving changes the packing of everything around it — treating
 * only `compose` as a keyframe would let a newly-arrived object overlap its
 * neighbours until the next composition happened to run. */
interface Keyframe {
  atSeconds: number;
  durationSeconds: number;
  composition: StageComposition;
}

function buildKeyframes(objects: StageObjectInput[], timeline: StageAction[]): Keyframe[] {
  // An object that is ever explicitly `enter`ed starts off-stage; one that is
  // never mentioned is present from the first frame. That rule is what makes
  // progressive disclosure the default without forcing every script to declare
  // an enter for scenery that was always there.
  const entered = new Set(timeline.filter((a) => a.type === "enter").map((a) => (a as { id: string }).id));
  const state: StageComposition = { place: {}, emphasis: {}, hidden: [...entered] };

  const keyframes: Keyframe[] = [{ atSeconds: 0, durationSeconds: 0, composition: cloneComposition(state) }];

  const ordered = [...timeline].sort((a, b) => a.startSeconds - b.startSeconds);
  for (const action of ordered) {
    if (action.type === "enter") {
      state.hidden = (state.hidden ?? []).filter((id) => id !== action.id);
    } else if (action.type === "exit") {
      state.hidden = [...new Set([...(state.hidden ?? []), action.id])];
    } else if (action.type === "compose") {
      state.place = { ...state.place, ...(action.place ?? {}) };
      state.emphasis = { ...state.emphasis, ...(action.emphasis ?? {}) };
      if (action.hidden) state.hidden = [...new Set([...(state.hidden ?? []), ...action.hidden])];
    } else {
      continue;
    }
    keyframes.push({
      atSeconds: action.startSeconds,
      durationSeconds: action.durationSeconds ?? 0.6,
      composition: cloneComposition(state),
    });
  }

  // A `compose` that re-places an object which is currently hidden must not
  // keep it hidden — placing something is an act of showing it. Handled here
  // rather than in the fold so the rule is stated once.
  for (const keyframe of keyframes) {
    const placed = Object.keys(keyframe.composition.place ?? {});
    keyframe.composition.hidden = (keyframe.composition.hidden ?? []).filter((id) => !placed.includes(id));
  }

  void objects;
  return keyframes;
}

function cloneComposition(composition: StageComposition): StageComposition {
  return { place: { ...composition.place }, emphasis: { ...composition.emphasis }, hidden: [...(composition.hidden ?? [])] };
}

/** Continuous 0-1 presence per object, so an entering object FADES in rather
 * than popping at a keyframe boundary. Kept separate from the keyframes'
 * discrete `hidden` set on purpose: layout packing needs a yes/no answer (a
 * half-present object should already have its final slot reserved), while
 * drawing needs a smooth one. */
function visibilityAt(objects: StageObjectInput[], timeline: StageAction[], atSeconds: number): Map<string, number> {
  const everEntered = new Set(timeline.filter((a) => a.type === "enter").map((a) => (a as { id: string }).id));
  const result = new Map<string, number>(objects.map((o) => [o.id, everEntered.has(o.id) ? 0 : 1]));

  for (const action of [...timeline].sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (action.startSeconds > atSeconds) break;
    if (action.type === "enter") {
      result.set(action.id, progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.5));
    } else if (action.type === "exit") {
      result.set(action.id, 1 - progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.4));
    } else if (action.type === "compose" && action.hidden) {
      const fade = 1 - progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.9);
      for (const id of action.hidden) result.set(id, fade);
    } else if (action.type === "compose" && action.place) {
      for (const id of Object.keys(action.place)) {
        if ((result.get(id) ?? 1) < 1) result.set(id, progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.9));
      }
    }
  }
  return result;
}

export const StageCard: React.FC<SharedVisualProps & { data: StageData }> = ({
  data,
  hasCaption,
  backgroundColor,
  backgroundImage,
  backgroundImageMode,
  backgroundImageSide,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const atSeconds = frame / fps;
  const unit = Math.min(width, height);

  const world = WORLDS[data.world ?? "network"] ?? WORLDS.network;
  const ACCENTS = world.accents;
  const EDGE_COLOR = world.edge;
  const energy = ENERGY[data.energy ?? "active"] ?? 1;

  const timeline = React.useMemo(() => data.timeline ?? [], [data.timeline]);
  const edges: StageEdgeInput[] = React.useMemo(() => data.edges ?? [], [data.edges]);
  const objects = data.objects;

  const safeArea = React.useMemo(() => {
    const base = defaultSafeArea({ width, height }, data.composition ?? "full");
    // A word-caption/phase overlay owns the bottom of the frame. Giving the
    // stage back that space when there is no caption is a real recomposition,
    // not a cosmetic margin — a Short with no caption gets a visibly larger
    // stage rather than a band of unused black.
    if (!hasCaption) return { ...base, height: base.height + height * 0.06 };
    return base;
  }, [width, height, hasCaption, data.composition]);

  const keyframes = React.useMemo(() => buildKeyframes(objects, timeline), [objects, timeline]);

  const layouts = React.useMemo(
    () => keyframes.map((k) => layoutStage(objects, edges, k.composition, { frame: { width, height }, safeArea })),
    [keyframes, objects, edges, width, height, safeArea],
  );

  // Blend between the two keyframes straddling `atSeconds`.
  const layout: StageLayout = React.useMemo(() => {
    let index = 0;
    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].atSeconds <= atSeconds) index = i;
      else break;
    }
    if (index === 0) return layouts[0];
    const k = keyframes[index];
    // Geometry overshoots and settles; this is the single biggest difference
    // between "the diagram rearranged" and "the system moved".
    const t = easeSnap(rawProgress(atSeconds, k.atSeconds, k.durationSeconds));
    return blendLayouts(layouts[index - 1], layouts[index], t, edges, unit);
  }, [keyframes, layouts, atSeconds, edges, unit]);

  const visibility = React.useMemo(() => visibilityAt(objects, timeline, atSeconds), [objects, timeline, atSeconds]);
  const boxById = React.useMemo(() => new Map(layout.boxes.map((b) => [b.id, b])), [layout]);

  // ---- folded per-object state -------------------------------------------
  const accents = new Map<string, StageAccent>(objects.map((o) => [o.id, o.accent ?? "neutral"]));
  let focusIds: string[] = [];
  const connected = new Map<string, number>();
  const annotations: { target: string; text: string; opacity: number }[] = [];
  let beat: { text: string; tone: string; progress: number; out: number; at: string; size: string } | null = null;
  let camera = { focus: undefined as string | undefined, zoom: 1, from: { focus: undefined as string | undefined, zoom: 1 }, t: 1 };
  const pops = new Map<string, number>();
  const counters = new Map<string, string>();
  /** Persistent packets: where each one IS, what it currently says, and whether
   * it is mid-flight. Folded like every other piece of state, so a packet's
   * position at any frame is derived rather than remembered — which is what
   * makes it survive across beats without a separate animation system. */
  const livePackets = new Map<
    string,
    {
      label: string;
      kind: string;
      at?: string;
      flight?: { path: string[]; t: number; blockedAt?: number };
      emerging?: number;
      absorbing?: { into: string; t: number };
      spread?: { index: number; t: number };
      converge?: { toX: number; toY: number; t: number; side: number };
      opacity: number;
    }
  >();
  for (const packet of data.packets ?? []) {
    livePackets.set(packet.id, { label: packet.label, kind: packet.kind ?? "request", at: packet.at, opacity: 1 });
  }
  const codeHighlights = new Map<string, number[]>();
  /** Each entity's current state within its declared lifecycle. */
  const phases = new Map<string, string>();
  /** An entity's CURRENT representation, plus how far through the change it is.
   * Folded like everything else, so a transform is derived from the timeline
   * rather than remembered — and mid-change both representations exist at once,
   * which is what makes it read as "this became that" instead of a swap. */
  const forms = new Map<string, { kind?: string; label?: string; sublabel?: string; code?: string[]; t: number }>();
  const meters = new Map<string, number>();
  let shake = { amount: 0, seed: 0 };
  /** An entity that has become the stage: 0 = normal, 1 = filling the frame. */
  const expansions = new Map<string, number>();
  /** Packets converging on a shared impact point, and how hard they hit. */
  const impacts = new Map<string, number>();

  // Edges with no explicit `connect` are present from the start; one that is
  // ever connected draws itself only when its moment arrives.
  const everConnected = new Set(
    timeline.filter((a) => a.type === "connect").map((a) => `${(a as { from: string }).from}->${(a as { to: string }).to}`),
  );
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    connected.set(key, everConnected.has(key) ? 0 : 1);
  }

  for (const action of [...timeline].sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (action.startSeconds > atSeconds) break;
    switch (action.type) {
      case "setState":
        accents.set(action.id, action.accent);
        break;
      case "focus":
        focusIds = action.ids;
        break;
      case "connect":
        connected.set(`${action.from}->${action.to}`, progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.6));
        break;
      case "annotate": {
        // A callout FADES IN, holds, then clears. Without the clear, every
        // annotation a scene ever fired stayed at full opacity and they piled
        // up on the same anchor point — two callouts on one object rendered as
        // one illegible smear. `durationSeconds` is the fade; the hold is fixed
        // so a script cannot accidentally leave a label on screen for ever.
        const fadeIn = action.durationSeconds ?? 0.4;
        const inP = progress(atSeconds, action.startSeconds, fadeIn);
        const outP = progress(atSeconds, action.startSeconds + fadeIn + ANNOTATION_HOLD_SECONDS, 0.3);
        const opacity = inP * (1 - outP);
        if (opacity > 0.01) annotations.push({ target: action.target, text: action.text, opacity });
        break;
      }
      case "beat": {
        const dur = action.durationSeconds ?? 1.8;
        const inP = progress(atSeconds, action.startSeconds, 0.28);
        const outP = progress(atSeconds, action.startSeconds + dur, 0.32);
        if (outP < 1)
          beat = {
            text: action.text,
            tone: action.tone ?? "neutral",
            progress: inP,
            out: outP,
            at: action.at ?? "top",
            size: action.size ?? "normal",
          };
        break;
      }
      case "camera": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 1);
        camera = { focus: action.focus, zoom: action.zoom ?? 1, from: { focus: camera.focus, zoom: camera.zoom }, t };
        break;
      }
      case "split": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.7);
        const src = livePackets.get(action.id);
        if (src) {
          src.opacity = 1 - t;
          // Children emerge FROM the parent's own position and spread, so the
          // viewer sees one thing becoming many rather than several things
          // appearing near each other.
          action.into.forEach((childId, i) => {
            const child = livePackets.get(childId);
            if (!child) return;
            child.opacity = t;
            child.at = src.at;
            child.spread = { index: i - (action.into.length - 1) / 2, t };
          });
        }
        break;
      }
      case "merge": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.7);
        for (const id of action.ids) {
          const p = livePackets.get(id);
          if (p) {
            p.opacity = 1 - t;
            p.spread = { index: p.spread?.index ?? 0, t: 1 - t };
          }
        }
        const target = livePackets.get(action.into);
        if (target) {
          target.opacity = t;
          const first = livePackets.get(action.ids[0]);
          target.at = target.at ?? first?.at;
        }
        break;
      }
      case "collide": {
        const dur = action.durationSeconds ?? 1.4;
        const t = Math.min(1, Math.max(0, (atSeconds - action.startSeconds) / dur));
        const host = boxById.get(action.at);
        if (host) {
          action.ids.forEach((id, i) => {
            const p = livePackets.get(id);
            if (!p) return;
            // Both converge on the SAME point at the SAME instant. The
            // simultaneity IS the concept, so it is expressed as shared timing
            // rather than as two separate journeys that happen to overlap.
            p.converge = { toX: host.x, toY: host.y, t, side: i === 0 ? -1 : 1 };
            p.opacity = t >= 1 ? Math.max(0, 1 - (atSeconds - (action.startSeconds + dur)) / 0.5) : 1;
          });
          if (t >= 1 && atSeconds < action.startSeconds + dur + 0.5) {
            const hit = 1 - (atSeconds - (action.startSeconds + dur)) / 0.5;
            impacts.set(action.at, hit);
            shake = { amount: hit * 0.9, seed: atSeconds };
            accents.set(action.at, "danger");
          }
        }
        break;
      }
      case "expand":
        expansions.set(action.id, progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.9));
        break;
      case "collapse":
        expansions.set(action.id, 1 - progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.9));
        break;
      case "transform": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.7);
        forms.set(action.id, {
          kind: action.toKind,
          label: action.toLabel,
          sublabel: action.toSublabel,
          code: action.toCode,
          t,
        });
        break;
      }
      case "emit": {
        const p = livePackets.get(action.id);
        const host = boxById.get(action.from);
        if (p && host) {
          const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.5);
          // Grows OUT of the emitter's own body, so causation is visible.
          p.at = action.from;
          p.emerging = t;
          p.opacity = t;
        }
        break;
      }
      case "absorb": {
        const p = livePackets.get(action.id);
        if (p) {
          const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.5);
          p.absorbing = { into: action.into, t };
          p.opacity = 1 - t;
        }
        break;
      }
      case "mutate": {
        const p = livePackets.get(action.id);
        if (p) {
          if (action.label) p.label = action.label;
          if (action.kind) p.kind = action.kind;
        }
        break;
      }
      case "consume": {
        const p = livePackets.get(action.id);
        if (p) p.opacity = 1 - progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.35);
        break;
      }
      case "send": {
        const p = livePackets.get(action.id);
        if (!p) break;
        const dur = action.durationSeconds ?? 1.4;
        const t = Math.min(1, Math.max(0, (atSeconds - action.startSeconds) / dur));
        if (t >= 1 && action.blockedAt === undefined) {
          // Arrived: the packet now LIVES at its destination and stays visible
          // there until something else moves it.
          p.at = action.path[action.path.length - 1];
          p.flight = undefined;
        } else {
          p.flight = { path: action.path, t, blockedAt: action.blockedAt };
          p.at = undefined;
        }
        break;
      }
      case "phase":
        phases.set(action.id, action.to);
        break;
      case "highlightLine":
        codeHighlights.set(action.id, action.lines);
        break;
      case "count": {
        const dur = action.durationSeconds ?? 1.6;
        const p = progress(atSeconds, action.startSeconds, dur);
        const value = Math.round(action.from + (action.to - action.from) * p);
        counters.set(action.id, `${value.toLocaleString("en-US")}${action.suffix ? ` ${action.suffix}` : ""}`);
        break;
      }
      case "meter": {
        const dur = action.durationSeconds ?? 2;
        const p = progress(atSeconds, action.startSeconds, dur);
        meters.set(action.id, action.from + (action.to - action.from) * p);
        break;
      }
      case "pop": {
        const dur = action.durationSeconds ?? 0.45;
        const p = rawProgress(atSeconds, action.startSeconds, dur);
        // One hit: punch out fast, settle back. sin(pi * p) peaks in the middle
        // and returns to zero, so the object ends exactly where it started.
        if (p > 0 && p < 1) pops.set(action.id, Math.sin(Math.PI * p));
        break;
      }
      case "shake": {
        const dur = action.durationSeconds ?? 0.4;
        const p = rawProgress(atSeconds, action.startSeconds, dur);
        if (p > 0 && p < 1) {
          const decay = 1 - p;
          shake = { amount: decay * (action.intensity === "heavy" ? 1 : 0.45), seed: atSeconds };
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- camera transform ---------------------------------------------------
  const focusPoint = (id: string | undefined): { x: number; y: number } => {
    if (!id) return { x: width / 2, y: safeArea.y + safeArea.height / 2 };
    const box = boxById.get(id);
    return box ? { x: box.x, y: box.y } : { x: width / 2, y: safeArea.y + safeArea.height / 2 };
  };
  const fromPoint = focusPoint(camera.from.focus);
  const toPoint = focusPoint(camera.focus);
  const requestedZoom = camera.from.zoom + (camera.zoom - camera.from.zoom) * camera.t;
  // Resolved against what is actually on stage RIGHT NOW, every frame — a
  // camera authored as a 1.3x push-in silently becomes whatever still keeps
  // every visible object in shot. Cropping a still-relevant object out of frame
  // is never the intended reading of "push in".
  const resolved = resolveCamera(
    layout.boxes,
    {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * camera.t,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * camera.t,
    },
    requestedZoom,
    { width, height },
  );
  const zoom = resolved.zoom;
  const fx = resolved.x;
  const fy = resolved.y;
  // Shake is applied to the camera, not to each object: shaking the objects
  // individually would tear them away from their own connectors, whereas the
  // whole frame lurching is what a physical impact actually looks like.
  const shakeX = shake.amount ? Math.sin(shake.seed * 71) * unit * 0.016 * shake.amount : 0;
  const shakeY = shake.amount ? Math.cos(shake.seed * 97) * unit * 0.013 * shake.amount : 0;
  const cameraTransform = `translate(${width / 2 - fx * zoom + shakeX} ${height / 2 - fy * zoom + shakeY}) scale(${zoom})`;

  const recededIds = new Set(layout.boxes.filter((b) => b.emphasis === "recede").map((b) => b.id));
  const leadIds = new Set(layout.boxes.filter((b) => b.emphasis === "lead").map((b) => b.id));

  /** "At any moment, the screen shows exactly one thing." Emphasis is not only
   * geometric: a `recede` object also drops in opacity, and once something is
   * `lead` everything that is NOT the lead steps back automatically. Without
   * that, every scene renders its whole architecture at equal weight and reads
   * as a wiring diagram whatever the topic — which is precisely why two Shorts
   * about completely different mechanisms looked like the same video. */
  /** How far the stage has been given over to a single entity. */
  const expansionAmount = Math.max(0, ...[...expansions.values()], 0);
  const expandedId = [...expansions.entries()].find(([, v]) => v > 0.01)?.[0];

  /** Geometry an entity draws at. Normally its laid-out box; when it is
   * EXPANDING, it grows toward filling the whole safe area. That is what makes
   * "the viewer moves inside it" a real move rather than a zoom: the entity
   * becomes the stage, instead of the camera merely getting closer to it. */
  const geometryFor = (box: StageBox): StageBox => {
    const t = expansions.get(box.id) ?? 0;
    if (t <= 0.01) return box;
    const targetW = safeArea.width * 0.96;
    // An expanded entity fills the WIDTH, but takes only the height its content
    // actually needs. Blindly filling both meant five lines of code sitting in
    // a box occupying 90% of the frame with two thirds of it empty — which
    // reads as a rendering fault, not as emphasis.
    const codePx = Math.max(24 * (unit / 1080), unit * 0.026);
    const contentH = box.code && box.code.length > 0 ? box.code.length * codePx * 1.5 + codePx * 3.4 : safeArea.height * 0.9;
    const targetH = Math.min(safeArea.height * 0.9, Math.max(contentH, box.height));
    return {
      ...box,
      x: box.x + (safeArea.x + safeArea.width / 2 - box.x) * t,
      y: box.y + (safeArea.y + safeArea.height / 2 - box.y) * t,
      width: box.width + (targetW - box.width) * t,
      height: box.height + (targetH - box.height) * t,
    };
  };

  const opacityFor = (id: string): number => {
    // Everything that is NOT the expanded entity clears out of its way.
    if (expandedId && id !== expandedId) return (visibility.get(id) ?? 1) * (1 - expansionAmount);
    const present = visibility.get(id) ?? 1;
    const focused = focusIds.length === 0 || focusIds.includes(id) ? 1 : DIMMED;
    let emphasisOpacity = 1;
    if (recededIds.has(id)) emphasisOpacity = 0.42;
    else if (leadIds.size > 0 && !leadIds.has(id)) emphasisOpacity = 0.62;
    return present * focused * emphasisOpacity;
  };

  // ---- packets ------------------------------------------------------------
  const segmentFor = (from: string, to: string) => {
    const forward = layout.edges.find((e) => e.from === from && e.to === to);
    if (forward) return forward;
    const back = layout.edges.find((e) => e.from === to && e.to === from);
    if (back) return { ...back, points: [...back.points].reverse() };
    const a = boxById.get(from);
    const b = boxById.get(to);
    if (!a || !b) return null;
    return routeStageEdges([a, b], [{ from, to }], unit)[0] ?? null;
  };

  /** One `flow` action emits `copies` packets down the same path, staggered and
   * fanned laterally. This is how magnitude is DEMONSTRATED rather than
   * claimed: "one failed request became ten thousand" is a sentence, a path
   * filling with packets is the thing itself. Copy 0 is the original and is
   * always drawn at full strength; the rest are progressively quieter so the
   * fan reads as volume behind one subject rather than N competing subjects. */
  const packets = timeline
    .filter((a): a is Extract<StageAction, { type: "flow" }> => a.type === "flow")
    .flatMap((action, index) => {
      const dur = action.durationSeconds ?? 1.4;
      const copies = Math.max(1, action.copies ?? 1);
      const hops = action.path.length - 1;
      const ceiling = action.blockedAt ?? 1;

      return Array.from({ length: copies }, (_, copy) => {
        // Later copies launch later, but the whole fan still finishes inside
        // the action's own duration — otherwise escalation would silently
        // overrun the narration beat that motivates it.
        const stagger = copies > 1 ? (copy / copies) * 0.55 : 0;
        const raw = ((atSeconds - action.startSeconds) / dur - stagger) / (1 - (copies > 1 ? 0.55 : 0));
        if (raw < -0.001 || raw > 1.35) return null;
        const travelled = Math.min(Math.max(raw, 0), 1);
        // A blocked packet decelerates into its wall and stops there, rather
        // than continuing invisibly — the beat IS the stop, so it must be
        // legible.
        const along = Math.min(travelled, ceiling);
        const hopFloat = Math.min(along * hops, hops - 0.0001);
        const hop = Math.floor(hopFloat);
        const within = hopFloat - hop;
        const segment = segmentFor(action.path[hop], action.path[hop + 1]);
        if (!segment) return null;
        const point = pointOnStageEdge(segment, within);
        const tangent = tangentOnStageEdge(segment, within);
        const blocked = action.blockedAt !== undefined && travelled >= ceiling;
        const fade = raw > 1 ? 1 - Math.min(1, (raw - 1) / 0.35) : Math.min(1, raw / 0.12);
        // Fan the copies perpendicular to the CURVE, so they read as a crowd
        // travelling the route rather than one packet flickering.
        const [p0, p1] = segment.points;
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const spreadIndex = copies > 1 ? copy - (copies - 1) / 2 : 0;
        const lateral = spreadIndex * unit * 0.018;
        const offX = -tangent.y * lateral;
        const offY = tangent.x * lateral;
        const dir = tangent;

        return {
          key: `flow-${index}-${copy}`,
          action,
          hopFrom: action.path[hop],
          hopTo: action.path[hop + 1],
          point: { x: point.x + offX, y: point.y + offY },
          dir,
          blocked,
          isLead: copy === 0,
          speed: Math.min(1, (len / Math.max(0.2, dur)) / (unit * 1.2)),
          opacity: Math.max(0, fade) * (copy === 0 ? 1 : 0.55),
        };
      });
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  /** Which connectors currently have something on them. This is what lets a
   * wire be infrastructure at rest and a subject in use — derived from the
   * packets themselves rather than authored, so a script can never forget to
   * light up the wire it is actively using. */
  const liveEdges = new Map<string, number>();
  for (const packet of packets) {
    for (const key of [`${packet.hopFrom}->${packet.hopTo}`, `${packet.hopTo}->${packet.hopFrom}`]) {
      liveEdges.set(key, Math.max(liveEdges.get(key) ?? 0, packet.opacity));
    }
  }

  // Arrival reactions fold into the accent map after the packet list, so a
  // `reactsOnArrival` recolour lands exactly when the packet does.
  for (const action of timeline) {
    if (action.type === "send" && action.reactsOnArrival && action.blockedAt === undefined) {
      const arrival = action.startSeconds + (action.durationSeconds ?? 1.4);
      if (atSeconds >= arrival && atSeconds <= arrival + 0.9) {
        accents.set(action.path[action.path.length - 1], action.reactsOnArrival);
      }
    }
    if (action.type !== "flow" || !action.reactsOnArrival || action.blockedAt !== undefined) continue;
    const dur = action.durationSeconds ?? 1.4;
    const arrival = action.startSeconds + dur;
    if (atSeconds >= arrival && atSeconds <= arrival + 0.9) {
      accents.set(action.path[action.path.length - 1], action.reactsOnArrival);
    }
  }

  const strokeBase = Math.max(2.5, unit * 0.0032);

  return (
    <SceneFrame
      backgroundColor={backgroundColor}
      backgroundImage={backgroundImage}
      backgroundImageMode={backgroundImageMode}
      backgroundImageSide={backgroundImageSide}
      orientation={orientation}
    >
      {(() => {
        // The world picks the backdrop unless a script overrides it, so a topic
        // gets its own ground without every script having to remember to say so.
        const kind = data.backdrop ?? world.backdrop;
        if (kind === "none") return null;
        if (kind === "liveMap") return <LiveMapBackdrop />;
        return <Backdrop kind={kind} width={width} height={height} atSeconds={atSeconds} tint={world.tint} energy={energy} />;
      })()}

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
        <g transform={cameraTransform}>
          {/* Connectors under everything — a wire is context, not a subject. */}
          {layout.edges.map((edge, i) => {
            const draw = connected.get(`${edge.from}->${edge.to}`) ?? 1;
            if (draw <= 0) return null;
            const op = Math.min(opacityFor(edge.from), opacityFor(edge.to)) * draw;
            if (op <= 0.01) return null;
            const [a, b] = edge.points;
            const x2 = a.x + (b.x - a.x) * draw;
            const y2 = a.y + (b.y - a.y) * draw;
            // A LIVE WIRE. A connector drawn as a plain static line is a dead
            // line, and a frame full of dead lines is why the stage looked
            // frozen between authored events. Dashes marching along it read as
            // "this connection carries traffic" — semantically honest ambient
            // motion, not decoration, and it means no frame is ever still.
            const march = -(atSeconds * 46 * world.flow * energy) % 26;
            // Draw the actual bezier the packets travel, partially, so a
            // connector still draws itself on. Straight rules between
            // rectangles are the strongest "generic diagram" signal there is.
            const c = edge.control;
            const mx = a.x + (x2 - a.x);
            void mx;
            const path = `M ${a.x} ${a.y} Q ${a.x + (c.x - a.x) * draw} ${a.y + (c.y - a.y) * draw} ${x2} ${y2}`;
            // A WIRE IS INFRASTRUCTURE, NOT A SUBJECT. Drawn at full strength
            // all the time, connectors are what make every scene read as "some
            // boxes joined by arrows" regardless of what it is actually about —
            // the frame becomes a wiring diagram and the thing being explained
            // has to compete with its own plumbing. So a wire sits at a whisper
            // until traffic is actually on it, then lights up. The viewer's eye
            // goes to what is happening, not to the map.
            const live = liveEdges.get(`${edge.from}->${edge.to}`) ?? 0;
            const restOpacity = 0.16 + 0.5 * live;
            return (
              <g key={`e${i}`} opacity={op}>
                <path
                  d={path}
                  fill="none"
                  stroke={live > 0.05 ? ACCENTS.primary.stroke : EDGE_COLOR}
                  strokeWidth={strokeBase * (0.75 + 0.5 * live)}
                  opacity={restOpacity}
                  strokeLinecap="round"
                />
                {energy > 0.3 && live > 0.05 ? (
                  <path
                    d={path}
                    fill="none"
                    stroke={ACCENTS.primary.stroke}
                    strokeWidth={strokeBase * 0.9}
                    strokeDasharray={edge.style === "dashed" ? "12 14" : "5 21"}
                    strokeDashoffset={march}
                    opacity={0.9 * live}
                    strokeLinecap="round"
                  />
                ) : null}
              </g>
            );
          })}

          {[...layout.boxes]
            .sort((a, b) => Number(b.isContainer) - Number(a.isContainer))
            .map((laidOut) => {
            const box = geometryFor(laidOut);
            const op = opacityFor(box.id);
            if (op <= 0.01) return null;
            const accent = ACCENTS[accents.get(box.id) ?? "neutral"];
            const present = visibility.get(box.id) ?? 1;
            // Entering objects scale up slightly into place; a pure fade reads
            // as a slide deck, a slight overshoot reads as arrival.
            const pop = pops.get(box.id) ?? 0;
            const isLeadBox = box.emphasis === "lead";
            // The subject BREATHES. Continuous, tiny, and only on whatever is
            // currently leading — enough that the frame is never completely
            // still, small enough that it never competes with a real event.
            const breathe = isLeadBox ? Math.sin(atSeconds * 2.1 * world.pulse) * 0.012 * energy : 0;
            const enterScale = (0.9 + 0.1 * present) * (1 + pop * 0.14 + breathe);
            const labelPx = Math.max(30 * (unit / 1080), box.height * 0.2);
            const subPx = Math.max(22 * (unit / 1080), box.height * 0.14);
            const shift = labelOffsetFor(box);
            const isLead = isLeadBox;
            return (
              <g key={box.id} opacity={op} transform={`translate(${box.x} ${box.y}) scale(${enterScale}) translate(${-box.x} ${-box.y})`}>
                {impacts.has(box.id) ? (
                  // The target visibly TAKES the hit — a ring blowing outward
                  // on the frame the two packets meet. Simultaneity is the
                  // whole concept of a race condition, and it has to be felt at
                  // the moment of contact or it is not communicated at all.
                  <rect
                    x={box.x - box.width / 2 - unit * 0.03 * impacts.get(box.id)!}
                    y={box.y - box.height / 2 - unit * 0.03 * impacts.get(box.id)!}
                    width={box.width + unit * 0.06 * impacts.get(box.id)!}
                    height={box.height + unit * 0.06 * impacts.get(box.id)!}
                    rx={22}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth={strokeBase * 3 * impacts.get(box.id)!}
                    opacity={impacts.get(box.id)!}
                  />
                ) : null}
                {isLead || pop > 0 ? (
                  <rect
                    x={box.x - box.width / 2 - 10 - pop * 14}
                    y={box.y - box.height / 2 - 10 - pop * 14}
                    width={box.width + 20 + pop * 28}
                    height={box.height + 20 + pop * 28}
                    rx={20}
                    fill="none"
                    stroke={pop > 0 ? accent.stroke : accent.glow}
                    strokeWidth={strokeBase * (2.4 + pop * 1.6)}
                    opacity={pop > 0 ? 0.35 + pop * 0.5 : 0.7}
                  />
                ) : null}
                {(() => {
                  const form = forms.get(box.id);
                  if (!form || form.t <= 0) {
                    return <Silhouette box={box} stroke={accent.stroke} fill={accent.fill} strokeWidth={strokeBase * (isLead ? 1.3 : 1)} />;
                  }
                  // BOTH representations exist during the change: the old one
                  // fades and contracts while the new one grows in its place.
                  // A hard swap would say "here is a different thing"; this says
                  // "this became that", which is the actual claim.
                  const after = { ...box, kind: (form.kind ?? box.kind) as typeof box.kind, code: form.code ?? box.code };
                  return (
                    <g>
                      {form.t < 1 ? (
                        <g opacity={1 - form.t} transform={`translate(${box.x} ${box.y}) scale(${1 - form.t * 0.12}) translate(${-box.x} ${-box.y})`}>
                          <Silhouette box={box} stroke={accent.stroke} fill={accent.fill} strokeWidth={strokeBase} />
                        </g>
                      ) : null}
                      <g opacity={form.t} transform={`translate(${box.x} ${box.y}) scale(${0.88 + form.t * 0.12}) translate(${-box.x} ${-box.y})`}>
                        <Silhouette box={after} stroke={accent.stroke} fill={accent.fill} strokeWidth={strokeBase * (isLead ? 1.3 : 1)} />
                      </g>
                    </g>
                  );
                })()}
                {box.label && box.isContainer ? (
                  // A container names itself QUIETLY, in its own header band,
                  // the way a real cloud diagram labels a VPC. Sized from the
                  // frame rather than from the box: a region is large by
                  // definition, and deriving its type size from its own height
                  // made the context label louder than the thing inside it.
                  <text
                    x={box.x - box.width / 2 + unit * 0.03}
                    y={box.y - box.height / 2 + unit * 0.045}
                    textAnchor="start"
                    fill="#8fa2bf"
                    fontFamily={MONO_FONT}
                    fontWeight={600}
                    fontSize={unit * 0.026}
                    letterSpacing="0.08em"
                  >
                    {box.label.toUpperCase()}
                  </text>
                ) : null}

                {(() => {
                  const form = forms.get(box.id);
                  const shown = form && form.t > 0.5 ? { ...box, code: form.code ?? box.code } : box;
                  return shown.code && shown.code.length > 0 ? (
                    <g opacity={form ? Math.max(0, form.t > 0.5 ? 1 : 1 - form.t * 2) : 1}>
                      <CodePane box={shown} unit={unit} highlighted={codeHighlights.get(box.id)} accent={accent.stroke} />
                    </g>
                  ) : null;
                })()}

                {box.captionBelow && !box.isContainer
                  ? (() => {
                      // Caption UNDER the silhouette, so the shape stays exact.
                      const form = forms.get(box.id);
                      const shownLabel = form && form.t > 0.5 && form.label !== undefined ? form.label : box.label;
                      const shownSub = form && form.t > 0.5 && form.sublabel !== undefined ? form.sublabel : box.sublabel;
                      const counterText = counters.get(box.id);
                      const subText = counterText ?? shownSub;
                      const top = box.y + box.height / 2 + labelPx * 0.95;
                      return (
                        <g>
                          {shownLabel ? (
                            <text x={box.x} y={top} textAnchor="middle" fill="#ffffff" fontFamily={STAGE_FONT} fontWeight={800} fontSize={labelPx}>
                              {shownLabel}
                            </text>
                          ) : null}
                          {subText ? (
                            <text
                              x={box.x}
                              y={top + subPx * 1.25}
                              textAnchor="middle"
                              fill={counterText ? accent.stroke : "#9fb0cc"}
                              fontFamily={MONO_FONT}
                              fontWeight={counterText ? 700 : 500}
                              fontSize={counterText ? subPx * 1.15 : subPx}
                            >
                              {subText}
                            </text>
                          ) : null}
                        </g>
                      );
                    })()
                  : null}

                {!box.isContainer && !box.code && !box.captionBelow
                  ? (() => {
                      // ONE layout for everything inside the box, so the brand
                      // mark, label, sublabel and replica pips cannot collide
                      // with each other however the silhouette is drawn.
                      // The label follows the transform too — an entity that
                      // became something else must not keep announcing itself as
                      // the thing it used to be.
                      const form = forms.get(box.id);
                      // `toLabel: ""` means CLEAR the label — an entity that
                      // became a code pane must stop announcing itself as the
                      // token it used to be. Checking truthiness treated the
                      // empty string as "unset" and kept the stale name.
                      const shownLabel = form && form.t > 0.5 && form.label !== undefined ? form.label : box.label;
                      const shownSub = form && form.t > 0.5 && form.sublabel !== undefined ? form.sublabel : box.sublabel;
                      const zones = boxZones({ ...box, label: shownLabel }, labelPx, subPx, shift);
                      const counterText = counters.get(box.id);
                      const subText = counterText ?? shownSub;
                      return (
                        <g>
                          {zones.plate ? (
                            <rect
                              x={zones.plate.x}
                              y={zones.plate.y}
                              width={zones.plate.width}
                              height={zones.plate.height}
                              rx={labelPx * 0.3}
                              fill="rgba(9, 11, 15, 0.8)"
                            />
                          ) : null}
                          {zones.logo ? (
                            <BrandMark box={box} size={zones.logo.size} cx={zones.logo.cx} cy={zones.logo.cy} />
                          ) : null}
                          {shownLabel ? (
                            <text x={box.x} y={zones.labelY} textAnchor="middle" fill="#ffffff" fontFamily={STAGE_FONT} fontWeight={800} fontSize={labelPx}>
                              {shownLabel}
                            </text>
                          ) : null}
                          {subText ? (
                            <text
                              x={box.x}
                              y={zones.sublabelY}
                              textAnchor="middle"
                              fill={counterText ? accent.stroke : "#9fb0cc"}
                              fontFamily={MONO_FONT}
                              fontWeight={counterText ? 700 : 500}
                              fontSize={counterText ? subPx * 1.15 : subPx}
                            >
                              {subText}
                            </text>
                          ) : null}
                        </g>
                      );
                    })()
                  : null}

                {box.logoPath && box.captionBelow ? (
                  // With the caption outside, a brand mark can own the whole
                  // interior — a logo has to be recognisable at a glance on a
                  // phone screen, and a small mark tucked in a corner is not.
                  <BrandMark
                    box={box}
                    size={Math.min(box.width * 0.62, box.height * 0.46)}
                    cx={box.x}
                    cy={box.y - (box.kind === "phone" ? box.height * 0.04 : 0)}
                  />
                ) : null}

                {box.states && box.states.length > 0
                  ? (() => {
                      // The entity WEARS its state. A lifecycle that exists only
                      // in the timeline is invisible to the viewer; showing the
                      // current state plus how far through the sequence it is
                      // turns "the cache is red now" into "the cache has
                      // missed, and there are two steps still to come".
                      const current = phases.get(box.id) ?? box.states[0];
                      const index = Math.max(0, box.states.indexOf(current));
                      const chipPx = Math.max(18 * (unit / 1080), box.height * 0.11);
                      const railY = box.y - box.height / 2 + chipPx * 1.1;
                      const dotR = Math.max(2.5, chipPx * 0.17);
                      const railW = box.states.length * dotR * 3.4;
                      return (
                        <g>
                          <text
                            x={box.x - box.width / 2 + chipPx * 0.6}
                            y={railY}
                            textAnchor="start"
                            fill={accent.stroke}
                            fontFamily={MONO_FONT}
                            fontWeight={700}
                            fontSize={chipPx}
                            letterSpacing="0.08em"
                          >
                            {current.toUpperCase()}
                          </text>
                          {box.states.map((_, i) => (
                            <circle
                              key={i}
                              cx={box.x + box.width / 2 - railW + i * dotR * 3.4}
                              cy={railY - chipPx * 0.32}
                              r={dotR}
                              fill={accent.stroke}
                              opacity={i <= index ? 0.95 : 0.24}
                            />
                          ))}
                        </g>
                      );
                    })()
                  : null}

                {meters.has(box.id) ? (
                  <g>
                    <rect
                      x={box.x - box.width * 0.38}
                      y={box.y + box.height / 2 - box.height * 0.045}
                      width={box.width * 0.76}
                      height={Math.max(5, box.height * 0.028)}
                      rx={3}
                      fill="rgba(255,255,255,0.10)"
                    />
                    <rect
                      x={box.x - box.width * 0.38}
                      y={box.y + box.height / 2 - box.height * 0.045}
                      width={box.width * 0.76 * Math.max(0, Math.min(1, meters.get(box.id)!))}
                      height={Math.max(5, box.height * 0.028)}
                      rx={3}
                      fill={accent.stroke}
                    />
                  </g>
                ) : null}
              </g>
            );
          })}

          {annotations.map((annotation, i) => {
            // Anchored to the geometry the object is ACTUALLY drawn at. Using
            // the laid-out box meant a callout on an expanded entity was placed
            // against the small box it used to be, landing it at the frame edge
            // while the pane it labels filled the screen.
            const laidOut = boxById.get(annotation.target);
            if (!laidOut) return null;
            const box = geometryFor(laidOut);
            // Capped against the FRAME, not the box. Deriving it from box
            // height alone meant an expanded entity — which fills the stage —
            // rendered its callout at display size, swamping the thing it was
            // annotating.
            const px = Math.min(unit * 0.042, Math.max(24 * (unit / 1080), box.height * 0.17));
            // Choose the side that actually HAS room for this specific string,
            // then clamp. Flipping on the object's position alone was not
            // enough: a centred object with a long callout still overflowed,
            // because whether it fits depends on the text, not on the box. An
            // annotation running off frame is precisely the class of bug this
            // medium promises to make unrepresentable, so it is solved here
            // rather than left to each script to avoid.
            const textW = annotation.text.length * px * 0.6;
            const gap = unit * 0.02;
            // THE VIEWPORT IN WORLD COORDINATES. Annotations live inside the
            // camera-transformed group, so clamping against the frame's own
            // 0..width was wrong the moment any scene zoomed: at zoom 1.28 a
            // callout that fits the world still lands off screen. What bounds
            // it is what the camera can currently SEE.
            const viewLeft = fx - width / (2 * zoom);
            const viewRight = fx + width / (2 * zoom);
            const rightEdge = box.x + box.width / 2 + gap + textW;
            const leftEdge = box.x - box.width / 2 - gap - textW;
            const roomRight = rightEdge <= viewRight - gap;
            const roomLeft = leftEdge >= viewLeft + gap;
            // Prefer right; fall back to left; if neither side fits, centre it
            // over the object and let it sit above.
            const side = roomRight ? "right" : roomLeft ? "left" : "over";
            const ax =
              side === "right"
                ? box.x + box.width / 2 + gap
                : side === "left"
                  ? box.x - box.width / 2 - gap
                  : Math.min(Math.max(box.x, viewLeft + gap + textW / 2), viewRight - gap - textW / 2);
            return (
              <text
                key={`a${i}`}
                x={ax}
                y={box.y - box.height / 2 - px * (box.isContainer ? 0.9 : 0.2)}
                textAnchor={side === "right" ? "start" : side === "left" ? "end" : "middle"}
                fill="#ffd76a"
                fontFamily={MONO_FONT}
                fontWeight={600}
                fontSize={px}
                opacity={annotation.opacity * opacityFor(annotation.target)}
              >
                {annotation.text}
              </text>
            );
          })}

          {[...livePackets.entries()].map(([id, p]) => {
            if (p.opacity <= 0.02) return null;
            let point: { x: number; y: number } | null = null;
            let dir = { x: 1, y: 0 };
            let blocked = false;
            if (p.flight) {
              const hops = p.flight.path.length - 1;
              const along = Math.min(p.flight.t, p.flight.blockedAt ?? 1);
              const hopFloat = Math.min(along * hops, hops - 0.0001);
              const hop = Math.floor(hopFloat);
              const segment = segmentFor(p.flight.path[hop], p.flight.path[hop + 1]);
              if (segment) {
                point = pointOnStageEdge(segment, hopFloat - hop);
                dir = tangentOnStageEdge(segment, hopFloat - hop);
                blocked = p.flight.blockedAt !== undefined && p.flight.t >= p.flight.blockedAt;
              }
            } else if (p.converge) {
              // Enters from its own side of the frame and meets the other at
              // the target, both arriving on the same frame.
              //
              // They stop just SHORT of the same point rather than on it: two
              // packets converging to identical coordinates render exactly on
              // top of each other, so the frame that is supposed to prove
              // "both arrived at once" shows only one of them. Keeping a small
              // separation at contact is what makes the simultaneity readable.
              const contactGap = unit * 0.11;
              const endX = p.converge.toX + p.converge.side * contactGap;
              // Above the target, so the cards never cover its own label.
              const endY = p.converge.toY - unit * 0.16;
              const startX = p.converge.toX + p.converge.side * width * 0.45;
              const startY = endY - unit * 0.16;
              point = {
                x: startX + (endX - startX) * p.converge.t,
                y: startY + (endY - startY) * p.converge.t,
              };
            } else if (p.absorbing) {
              const host = boxById.get(p.absorbing.into);
              if (host) {
                // Travels INTO the object and shrinks away inside it.
                const from = p.at ? boxById.get(p.at) : undefined;
                const sx = from ? from.x : host.x;
                const sy = from ? from.y - from.height * 0.28 : host.y - host.height;
                point = { x: sx + (host.x - sx) * p.absorbing.t, y: sy + (host.y - sy) * p.absorbing.t };
              }
            } else if (p.at) {
              // PARKED. A packet that has arrived rests just outside its host
              // rather than vanishing into it — the viewer can see the request
              // is still there, waiting, which is the whole point of it being
              // persistent rather than a one-shot animation.
              // Parked to the SIDE, not directly above: annotations already own
              // the space above an object, and a parked packet landing there
              // collided with every callout. Flips to the left near the right
              // edge so it can never sit off frame.
              const host = boxById.get(p.at);
              if (host) {
                const right = host.x < width * 0.55;
                const fan = p.spread ? p.spread.index * unit * 0.16 * p.spread.t : 0;
                point = {
                  x: host.x + (right ? host.width / 2 + unit * 0.12 : -(host.width / 2 + unit * 0.12)) + fan,
                  y: host.y - host.height * 0.28 - (p.spread ? Math.abs(p.spread.index) * unit * 0.02 * p.spread.t : 0),
                };
              }
            }
            if (!point) return null;
            return (
              <Packet
                key={`pk-${id}`}
                x={point.x}
                y={point.y}
                dir={dir}
                speed={p.flight ? 0.5 : 0}
                label={p.label}
                kind={p.kind}
                blocked={blocked}
                opacity={p.opacity}
                unit={unit}
                atSeconds={atSeconds}
              />
            );
          })}

          {packets.map((packet) => (
            <Packet
              key={packet.key}
              x={packet.point.x}
              y={packet.point.y}
              dir={packet.dir}
              speed={packet.speed}
              // Only the lead copy carries the payload text. Twenty packets all
              // spelling out "GET /orders" is unreadable noise; one labelled
              // packet leading an unlabelled crowd reads instantly as "this,
              // many times over".
              label={packet.isLead ? (packet.action.magnitude ?? packet.action.label) : undefined}
              kind={packet.action.kind ?? "request"}
              blocked={packet.blocked}
              opacity={packet.opacity}
              unit={unit}
              atSeconds={atSeconds}
            />
          ))}
        </g>
      </svg>

      {beat ? <BeatText beat={beat} width={width} height={height} unit={unit} /> : null}
    </SceneFrame>
  );
};

/** REAL CODE, not an illustration of code.
 *
 * The `code` silhouette draws indented rules that read as "some code"; that is
 * fine as scenery and useless as teaching. When an object carries actual source,
 * this renders it with line numbers in a monospace face and supports the one
 * move that matters for teaching code: brighten the line being discussed and
 * dim the rest, so the viewer's eye is on the exact line the narrator is
 * talking about rather than hunting for it.
 *
 * Deliberately no syntax highlighting yet. A line-level highlight is what the
 * narration can actually drive; per-token colour is decoration until something
 * needs it. */
const CodePane: React.FC<{ box: StageBox; unit: number; highlighted?: number[]; accent: string }> = ({ box, unit, highlighted, accent }) => {
  const lines = box.code ?? [];
  const px = Math.max(24 * (unit / 1080), unit * 0.026);
  const lineH = px * 1.5;
  const top = box.y - box.height / 2 + px * 1.9;
  const left = box.x - box.width / 2 + px * 1.2;
  const gutter = px * 2.2;
  const active = highlighted && highlighted.length > 0;

  return (
    <g>
      {lines.map((text, i) => {
        const n = i + 1;
        const lit = !active || highlighted!.includes(n);
        const y = top + i * lineH;
        return (
          <g key={i} opacity={lit ? 1 : 0.26}>
            {lit && active ? (
              <rect x={box.x - box.width / 2 + px * 0.4} y={y - px * 0.95} width={box.width - px * 0.8} height={lineH} rx={px * 0.22} fill={accent} opacity={0.14} />
            ) : null}
            <text x={left} y={y} textAnchor="start" fill="#5c6b85" fontFamily={MONO_FONT} fontWeight={500} fontSize={px * 0.82}>
              {n}
            </text>
            <text x={left + gutter} y={y} textAnchor="start" fontFamily={MONO_FONT} fontWeight={500} fontSize={px} xmlSpace="preserve">
              {tokenizeLine(text).map((span, k) => (
                <tspan key={k} fill={CODE_COLORS[span.token]}>
                  {span.text}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
};

/** A packet is a real object carrying real text — "GET /refund", "200 OK",
 * "SELECT * FROM orders". A bare dot travelling a line says only "something is
 * happening", which is the generic motion this whole medium exists to replace:
 * the viewer should be able to pause on any frame and know exactly what is
 * moving and why. */
const Packet: React.FC<{
  x: number;
  y: number;
  dir: { x: number; y: number };
  speed: number;
  label?: string;
  kind: string;
  blocked: boolean;
  opacity: number;
  unit: number;
  atSeconds: number;
}> = ({ x, y, dir, speed, label, kind, blocked, opacity, unit, atSeconds }) => {
  const style = FLOW_STYLES[kind] ?? FLOW_STYLES.request;
  const color = blocked ? FLOW_STYLES.error.color : style.color;
  const fontSize = Math.max(21 * (unit / 1080), unit * 0.023);
  const text = `${style.glyph && !blocked ? `${style.glyph} ` : ""}${label ?? ""}`.trim();
  const padX = fontSize * 0.7;
  const w = Math.max(text.length * fontSize * 0.62 + padX * 2, unit * 0.06);
  const h = fontSize * 2;
  // A blocked packet judders against the wall instead of resting on it — a
  // stopped object with no residual motion reads as a rendering glitch.
  const shake = blocked ? Math.sin(atSeconds * 26) * unit * 0.004 : 0;
  const radius = style.shape === "pill" ? h / 2 : style.shape === "chevron" ? h * 0.22 : h * 0.14;

  // A streak behind the packet, scaled by how fast it is actually travelling.
  // Without it a quick packet reads as a card teleporting between positions —
  // the trail is what makes speed legible at 30fps.
  const trail = blocked ? 0 : speed * unit * 0.14;

  return (
    <g opacity={opacity} transform={`translate(${x + shake} ${y})`}>
      {trail > 4 ? (
        <line
          x1={-dir.x * trail}
          y1={-dir.y * trail}
          x2={-dir.x * h * 0.4}
          y2={-dir.y * h * 0.4}
          stroke={color}
          strokeWidth={h * 0.34}
          strokeLinecap="round"
          opacity={0.28}
        />
      ) : null}
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={radius}
        fill="rgba(10, 12, 16, 0.94)"
        stroke={color}
        strokeWidth={Math.max(2.4, unit * 0.0028)}
        strokeDasharray={blocked || style.dashed ? "8 6" : undefined}
      />
      <text x={0} y={fontSize * 0.36} textAnchor="middle" fill={color} fontFamily={MONO_FONT} fontWeight={700} fontSize={fontSize}>
        {blocked ? `✕ ${label ?? "BLOCKED"}` : text}
      </text>
    </g>
  );
};

/** The headline as a timed ACTOR. It lands, holds, and clears — it is never a
 * banner that sits on screen for the whole scene, which is why the stage schema
 * has no `title` field at all. Rendered OUTSIDE the camera group on purpose: it
 * addresses the viewer directly and must not zoom with the system it is
 * commenting on. */
const BeatText: React.FC<{
  beat: { text: string; tone: string; progress: number; out: number; at: string; size: string };
  width: number;
  height: number;
  unit: number;
}> = ({ beat, height, unit }) => {
  const toneColor = beat.tone === "alert" ? "#f43f5e" : beat.tone === "reveal" ? "#22d3ee" : "#ffffff";
  const rise = (1 - beat.progress) * unit * 0.03;
  const huge = beat.size === "huge";
  // `huge` type is the dominant element of the frame, not a caption above it.
  // This is the standing "full-frame, varied compositions per scene, stop the
  // diagram-in-a-centred-rectangle formula" direction applied to type: a
  // headline can BE the composition for a beat. A heavy shadow rides with it so
  // the words stay legible over whatever the system is doing underneath.
  const fontSize = unit * (huge ? 0.125 : 0.068);
  const vertical =
    beat.at === "center"
      ? { top: 0, bottom: 0, alignItems: "center" as const }
      : beat.at === "bottom"
        ? { bottom: height * 0.2, alignItems: "flex-end" as const }
        : { top: height * 0.045, alignItems: "flex-start" as const };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        ...vertical,
        padding: `0 ${unit * (huge ? 0.06 : 0.08)}px`,
        opacity: beat.progress * (1 - beat.out),
        transform: `translateY(${rise}px)`,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: STAGE_FONT,
          fontWeight: 900,
          fontSize,
          letterSpacing: "-0.025em",
          lineHeight: 0.98,
          color: toneColor,
          textAlign: "center",
          textTransform: "uppercase",
          textShadow: huge
            ? "0 10px 46px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.9)"
            : "0 6px 34px rgba(0,0,0,0.85)",
        }}
      >
        {beat.text}
      </span>
    </div>
  );
};

/** One ground per topic world. Their only job is that no frame is ever visually
 * dead during a narration lull — each must stay low-contrast and never compete
 * with the stage, and none is a substitute for the system itself doing
 * something. What they buy is that a storage video does not open on the same
 * picture as a security video. */
const Backdrop: React.FC<{
  kind: "grid" | "scanlines" | "field" | "depth";
  width: number;
  height: number;
  atSeconds: number;
  tint: string;
  energy: number;
}> = ({ kind, width, height, atSeconds, tint, energy }) => {
  const unit = Math.min(width, height);
  const t = atSeconds * energy;

  const content = () => {
    if (kind === "scanlines") {
      // Security: a surveilled, scanned space. A bright line sweeps the frame.
      const spacing = unit * 0.022;
      const rows = Math.ceil(height / spacing) + 1;
      const sweep = ((t * 0.16) % 1.4) * height - height * 0.2;
      return (
        <>
          <g stroke="rgba(200, 160, 180, 0.07)" strokeWidth={1.2}>
            {Array.from({ length: rows }, (_, i) => (
              <line key={i} x1={0} y1={i * spacing} x2={width} y2={i * spacing} />
            ))}
          </g>
          <rect x={0} y={sweep} width={width} height={unit * 0.1} fill="rgba(244, 63, 94, 0.05)" />
        </>
      );
    }
    if (kind === "field") {
      // Storage / data: stacked blocks, drifting slowly. Heavier than a grid.
      const size = unit * 0.055;
      const cols = Math.ceil(width / size) + 2;
      const rows = Math.ceil(height / size) + 2;
      const drift = (t * 5) % size;
      return (
        <g fill="none" stroke="rgba(200, 190, 160, 0.075)" strokeWidth={1.4}>
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={c * size - size + (r % 2 ? size / 2 : 0)}
                y={r * size - drift}
                width={size * 0.78}
                height={size * 0.5}
                rx={2}
              />
            )),
          )}
        </g>
      );
    }
    if (kind === "depth") {
      // Compute: parallel lanes running, for threads/workers/queues.
      const lanes = 9;
      const gap = width / lanes;
      return (
        <g>
          {Array.from({ length: lanes }, (_, i) => {
            const speed = 40 + ((i * 37) % 60);
            const offset = (t * speed) % (height * 0.5);
            return (
              <g key={i}>
                <line x1={i * gap + gap / 2} y1={0} x2={i * gap + gap / 2} y2={height} stroke="rgba(170, 175, 220, 0.07)" strokeWidth={1.3} />
                <line
                  x1={i * gap + gap / 2}
                  y1={offset - height * 0.5}
                  x2={i * gap + gap / 2}
                  y2={offset - height * 0.32}
                  stroke="rgba(167, 139, 250, 0.16)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>
      );
    }
    const spacing = unit * 0.085;
    const drift = (t * 6) % spacing;
    const cols = Math.ceil(width / spacing) + 2;
    const rows = Math.ceil(height / spacing) + 2;
    return (
      <g stroke="rgba(120, 145, 185, 0.10)" strokeWidth={1.5}>
        {Array.from({ length: cols }, (_, i) => (
          <line key={`c${i}`} x1={i * spacing - drift} y1={0} x2={i * spacing - drift} y2={height} />
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i * spacing - drift} x2={width} y2={i * spacing - drift} />
        ))}
      </g>
    );
  };

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      <rect x={0} y={0} width={width} height={height} fill={tint} />
      {content()}
    </svg>
  );
};
