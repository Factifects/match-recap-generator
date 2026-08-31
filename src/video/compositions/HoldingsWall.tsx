import React from "react";
import { useCurrentFrame, useVideoConfig, Easing, staticFile } from "remotion";
import { DISPLAY_FONT_FAMILY } from "../theme";
import {
  buildPanes,
  packWall,
  assemblyPlacement,
  assemblyAttempt,
  agree,
  affectedBy,
  spreadRow,
  rowLayout,
  stagePlacement,
  sharedRefs,
  segmentId,
  UNIVERSE_SIZE,
  type Pane,
  type PaneBox,
} from "../../script/holdingsLayout";
import type { SharedVisualProps, HoldingsData } from "../sharedVisualProps";

// Renderer for the `holdings` medium.
//
// Every coordinate and every number on screen comes from holdingsLayout.ts.
// This file draws; it does not decide what is true. That split matters more
// here than in any other medium, because the episode's claims ARE numbers —
// how much of the world is covered, how many devices disagree, how few have to
// care when something changes. If those could be authored per scene, the whole
// argument would be the narrator asserting things over a picture, which is the
// failure mode this medium was built to escape.

const UI_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

type HoldingsAction = NonNullable<HoldingsData["timeline"]>[number];

/** Row colours. A held reading is the only data a pane carries, so its colour is
 * doing real work: it is what makes two participants disagreeing about the same
 * row visible at a glance during the assembly.
 *
 * `betterWhen` is not a nicety. The same ramp that reads correctly for a road's
 * speed reads exactly backwards for a clock's error in milliseconds, and a
 * confidently inverted colour scale is worse than no colour at all. */
function valueColor(value: number, betterWhen: "high" | "low"): string {
  const stops: [number, string][] = [
    [12, "#ef4444"],
    [26, "#f59e0b"],
    [40, "#eab308"],
    [999, "#22c55e"],
  ];
  const scale = betterWhen === "high" ? value : 62 - Math.min(62, value);
  return stops.find(([limit]) => scale <= limit)![1];
}

function progressOf(t: number, start: number, duration: number): number {
  if (t <= start) return 0;
  if (t >= start + duration) return 1;
  return (t - start) / Math.max(0.0001, duration);
}

const ease = (p: number) => Easing.bezier(0.33, 0, 0.15, 1)(Math.max(0, Math.min(1, p)));

interface Resolved {
  paneCount: number;
  inspect: { index: number; weight: number } | null;
  compare: { a: number; b: number; weight: number } | null;
  assembleProgress: number;
  agreeing: { ref: string; rule: "median" | "min" | "max"; weight: number; progress: number } | null;
  changing: { ref: string; weight: number; progress: number } | null;
  readout: { show: string; weight: number } | null;
  beat: { text: string; tone: string; at: string; size: string; weight: number } | null;
}

/** Folds the timeline down to what is true at `t`. Same shape as the other
 * timeline media: one linear scan, no per-frame state, so any frame can be
 * rendered on its own — which is what makes a distributed render safe. */
function resolve(timeline: readonly HoldingsAction[], t: number): Resolved {
  let paneCount = 1;
  let assembleProgress = 0;
  let inspect: Resolved["inspect"] = null;
  let compare: Resolved["compare"] = null;
  let agreeing: Resolved["agreeing"] = null;
  let changing: Resolved["changing"] = null;
  let readout: Resolved["readout"] = null;
  let beat: Resolved["beat"] = null;

  /** A beat's own fade, so a mode leaves the screen as deliberately as it
   * arrived instead of popping off at its last frame. */
  const window = (start: number, duration: number, hold = 0.9): number => {
    const inP = progressOf(t, start, 0.45);
    const outP = 1 - progressOf(t, start + duration + hold, 0.5);
    return Math.max(0, Math.min(ease(inP), Math.max(0, outP)));
  };

  for (const action of timeline) {
    switch (action.type) {
      case "panes": {
        const p = ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 2));
        if (p > 0) paneCount = Math.round(paneCount + (action.count - paneCount) * p);
        break;
      }
      case "inspect": {
        const w = window(action.startSeconds, action.durationSeconds ?? 3);
        if (w > 0) inspect = { index: action.pane ?? 0, weight: w };
        break;
      }
      case "compare": {
        const w = window(action.startSeconds, action.durationSeconds ?? 3);
        if (w > 0) compare = { a: action.panes[0], b: action.panes[1], weight: w };
        break;
      }
      case "assemble": {
        assembleProgress = Math.max(assembleProgress, ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 3.5)));
        break;
      }
      case "scatter": {
        const p = ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 2));
        if (p > 0) assembleProgress = assembleProgress * (1 - p);
        break;
      }
      case "agree": {
        const w = window(action.startSeconds, action.durationSeconds ?? 3.5);
        if (w > 0)
          agreeing = {
            ref: action.ref,
            rule: action.rule ?? "median",
            weight: w,
            progress: ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 3.5)),
          };
        break;
      }
      case "change": {
        const w = window(action.startSeconds, action.durationSeconds ?? 3, 3.5);
        if (w > 0) changing = { ref: action.ref, weight: w, progress: ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 3)) };
        break;
      }
      case "readout": {
        const w = window(action.startSeconds, action.durationSeconds ?? 2.6);
        if (w > 0) readout = { show: action.show, weight: w };
        break;
      }
      case "beat": {
        const w = window(action.startSeconds, action.durationSeconds ?? 2.4, 0.2);
        if (w > 0) beat = { text: action.text, tone: action.tone ?? "neutral", at: action.at ?? "top", size: action.size ?? "normal", weight: w };
        break;
      }
    }
  }
  return { paneCount, inspect, compare, assembleProgress, agreeing, changing, readout, beat };
}

/** TEXT IS NEVER DRAWN STRAIGHT ONTO CONTENT — BUT IT IS NOT PATCHED EITHER.
 *
 * Two failures in a row here, both caught by looking at frames. First the
 * captions were drawn bare over the wall, so grey text landed on green and
 * amber bars and vanished. Then they were given plates sized to the text, which
 * fixed the contrast and looked like redaction boxes: opaque blobs hugging each
 * line, stamped on top of the picture.
 *
 * The right shape is a BACKDROP, not a patch — a full-width band that fades in
 * and out vertically, so the text sits in a calm region of the frame and the
 * band has no edges of its own to notice. Same idiom SpatialStage already uses
 * for its beats. Text is only ever drawn inside one of these.
 */
const BAND_GRADIENT_ID = "holdings-band";

const BackdropBand: React.FC<{
  width: number;
  centerY: number;
  height: number;
  opacity?: number;
}> = ({ width, centerY, height, opacity = 1 }) => (
  <rect x={0} y={centerY - height / 2} width={width} height={height} fill={`url(#${BAND_GRADIENT_ID})`} opacity={opacity} />
);

const PaneCard: React.FC<{
  pane: Pane;
  box: { x: number; y: number; width: number; height: number };
  detail: PaneBox["detail"];
  opacity: number;
  lit: boolean;
  /** Rows to pick out inside this pane — what the current beat is about. One
   * ref for a change or a reconciliation; every shared ref for a comparison. */
  markRefs?: ReadonlySet<string>;
  colors: { card: string; border: string; text: string; dim: string };
  subject: string;
  holds: string;
  refPrefix: string;
  betterWhen: "high" | "low";
  world?: readonly { label: string; brand?: string; logoPath?: string; logoHex?: string; logoMonochrome?: boolean }[];
  /** A row that has just STOPPED being usable, and how far the strike has
   * played (0..1). Only ever set on a participant that actually held it. */
  struck?: { ref: string; progress: number };
}> = ({ pane, box, detail, opacity, lit, markRefs, colors, subject, holds, refPrefix, betterWhen, world, struck }) => {
  const rows = pane.records;
  // Row geometry lives in holdingsLayout so the comparison overlay can draw a
  // link to exactly the row this card drew.
  const geometry = rowLayout(box, detail, rows.length);
  const { pad, headerHeight: headerH, rowHeight: rowH, rowGap } = geometry;
  // THE FALLBACK IS THE MECHANISM. Lighting up the participants that held the
  // dead route showed the blast radius but not what any of them actually DID —
  // and what they do is the explanation: drop that line, and use the next
  // cheapest thing they already knew about. So the struck row is struck, and
  // the row that inherits from it is lit, in the same card at the same moment.
  const struckIndex = struck ? rows.findIndex((r) => r.ref === struck.ref) : -1;
  const fallbackIndex =
    struckIndex >= 0
      ? rows.reduce((best, record, index) => {
          if (index === struckIndex) return best;
          if (best < 0) return index;
          return (record.value ?? Infinity) < (rows[best].value ?? Infinity) ? index : best;
        }, -1)
      : -1;

  return (
    <g opacity={opacity}>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={Math.min(10, box.width * 0.05)}
        fill={colors.card}
        stroke={lit ? "#f8fafc" : colors.border}
        strokeWidth={lit ? 2.4 : 1}
      />
      {detail !== "dense" ? (
        <text
          x={box.x + pad}
          y={box.y + pad + headerH * 0.5}
          fill={colors.dim}
          fontFamily={UI_FONT}
          fontSize={Math.max(9, Math.min(headerH * 0.62, 17))}
          fontWeight={700}
          letterSpacing={0.8}
          dominantBaseline="middle"
        >
          {detail === "full" ? `${subject} ${pane.label.split(" ").pop()}` : pane.label.split(" ").pop()}
        </text>
      ) : null}
      {detail === "full" ? (
        <text
          x={box.x + box.width - pad}
          y={box.y + pad + headerH * 0.5}
          fill={colors.dim}
          fontFamily={UI_FONT}
          fontSize={Math.max(8, Math.min(headerH * 0.5, 13))}
          textAnchor="end"
          dominantBaseline="middle"
          opacity={0.75}
        >
          {rows.length} {holds}
        </text>
      ) : null}
      {rows.map((record, index) => {
        const y = box.y + geometry.tops[index];
        const marked = markRefs?.has(record.ref) ?? false;
        const named = world?.[Number(record.ref.slice(1))];
        const value = record.value ?? 0;
        const barW = (box.width - pad * 2) * (detail === "full" ? 0.42 : 1) * Math.max(0.22, Math.min(1, value / 62));
        return (
          <g key={record.ref}>
            {marked ? (
              <rect
                x={box.x + pad * 0.35}
                y={y - rowGap * 0.5}
                width={box.width - pad * 0.7}
                height={rowH + rowGap}
                rx={3}
                fill="#f8fafc"
                opacity={0.16}
              />
            ) : null}
            {index === fallbackIndex && struck && struck.progress > 0.45 ? (
              <rect
                x={box.x + pad * 0.35}
                y={y - rowGap * 0.5}
                width={box.width - pad * 0.7}
                height={rowH + rowGap}
                rx={3}
                fill="#22c55e"
                opacity={0.16 * ease(Math.max(0, (struck.progress - 0.45) / 0.55))}
              />
            ) : null}
            <rect
              x={box.x + pad}
              y={y}
              width={Math.max(2, barW)}
              height={Math.max(2, rowH * 0.66)}
              rx={2}
              fill={index === struckIndex ? "#ef4444" : valueColor(value, betterWhen)}
              opacity={index === struckIndex ? 1 - struck!.progress * 0.65 : marked ? 1 : 0.92}
            />
            {index === struckIndex && struck ? (
              <line
                x1={box.x + pad}
                y1={y + rowH * 0.33}
                x2={box.x + pad + (box.width - pad * 2) * Math.min(1, struck.progress * 1.2)}
                y2={y + rowH * 0.33}
                stroke="#ef4444"
                strokeWidth={2.5}
              />
            ) : null}
            {detail === "full" ? (
              <>
                {/* A NAMED DESTINATION SHOWS ITS REAL MARK. Only some rows have
                    one, which is the honest picture — a routing table holds a
                    couple of recognizable networks among a pile of anonymous
                    prefixes — and it is also what keeps the logos meaningful.
                    A wall where every row carries a logo is a wall where none
                    of them mean anything. */}
                {named?.logoPath ? (
                  <image
                    href={staticFile(named.logoPath)}
                    x={box.x + pad + (box.width - pad * 2) * 0.47}
                    y={y - rowH * 0.08}
                    width={Math.max(12, rowH * 0.85)}
                    height={Math.max(12, rowH * 0.85)}
                    preserveAspectRatio="xMidYMid meet"
                    opacity={marked ? 1 : 0.92}
                  />
                ) : null}
                <text
                  x={box.x + pad + (box.width - pad * 2) * (named?.logoPath ? 0.47 : 0.5) + (named?.logoPath ? rowH * 1.05 : 0)}
                  y={y + rowH * 0.33}
                  fill={colors.text}
                  fontFamily={UI_FONT}
                  fontSize={Math.max(10, Math.min(rowH * 0.78, 19))}
                  dominantBaseline="middle"
                  fontWeight={marked ? 700 : 500}
                >
                  {named ? named.label : refPrefix + record.ref.slice(1)}
                </text>
                <text
                  x={box.x + box.width - pad}
                  y={y + rowH * 0.33}
                  fill={colors.text}
                  fontFamily={UI_FONT}
                  fontSize={Math.max(10, Math.min(rowH * 0.78, 19))}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontWeight={marked ? 700 : 500}
                >
                  {record.value}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </g>
  );
};

export const HoldingsWall: React.FC<{ data: HoldingsData } & SharedVisualProps> = ({ data, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const timeline = React.useMemo(() => [...(data.timeline ?? [])].sort((a, b) => a.startSeconds - b.startSeconds), [data.timeline]);
  const state = React.useMemo(() => resolve(timeline, t), [timeline, t]);

  // Three grounds, each with its own text pair rather than one palette nudged
  // lighter. Cream is a warm paper the row colours sit on without glaring; its
  // card is a shade ABOVE the ground, so a pane still reads as a held thing
  // rather than a hole cut in the page.
  const colors = React.useMemo(() => {
    switch (data.theme) {
      case "cream":
        return { ground: "#faf5e9", card: "#fffdf7", border: "#ddd3bc", text: "#1b1a16", dim: "#5f5849" };
      case "light":
        return { ground: "#f5f6f8", card: "#ffffff", border: "#d7dbe0", text: "#11161b", dim: "#5b636e" };
      default:
        // Small text needs MORE contrast than large text, not less — this dim
        // was lifted from #8c98a5 after a pane header read as grey mush.
        return { ground: "#0e1113", card: "#171b1f", border: "#2b3238", text: "#e8edf2", dim: "#a6b2bf" };
    }
  }, [data.theme]);

  /** The whole population is built ONCE, at the largest size the scene ever
   * reaches, so device 3 is the same device with the same holdings at every
   * count. A wall that regenerated as it grew would silently swap everyone's
   * holdings mid-scene, and the compare/agree/change beats would then be about
   * different devices than the ones the viewer had been watching. */
  const maxPanes = React.useMemo(
    () => Math.max(1, ...timeline.filter((a): a is Extract<HoldingsAction, { type: "panes" }> => a.type === "panes").map((a) => a.count)),
    [timeline],
  );
  const allPanes = React.useMemo(() => buildPanes(maxPanes, data.seed ?? 1), [maxPanes, data.seed]);

  const isPortrait = orientation === "portrait";
  const wallRect = React.useMemo(() => {
    const mx = width * (isPortrait ? 0.05 : 0.045);
    const top = height * (isPortrait ? 0.14 : 0.15);
    const bottom = height * (isPortrait ? 0.12 : 0.1);
    return { x: mx, y: top, width: width - mx * 2, height: height - top - bottom };
  }, [width, height, isPortrait]);

  const visible = Math.max(1, Math.min(state.paneCount, allPanes.length));
  const panes = React.useMemo(() => allPanes.slice(0, visible), [allPanes, visible]);
  const slots = React.useMemo(() => packWall(visible, wallRect), [visible, wallRect]);

  // Cheap enough to run every frame (a few thousand comparisons at the largest
  // wall this medium allows), and running them off `panes` rather than off a
  // memo keyed by an object that changes identity each frame keeps the numbers
  // honestly in step with what is actually on screen.
  const report = React.useMemo(() => assemblyAttempt(panes), [panes]);
  const agreement = state.agreeing ? agree(panes, state.agreeing.ref, state.agreeing.rule) : null;
  const affected = state.changing ? affectedBy(panes, state.changing.ref) : null;
  const affectedSet = new Set(affected?.paneIds ?? []);

  // The single frame the assembly is trying to fill. Drawn only while the
  // assembly is happening: it is the shape of the thing that does not exist.
  const target = {
    x: wallRect.x + wallRect.width * 0.08,
    y: wallRect.y + wallRect.height * 0.06,
    width: wallRect.width * 0.84,
    height: wallRect.height * 0.88,
  };
  const universeCols = 8;
  const universeRows = Math.ceil(UNIVERSE_SIZE / universeCols);
  const heldRefs = React.useMemo(() => new Set(panes.flatMap((p) => p.records.map((r) => r.ref))), [panes]);
  const conflictRefs = React.useMemo(() => new Set(report.conflicts.map((c) => c.ref)), [report]);

  const stagedIndexes: number[] = [];
  if (state.inspect) stagedIndexes.push(state.inspect.index);
  if (state.compare) stagedIndexes.push(state.compare.a, state.compare.b);
  const focusIndexes = new Set(stagedIndexes);
  const focusWeight = Math.max(state.inspect?.weight ?? 0, state.compare?.weight ?? 0);
  // A named subject has to be BROUGHT FORWARD, not merely un-dimmed: device 5
  // of a hundred and fifty is a card too small to read whatever happens to the
  // rest of the wall.
  const stagedBoxes = React.useMemo(
    () => (stagedIndexes.length > 0 ? stagePlacement(slots, stagedIndexes, wallRect, focusWeight) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, wallRect, focusWeight, stagedIndexes.join(",")],
  );
  const stagedBoxByIndex = new Map(stagedIndexes.map((paneIndex, position) => [paneIndex, stagedBoxes[position]]));
  const comparedShared =
    state.compare && panes[state.compare.a] && panes[state.compare.b]
      ? new Set(sharedRefs(panes[state.compare.a], panes[state.compare.b]))
      : null;
  const overlayWeight = Math.max(state.agreeing?.weight ?? 0, state.changing?.weight ?? 0);

  const readoutText = (): { value: string; label: string } | null => {
    if (!state.readout) return null;
    switch (state.readout.show) {
      case "coverage":
        return { value: `${Math.round(report.coverage * 100)}%`, label: "OF THE WORLD ANYONE IS HOLDING" };
      case "gaps":
        return { value: `${report.gaps.length}`, label: "PIECES NOBODY HAS" };
      case "conflicts":
        return { value: `${report.conflicts.length}`, label: "PIECES TWO DEVICES DISAGREE ON" };
      case "affected":
        return affected
          ? { value: `${affected.paneIds.length} of ${panes.length}`, label: `${data.subject ?? "DEVICE"}S HAD TO CHANGE ANYTHING` }
          : null;
      case "devices":
        return { value: `${panes.length}`, label: `${data.subject ?? "DEVICE"}S, NONE OF THEM HOLDING THE WHOLE` };
    }
    return null;
  };
  const readout = readoutText();

  const beatColor = state.beat?.tone === "alert" ? "#f59e0b" : state.beat?.tone === "reveal" ? "#38bdf8" : colors.text;

  return (
    <div style={{ width, height, background: colors.ground, position: "relative", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {/* Opaque through the middle, gone at both edges — the band reads as
              the frame quietening rather than as a shape laid over it. */}
          <linearGradient id={BAND_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.ground} stopOpacity={0} />
            <stop offset="22%" stopColor={colors.ground} stopOpacity={0.97} />
            <stop offset="78%" stopColor={colors.ground} stopOpacity={0.97} />
            <stop offset="100%" stopColor={colors.ground} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* The frame the assembly is trying to fill, with one cell per piece of
            the world. Cells nobody holds stay empty — that emptiness is the
            episode's central claim, so it is drawn rather than described. */}
        {state.assembleProgress > 0.02 ? (
          <g opacity={state.assembleProgress * 0.9}>
            <rect x={target.x} y={target.y} width={target.width} height={target.height} rx={10} fill="none" stroke={colors.border} strokeDasharray="10 8" strokeWidth={2} />
            {Array.from({ length: UNIVERSE_SIZE }, (_, index) => {
              const col = index % universeCols;
              const row = Math.floor(index / universeCols);
              const cw = target.width / universeCols;
              const ch = target.height / universeRows;
              const ref = segmentId(index);
              const held = heldRefs.has(ref);
              const contested = conflictRefs.has(ref);
              const named = data.world?.[index];
              const x = target.x + col * cw + 3;
              const y = target.y + row * ch + 3;
              // EVERY required piece is drawn, not only the missing ones. The
              // first render marked holes alone, and with nothing to be a hole
              // IN, the empty regions read as ordinary layout space rather than
              // as the picture failing to close.
              return (
                <g key={index}>
                  <rect x={x} y={y} width={cw - 6} height={ch - 6} rx={4} fill="none" stroke={colors.border} strokeWidth={1} opacity={0.5} />
                  {/* A hole is far more pointed when the viewer can see WHAT is
                      missing — an empty cell with a real destination's mark in
                      it says "nobody here knows how to reach this". */}
                  {named?.logoPath ? (
                    <image
                      href={staticFile(named.logoPath)}
                      x={x + (cw - 6) / 2 - Math.min(22, ch * 0.3)}
                      y={y + (ch - 6) * 0.16}
                      width={Math.min(44, ch * 0.6)}
                      height={Math.min(44, ch * 0.6)}
                      preserveAspectRatio="xMidYMid meet"
                      opacity={held ? 0.5 : 0.9}
                    />
                  ) : null}
                  {!held ? (
                    <>
                      <rect x={x} y={y} width={cw - 6} height={ch - 6} rx={4} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" opacity={0.95} />
                      <text
                        x={x + (cw - 6) / 2}
                        y={y + (ch - 6) * (named?.logoPath ? 0.82 : 0.5)}
                        fill="#ef4444"
                        fontFamily={UI_FONT}
                        fontSize={Math.min(22, ch * 0.4)}
                        fontWeight={800}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        ?
                      </text>
                    </>
                  ) : contested ? (
                    // Two devices hold this and do not agree. Marked, because a
                    // picture that cannot even be made CONSISTENT is a stronger
                    // claim than one that is merely incomplete.
                    <path
                      d={`M ${x + cw - 20} ${y} l 14 0 l 0 14 z`}
                      fill="#f59e0b"
                      opacity={0.95}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}

        {[...panes.keys()]
          .sort((a, b) => Number(focusIndexes.has(a)) - Number(focusIndexes.has(b)))
          .map((index) => {
          const pane = panes[index];
          const slot = slots[index];
          if (!slot) return null;
          const staged = stagedBoxByIndex.get(index);
          const box = staged ?? (state.assembleProgress > 0.001 ? assemblyPlacement(pane, slot, target, state.assembleProgress) : slot);
          const isFocus = focusIndexes.has(index);
          const dimmedByFocus = focusWeight > 0 && !isFocus ? 1 - focusWeight * 0.82 : 1;
          const isAffected = affectedSet.has(pane.id);
          const dimmedByChange = state.changing ? (isAffected ? 1 : 1 - state.changing.weight * 0.8) : 1;
          const dimmedByOverlay = overlayWeight > 0 && !state.changing ? 1 - overlayWeight * 0.72 : 1;
          return (
            <PaneCard
              key={pane.id}
              pane={pane}
              box={box}
              detail={staged?.detail ?? slot.detail}
              opacity={Math.max(0.06, dimmedByFocus * dimmedByChange * dimmedByOverlay)}
              lit={Boolean(state.changing && isAffected && state.changing.weight > 0.2)}
              markRefs={
                isFocus && comparedShared
                  ? comparedShared
                  : state.changing
                    ? new Set([state.changing.ref])
                    : state.agreeing
                      ? new Set([state.agreeing.ref])
                      : undefined
              }
              colors={colors}
              subject={data.subject ?? "DEVICE"}
              holds={data.holds ?? "SEGMENTS"}
              refPrefix={data.refPrefix ?? "S"}
              betterWhen={data.betterWhen ?? "high"}
              world={data.world}
              struck={state.changing && isAffected ? { ref: state.changing.ref, progress: state.changing.progress } : undefined}
            />
          );
        })}

        {/* DISAGREEMENT IS DRAWN AS A RELATIONSHIP, NOT LEFT AS TWO COLUMNS.
            Marking the rows two routers share showed that they overlap, which
            is only half the claim — the narration's actual point is that they
            disagree about the SAME destination, and a viewer should not have to
            mentally diff two columns of numbers to see it. So each shared row is
            linked across the gap and the difference is stated on the link. */}
        {state.compare && comparedShared && comparedShared.size > 0
          ? (() => {
              const boxA = stagedBoxByIndex.get(state.compare.a);
              const boxB = stagedBoxByIndex.get(state.compare.b);
              const paneA = panes[state.compare.a];
              const paneB = panes[state.compare.b];
              if (!boxA || !boxB || !paneA || !paneB) return null;
              const geoA = rowLayout(boxA, boxA.detail, paneA.records.length);
              const geoB = rowLayout(boxB, boxB.detail, paneB.records.length);
              const reveal = ease(Math.max(0, (state.compare.weight - 0.55) / 0.45));
              if (reveal <= 0.01) return null;
              return (
                <g opacity={reveal}>
                  {[...comparedShared].map((ref) => {
                    const indexA = paneA.records.findIndex((r) => r.ref === ref);
                    const indexB = paneB.records.findIndex((r) => r.ref === ref);
                    if (indexA < 0 || indexB < 0) return null;
                    const yA = boxA.y + geoA.tops[indexA] + geoA.rowHeight * 0.33;
                    const yB = boxB.y + geoB.tops[indexB] + geoB.rowHeight * 0.33;
                    const valueA = paneA.records[indexA].value ?? 0;
                    const valueB = paneB.records[indexB].value ?? 0;
                    const delta = Math.abs(valueA - valueB);
                    const x1 = boxA.x + boxA.width;
                    const x2 = boxB.x;
                    const midX = (x1 + x2) / 2;
                    return (
                      <g key={ref}>
                        <path
                          d={`M ${x1} ${yA} C ${midX} ${yA}, ${midX} ${yB}, ${x2} ${yB}`}
                          fill="none"
                          stroke={delta > 0 ? "#f59e0b" : colors.border}
                          strokeWidth={2}
                          strokeDasharray={delta > 0 ? "none" : "5 5"}
                        />
                        <circle cx={midX} cy={(yA + yB) / 2} r={19} fill={colors.ground} stroke={delta > 0 ? "#f59e0b" : colors.border} strokeWidth={2} />
                        <text
                          x={midX}
                          y={(yA + yB) / 2}
                          fill={colors.text}
                          fontFamily={UI_FONT}
                          fontSize={16}
                          fontWeight={800}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {delta > 0 ? `${delta}` : "="}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()
          : null}

        {/* Reconciliation: every reading of one thing, converging on one
            number, with the outliers visibly set aside rather than dropped. */}
        {agreement && state.agreeing ? (
          <g opacity={state.agreeing.weight}>
            {/* The wall is meant to recede for this beat, so it gets a full
                scrim rather than per-caption plates alone — the readings and
                the number then sit on a known colour instead of on whatever
                bars happen to be underneath them. */}
            <rect x={0} y={0} width={width} height={height} fill={colors.ground} opacity={0.82} />
            {(() => {
              // The beat has to say WHAT is being resolved. Twelve numbers
              // converging on one is a mechanism; twelve numbers converging on
              // one under the name of a real destination is an explanation.
              const named = data.world?.[Number(state.agreeing!.ref.slice(1))];
              const headerY = wallRect.y + wallRect.height * 0.1;
              return (
                <g>
                  {named?.logoPath ? (
                    <image
                      href={staticFile(named.logoPath)}
                      x={width / 2 - 22}
                      y={headerY - 52}
                      width={44}
                      height={44}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  ) : null}
                  <text
                    x={width / 2}
                    y={headerY}
                    fill={colors.dim}
                    fontFamily={UI_FONT}
                    fontSize={22}
                    fontWeight={700}
                    letterSpacing={2.6}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {state.agreeing!.rule === "median" ? "READINGS FOR " : "ROUTES TO "}
                    {named ? named.label.toUpperCase() : (data.refPrefix ?? "S") + state.agreeing!.ref.slice(1)}
                  </text>
                </g>
              );
            })()}
            {(() => {
              // CHIPS NEVER MOVE SIDEWAYS. The first version slid every reading
              // toward one point and they piled on top of each other on the way
              // — at mid-convergence the row rendered as "4 4 4 5 5 53", each
              // chip clipping its neighbour's second digit. So the readings hold
              // their own places and CONVERGENCE IS SUBTRACTION: the ones that
              // are not the answer drop away, and the one that is rises into it.
              const shown = agreement.readings.slice(0, 12);
              const chipW = 62;
              const centres = spreadRow(shown.length, chipW, 12, width / 2);
              const y = wallRect.y + wallRect.height * 0.24;
              const converge = ease(Math.max(0, (state.agreeing!.progress - 0.4) / 0.6));
              // Which chip is the ANSWER depends on the rule the scene declared:
              // the middle one for a median, the first for a min, the last for a
              // max. Lighting the middle chip while the number underneath is the
              // cheapest path would show the wrong mechanism.
              const rule = state.agreeing!.rule;
              const answerIndex = rule === "min" ? 0 : rule === "max" ? shown.length - 1 : Math.floor((shown.length - 1) / 2);
              return shown.map((reading, index) => {
                const isOut = agreement.discarded.includes(reading.paneId);
                const isAnswer = index === answerIndex;
                const x = centres[index];
                const drop = isAnswer ? 0 : (isOut ? 70 : 34) * converge;
                const opacity = isAnswer ? 1 : Math.max(0, 1 - converge * (isOut ? 1.4 : 1.15));
                return (
                  <g key={reading.paneId} opacity={opacity} transform={`translate(0 ${drop})`}>
                    <rect
                      x={x - chipW / 2}
                      y={y - 18}
                      width={chipW}
                      height={36}
                      rx={7}
                      fill={colors.card}
                      stroke={isOut ? "#ef4444" : isAnswer ? "#e8edf2" : valueColor(reading.value, data.betterWhen ?? "high")}
                      strokeWidth={isAnswer ? 2.6 : 2}
                    />
                    <text x={x} y={y} fill={colors.text} fontFamily={UI_FONT} fontSize={19} fontWeight={700} textAnchor="middle" dominantBaseline="middle">
                      {reading.value}
                    </text>
                  </g>
                );
              });
            })()}
            {/* The scrim above already put this whole beat on the ground
                colour, so the number and its caption need no backing of their
                own — adding one would be the patch problem all over again. */}
            <text
              x={width / 2}
              y={wallRect.y + wallRect.height * 0.7}
              fill={colors.text}
              fontFamily={DISPLAY_FONT_FAMILY}
              fontSize={Math.min(width * 0.075, 118)}
              fontWeight={900}
              textAnchor="middle"
              dominantBaseline="middle"
              opacity={ease(Math.max(0, (state.agreeing.progress - 0.62) / 0.38))}
            >
              {agreement.agreed}
            </text>
            <text
              x={width / 2}
              y={wallRect.y + wallRect.height * 0.82}
              fill={colors.dim}
              fontFamily={UI_FONT}
              fontSize={21}
              fontWeight={600}
              letterSpacing={2}
              textAnchor="middle"
              dominantBaseline="middle"
              opacity={ease(Math.max(0, (state.agreeing.progress - 0.72) / 0.28))}
            >
              {agreement.readings.length} PARTIAL {state.agreeing.rule === "median" ? "READINGS" : "ROUTES"}
              {agreement.discarded.length > 0 ? ` · ${agreement.discarded.length} SET ASIDE` : ""}
              {state.agreeing.rule === "median" ? " · ONE AGREED NUMBER" : " · ONE KEPT"}
            </text>
          </g>
        ) : null}

        {readout ? (
          <g opacity={state.readout!.weight}>
            {/* ALWAYS AT THE BOTTOM, in a band. The first version put a
                standalone readout in the middle of the frame, where it sat on
                top of the very picture it was a fact about. A readout is a
                caption on the wall, not a thing in front of it. */}
            <BackdropBand width={width} centerY={height * 0.87} height={height * 0.26} />
            <text
              x={width / 2}
              y={height * 0.855}
              fill={colors.text}
              fontFamily={DISPLAY_FONT_FAMILY}
              fontSize={Math.min(width * 0.055, 84)}
              fontWeight={900}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {readout.value}
            </text>
            <text
              x={width / 2}
              y={height * 0.925}
              fill={colors.dim}
              fontFamily={UI_FONT}
              fontSize={Math.min(width * 0.017, 27)}
              fontWeight={600}
              letterSpacing={2.4}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {readout.label}
            </text>
          </g>
        ) : null}

        {state.beat ? (
          (() => {
            const y = state.beat.at === "top" ? height * 0.085 : state.beat.at === "bottom" ? height * 0.93 : height * 0.5;
            const fontSize = state.beat.size === "huge" ? Math.min(width * 0.058, 88) : Math.min(width * 0.032, 52);
            return (
              <g opacity={state.beat.weight}>
                <BackdropBand width={width} centerY={y} height={fontSize * 3.4} />
                <text
                  x={width / 2}
                  y={y}
                  fill={beatColor}
                  fontFamily={DISPLAY_FONT_FAMILY}
                  fontSize={fontSize}
                  fontWeight={900}
                  letterSpacing={1.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {state.beat.text}
                </text>
              </g>
            );
          })()
        ) : null}
      </svg>
    </div>
  );
};
