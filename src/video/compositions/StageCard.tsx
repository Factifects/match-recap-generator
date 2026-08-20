import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing, staticFile, Img } from "remotion";
import { SceneFrame } from "./SceneFrame";
import { LiveMapBackdrop } from "./LiveMapBackdrop";
import { DISPLAY_FONT_FAMILY } from "../theme";
import {
  blendLayouts,
  defaultSafeArea,
  layoutStage,
  paneAreas,
  stagePaneUnit,
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
import { AppSurface } from "./AppSurface";
import { ContextSurface } from "./ContextSurface";
import { Silhouette, BrandMark, boxZones, labelOffsetFor, hexCells, hexPath, CityMap } from "./stageSilhouettes";
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
  { accents: AccentSet; backdrop: "grid" | "scanlines" | "field" | "depth" | "scanner" | "streets" | "branches" | "none"; edge: string; tint: string; flow: number; pulse: number }
> = {
  network: {
    accents: accentSet("#22d3ee", "34, 211, 238", "#4a5a72", "74, 90, 114"),
    backdrop: "grid",
    edge: "rgba(147, 167, 212, 0.55)",
    tint: "rgba(34, 211, 238, 0.05)",
    flow: 1,
    pulse: 1,
  },
  // A world for things that are READ rather than run: codes, barcodes, scanned
  // documents, optical recognition. Near-monochrome with a single green
  // scanner accent, because that is what the subject actually looks like in
  // life — a QR code is black on white, and dressing one in the network world's
  // cyan would fight the only two colours it is allowed to have.
  scan: {
    accents: accentSet("#22c55e", "34, 197, 94", "#4a5568", "74, 85, 104"),
    backdrop: "scanlines",
    edge: "rgba(180, 200, 190, 0.5)",
    tint: "rgba(34, 197, 94, 0.05)",
    // Deliberate and mechanical: a scanner sweeps, it does not dart.
    flow: 0.8,
    pulse: 0.9,
  },
  // A world for PRIVACY AND EXPOSURE: browsers, connections, who can see what.
  // Violet is the private side — the local session, the thing people believe is
  // protected — and it is the only warm-cool anchor in the frame, so anything
  // violet reads as "yours". Everything outside it sits in cold slate, which is
  // the visual argument of the whole subject: your side is small and lit, the
  // rest of the journey is not yours and never was.
  privacy: {
    accents: accentSet("#a78bfa", "167, 139, 250", "#46506b", "70, 80, 107"),
    backdrop: "none",
    edge: "rgba(150, 165, 205, 0.5)",
    tint: "rgba(167, 139, 250, 0.05)",
    // Traffic never stops on the internet, and that is the point being made.
    flow: 1.15,
    pulse: 0.85,
  },
  // A world for MACHINE REASONING: agents, planning, chains of steps, anything
  // where one decision leads to the next. Indigo because it is the register
  // this palette has not spent — network cyan reads as plumbing, city amber as
  // traffic, and neither of those is what thinking looks like. Failure red
  // stays available underneath for the moment a chain breaks.
  reasoning: {
    accents: accentSet("#8b7cf6", "139, 124, 246", "#4a4a6b", "74, 74, 107"),
    backdrop: "branches",
    edge: "rgba(170, 165, 215, 0.5)",
    tint: "rgba(139, 124, 246, 0.05)",
    flow: 1.1,
    pulse: 1.1,
  },
  // A world of STREETS: roads, trips, dispatch, delivery, maps. Cool slate for
  // the city and a warm amber for demand, because every rider app on earth
  // shows a busy area in warm colours and a quiet one in cool ones — borrowing
  // that is not imitation, it is speaking the viewer's existing vocabulary.
  city: {
    accents: accentSet("#f59e0b", "245, 158, 11", "#46536b", "70, 83, 107"),
    backdrop: "streets",
    edge: "rgba(160, 175, 205, 0.45)",
    tint: "rgba(245, 158, 11, 0.05)",
    // Traffic: continuous, unhurried, never still.
    flow: 0.85,
    pulse: 0.8,
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
  // Sealed: a card carrying a padlock. Deliberately a CARD rather than a
  // chevron, because the point of encryption is that the thing is still
  // travelling in plain view — you can watch the envelope go past, you just
  // cannot read the letter.
  encrypted: { color: "#5eead4", shape: "card", glyph: "🔒" },
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
  /** What each code object is SHOWING at this keyframe, which is not what it
   * was declared with: `transform` with `toCode` swaps the whole snippet.
   * Layout has to follow, or a pane sized for a seven-line URL keeps that
   * height after the scene trims it to one line and the frame is left holding
   * a mostly empty box — which is exactly what the first render showed. */
  code: Record<string, string[]>;
}

function buildKeyframes(objects: StageObjectInput[], timeline: StageAction[]): Keyframe[] {
  // An object that is ever explicitly `enter`ed starts off-stage; one that is
  // never mentioned is present from the first frame. That rule is what makes
  // progressive disclosure the default without forcing every script to declare
  // an enter for scenery that was always there.
  const entered = new Set(timeline.filter((a) => a.type === "enter").map((a) => (a as { id: string }).id));
  const state: StageComposition = { place: {}, emphasis: {}, hidden: [...entered] };
  const code: Record<string, string[]> = {};
  for (const object of objects) if (object.code && object.code.length > 0) code[object.id] = object.code;

  const keyframes: Keyframe[] = [{ atSeconds: 0, durationSeconds: 0, composition: cloneComposition(state), code: { ...code } }];

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
    } else if (action.type === "transform" && action.toCode) {
      // A code swap is a layout event, not only a content one: the pane resizes
      // to what it is now holding, and because keyframes blend, the box visibly
      // contracts as the snippet shrinks instead of jumping.
      code[action.id] = action.toCode;
    } else {
      continue;
    }
    keyframes.push({
      atSeconds: action.startSeconds,
      durationSeconds: action.durationSeconds ?? 0.6,
      composition: cloneComposition(state),
      code: { ...code },
    });
  }

  // A `compose` that re-places an object which is currently hidden must not
  // keep it hidden — placing something is an act of showing it. Handled here
  // rather than in the fold so the rule is stated once.
  for (const keyframe of keyframes) {
    const placed = Object.keys(keyframe.composition.place ?? {});
    keyframe.composition.hidden = (keyframe.composition.hidden ?? []).filter((id) => !placed.includes(id));
  }

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

  // THE CITY'S CLOCK. Traffic runs until the explanation stops being about the
  // city and starts being about how it is divided; from the moment the grid
  // lands, the cars hold still so the viewer can read the tiling instead of
  // chasing movement. Derived from the authored `expand`, so it needs no state
  // and lands on exactly the beat the grid does.
  const gridArrivesAt = (data.timeline ?? []).find((a) => a.type === "expand")?.startSeconds;
  const cityClock = gridArrivesAt !== undefined && atSeconds > gridArrivesAt ? gridArrivesAt : atSeconds;

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

  // Everything drawn INSIDE a box letters itself at the same scale the layout
  // sized that box against. In a split stage every object lives in a pane, so
  // one value covers the frame — but it must not stay at the frame's own unit,
  // or a half-width browser gets full-width chrome and text and spills out of
  // its own half.
  // Verbs that mean the actor is merely LOOKING, not operating — drawn as a
  // reading ring rather than a press.
  const READING_VERBS = new Set(["observe", "wait", "decide", "assume"]);

  const pointerFor = (objectId: string) => {
    for (const [actorId, state] of actorState) {
      if (state.target !== objectId || !state.row) continue;
      const declared = (data.actors ?? []).find((a) => a.id === actorId);
      if (declared && (declared.as ?? "cursor") !== "cursor") continue;
      return { row: state.row, fromRow: state.fromRow, t: state.t, reading: READING_VERBS.has(state.verb) };
    }
    return undefined;
  };

  /** The label an actor shows while it is operating something — "assumed
   * Thursday", "typing", "waiting". The verb carries the meaning, so the label
   * never has to be written into the script. */
  const actorLabelFor = (objectId: string) => {
    for (const [actorId, state] of actorState) {
      if (state.target !== objectId) continue;
      const declared = (data.actors ?? []).find((a) => a.id === actorId);
      const name = declared?.label ?? actorId;
      if (state.verb === "assume") return { text: `${name} assumed ${state.value ?? "it"}`, tone: "warn" as const };
      if (state.verb === "observe") return { text: `${name} reads ${state.value ?? ""}`.trim(), tone: "neutral" as const };
      if (state.verb === "decide") return { text: `${name} chose ${state.value ?? ""}`.trim(), tone: "neutral" as const };
      if (state.verb === "fail") return { text: `${name} failed`, tone: "danger" as const };
      if (state.verb === "succeed") return { text: `${name} done`, tone: "success" as const };
      if (state.verb === "wait") return { text: `${name} waiting`, tone: "neutral" as const };
      return undefined;
    }
    return undefined;
  };

  /** NOTHING LEAVES THE FRAME.
   *
   * A packet parked beside its host, a fanned copy, a label sitting to one
   * side — each of those is computed from the host's geometry and none of them
   * knew where the edge was, so anything near the border pushed its own label
   * off screen. Clamping at the point of drawing is the only place that can be
   * guaranteed, because it catches every path into a position: parked, fanned,
   * in flight, converging or emerging.
   *
   * The margin accounts for the packet's OWN width, not just its centre —
   * placing a centre safely inside and letting a long label hang past the edge
   * is the exact failure this exists to stop. */
  const clampToFrame = (point: { x: number; y: number }, labelChars = 0) => {
    const halfW = unit * 0.06 + labelChars * unit * 0.011;
    const halfH = unit * 0.045;
    const margin = unit * 0.02;
    return {
      x: Math.min(Math.max(point.x, safeArea.x + margin + halfW), safeArea.x + safeArea.width - margin - halfW),
      y: Math.min(Math.max(point.y, safeArea.y + margin + halfH), safeArea.y + safeArea.height - margin - halfH),
    };
  };

  const boxUnit = data.splitScreen
    ? stagePaneUnit({ width, height }, data.splitScreen.orientation ?? "vertical")
    : unit;

  const layouts = React.useMemo(
    () =>
      keyframes.map((k) =>
        layoutStage(objects.map((o) => (k.code[o.id] ? { ...o, code: k.code[o.id] } : o)), edges, k.composition, {
          frame: { width, height },
          safeArea,
          split: data.splitScreen ? { orientation: data.splitScreen.orientation ?? "vertical" } : undefined,
        }),
      ),
    [keyframes, objects, edges, width, height, safeArea, data.splitScreen],
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
  /** Live values written into specific UI rows — a receipt's running total. */
  const rowCounters = new Map<string, string>();
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
  /** Which actor, if any, is currently operating a given object — and how it
   * should be drawn there. An interface does not need to know about actors in
   * general, only about the one with its hands on it. */
  /** THE PROTECTIVE BOUNDARY currently on stage, and the one it is moving from
   * — a shield contracting from what people assume it covers onto what it
   * actually covers is the whole teaching in a privacy explanation. */
  let shield: { over: string[]; from?: string[]; label?: string; tone: string; t: number } | undefined;
  /** WHICH SCREEN each application is showing, what it was showing before, and
   * how far through the change it is — the state that drives composition. */
  const appScreens = new Map<
    string,
    { screen?: string; previous?: string; t: number; kind: "slide" | "fade" | "expand"; overlay?: string; overlayT: number }
  >();
  /** WHERE EVERY ACTOR IS and what it is doing, derived from `act`. Held after
   * each action so an actor stays where it left off rather than teleporting. */
  const actorState = new Map<
    string,
    { target?: string; row?: string; fromTarget?: string; fromRow?: string; t: number; verb: string; value?: string }
  >();
  /** Values typed into application elements, keyed by element id. */
  const appTyped = new Map<string, string>();
  /** Values an actor has TYPED into a row, so the field shows what was entered. */
  const typedValues = new Map<string, string>();
  /** THE AGENT'S HAND on each interface: which row it is travelling to, which
   * row it left, and how far through the move it is. */
  const pointers = new Map<string, { row: string; fromRow?: string; t: number; reading: boolean }>();
  /** Hex maps showing ONE tile with the rest muted, and how far in. */
  const spotlights = new Map<string, number>();
  /** Which objects are being READ, and how far through. */
  const scans = new Map<string, { t: number; locked: boolean }>();
  /** What is COVERING each object, and how completely. */
  const occlusions = new Map<string, { area: string; amount: number }>();
  /** When each packet was last acted on, so one left parked can time out. */
  const packetTouched = new Map<string, number>();
  /** Each entity's current state within its declared lifecycle. */
  const phases = new Map<string, string>();
  /** An entity's CURRENT representation, plus how far through the change it is.
   * Folded like everything else, so a transform is derived from the timeline
   * rather than remembered — and mid-change both representations exist at once,
   * which is what makes it read as "this became that" instead of a swap. */
  const forms = new Map<string, { kind?: string; label?: string; sublabel?: string; code?: string[]; t: number }>();
  const meters = new Map<string, number>();
  let shake = { amount: 0, seed: 0 };
  /** The mascot's current face, and when it changed. */
  let mascotFace = { expression: (data.mascot?.expression ?? "puzzled") as string, changedAt: -10 };
  /** An entity that has become the stage: 0 = normal, 1 = filling the frame. */
  const expansions = new Map<string, number>();
  /** How many items each object is currently holding. */
  const piles = new Map<string, number>();
  /** 0 healthy .. 1 gone. */
  const degradation = new Map<string, number>();
  /** UI rows currently revealed or hidden, and any press in progress. */
  const uiVisible = new Map<string, boolean>();
  const uiPress = new Map<string, number>();
  /** Rows/lines currently lifting out of their source, so the source can show
   * the gap they left. */
  const detached = new Map<string, { row?: string; line?: number; t: number }>();
  /** Compressed clock, if one is running. */
  let timeLapse: { label: string; factor: number; t: number } | null = null;
  /** Whose point of view the scene is currently taking. */
  let viewpoint: { to: string; t: number } | null = null;
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
    if ("id" in action && livePackets.has(action.id)) packetTouched.set(action.id, action.startSeconds);
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
      case "detach": {
        const dur = action.durationSeconds ?? 0.8;
        const t = progress(atSeconds, action.startSeconds, dur);
        const packet = livePackets.get(action.id);
        const host = boxById.get(action.from);
        if (packet && host) {
          // The piece LEAVES: it rises out of the source's body rather than
          // fading in beside it, so the viewer sees where it came from.
          packet.at = action.from;
          packet.emerging = t;
          packet.opacity = t;
          if (t < 1) detached.set(action.from, { row: action.row, line: action.line, t });
        }
        break;
      }
      case "timeLapse": {
        const dur = action.durationSeconds ?? 3;
        const t = rawProgress(atSeconds, action.startSeconds, dur);
        if (t > 0 && t < 1) timeLapse = { label: action.label, factor: action.factor ?? 6, t };
        break;
      }
      case "perspective": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.8);
        viewpoint = { to: action.to, t };
        if (action.focus) focusIds = [action.focus];
        break;
      }
      case "accumulate": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 2);
        piles.set(action.id, action.from + (action.to - action.from) * t);
        break;
      }
      case "spotlight": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.8);
        spotlights.set(action.id, t);
        break;
      }
      case "scan": {
        const dur = action.durationSeconds ?? 1.6;
        const t = rawProgress(atSeconds, action.startSeconds, dur);
        // Held after it completes, so a locked-on reticle stays around the
        // subject instead of vanishing the instant it succeeds.
        if (t > 0) scans.set(action.id, { t: Math.min(1, t), locked: t >= 1 });
        break;
      }
      case "occlude": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.5);
        occlusions.set(action.id, { area: action.area ?? "third", amount: (action.amount ?? 1) * t });
        break;
      }
      case "degrade": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 3);
        degradation.set(action.id, action.from + (action.to - action.from) * t);
        break;
      }
      case "shield": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.9);
        shield =
          action.over.length === 0 && t >= 1
            ? undefined
            : {
                over: action.over,
                from: shield && shield.over.join() !== action.over.join() ? shield.over : undefined,
                label: action.label ?? shield?.label,
                tone: action.tone ?? "actual",
                t,
              };
        break;
      }
      case "screen": {
        const dur = action.durationSeconds ?? 0.7;
        const t = progress(atSeconds, action.startSeconds, dur);
        const previous = appScreens.get(action.id);
        // An overlay-only change must NOT invent a screen id. Leaving it
        // undefined lets the renderer fall back to the object's declared
        // screen; storing an empty string looked like a real id and sent the
        // renderer looking for a screen that does not exist.
        const nextScreen = action.to ?? previous?.screen;
        const overlayGiven = action.overlay !== undefined;
        appScreens.set(action.id, {
          screen: nextScreen,
          previous: action.to && previous && previous.screen !== action.to ? previous.screen : previous?.previous,
          t: action.to ? t : 1,
          kind: action.transition ?? "slide",
          overlay: overlayGiven ? (action.overlay === "" ? undefined : action.overlay) : previous?.overlay,
          // An overlay opening and an overlay closing are the same progress
          // run in opposite directions.
          overlayT: overlayGiven ? (action.overlay === "" ? 1 - t : t) : (previous?.overlayT ?? 0),
        });
        break;
      }
      case "act": {
        const dur = action.durationSeconds ?? 0.8;
        const t = progress(atSeconds, action.startSeconds, dur);
        const previous = actorState.get(action.actor);
        const movedTarget = action.target ?? previous?.target;
        const movedRow = action.row ?? (action.target && action.target !== previous?.target ? undefined : previous?.row);
        actorState.set(action.actor, {
          target: movedTarget,
          row: movedRow,
          fromTarget: previous?.target !== movedTarget ? previous?.target : undefined,
          fromRow: previous?.row !== movedRow ? previous?.row : undefined,
          t,
          verb: action.verb,
          value: action.value ?? previous?.value,
        });
        // TYPE writes into the field as it goes, so the form fills in under the
        // cursor instead of appearing complete the instant the actor arrives.
        if (action.verb === "type" && action.target && action.row && action.value) {
          const shown = action.value.slice(0, Math.max(0, Math.round(action.value.length * t)));
          typedValues.set(`${action.target}:${action.row}`, shown);
          appTyped.set(action.row, shown);
        }
        // The interaction verbs also drive the interface's own feedback.
        if ((action.verb === "click" || action.verb === "select") && action.target && action.row) {
          const p = rawProgress(atSeconds, action.startSeconds, dur);
          if (p > 0 && p < 1) uiPress.set(`${action.target}:${action.row}`, p);
        }
        break;
      }
      case "pointer": {
        const t = progress(atSeconds, action.startSeconds, action.durationSeconds ?? 0.7);
        const previous = pointers.get(action.id);
        // Held after arrival, so the hand stays where it landed instead of
        // vanishing between actions — an agent that teleports reads as magic.
        pointers.set(action.id, {
          row: action.row,
          fromRow: previous && previous.row !== action.row ? previous.row : undefined,
          t,
          reading: action.reading ?? false,
        });
        break;
      }
      case "click": {
        // RAW progress, not the eased dip. The renderer needs both: a press
        // that goes down and back up, and a ripple that only ever expands.
        // Storing the sine threw the second one away, which is why a tap read
        // as a faint nudge rather than as a finger hitting glass.
        const p = rawProgress(atSeconds, action.startSeconds, (action.durationSeconds ?? 0.35) * 2.2);
        if (p > 0 && p < 1) uiPress.set(`${action.id}:${action.row}`, p);
        break;
      }
      case "uiState":
        uiVisible.set(`${action.id}:${action.row}`, action.visible ?? true);
        break;
      case "loop": {
        // The SAME packet coming back around, lap after lap. Each lap can add
        // weight, which is what turns a retry cycle into a storm.
        const packet = livePackets.get(action.id);
        if (!packet) break;
        const interval = action.intervalSeconds ?? 1.2;
        const elapsed = atSeconds - action.startSeconds;
        const lap = Math.floor(elapsed / interval);
        if (lap < 0 || lap >= (action.count ?? 3)) break;
        const within = (elapsed % interval) / interval;
        packet.flight = { path: action.path, t: within };
        packet.at = undefined;
        packet.opacity = 1;
        if (action.degrade) {
          packet.kind = lap === 0 ? packet.kind : lap >= (action.count ?? 3) - 1 ? "error" : "retry";
          packet.spread = { index: lap, t: 1 };
        }
        break;
      }
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
      case "react":
        mascotFace = { expression: action.to, changedAt: action.startSeconds };
        break;
      case "highlightLine":
        codeHighlights.set(action.id, action.lines);
        break;
      case "count": {
        const dur = action.durationSeconds ?? 1.6;
        const p = progress(atSeconds, action.startSeconds, dur);
        const decimals = action.decimals ?? 0;
        const raw = action.from + (action.to - action.from) * p;
        const shown =
          decimals > 0
            ? raw.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
            : Math.round(raw).toLocaleString("en-US");
        const text = `${action.prefix ?? ""}${shown}${action.suffix ? ` ${action.suffix}` : ""}`;
        // A row-targeted count writes into the interface; an object-targeted
        // one writes on the object, as before.
        if (action.row) rowCounters.set(`${action.id}:${action.row}`, text);
        else counters.set(action.id, text);
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
  /** A packet left sitting at its host eventually clears.
   *
   * Persistence is the point of these objects, but persistence without an end
   * means every packet a passage ever emitted is still on screen at the final
   * frame — which is exactly what happened once scenes were folded into one
   * continuous passage: a question asked in act two was still parked beside the
   * server in act four. A packet the timeline has stopped talking about is done. */
  const PARKED_LIFETIME_SECONDS = 4;
  for (const [id, packet] of livePackets) {
    if (packet.flight || packet.absorbing || packet.converge) continue;
    const touched = packetTouched.get(id);
    if (touched === undefined) continue;
    const age = atSeconds - touched;
    if (age > PARKED_LIFETIME_SECONDS) {
      packet.opacity = Math.max(0, packet.opacity * (1 - (age - PARKED_LIFETIME_SECONDS) / 0.6));
    }
  }

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

  // Ambient motion runs at the compressed rate while the clock is fast, so the
  // world visibly agrees with the label rather than the label being a caption
  // over normal-speed motion.
  const clockFactor = timeLapse ? 1 + (timeLapse.factor - 1) * Math.min(1, timeLapse.t * 4) : 1;

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
        // The city runs on its own clock so it can be stopped when the grid
        // lands; every other backdrop keeps the scene clock.
        return <Backdrop kind={kind} width={width} height={height} atSeconds={kind === "streets" ? cityClock : atSeconds} tint={world.tint} energy={energy} />;
      })()}

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
        {data.splitScreen
          ? (() => {
              // The divider and the two names, drawn OUTSIDE the camera group:
              // they frame the comparison rather than taking part in it, so
              // they must not move when either half is pushed into.
              const orientation = data.splitScreen.orientation ?? "vertical";
              const areas = paneAreas(safeArea, orientation);
              const labels = data.splitScreen.labels;
              const px = unit * 0.032;
              const vertical = orientation === "vertical";
              const midX = (areas.a.x + areas.a.width + areas.b.x) / 2;
              const midY = (areas.a.y + areas.a.height + areas.b.y) / 2;
              return (
                <g>
                  <line
                    x1={vertical ? midX : safeArea.x}
                    y1={vertical ? safeArea.y : midY}
                    x2={vertical ? midX : safeArea.x + safeArea.width}
                    y2={vertical ? safeArea.y + safeArea.height : midY}
                    stroke="rgba(148,163,184,0.28)"
                    strokeWidth={Math.max(1.5, unit * 0.002)}
                    strokeDasharray="10 12"
                  />
                  {labels
                    ? (["a", "b"] as const).map((key, i) => (
                        <text
                          key={key}
                          x={areas[key].x + areas[key].width / 2}
                          // A VERTICAL split hangs both names above the stage,
                          // where there is empty frame either side of nothing.
                          // A HORIZONTAL one cannot: above the lower pane is the
                          // gutter, where the pane above is still drawing object
                          // captions, and above the upper pane is where a `beat`
                          // headline lands. Both drop inside their own half.
                          y={vertical ? areas[key].y - px * 0.5 : areas[key].y + px * 1.7}
                          textAnchor="middle"
                          fill="#8fa2bf"
                          fontFamily={MONO_FONT}
                          fontWeight={700}
                          fontSize={px}
                          letterSpacing="0.1em"
                        >
                          {labels[i].toUpperCase()}
                        </text>
                      ))
                    : null}
                </g>
              );
            })()
          : null}
        <g transform={cameraTransform}>
          {shield
            ? (() => {
                // Wraps whatever the named objects OCCUPY, so the boundary
                // follows the composition instead of being drawn at fixed
                // coordinates — and so contracting it is a real move between
                // two real regions rather than a shape swap.
                const bounds = (ids: string[]) => {
                  // A shield protects things that are ON STAGE. Left anchored to
                  // an object that has exited, it stayed on screen wrapping
                  // empty space and stretched past the frame edge — a boundary
                  // around nothing, which is worse than no boundary at all.
                  const boxes = ids
                    .map((id) => boxById.get(id))
                    .filter((b): b is NonNullable<typeof b> => !!b && (opacityFor(b.id) > 0.05))
                    .map(geometryFor);
                  if (boxes.length === 0) return null;
                  const pad = unit * 0.045;
                  const left = Math.min(...boxes.map((b) => b.x - b.width / 2)) - pad;
                  const right = Math.max(...boxes.map((b) => b.x + b.width / 2)) + pad;
                  const top = Math.min(...boxes.map((b) => b.y - b.height / 2)) - pad * 1.5;
                  const bottom = Math.max(...boxes.map((b) => b.y + b.height / 2)) + pad;
                  return { x: left, y: top, w: right - left, h: bottom - top };
                };
                const to = bounds(shield.over);
                if (!to) return null;
                const from = shield.from ? bounds(shield.from) : null;
                const e = from ? 1 - Math.pow(1 - shield.t, 3) : 1;
                const raw = from
                  ? {
                      x: from.x + (to.x - from.x) * e,
                      y: from.y + (to.y - from.y) * e,
                      w: from.w + (to.w - from.w) * e,
                      h: from.h + (to.h - from.h) * e,
                    }
                  : to;
                // AND IT STAYS IN FRAME. A boundary drawn from object geometry
                // inherits whatever those objects do, including sitting near an
                // edge — so the rectangle is clipped to the safe area before it
                // is drawn rather than trusted to land inside it.
                const margin = unit * 0.025;
                const left = Math.max(raw.x, safeArea.x + margin);
                const top2 = Math.max(raw.y, safeArea.y + margin);
                const right = Math.min(raw.x + raw.w, safeArea.x + safeArea.width - margin);
                const bottom = Math.min(raw.y + raw.h, safeArea.y + safeArea.height - margin);
                if (right <= left || bottom <= top2) return null;
                const box = { x: left, y: top2, w: right - left, h: bottom - top2 };
                const claimed = shield.tone === "claimed";
                const colour = claimed ? "rgba(148,163,184,0.75)" : "#38bdf8";
                return (
                  <g opacity={from ? 1 : shield.t}>
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={box.h}
                      rx={unit * 0.03}
                      fill={claimed ? "rgba(148,163,184,0.05)" : "rgba(56,189,248,0.07)"}
                      stroke={colour}
                      strokeWidth={Math.max(2.5, unit * 0.004)}
                      strokeDasharray={claimed ? "16 10" : undefined}
                    />
                    {shield.label ? (
                      <g>
                        <rect
                          x={box.x + unit * 0.02}
                          y={box.y - unit * 0.021}
                          width={shield.label.length * unit * 0.0165 + unit * 0.035}
                          height={unit * 0.042}
                          rx={unit * 0.01}
                          fill="#0b1017"
                          stroke={colour}
                          strokeWidth={1.8}
                        />
                        <text
                          x={box.x + unit * 0.037}
                          y={box.y + unit * 0.007}
                          fill={colour}
                          fontFamily={MONO_FONT}
                          fontWeight={700}
                          fontSize={unit * 0.024}
                          letterSpacing="0.1em"
                        >
                          {shield.label.toUpperCase()}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })()
            : null}
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
            const march = -(atSeconds * 46 * world.flow * energy * clockFactor) % 26;
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
            // A LIVE SYSTEM breathes; an INTERFACE does not. A phone or a
            // browser scaling gently in and out reads as the camera drifting,
            // not as the app being active — and the app shows it is active
            // through its own content. Same for a printed code: a QR that
            // pulses is a QR nobody can scan.
            const inanimate = !!box.ui || box.kind === "qr";
            const breathe = isLeadBox && !inanimate ? Math.sin(atSeconds * 2.1 * world.pulse) * 0.012 * energy : 0;
            const enterScale = (0.9 + 0.1 * present) * (1 + pop * 0.14 + breathe);
            // FAILURE AS A PROCESS. A system going down judders and loses
            // colour before it stops; flipping it to red asserts the outage,
            // this one shows it happening.
            const decay = degradation.get(box.id) ?? 0;
            const jitter = decay > 0 ? Math.sin(atSeconds * 34 + box.x) * decay * unit * 0.006 : 0;
            // Capped against the FRAME as well as floored against it. Derived
            // from box height alone, a `lead` object's caption grew into
            // headline type and collided with its neighbours — emphasis should
            // enlarge the OBJECT, not its label.
            const labelPx = Math.min(boxUnit * 0.05, Math.max(30 * (boxUnit / 1080), box.height * 0.2));
            const subPx = Math.min(boxUnit * 0.034, Math.max(22 * (boxUnit / 1080), box.height * 0.14));
            const shift = labelOffsetFor(box);
            const isLead = isLeadBox;
            return (
              <g
                key={box.id}
                opacity={op * (1 - decay * 0.45)}
                style={decay > 0 ? { filter: `saturate(${1 - decay * 0.8})` } : undefined}
                transform={`translate(${box.x + jitter} ${box.y}) scale(${enterScale}) translate(${-box.x} ${-box.y})`}
              >
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
                {/* A BACKING PASS in the stage's own ground colour, drawn in the
                    object's exact shape before the object itself.
                    Silhouettes are stroked outlines over a low-alpha tint, which
                    is legible on an empty stage and falls apart the moment
                    anything busy is behind them — over the city backdrop the
                    streets and blocks showed straight through the objects and
                    their labels became unreadable. An object has to separate
                    from whatever it stands on, whatever that happens to be. */}
                {!box.ui && box.kind !== "hexmap" && box.kind !== "region" ? (
                  <g opacity={0.9}>
                    <Silhouette box={box} stroke="rgba(9, 12, 18, 0.95)" fill="rgba(9, 12, 18, 0.95)" strokeWidth={strokeBase * 2.2} />
                  </g>
                ) : null}
                {(() => {
                  const form = forms.get(box.id);
                  // A SHAPE THAT HAS STATES needs to be drawn in the state it is
                  // currently in. `phase` moves an object through its declared
                  // lifecycle, and until now only the state CHIP knew about it —
                  // the silhouette itself always drew the first state, so a book
                  // told to open stayed shut.
                  const staged =
                    box.states && box.states.length > 0
                      ? { ...box, states: [phases.get(box.id) ?? box.states[0]] }
                      : box;
                  if (!form || form.t <= 0) {
                    return <Silhouette box={staged} stroke={accent.stroke} fill={accent.fill} strokeWidth={strokeBase * (isLead ? 1.3 : 1)} />;
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
                  //
                  // The band is also where its BRAND belongs. A container had
                  // no logo placement at all, so `brand: "aws"` on a region
                  // resolved, cached, and then drew nothing — the mark existed
                  // everywhere except on screen. A real cloud diagram puts the
                  // provider's mark beside the region name, so that is where
                  // this one goes, and the name shifts right to make room.
                  (() => {
                    const bandX = box.x - box.width / 2 + unit * 0.03;
                    const bandY = box.y - box.height / 2 + unit * 0.045;
                    const markSize = unit * 0.042;
                    return (
                      <g>
                        {box.logoPath ? (
                          <BrandMark box={box} size={markSize} cx={bandX + markSize / 2} cy={bandY - markSize * 0.28} />
                        ) : null}
                        <text
                          x={bandX + (box.logoPath ? markSize * 1.35 : 0)}
                          y={bandY}
                          textAnchor="start"
                          fill="#8fa2bf"
                          fontFamily={MONO_FONT}
                          fontWeight={600}
                          fontSize={boxUnit * 0.026}
                          letterSpacing="0.08em"
                        >
                          {box.label.toUpperCase()}
                        </text>
                      </g>
                    );
                  })()
                ) : null}

                {(() => {
                  const form = forms.get(box.id);
                  const shown = form && form.t > 0.5 ? { ...box, code: form.code ?? box.code } : box;
                  const lifted = detached.get(box.id);
                  return shown.code && shown.code.length > 0 ? (
                    <g opacity={form ? Math.max(0, form.t > 0.5 ? 1 : 1 - form.t * 2) : 1}>
                      {shown.kind === "phrase" ? (
                        <PhraseLines box={shown} unit={boxUnit} highlighted={codeHighlights.get(box.id)} accent={accent.stroke} />
                      ) : (
                        <CodePane box={shown} unit={boxUnit} highlighted={codeHighlights.get(box.id)} accent={accent.stroke} liftedLine={lifted?.line} liftedAmount={lifted?.t} />
                      )}
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
                              fill={counterText ? "#ffffff" : "#9fb0cc"}
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
                          {/* A UI surface wears its brand as a favicon in its own
                              address bar. Drawing the shared in-box mark as well
                              put a second, much larger copy behind the chrome —
                              one identity, one placement. */}
                          {zones.logo && !box.ui ? (
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
                              fill={counterText ? "#ffffff" : "#9fb0cc"}
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

                {box.context
                  ? (() => {
                      // Entries appear as they arrive: `uiState` reveals them by
                      // id, exactly as it reveals a row, so the context fills up
                      // on the same clock as everything else in the medium.
                      const revealed = new Set<string>();
                      for (const entry of box.context.entries) {
                        const state = uiVisible.get(`${box.id}:${entry.id}`);
                        if (state === undefined ? !entry.hidden : state) revealed.add(entry.id);
                      }
                      const actor = [...actorState.values()].find((a) => a.target === box.id);
                      const mode =
                        actor?.verb === "assume"
                          ? ("assume" as const)
                          : actor?.verb === "select" || actor?.verb === "click"
                            ? ("press" as const)
                            : ("observe" as const);
                      // What the model went with. An `assume` writes its value
                      // into the slot; a `decide` does too, but reads as a
                      // considered choice rather than an unchecked one.
                      const chosenEntry = actor && (actor.verb === "assume" || actor.verb === "decide") ? actor.value : undefined;
                      return (
                        <ContextSurface
                          box={box}
                          unit={unit}
                          accent={accent.stroke}
                          visible={revealed}
                          focusId={actor?.row}
                          focusMode={actor ? mode : undefined}
                          chosen={chosenEntry ?? box.context.chosen}
                          chosenTone={actor?.verb === "assume" ? "warn" : actor?.verb === "decide" ? "good" : "neutral"}
                        />
                      );
                    })()
                  : null}

                {box.app
                  ? (() => {
                      const state = appScreens.get(box.id);
                      const actor = [...actorState.values()].find((a) => a.target === box.id);
                      const mode =
                        actor?.verb === "assume"
                          ? ("assume" as const)
                          : actor?.verb === "click" || actor?.verb === "select" || actor?.verb === "type"
                            ? ("press" as const)
                            : ("observe" as const);
                      return (
                        <AppSurface
                          box={box}
                          unit={unit}
                          accent={accent.stroke}
                          screen={state?.screen ?? box.app.screen}
                          previousScreen={state?.previous}
                          transition={state?.t ?? 1}
                          transitionKind={state?.kind ?? "slide"}
                          overlay={state?.overlay ?? box.app.overlay}
                          overlayProgress={state?.overlayT ?? (box.app.overlay ? 1 : 0)}
                          focusId={actor?.row}
                          focusMode={actor ? mode : undefined}
                          typed={appTyped}
                        />
                      );
                    })()
                  : null}

                {box.ui ? <UiSurface box={box} unit={boxUnit} accent={accent.stroke} visible={uiVisible} press={uiPress} mapSeconds={atSeconds} values={rowCounters} typed={typedValues} pointer={pointerFor(box.id)} actorLabel={actorLabelFor(box.id)} /> : null}

                {box.logoPath && box.captionBelow ? (
                  (() => {
                    // How much of the shape a brand mark may take depends on
                    // what the shape is FOR. On a device the screen is the
                    // identity, so the app's mark fills it — that is what the
                    // viewer would actually see in their hand. On infrastructure
                    // the SILHOUETTE is the identity, and a mark blown up to
                    // 62% of a rack hides the rack: the server started reading
                    // as a third phone because every object wore the same big
                    // green logo.
                    const isDevice = box.kind === "phone" || box.kind === "tv" || box.kind === "laptop" || box.kind === "browser";
                    const size = isDevice
                      ? Math.min(box.width * 0.62, box.height * 0.46)
                      : Math.min(box.width * 0.3, box.height * 0.26);
                    const cy = isDevice ? box.y - box.height * 0.04 : box.y - box.height / 2 + size * 0.85;
                    return <BrandMark box={box} size={size} cx={box.x} cy={cy} />;
                  })()
                ) : null}

                {scans.has(box.id)
                  ? (() => {
                      // A READING PASS, drawn the way every scanner a viewer has
                      // ever used draws it: four corner brackets that close in,
                      // a bright bar travelling down the subject, and a lock-on
                      // when it succeeds. The bar is the part that matters —
                      // brackets alone are a frame, and a frame is not an act.
                      const scan = scans.get(box.id)!;
                      const side = Math.min(box.width, box.height);
                      const pad = side * 0.09;
                      const half = side / 2 + pad;
                      const arm = side * 0.2;
                      const colour = scan.locked ? "#22c55e" : "rgba(34, 197, 94, 0.85)";
                      const stroke = Math.max(2.5, side * 0.011);
                      // Brackets settle inward over the first third of the pass.
                      const ease = Math.min(1, scan.t * 3);
                      const off = half + side * 0.06 * (1 - ease);
                      const corner = (sx: number, sy: number) => (
                        <path
                          key={`${sx}-${sy}`}
                          d={`M ${box.x + sx * off} ${box.y + sy * off - sy * arm} L ${box.x + sx * off} ${box.y + sy * off} L ${box.x + sx * off - sx * arm} ${box.y + sy * off}`}
                          fill="none"
                          stroke={colour}
                          strokeWidth={stroke}
                          strokeLinecap="round"
                        />
                      );
                      const sweepY = box.y - half + 2 * half * Math.min(1, scan.t);
                      return (
                        <g>
                          {corner(-1, -1)}
                          {corner(1, -1)}
                          {corner(-1, 1)}
                          {corner(1, 1)}
                          {!scan.locked ? (
                            <>
                              <rect x={box.x - half} y={sweepY - side * 0.09} width={half * 2} height={side * 0.09} fill="rgba(34,197,94,0.16)" />
                              <rect x={box.x - half} y={sweepY} width={half * 2} height={Math.max(2, side * 0.007)} fill="#22c55e" />
                            </>
                          ) : (
                            <rect
                              x={box.x - half}
                              y={box.y - half}
                              width={half * 2}
                              height={half * 2}
                              fill="none"
                              stroke="rgba(34,197,94,0.35)"
                              strokeWidth={stroke * 0.8}
                              rx={side * 0.03}
                            />
                          )}
                        </g>
                      );
                    })()
                  : null}

                {box.kind === "hexmap"
                  ? (() => {
                      // THE TILING ITSELF, laid over the city rather than baked
                      // into it — so a scene can show a real place first and
                      // drop the grid on top when the explanation reaches it.
                      // `collapse` hides it, `expand` brings it in; with neither,
                      // it is simply present.
                      const shown = expansions.has(box.id) ? Math.max(0, Math.min(1, expansions.get(box.id)!)) : 1;
                      if (shown <= 0.01) return null;
                      const mode = box.hex?.mode ?? "grid";
                      const cells = hexCells(box, mode, box.hex?.cols ?? 7);
                      return (
                        <g opacity={shown}>
                          {cells.map((cell) => (
                            <path
                              key={cell.index}
                              d={hexPath(cell.cx, cell.cy, cell.r * 0.94)}
                              fill={mode === "neighbours" ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.02)"}
                              stroke={accent.stroke}
                              strokeWidth={Math.max(1.2, cell.r * (mode === "neighbours" ? 0.05 : 0.028))}
                              // An unlit tile is scaffolding, not information.
                              // At full strength the whole grid competed with
                              // the city underneath and the frame read as two
                              // pictures at once.
                              opacity={mode === "neighbours" ? (cell.index === 0 ? 1 : 0.7) : 0.3}
                            />
                          ))}
                        </g>
                      );
                    })()
                  : null}

                {box.kind === "hexmap" && (spotlights.get(box.id) ?? 0) > 0.01
                  ? (() => {
                      // ONE TILE, and the ground it actually covers. Everything
                      // outside the cell is muted with a full-frame scrim that
                      // has a hexagonal hole punched in it, so the city inside
                      // stays fully lit and legible — the viewer reads streets
                      // and blocks inside one tile rather than a shape on a map.
                      const t = spotlights.get(box.id)!;
                      const mode = box.hex?.mode ?? "grid";
                      const cells = hexCells(box, mode, box.hex?.cols ?? 7);
                      // In `neighbours` mode cell 0 IS the subject — the tile
                      // whose six neighbours are being compared. Picking the
                      // middle of the array there lights a neighbour instead,
                      // which argues the opposite of the point.
                      const pick = mode === "neighbours" ? cells[0] : cells[Math.floor(cells.length / 2)];
                      if (!pick) return null;
                      const ring = hexPath(pick.cx, pick.cy, pick.r * 0.94);
                      return (
                        <g>
                          <path
                            d={`M ${-width * 2} ${-height * 2} H ${width * 3} V ${height * 3} H ${-width * 2} Z ${ring}`}
                            fill="rgba(6, 9, 14, 0.82)"
                            fillRule="evenodd"
                            opacity={t}
                          />
                          <path d={ring} fill="none" stroke="#f59e0b" strokeWidth={Math.max(2.5, pick.r * 0.06)} opacity={t} />
                        </g>
                      );
                    })()
                  : null}

                {box.kind === "hexmap" && meters.has(box.id)
                  ? (() => {
                      // DEMAND, PER TILE. The existing `meter` action drives it:
                      // a map does not need its own vocabulary for "how much of
                      // this is hot", and reusing the meter means the number is
                      // animatable, fittable to narration, and already
                      // understood by every other part of the engine.
                      //
                      // Which cells light is deterministic per cell, so the
                      // pattern grows outward from a couple of centres the way
                      // real demand does, instead of flickering randomly.
                      const heat = meters.get(box.id)!;
                      const cells = hexCells(box, box.hex?.mode ?? "grid", box.hex?.cols ?? 7);
                      return (
                        <g>
                          {cells.map((cell) => {
                            const seed = Math.sin(cell.index * 127.1) * 43758.5453;
                            const rank = seed - Math.floor(seed);
                            if (rank > heat) return null;
                            // The hottest cells are the ones that lit first.
                            const intensity = Math.min(1, (heat - rank) / Math.max(0.15, heat));
                            return (
                              <path
                                key={cell.index}
                                d={hexPath(cell.cx, cell.cy, cell.r * 0.94)}
                                // Kept translucent on purpose. The tiling is
                                // laid OVER a real city, and a fill opaque
                                // enough to hide the streets and the traffic
                                // underneath turns the overlay back into the
                                // floating honeycomb it replaced. The stroke
                                // carries the intensity instead.
                                fill={`rgba(245, 158, 11, ${0.08 + intensity * 0.3})`}
                                stroke={`rgba(245, 158, 11, ${0.4 + intensity * 0.5})`}
                                strokeWidth={Math.max(1.2, cell.r * 0.05)}
                              />
                            );
                          })}
                        </g>
                      );
                    })()
                  : null}

                {occlusions.has(box.id)
                  ? (() => {
                      // Something physically COVERING the object — a sticker, a
                      // thumb, a scratch. Drawn in the stage's own ground colour
                      // with a soft edge so it reads as an obstruction rather
                      // than as part of the artwork underneath it.
                      const occ = occlusions.get(box.id)!;
                      const side = Math.min(box.width, box.height);
                      // GEOMETRY THAT TELLS THE TRUTH. On a QR code these are
                      // not arbitrary rectangles: the three corner finder
                      // squares are unrecoverable, and everything else has a
                      // recovery budget of roughly 30% of codewords at level H.
                      // A patch that covers a finder, or that eats more than
                      // that budget, makes the code genuinely unscannable — and
                      // a video telling viewers to pause and scan the damaged
                      // frame has to survive them actually doing it. So the
                      // "survivable" areas all avoid the three finders and stay
                      // inside the budget; only `corner` is meant to be fatal.
                      const areas: Record<string, { x: number; y: number; w: number; h: number }> = {
                        // Top-left: a finder square. Nothing can reconstruct it.
                        corner: { x: box.x - side / 2, y: box.y - side / 2, w: side * 0.3, h: side * 0.3 },
                        // A band across the middle clears all three finders.
                        band: { x: box.x - side / 2, y: box.y - side * 0.13, w: side, h: side * 0.26 },
                        // The middle, where a logo goes.
                        centre: { x: box.x - side * 0.17, y: box.y - side * 0.17, w: side * 0.34, h: side * 0.34 },
                        // The bottom-RIGHT block — the one corner of a QR code
                        // with no finder in it — at about a quarter of the area.
                        third: { x: box.x, y: box.y, w: side * 0.5, h: side * 0.5 },
                      };
                      const a = areas[occ.area] ?? areas.third;
                      return (
                        <g opacity={Math.min(1, occ.amount)}>
                          <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={side * 0.02} fill="#11161f" />
                          <rect
                            x={a.x}
                            y={a.y}
                            width={a.w}
                            height={a.h}
                            rx={side * 0.02}
                            fill="none"
                            stroke="rgba(244,63,94,0.75)"
                            strokeWidth={Math.max(2, side * 0.006)}
                            strokeDasharray="10 8"
                          />
                        </g>
                      );
                    })()
                  : null}

                {piles.has(box.id)
                  ? (() => {
                      // A PILE, not a bar. What is being taught is the heap
                      // getting bigger — a meter sliding right reads as a
                      // percentage, which is a different claim entirely.
                      const count = Math.round(piles.get(box.id)!);
                      const shown = Math.min(count, 24);
                      const perRow = 8;
                      const cell = Math.min(box.width * 0.09, box.height * 0.11);
                      const startX = box.x - box.width * 0.38;
                      const baseY = box.y + box.height / 2 - cell * 0.9;
                      return (
                        <g>
                          {Array.from({ length: shown }, (_, i) => (
                            <rect
                              key={i}
                              x={startX + (i % perRow) * cell * 1.15}
                              y={baseY - Math.floor(i / perRow) * cell * 1.2}
                              width={cell * 0.85}
                              height={cell * 0.85}
                              rx={cell * 0.18}
                              fill={accent.stroke}
                              opacity={0.85}
                            />
                          ))}
                          {count > shown ? (
                            <text
                              x={box.x + box.width * 0.38}
                              y={baseY + cell * 0.6}
                              textAnchor="end"
                              fill={accent.stroke}
                              fontFamily={MONO_FONT}
                              fontWeight={700}
                              fontSize={subPx}
                            >
                              {`+${count - shown}`}
                            </text>
                          ) : null}
                        </g>
                      );
                    })()
                  : null}

                {/* SHAPES THAT SHOW THEIR OWN STATE do not also get the chip.
                    A phone book that visibly opens does not need the word OPEN
                    stencilled beside it and a row of progress dots — that is
                    debug output sitting on top of the illustration, and it was
                    the first thing anyone noticed about the frame. The chip
                    exists for objects whose state is otherwise invisible. */}
                {box.states && box.states.length > 0 && box.kind !== "phonebook"
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

                {/* A hex map expresses its meter as lit TILES, drawn above.
                    Drawing the bar as well states the same number twice, and
                    the bar is the weaker of the two statements. */}
                {meters.has(box.id) && box.kind !== "hexmap" ? (
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
            const gap = unit * 0.02;
            // FIT THE VIEWPORT FIRST. The side-choosing and clamping below all
            // assume the string is narrower than what the camera can see; when
            // it is not, the "centre it" fallback clamps to an impossible range
            // and the text runs off BOTH edges at once. A zoomed-in scene makes
            // that easy to hit, because zooming shrinks the visible width while
            // the callout stays the same length. So the type shrinks to fit
            // before anything else is decided.
            const visibleWidth = width / zoom;
            const rawTextW = annotation.text.length * px * 0.6;
            const maxTextW = visibleWidth - gap * 4;
            const fitted = rawTextW > maxTextW ? px * (maxTextW / rawTextW) : px;
            const textW = annotation.text.length * fitted * 0.6;
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
                fontSize={fitted}
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
            const safePoint = clampToFrame(point, (p.label ?? "").length);
            return (
              <Packet
                key={`pk-${id}`}
                x={safePoint.x}
                y={safePoint.y}
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
              x={clampToFrame(packet.point, ((packet.isLead ? (packet.action.magnitude ?? packet.action.label) : "") ?? "").length).x}
              y={clampToFrame(packet.point, ((packet.isLead ? (packet.action.magnitude ?? packet.action.label) : "") ?? "").length).y}
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

      {/* ACTORS THAT ARE NOT CURSORS. An avatar when the actor has an identity,
          a focus ring when the actor IS attention rather than a body, a process
          chip for something running inside a machine. Same verbs, different
          representation — chosen by the story, not fixed by the engine. */}
      {(data.actors ?? [])
        .filter((actor) => (actor.as ?? "cursor") !== "cursor")
        .map((actor) => {
          const state = actorState.get(actor.id);
          if (!state?.target) return null;
          const host = boxById.get(state.target);
          if (!host) return null;
          const geom = geometryFor(host);
          const size = unit * 0.055;
          const x = geom.x - geom.width / 2 - size * 1.6;
          const y = geom.y;
          const busy = state.verb === "assume" || state.verb === "fail";
          const colour = busy ? "#f59e0b" : state.verb === "succeed" ? "#22c55e" : ACCENTS[accents.get(host.id) ?? "primary"].stroke;
          if ((actor.as ?? "cursor") === "focus") {
            // Attention itself: a ring around what is being looked at.
            return (
              <g key={actor.id}>
                <rect
                  x={geom.x - geom.width / 2 - size * 0.4}
                  y={geom.y - geom.height / 2 - size * 0.4}
                  width={geom.width + size * 0.8}
                  height={geom.height + size * 0.8}
                  rx={size * 0.4}
                  fill="none"
                  stroke={colour}
                  strokeWidth={Math.max(2, size * 0.12)}
                  strokeDasharray={`${size * 0.5} ${size * 0.35}`}
                  opacity={0.85}
                />
              </g>
            );
          }
          return (
            <g key={actor.id}>
              {(actor.as ?? "cursor") === "avatar" ? (
                <>
                  <circle cx={x} cy={y - size * 0.5} r={size * 0.42} fill="none" stroke={colour} strokeWidth={2.4} />
                  <path
                    d={`M ${x - size * 0.55} ${y + size * 0.75} q ${size * 0.55} ${-size * 0.7} ${size * 1.1} 0`}
                    fill="none"
                    stroke={colour}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <rect x={x - size * 0.6} y={y - size * 0.4} width={size * 1.2} height={size * 0.8} rx={size * 0.2} fill="none" stroke={colour} strokeWidth={2.4} />
              )}
              {actor.label ? (
                <text x={x} y={y + size * 1.6} textAnchor="middle" fill="#9fb0cc" fontFamily={MONO_FONT} fontSize={unit * 0.022}>
                  {actor.label}
                </text>
              ) : null}
            </g>
          );
        })}

      {/* THE STANDING INSTRUCTION. Pinned for the whole scene so the audience
          can hold the asked-for value in view while the system confidently
          works with a different one. This is what makes a mistake visible
          before anybody says it is a mistake. */}
      {data.instruction ? (
        <div
          style={{
            position: "absolute",
            left: unit * 0.045,
            top: unit * 0.045,
            padding: `${unit * 0.012}px ${unit * 0.022}px`,
            borderRadius: unit * 0.012,
            border: "1.6px solid rgba(148,163,184,0.45)",
            background: "rgba(9,12,18,0.88)",
            fontFamily: MONO_FONT,
            fontSize: unit * 0.024,
            color: "#c9d6ee",
            letterSpacing: "0.04em",
          }}
        >
          {data.instruction.label}
          {data.instruction.value ? (
            <span style={{ color: "#ffd76a", fontWeight: 800 }}>{`  ${data.instruction.value}`}</span>
          ) : null}
        </div>
      ) : null}

      {data.mascot ? (
        <Mascot
          expression={mascotFace.expression}
          since={atSeconds - mascotFace.changedAt}
          at={data.mascot.at ?? "bottom-left"}
          height={height}
          unit={unit}
        />
      ) : null}

      {timeLapse ? (
        <div
          style={{
            position: "absolute",
            top: height * 0.055,
            right: unit * 0.05,
            padding: `${unit * 0.012}px ${unit * 0.022}px`,
            borderRadius: unit * 0.012,
            background: "rgba(9,11,15,0.85)",
            border: "1px solid rgba(148,163,184,0.4)",
            color: "#ffd76a",
            fontFamily: MONO_FONT,
            fontWeight: 700,
            fontSize: unit * 0.03,
            letterSpacing: "0.08em",
          }}
        >
          {`>> ${timeLapse.label}`}
        </div>
      ) : null}

      {viewpoint ? (
        <div
          style={{
            position: "absolute",
            top: height * 0.055,
            left: unit * 0.05,
            opacity: viewpoint.t,
            padding: `${unit * 0.012}px ${unit * 0.022}px`,
            borderRadius: unit * 0.012,
            background: "rgba(9,11,15,0.85)",
            border: `1px solid ${ACCENTS.primary.stroke}`,
            color: ACCENTS.primary.stroke,
            fontFamily: MONO_FONT,
            fontWeight: 700,
            fontSize: unit * 0.028,
            letterSpacing: "0.1em",
          }}
        >
          {viewpoint.to.toUpperCase()}
        </div>
      ) : null}

      {beat ? <BeatText beat={beat} width={width} height={height} unit={unit} /> : null}
    </SceneFrame>
  );
};

/** A REAL INTERFACE, for concepts that are user-facing.
 *
 * When what is being explained is something a person DOES — signing in, hitting
 * a permission wall, watching a page fail — an architecture diagram is the
 * wrong register. The viewer should see the click, the change and the
 * consequence in the surface they actually recognise, because that is where
 * they have met the problem before.
 *
 * Rows are declared and then REVEALED, so a response appears at the moment the
 * click causes it rather than sitting there from the start merely lighting up. */
const UiSurface: React.FC<{
  box: StageBox;
  unit: number;
  accent: string;
  visible: Map<string, boolean>;
  press: Map<string, number>;
  mapSeconds: number;
  values: Map<string, string>;
  typed: Map<string, string>;
  pointer?: { row: string; fromRow?: string; t: number; reading: boolean };
  actorLabel?: { text: string; tone: "neutral" | "warn" | "danger" | "success" };
}> = ({ box, unit, accent, visible, press, mapSeconds, values, typed, pointer, actorLabel }) => {
  const ui = box.ui!;
  const px = Math.max(26 * (unit / 1080), unit * 0.028);
  const chromeH = px * 2.2;
  const left = box.x - box.width / 2;
  const top = box.y - box.height / 2;
  const pad = px * 0.9;
  const rowH = px * 2.1;

  const ROW_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
    button: { fill: accent, stroke: accent, text: "#06121a" },
    input: { fill: "rgba(255,255,255,0.05)", stroke: "rgba(148,163,184,0.5)", text: "#c9d6ee" },
    text: { fill: "transparent", stroke: "transparent", text: "#c9d6ee" },
    row: { fill: "rgba(255,255,255,0.04)", stroke: "rgba(148,163,184,0.35)", text: "#c9d6ee" },
    error: { fill: "rgba(244,63,94,0.14)", stroke: "#f43f5e", text: "#ffb4c0" },
    success: { fill: "rgba(34,197,94,0.14)", stroke: "#22c55e", text: "#9ff0b8" },
  };

  // A HANDSET, not a window. Traffic-light dots and a title bar are desktop
  // furniture; on a phone the viewer expects a status bar at the top and a home
  // indicator at the bottom, and nothing else framing the screen. Getting this
  // wrong is not cosmetic — an app people only ever see in their hand, drawn as
  // a desktop window, stops being the thing they recognise.
  const isPhone = ui.chrome === "phone";
  // The map owns the top of a phone screen; the sheet of rows starts below it.
  const mapH = isPhone && ui.map ? box.height * 0.56 : 0;

  return (
    <g>
      <rect
        x={left}
        y={top}
        width={box.width}
        height={box.height}
        rx={isPhone ? px * 1.6 : px * 0.5}
        fill="rgba(12,16,22,0.95)"
        stroke="rgba(148,163,184,0.45)"
        strokeWidth={2}
      />
      {isPhone ? (
        <>
          {/* Status bar: a clock and a signal cluster, which is all the eye
              needs to accept the frame as a phone. */}
          <text x={left + pad * 1.4} y={top + chromeH * 0.62} fill="#8fa2bf" fontFamily={MONO_FONT} fontWeight={700} fontSize={px * 0.6}>
            9:41
          </text>
          <g fill="rgba(148,163,184,0.6)">
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={left + box.width - pad * 1.4 - (3 - i) * px * 0.34}
                y={top + chromeH * 0.62 - px * (0.22 + i * 0.09)}
                width={px * 0.22}
                height={px * (0.22 + i * 0.09)}
                rx={px * 0.05}
              />
            ))}
          </g>
          {/* Home indicator. */}
          <rect
            x={box.x - box.width * 0.16}
            y={top + box.height - px * 0.7}
            width={box.width * 0.32}
            height={px * 0.16}
            rx={px * 0.08}
            fill="rgba(148,163,184,0.5)"
          />
        </>
      ) : (
        <>
          <line x1={left} y1={top + chromeH} x2={left + box.width} y2={top + chromeH} stroke="rgba(148,163,184,0.35)" strokeWidth={1.5} />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={left + pad + i * px * 0.7} cy={top + chromeH / 2} r={px * 0.16} fill="rgba(148,163,184,0.55)" />
          ))}
        </>
      )}
      {/* WHOSE APP THIS IS. On a phone the mark sits ABOVE the handset and
          large enough to read — inside the screen it competed with the app's
          own content and was too small to identify anyway, which defeats the
          only job a brand mark has. */}
      {box.logoPath && !(ui.chrome === "browser" && ui.url) ? (
        <BrandMark
          box={box}
          size={isPhone ? px * 3.4 : px * 1.25}
          cx={box.x}
          cy={isPhone ? top - px * 2.2 : top + chromeH * 0.5}
        />
      ) : null}
      {ui.chrome === "browser" && ui.url ? (
        <>
          {box.logoPath ? <BrandMark box={box} size={px * 1.1} cx={left + pad + px * 3.1} cy={top + chromeH / 2} /> : null}
          <text
            x={left + pad + px * (box.logoPath ? 4.0 : 2.6)}
            y={top + chromeH / 2 + px * 0.28}
            fill="#8fa2bf"
            fontFamily={MONO_FONT}
            fontSize={px * 0.72}
          >
            {ui.url}
          </text>
        </>
      ) : null}

      {/* THE MAP PANEL. A ride app is a map with a sheet of controls under it,
          and drawing it as a blank screen with a list on it makes it a form
          instead of the thing the viewer opens every week. The city runs inside
          the handset here, which is also what stops it competing with the
          handset from behind. */}
      {isPhone && ui.map ? (
        <>
          <defs>
            <clipPath id={`phonemap-${box.id}`}>
              <rect x={left + pad * 0.5} y={top + chromeH} width={box.width - pad} height={mapH} rx={px * 0.5} />
            </clipPath>
          </defs>
          <g clipPath={`url(#phonemap-${box.id})`}>
            <rect x={left + pad * 0.5} y={top + chromeH} width={box.width - pad} height={mapH} fill="#0d1219" />
            <CityMap x={left + pad * 0.5} y={top + chromeH} w={box.width - pad} h={mapH} atSeconds={mapSeconds} />
            {/* The route, and the car coming to get you. */}
            <path
              d={`M ${left + box.width * 0.24} ${top + chromeH + mapH * 0.78} L ${left + box.width * 0.24} ${top + chromeH + mapH * 0.46} L ${left + box.width * 0.68} ${top + chromeH + mapH * 0.46} L ${left + box.width * 0.68} ${top + chromeH + mapH * 0.2}`}
              fill="none"
              stroke="#f5f7fb"
              strokeWidth={px * 0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={left + box.width * 0.24} cy={top + chromeH + mapH * 0.78} r={px * 0.28} fill="#f59e0b" />
            <rect
              x={left + box.width * 0.68 - px * 0.3}
              y={top + chromeH + mapH * 0.2 - px * 0.3}
              width={px * 0.6}
              height={px * 0.6}
              fill="#f5f7fb"
            />
          </g>
          <rect
            x={left + pad * 0.5}
            y={top + chromeH}
            width={box.width - pad}
            height={mapH}
            rx={px * 0.5}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={1.4}
          />
        </>
      ) : null}

      {/* THE BOTTOM SHEET. A ride app is a map with a sheet of options over it,
          and each option is a two-line row with a price on the right and one
          committing button at the foot. Rendered as a flat list of identical
          bars it stops being that app and becomes a form — which is exactly how
          the first version read. */}
      {isPhone && ui.map ? (
        <rect
          x={left}
          y={top + chromeH + mapH}
          width={box.width}
          height={box.height - chromeH - mapH}
          rx={px * 1.1}
          fill="#12161d"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={1.4}
        />
      ) : null}

      {ui.rows.map((row, i) => {
        const shown = visible.get(`${box.id}:${row.id}`) ?? !row.hidden;
        if (!shown) return null;
        const style = ROW_STYLE[row.kind] ?? ROW_STYLE.text;
        const pressed = press.get(`${box.id}:${row.id}`) ?? 0;
        const sheetTop = top + chromeH + mapH;
        // What an actor has typed replaces the field's own text as it is
        // entered, so a form fills in under the cursor.
        const entered = typed.get(`${box.id}:${row.id}`);

        // The one committing action sits at the foot of the sheet, full width,
        // the way every "confirm" in every ride app does.
        if (isPhone && ui.map && row.kind === "button") {
          const bh = rowH * 1.05;
          const by = top + box.height - bh - px * 1.5;
          const dip = Math.sin(Math.PI * pressed);
          return (
            <g key={row.id} transform={`translate(0 ${dip * px * 0.22})`} opacity={1 - dip * 0.12}>
              <rect x={left + pad} y={by} width={box.width - pad * 2} height={bh} rx={px * 0.4} fill={accent} />
              {pressed > 0 ? (
                <>
                  {/* The ripple, expanding out of the point of contact and
                      fading — the thing every touch interface uses to say
                      "that press registered". */}
                  <circle
                    cx={box.x}
                    cy={by + bh / 2}
                    r={pressed * box.width * 0.5}
                    fill="rgba(255,255,255,0.28)"
                    opacity={1 - pressed}
                  />
                  {/* And the finger itself, so a viewer sees WHO tapped. */}
                  <circle
                    cx={box.x}
                    cy={by + bh / 2}
                    r={px * 1.5 * (1 - pressed * 0.35)}
                    fill="rgba(255,255,255,0.18)"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={2}
                    opacity={1 - pressed * 0.8}
                  />
                </>
              ) : null}
              <text
                x={box.x}
                y={by + bh * 0.62}
                textAnchor="middle"
                fill="#06121a"
                fontFamily={STAGE_FONT}
                fontWeight={800}
                fontSize={px * 0.92}
              >
                {entered ?? row.label}
              </text>
            </g>
          );
        }

        if (isPhone && ui.map) {
          const rh = rowH * 1.5;
          const y = sheetTop + px * 1.1 + i * rh;
          const iconSize = rh * 0.52;
          // THE VALUE OWNS ITS COLUMN. Right-aligning it and letting the label
          // run at full size meant a long label ("estimated distance") ran
          // straight into its own figure. The label gets whatever is left after
          // the icon, the value and a real gutter, and shrinks to fit it.
          const valuePx = px * 1.02;
          const valueText = values.get(`${box.id}:${row.id}`) ?? row.value;
          const valueW = valueText ? valueText.length * valuePx * 0.62 : 0;
          const labelX = left + pad * 1.3 + (row.icon === "car" ? iconSize * 2.1 : 0);
          const labelRoom = left + box.width - pad * 1.5 - valueW - px * 0.9 - labelX;
          const labelPx = px * 0.92;
          const labelW = row.label.length * labelPx * 0.55;
          const labelFit = labelRoom > 0 && labelW > labelRoom ? labelPx * (labelRoom / labelW) : labelPx;
          const subPxRow = px * 0.66;
          const subW = row.sub ? row.sub.length * subPxRow * 0.58 : 0;
          const subFit = labelRoom > 0 && subW > labelRoom ? subPxRow * (labelRoom / subW) : subPxRow;
          return (
            <g key={row.id} transform={`translate(0 ${Math.sin(Math.PI * pressed) * px * 0.2})`} opacity={1 - Math.sin(Math.PI * pressed) * 0.12}>
              {row.kind !== "text" ? (
                <rect x={left + pad * 0.7} y={y} width={box.width - pad * 1.4} height={rh * 0.9} rx={px * 0.35} fill={style.fill} stroke={style.stroke} strokeWidth={1.4} />
              ) : null}
              {pressed > 0 ? (
                <circle cx={box.x} cy={y + rh * 0.45} r={pressed * box.width * 0.45} fill="rgba(255,255,255,0.22)" opacity={1 - pressed} />
              ) : null}
              {/* Only where the author asked for one. */}
              {row.icon === "car" ? (
                <g>
                  <rect x={left + pad * 1.3} y={y + rh * 0.2} width={iconSize * 1.5} height={iconSize * 0.72} rx={iconSize * 0.2} fill="rgba(240,246,255,0.9)" />
                  <rect x={left + pad * 1.3 + iconSize * 0.28} y={y + rh * 0.12} width={iconSize * 0.92} height={iconSize * 0.4} rx={iconSize * 0.14} fill="rgba(240,246,255,0.6)" />
                </g>
              ) : null}
              <text
                x={labelX}
                y={y + (row.sub ? rh * 0.36 : rh * 0.52)}
                textAnchor="start"
                fill={style.text}
                fontFamily={STAGE_FONT}
                fontWeight={700}
                fontSize={labelFit}
              >
                {row.label}
              </text>
              {row.sub ? (
                <text
                  x={labelX}
                  y={y + rh * 0.63}
                  textAnchor="start"
                  fill="rgba(190, 204, 228, 0.7)"
                  fontFamily={MONO_FONT}
                  fontSize={subFit}
                >
                  {row.sub}
                </text>
              ) : null}
              {valueText ? (
                <text
                  x={left + box.width - pad * 1.5}
                  y={y + rh * 0.52}
                  textAnchor="end"
                  fill="#ffffff"
                  fontFamily={STAGE_FONT}
                  fontWeight={800}
                  fontSize={valuePx}
                >
                  {valueText}
                </text>
              ) : null}
            </g>
          );
        }

        const y = top + chromeH + mapH + pad + i * rowH;
        return (
          <g key={row.id} transform={`translate(0 ${pressed * px * 0.12})`} opacity={1 - pressed * 0.18}>
            {row.kind !== "text" ? (
              <rect x={left + pad} y={y} width={box.width - pad * 2} height={rowH * 0.8} rx={px * 0.35} fill={style.fill} stroke={style.stroke} strokeWidth={1.6} />
            ) : null}
            <text
              x={row.kind === "button" ? box.x : left + pad * 1.7}
              y={y + rowH * 0.52}
              textAnchor={row.kind === "button" ? "middle" : "start"}
              fill={style.text}
              fontFamily={row.kind === "text" ? STAGE_FONT : MONO_FONT}
              fontWeight={row.kind === "button" ? 800 : 500}
              fontSize={px * (row.kind === "text" ? 0.95 : 0.85)}
            >
              {row.label}
            </text>
          </g>
        );
      })}
      {/* WHAT THE ACTOR IS DOING, in its own words, under the thing it is doing
          it to. Derived from the verb rather than written per scene, so
          "assumed" always reads as unverified wherever it happens. */}
      {actorLabel ? (
        <g>
          <rect
            x={box.x - box.width * 0.46}
            y={top + box.height + px * 0.3}
            width={box.width * 0.92}
            height={px * 1.7}
            rx={px * 0.35}
            fill="rgba(9,12,18,0.9)"
            stroke={
              actorLabel.tone === "warn"
                ? "#f59e0b"
                : actorLabel.tone === "danger"
                  ? "#f43f5e"
                  : actorLabel.tone === "success"
                    ? "#22c55e"
                    : "rgba(148,163,184,0.5)"
            }
            strokeWidth={1.6}
          />
          <text
            x={box.x}
            y={top + box.height + px * 1.45}
            textAnchor="middle"
            fill={
              actorLabel.tone === "warn"
                ? "#ffd76a"
                : actorLabel.tone === "danger"
                  ? "#ffb4c0"
                  : actorLabel.tone === "success"
                    ? "#9ff0b8"
                    : "#c9d6ee"
            }
            fontFamily={MONO_FONT}
            fontWeight={600}
            fontSize={px * 0.78}
          >
            {actorLabel.text}
          </text>
        </g>
      ) : null}

      {/* THE CURSOR. Travels between rows rather than jumping, because the
          journey is the part that shows the agent choosing where to look. A
          `reading` stop draws a soft ring instead of a click, which is how the
          scene says "it looked at this and moved on" without a caption. */}
      {pointer
        ? (() => {
            const rowY = (id: string) => {
              const i = ui.rows.findIndex((r) => r.id === id);
              if (i < 0) return null;
              const stride = isPhone && ui.map ? rowH * 1.5 : rowH;
              const base = top + chromeH + mapH + (isPhone && ui.map ? px * 1.1 : pad);
              return base + i * stride + stride * 0.4;
            };
            const toY = rowY(pointer.row);
            if (toY === null) return null;
            const fromY = pointer.fromRow ? (rowY(pointer.fromRow) ?? toY) : toY;
            // Ease out: quick departure, soft arrival, like a real hand.
            const e = 1 - Math.pow(1 - Math.min(1, pointer.t), 3);
            const y = fromY + (toY - fromY) * e;
            const x = left + box.width * 0.62;
            const size = px * 1.1;
            return (
              <g>
                {pointer.reading && pointer.t >= 1 ? (
                  <circle cx={x} cy={y} r={size * 1.5} fill="none" stroke={accent} strokeWidth={2} opacity={0.5} />
                ) : null}
                <path
                  d={`M ${x} ${y} L ${x} ${y + size * 1.5} L ${x + size * 0.42} ${y + size * 1.1} L ${x + size * 0.72} ${y + size * 1.75} L ${x + size * 0.95} ${y + size * 1.6} L ${x + size * 0.66} ${y + size * 0.98} L ${x + size * 1.15} ${y + size * 0.86} Z`}
                  fill="#ffffff"
                  stroke="rgba(9,12,18,0.85)"
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              </g>
            );
          })()
        : null}
    </g>
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

/** WORDS, SET AS THE SUBJECT.
 *
 * Deliberately not CodePane: no pane, no border, no line numbers, no monospace
 * gutter. A sentence that is the thing being explained should look like a
 * sentence on a screen, and everything a code editor draws around it is chrome
 * that says "this is source code" when it is not.
 *
 * `highlightLine` still works, and does the job typography does best: the line
 * under discussion sits at full strength while the rest drop back far enough to
 * read as context. That is the whole interaction model — no movement required. */
const PhraseLines: React.FC<{
  box: StageBox;
  unit: number;
  highlighted?: number[];
  accent: string;
}> = ({ box, unit, highlighted, accent }) => {
  const lines = box.code ?? [];
  if (lines.length === 0) return null;
  const px = Math.max(38 * (unit / 1080), unit * 0.044);
  const lead = px * 1.5;
  const top = box.y - ((lines.length - 1) * lead) / 2;
  const anyHighlight = (highlighted?.length ?? 0) > 0;

  return (
    <g>
      {lines.map((text, i) => {
        const isLit = !anyHighlight || highlighted!.includes(i + 1);
        return (
          <text
            key={i}
            x={box.x}
            y={top + i * lead}
            textAnchor="middle"
            fill={isLit ? "#ffffff" : "rgba(160, 174, 202, 0.28)"}
            fontFamily={STAGE_FONT}
            fontWeight={isLit ? 800 : 600}
            fontSize={px}
          >
            {text}
          </text>
        );
      })}
      {/* A rule under the live line, in the scene's accent — the only mark this
          medium draws, and only where attention belongs. */}
      {anyHighlight
        ? highlighted!.map((n) => {
            const i = n - 1;
            if (i < 0 || i >= lines.length) return null;
            const w = Math.min(box.width, lines[i].length * px * 0.5);
            return (
              <rect
                key={`r${n}`}
                x={box.x - w / 2}
                y={top + i * lead + px * 0.28}
                width={w}
                height={Math.max(2, px * 0.05)}
                rx={px * 0.03}
                fill={accent}
                opacity={0.85}
              />
            );
          })
        : null}
    </g>
  );
};

const CodePane: React.FC<{
  box: StageBox;
  unit: number;
  highlighted?: number[];
  accent: string;
  /** 1-indexed line currently lifting out of the page, and how far. */
  liftedLine?: number;
  liftedAmount?: number;
}> = ({ box, unit, highlighted, accent, liftedLine, liftedAmount }) => {
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
        // A line that is detaching visibly leaves a gap behind it — the source
        // LOSES the piece, which is what separates a detachment from a copy.
        const lifting = liftedLine === n ? (liftedAmount ?? 0) : 0;
        return (
          <g key={i} opacity={(lit ? 1 : 0.26) * (1 - lifting)} transform={`translate(0 ${-lifting * lineH * 0.8})`}>
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
/** The reacting mascot.
 *
 * Rendered OUTSIDE the camera group, deliberately. It is a narrator commenting
 * on the system, not an object inside it — so it must not zoom, pan or shake
 * with the thing it is reacting to, and it must never occupy a stage region.
 * Keeping it out of that coordinate space is also what stops it drifting into
 * being used as a component, which is how a technical channel turns into a
 * cartoon one.
 *
 * Anchored clear of the caption band at the bottom of a portrait frame. */
const Mascot: React.FC<{
  expression: string;
  since: number;
  at: string;
  height: number;
  unit: number;
}> = ({ expression, since, at, height, unit }) => {
  const size = unit * 0.13;
  const margin = unit * 0.045;
  const left = at.endsWith("left");
  const top = at.startsWith("top");
  // A pop as the new face lands, then still. The reaction IS the event; a
  // continuously animated face is ambient motion competing with the system.
  const pop = since >= 0 && since < 0.45 ? Math.sin((since / 0.45) * Math.PI) : 0;

  // Remotion's <Img>, never a CSS background-image: a render is thousands of
  // headless frames, and the renderer only waits for images it can see. A
  // background-image is invisible to it, so the mascot would be missing from
  // whichever frames happened to be captured before the SVG finished loading —
  // a flicker that appears only in the output file and never in the studio.
  return (
    <div
      style={{
        position: "absolute",
        left: left ? margin : undefined,
        right: left ? undefined : margin,
        top: top ? margin + height * 0.06 : undefined,
        bottom: top ? undefined : height * 0.21,
        width: size,
        height: size,
        transform: `scale(${1 + pop * 0.16}) rotate(${pop * (left ? -6 : 6)}deg)`,
        filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.55))",
        pointerEvents: "none",
      }}
    >
      <Img
        src={staticFile(`assets/mascot/${expression}.svg`)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
};

const Backdrop: React.FC<{
  kind: "grid" | "scanlines" | "field" | "depth" | "scanner" | "streets" | "branches" | "none";
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
    if (kind === "branches") {
      // PATHS THAT KEEP FORKING. Every other backdrop in this file is a
      // texture; this one is a shape that means something — one route in at the
      // bottom and the possibilities multiplying upward. It is the ambient form
      // of the subject itself: a chain of decisions, each opening more.
      const rows = 6;
      const rowH = height / rows;
      const paths: React.ReactNode[] = [];
      let key = 0;
      for (let r = 0; r < rows; r++) {
        const count = Math.pow(2, Math.min(r, 4));
        const span = width / (count + 1);
        for (let i = 1; i <= count; i++) {
          const x0 = span * i;
          const y0 = height - r * rowH;
          const y1 = y0 - rowH;
          const drift = Math.sin(t * 0.25 + r * 0.7 + i) * width * 0.012;
          paths.push(
            <path key={key++} d={`M ${x0} ${y0} C ${x0 + drift} ${y0 - rowH * 0.5}, ${x0 - span * 0.35 + drift} ${y0 - rowH * 0.6}, ${x0 - span * 0.4} ${y1}`} />,
            <path key={key++} d={`M ${x0} ${y0} C ${x0 + drift} ${y0 - rowH * 0.5}, ${x0 + span * 0.35 + drift} ${y0 - rowH * 0.6}, ${x0 + span * 0.4} ${y1}`} />,
          );
        }
      }
      return (
        <g fill="none" stroke="rgba(139, 124, 246, 0.09)" strokeWidth={Math.max(1.2, unit * 0.0022)}>
          {paths}
        </g>
      );
    }
    if (kind === "streets") {
      // THE CITY ITSELF, edge to edge: streets, blocks, a river and moving
      // traffic. It belongs here rather than inside an object because the map
      // is the world this topic happens in, not a diagram placed on a stage —
      // which is what lets a hex overlay be cut straight over the real thing.
      return <CityMap x={0} y={0} w={width} h={height} atSeconds={t} />;
    }
    if (kind === "scanner") {
      // A READING surface: a sparse field of code modules with a bright bar
      // travelling down it. Every other backdrop in this file is ambience; this
      // one is the topic — the frame itself behaves like something being
      // scanned, so the subject and its world agree.
      const size = unit * 0.05;
      const cols = Math.ceil(width / size) + 1;
      const rows = Math.ceil(height / size) + 1;
      const sweep = ((t * 0.32) % 1.35 - 0.175) * height;
      return (
        <>
          <g fill="rgba(34, 197, 94, 0.07)">
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: cols }, (_, c) => {
                // Deterministic per cell, so the field never strobes.
                const h = Math.sin(r * 91.7 + c * 47.3) * 9137.71;
                if (h - Math.floor(h) < 0.72) return null;
                return <rect key={`${r}-${c}`} x={c * size} y={r * size} width={size * 0.62} height={size * 0.62} rx={1} />;
              }),
            )}
          </g>
          {/* The bar itself, with the glow trailing behind it. */}
          <rect x={0} y={sweep} width={width} height={unit * 0.004} fill="rgba(34, 197, 94, 0.55)" />
          <rect x={0} y={sweep - unit * 0.12} width={width} height={unit * 0.12} fill="url(#scanTrail)" />
          <defs>
            <linearGradient id="scanTrail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 197, 94, 0)" />
              <stop offset="100%" stopColor="rgba(34, 197, 94, 0.18)" />
            </linearGradient>
          </defs>
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
