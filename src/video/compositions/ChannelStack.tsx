import React from "react";
import { useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { DISPLAY_FONT_FAMILY } from "../theme";
import {
  derive,
  deriveWithout,
  firstConfidentAt,
  silentChannels,
  timeToX,
  stackRows,
  weightedRows,
  axisTicks,
  stackLabels,
  estimateTextWidthPx,
  type Mark,
} from "../../script/channelLayout";
import type { SharedVisualProps, ChannelsData } from "../sharedVisualProps";

// Renderer for the `channels` medium.
//
// Every number it shows — the conclusion, how many traces support it, when it
// first became safe, how much later it arrives with a channel switched off — is
// computed in channelLayout.ts from the marks on screen. This file draws.
//
// The one rule that matters most here: a mark's x comes from the SAME
// `timeToX` as the moment above it, so the causal reading (this happened, so
// that was emitted) is structurally true rather than eyeballed.

const UI_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';
const BAND_GRADIENT_ID = "channels-band";

const progressOf = (t: number, start: number, duration: number): number =>
  t <= start ? 0 : t >= start + duration ? 1 : (t - start) / Math.max(0.0001, duration);
const ease = (p: number) => Easing.bezier(0.33, 0, 0.15, 1)(Math.max(0, Math.min(1, p)));

type ChannelsAction = NonNullable<ChannelsData["timeline"]>[number];

interface Resolved {
  /** Where the playhead is, in hours. Null before the first `play`. */
  playhead: number | null;
  splitProgress: number;
  focus: { channel: string; weight: number } | null;
  convergeProgress: number;
  muted: { channel: string; progress: number } | null;
  proving: { margin: number; progress: number } | null;
  /** The visible span of the day right now — the medium's camera. */
  window: { from: number; to: number };
  /** 0..1 per channel; a collapsed channel is one the beat is not about. */
  soloOf: string | null;
  soloProgress: number;
  readout: { show: string; weight: number } | null;
  beat: { text: string; tone: string; at: string; size: string; weight: number } | null;
}

function resolve(timeline: readonly ChannelsAction[], t: number, baseWindow: { from: number; to: number }): Resolved {
  let window = baseWindow;
  let soloOf: string | null = null;
  let soloProgress = 0;
  let playhead: number | null = null;
  let splitProgress = 0;
  let convergeProgress = 0;
  let focus: Resolved["focus"] = null;
  let muted: Resolved["muted"] = null;
  let proving: Resolved["proving"] = null;
  let readout: Resolved["readout"] = null;
  let beat: Resolved["beat"] = null;

  const fadeWindow = (start: number, duration: number, hold = 0.9): number => {
    const inP = progressOf(t, start, 0.4);
    const outP = 1 - progressOf(t, start + duration + hold, 0.5);
    return Math.max(0, Math.min(ease(inP), Math.max(0, outP)));
  };

  for (const action of timeline) {
    switch (action.type) {
      case "window": {
        const p = ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 2.5));
        if (p > 0) {
          window = {
            from: window.from + (action.from - window.from) * p,
            to: window.to + (action.to - window.to) * p,
          };
        }
        break;
      }
      case "solo": {
        // Rises and RELEASES, like `focus` — a solo is a beat, not a permanent
        // state, so the stack comes back on its own rather than needing an
        // explicit undo action that an author would inevitably forget.
        const p = fadeWindow(action.startSeconds, action.durationSeconds ?? 2, 1.2);
        if (p > 0) {
          soloOf = action.channel;
          soloProgress = p;
        }
        break;
      }
      case "play": {
        const p = ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 6));
        if (p > 0) {
          const from = action.from ?? window.from;
          const to = action.to ?? window.to;
          playhead = from + (to - from) * p;
        }
        break;
      }
      case "split":
        splitProgress = Math.max(splitProgress, ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 2.2)));
        break;
      case "focus": {
        const w = fadeWindow(action.startSeconds, action.durationSeconds ?? 3);
        if (w > 0) focus = { channel: action.channel, weight: w };
        break;
      }
      case "converge":
        convergeProgress = Math.max(convergeProgress, ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 4)));
        break;
      case "prove": {
        const p = progressOf(t, action.startSeconds, action.durationSeconds ?? 7);
        if (p > 0) {
          proving = { margin: action.margin ?? 2, progress: p };
          // The tally IS the playhead sweeping the day again — one clock, so
          // the bars can only ever grow as the line passes a trace.
          playhead = window.from + (window.to - window.from) * Math.min(1, p / 0.85);
        }
        break;
      }
      case "mute": {
        const p = ease(progressOf(t, action.startSeconds, action.durationSeconds ?? 3.5));
        if (p > 0) muted = { channel: action.channel, progress: p };
        break;
      }
      case "readout": {
        const w = fadeWindow(action.startSeconds, action.durationSeconds ?? 2.8);
        if (w > 0) readout = { show: action.show, weight: w };
        break;
      }
      case "beat": {
        const w = fadeWindow(action.startSeconds, action.durationSeconds ?? 2.4, 0.2);
        if (w > 0) beat = { text: action.text, tone: action.tone ?? "neutral", at: action.at ?? "top", size: action.size ?? "normal", weight: w };
        break;
      }
    }
  }
  return { playhead, splitProgress, focus, convergeProgress, muted, proving, readout, beat, window, soloOf, soloProgress };
}

export const ChannelStack: React.FC<{ data: ChannelsData } & SharedVisualProps> = ({ data, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const timeline = React.useMemo(() => [...(data.timeline ?? [])].sort((a, b) => a.startSeconds - b.startSeconds), [data.timeline]);
  // Memoised because everything downstream — the resolve pass, the axis, every
  // mark's x — keys off it, and a fresh literal each render would rebuild all
  // of them on every frame.
  const baseWindow = React.useMemo(() => data.window ?? { from: 7, to: 23 }, [data.window]);
  const state = React.useMemo(() => resolve(timeline, t, baseWindow), [timeline, t, baseWindow]);
  // Everything downstream reads the LIVE window, so a `window` action rescales
  // the axis, the moments and every trace together — one clock, one move.
  const window = state.window;

  const colors = React.useMemo(() => {
    switch (data.theme) {
      case "dark":
        return { ground: "#0e1113", card: "#171b1f", border: "#2b3238", text: "#e8edf2", dim: "#a6b2bf", rule: "#232a30" };
      case "light":
        return { ground: "#f5f6f8", card: "#ffffff", border: "#d7dbe0", text: "#11161b", dim: "#5b636e", rule: "#e4e8ec" };
      default:
        return { ground: "#faf5e9", card: "#fffdf7", border: "#ddd3bc", text: "#1b1a16", dim: "#5f5849", rule: "#ece3cf" };
    }
  }, [data.theme]);

  const isPortrait = orientation === "portrait";
  // THE BOTTOM ZONE IS RESERVED, NOT SHARED. A rendered frame had the readout
  // band wash out the whole last channel row — "WHO YOU WERE NEAR" and its one
  // trace faded to nothing underneath a number. A band that can eat content is
  // a band drawn in the wrong place, so the stack now ends above the zone the
  // readouts and the axis live in.
  const pad = { x: width * (isPortrait ? 0.06 : 0.055), top: height * 0.13, bottom: height * 0.26 };
  const labelWidth = isPortrait ? width * 0.3 : width * 0.16;
  const outer = { x: pad.x, y: pad.top, width: width - pad.x * 2, height: height - pad.top - pad.bottom };
  /** Marks and moments live to the right of the channel labels. */
  const lane = { x: outer.x + labelWidth, y: outer.y, width: outer.width - labelWidth, height: outer.height };

  const channels = data.channels;
  const marks = React.useMemo(() => (data.marks ?? []) as Mark[], [data.marks]);
  // `outer`/`lane` are fresh objects every render, so the identity check is
  // useless and the scalar fields are what actually decide the geometry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const channelWeights = React.useMemo(
    () => channels.map((channel) => (state.soloOf ? (channel.id === state.soloOf ? 1 + state.soloProgress * 3.2 : 1 - state.soloProgress) : 1)),
    [channels, state.soloOf, state.soloProgress],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { strip: splitStrip, rows } = React.useMemo(
    () => weightedRows(outer, channelWeights),
    [outer.x, outer.y, outer.width, outer.height, channelWeights.join(",")],
  );
  void stackRows;
  // BEFORE THE SPLIT, THE DAY IS THE WHOLE PICTURE. Leaving the strip pinned at
  // the top from the first frame left the opening beat as a thin line above an
  // empty two-thirds of frame — a composition that says "something is missing"
  // when the point of the beat is that the day feels complete as lived.
  const strip = React.useMemo(() => {
    const centred = { ...splitStrip, y: outer.y + (outer.height - splitStrip.height) / 2 };
    const p = state.splitProgress;
    return { ...splitStrip, y: centred.y + (splitStrip.y - centred.y) * p };
  }, [splitStrip, outer.y, outer.height, state.splitProgress]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ticks = React.useMemo(() => axisTicks(window, lane), [window, lane.x, lane.width]);

  const liveMarks = React.useMemo(
    () => (state.muted ? marks.filter((m) => m.channel !== state.muted!.channel || state.muted!.progress < 0.5) : marks),
    [marks, state.muted],
  );
  const inference = React.useMemo(() => derive(liveMarks, state.playhead ?? Infinity), [liveMarks, state.playhead]);
  const fullInference = React.useMemo(() => derive(marks), [marks]);
  const mutedInference = React.useMemo(() => (state.muted ? deriveWithout(marks, state.muted.channel) : null), [marks, state.muted]);
  const confidentAt = React.useMemo(() => firstConfidentAt(marks), [marks]);
  const mutedConfidentAt = React.useMemo(
    () => (state.muted ? firstConfidentAt(marks.filter((m) => m.channel !== state.muted!.channel)) : null),
    [marks, state.muted],
  );
  const silent = React.useMemo(() => silentChannels(channels, marks), [channels, marks]);

  const labelFor = (signal: string | null): string =>
    signal ? (data.signalLabels?.[signal] ?? signal.toUpperCase()) : "—";

  const visibleAt = (at: number): boolean => state.playhead === null || at <= state.playhead + 0.001;
  const playheadX = state.playhead === null ? null : timeToX(state.playhead, window, lane);

  // Where converging traces gather.
  const verdict = { x: lane.x + lane.width * 0.5, y: outer.y + outer.height * 0.52 };

  const readoutText = (): { value: string; label: string } | null => {
    if (!state.readout) return null;
    switch (state.readout.show) {
      case "conclusion":
        // While the verdict card is up it already names the conclusion, and
        // printing it again underneath turns the frame into a slide. So the
        // readout carries the part the card cannot: what it was built from.
        return state.convergeProgress > 0.62
          ? { value: `${fullInference.supporting.length} ORDINARY MOMENTS`, label: "AND NOT ONE SECOND OF AUDIO" }
          : { value: labelFor(fullInference.winner), label: `BUILT FROM ${fullInference.supporting.length} ORDINARY MOMENTS` };
      case "traces":
        return { value: `${marks.length}`, label: "THINGS YOUR PHONE WROTE DOWN TODAY" };
      case "silent": {
        const names = silent.map((id) => channels.find((c) => c.id === id)?.label ?? id);
        return { value: names.length > 0 ? "0" : "—", label: names.length > 0 ? `RECORDINGS ON THE ${names[0]} CHANNEL` : "" };
      }
      case "confidentAt": {
        if (confidentAt === null) return null;
        const hour = Math.floor(confidentAt);
        const minute = Math.round((confidentAt - hour) * 60);
        const display = hour % 12 === 0 ? 12 : hour % 12;
        return { value: `${display}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`, label: "IT KNEW BY" };
      }
      case "delay": {
        if (confidentAt === null || mutedConfidentAt === null) return null;
        const hours = mutedConfidentAt - confidentAt;
        return {
          value: `${hours.toFixed(1)} HOURS LATER`,
          label: `STILL ${labelFor(mutedInference?.winner ?? null)}, WITHOUT THAT CHANNEL`,
        };
      }
    }
    return null;
  };
  const readout = readoutText();
  const beatColor = state.beat?.tone === "alert" ? "#d97706" : state.beat?.tone === "reveal" ? "#0ea5e9" : colors.text;

  return (
    <div style={{ width, height, background: colors.ground, position: "relative", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={BAND_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.ground} stopOpacity={0} />
            <stop offset="22%" stopColor={colors.ground} stopOpacity={0.97} />
            <stop offset="78%" stopColor={colors.ground} stopOpacity={0.97} />
            <stop offset="100%" stopColor={colors.ground} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* The title steps aside for a top beat. A beat band is painted in the
            ground colour, but a gradient's soft edges still let a heading ghost
            through underneath it — and "text never sits on content" applies to
            the scene's own furniture just as much as to the day. */}
        {data.title && !(state.beat && state.beat.at === "top") ? (
          <text x={outer.x} y={outer.y - height * 0.045} fill={colors.dim} fontFamily={UI_FONT} fontSize={Math.min(width * 0.017, 26)} fontWeight={700} letterSpacing={3}>
            {data.title}
          </text>
        ) : null}

        {/* Hour axis — the shared clock, drawn once, at the bottom. */}
        {ticks.map((tick) => (
          <g key={tick.at}>
            <line x1={tick.x} y1={outer.y} x2={tick.x} y2={outer.y + outer.height} stroke={colors.rule} strokeWidth={1} />
            {/* Sized and weighted to actually be read: at 15px and 90% opacity
                these were a grey suggestion of an axis rather than an axis. */}
            <text x={tick.x} y={outer.y + outer.height + 30} fill={colors.dim} fontFamily={UI_FONT} fontSize={18} fontWeight={600} letterSpacing={0.6} textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}

        {/* THE DAY AS LIVED. Before the split this is the whole picture: plain
            moments, no data anywhere, which is the honest version of how the
            day felt from the inside. */}
        <g>
          <line x1={lane.x} y1={strip.y + strip.height * 0.62} x2={lane.x + lane.width} y2={strip.y + strip.height * 0.62} stroke={colors.border} strokeWidth={2} />
          {(() => {
            const moments = data.moments ?? [];
            const fontSize = Math.min(width * 0.0125, 21);
            const y = strip.y + strip.height * 0.62;
            // Measured placement, not index alternation — see stackLabels.
            // Even levels go above the line, odd levels below, so a crowded
            // run fans outwards from the day rather than piling up on one side.
            const levels = stackLabels(
              moments.map((moment) => ({ centerX: timeToX(moment.at, window, lane), width: estimateTextWidthPx(moment.label, fontSize) })),
              16,
            );
            return moments.map((moment, index) => {
              const x = timeToX(moment.at, window, lane);
              const shown = visibleAt(moment.at);
              const level = levels[index];
              const above = level % 2 === 0;
              const rank = Math.floor(level / 2);
              const stem = 16 + rank * (fontSize + 16);
              const textY = above ? y - stem - fontSize * 0.8 : y + stem + fontSize * 0.9;
              return (
                <g key={`${moment.at}-${moment.label}`} opacity={shown ? 1 : 0.12}>
                  <circle cx={x} cy={y} r={7} fill={colors.text} />
                  <line x1={x} y1={above ? y - 12 : y + 12} x2={x} y2={above ? y - stem : y + stem} stroke={colors.border} strokeWidth={1.5} />
                  <text x={x} y={textY} fill={colors.text} fontFamily={UI_FONT} fontSize={fontSize} fontWeight={600} textAnchor="middle" dominantBaseline="middle">
                    {moment.label}
                  </text>
                </g>
              );
            });
          })()}
        </g>

        {/* The channels underneath, revealed by `split`. */}
        {rows.map((row, index) => {
          const channel = channels[index];
          const appear = ease(Math.max(0, Math.min(1, (state.splitProgress - index * 0.06) / 0.6)));
          if (appear <= 0.01) return null;
          const focused = state.focus?.channel === channel.id;
          const dimmed = state.focus && !focused ? 1 - state.focus.weight * 0.78 : 1;
          const isMuted = state.muted?.channel === channel.id;
          const channelMarks = marks.filter((mark) => mark.channel === channel.id);
          const isSilent = channelMarks.length === 0;
          const y = row.y + (1 - appear) * 26;
          // A collapsing row fades as it closes, so a solo never leaves slivers
          // of unreadable label behind where the other channels used to be.
          const collapsed = state.soloOf && state.soloOf !== channel.id ? state.soloProgress : 0;
          return (
            <g key={channel.id} opacity={appear * dimmed * (1 - collapsed)}>
              <rect x={outer.x} y={y} width={outer.width} height={row.height} rx={8} fill={focused ? colors.card : "transparent"} stroke={focused ? colors.border : "transparent"} strokeWidth={1.5} />
              <text
                x={outer.x + 14}
                y={y + row.height / 2}
                fill={isMuted && state.muted!.progress > 0.4 ? "#ef4444" : colors.dim}
                fontFamily={UI_FONT}
                fontSize={Math.min(width * 0.0115, 19)}
                fontWeight={700}
                letterSpacing={1.4}
                dominantBaseline="middle"
                textDecoration={isMuted && state.muted!.progress > 0.4 ? "line-through" : undefined}
              >
                {channel.label}
              </text>
              <line x1={lane.x} y1={y + row.height / 2} x2={lane.x + lane.width} y2={y + row.height / 2} stroke={colors.rule} strokeWidth={1.5} />

              {/* AN EMPTY CHANNEL SAYS SO. Nothing here is special-cased for the
                  microphone: any channel nobody put a mark on gets this, which
                  is what makes the absence a fact rather than a flourish. */}
              {isSilent && state.splitProgress > 0.7 ? (
                <text
                  x={lane.x + lane.width / 2}
                  y={y + row.height / 2 - 4}
                  fill={colors.dim}
                  fontFamily={UI_FONT}
                  fontSize={Math.min(width * 0.011, 18)}
                  fontWeight={600}
                  letterSpacing={3}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  opacity={focused ? 1 : 0.55}
                >
                  NOTHING RECORDED
                </text>
              ) : null}

              {(() => {
                const labelSize = Math.min(width * 0.0098, 16);
                // Two traces forty minutes apart on the same channel printed
                // "protein barspasta, passata" through each other; same fix.
                const markLevels = stackLabels(
                  channelMarks.map((mark) => ({ centerX: timeToX(mark.at, window, lane), width: estimateTextWidthPx(mark.label ?? "", labelSize) })),
                  14,
                );
                return channelMarks.map((mark, markIndex) => {
                const x = timeToX(mark.at, window, lane);
                const shown = visibleAt(mark.at);
                const supports = inference.winner !== null && mark.signals.includes(inference.winner);
                // A supporting trace LEAVES its channel and gathers at the
                // verdict — the ones that move are the ones the inference used.
                const pull = supports ? state.convergeProgress : 0;
                const cx = x + (verdict.x - x) * pull;
                const cy = y + row.height / 2 + (verdict.y - (y + row.height / 2)) * pull;
                const gone = isMuted ? state.muted!.progress : 0;
                return (
                  <g key={`${mark.at}-${mark.channel}`} opacity={(shown ? 1 : 0) * (1 - gone * 0.85)}>
                    <circle cx={cx} cy={cy} r={Math.max(6, row.height * 0.17)} fill={supports ? "#0ea5e9" : colors.dim} opacity={supports ? 1 : 0.55} />
                    {mark.label && pull < 0.2 ? (
                      <text
                        x={cx}
                        y={cy + row.height * 0.3 + markLevels[markIndex] * (labelSize + 4)}
                        fill={colors.dim}
                        fontFamily={UI_FONT}
                        fontSize={labelSize}
                        textAnchor="middle"
                      >
                        {mark.label}
                      </text>
                    ) : null}
                  </g>
                );
                });
              })()}
            </g>
          );
        })}

        {/* The playhead — one clock for the strip and every channel. */}
        {playheadX !== null ? (
          <g>
            <line x1={playheadX} y1={outer.y} x2={playheadX} y2={outer.y + outer.height} stroke="#0ea5e9" strokeWidth={2.5} opacity={0.9} />
            <circle cx={playheadX} cy={outer.y} r={6} fill="#0ea5e9" />
          </g>
        ) : null}

        {/* The verdict, once traces have gathered into it. */}
        {/* THE ANSWER MUST NOT ARRIVE BEFORE ITS EVIDENCE.
            Caught by sampling the beat mid-flight: the card was fading in from
            a quarter of the way through, so the conclusion was legible behind
            traces that had not reached it yet. That inverts the whole beat — a
            viewer told the answer first reads the gathering as decoration
            rather than as the thing that produced it. The card now waits until
            the traces have essentially landed.
            The scrim underneath it keeps the card in front of the day rather
            than colliding with a channel row; the traces that did NOT support
            the conclusion stay visible through it, because they are the
            counter-example and hiding them would flatter the argument. */}
        {/* THE VERDICT CARD BELONGS TO ITS OWN BEAT. `convergeProgress` only ever
            rises, so the card was still sitting there two beats later, on top
            of the tally that was busy deriving the same conclusion a second
            time. It stays for the mute beat — where the trace count visibly
            dropping from six to four IS the demonstration — and steps aside for
            anything else. */}
        {state.convergeProgress > 0.62 && !state.proving ? (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={colors.ground}
            opacity={0.62 * ease(Math.max(0, (state.convergeProgress - 0.62) / 0.38))}
          />
        ) : null}
        {state.convergeProgress > 0.62 && !state.proving ? (
          <g opacity={ease(Math.max(0, (state.convergeProgress - 0.62) / 0.38))}>
            <rect x={verdict.x - Math.min(430, width * 0.26)} y={verdict.y - 74} width={Math.min(860, width * 0.52)} height={148} rx={14} fill={colors.card} stroke={colors.border} strokeWidth={2} />
            <text x={verdict.x} y={verdict.y - 26} fill={colors.dim} fontFamily={UI_FONT} fontSize={17} fontWeight={700} letterSpacing={3} textAnchor="middle" dominantBaseline="middle">
              WHAT IT WORKED OUT
            </text>
            <text x={verdict.x} y={verdict.y + 22} fill={colors.text} fontFamily={DISPLAY_FONT_FAMILY} fontSize={Math.min(width * 0.036, 56)} fontWeight={900} textAnchor="middle" dominantBaseline="middle">
              {labelFor(inference.winner)}
            </text>
            <text x={verdict.x} y={verdict.y + 56} fill={colors.dim} fontFamily={UI_FONT} fontSize={16} textAnchor="middle" dominantBaseline="middle">
              {inference.supporting.length} traces · no audio
            </text>
          </g>
        ) : null}

        {/* THE TALLY YOU CAN WATCH. Two bars for the top two candidates, growing
            as the playhead passes each trace, and a marker pinned at the moment
            the leader's lead reaches the margin. The number underneath is the
            same one `readout: confidentAt` reports — but here you see it
            happen instead of being told it did. */}
        {state.proving
          ? (() => {
              const asOf = state.playhead ?? window.from;
              const live = derive(liveMarks, asOf);
              const confidentX = confidentAt === null ? null : timeToX(confidentAt, window, lane);
              const reached = confidentAt !== null && asOf >= confidentAt;
              // Centred and given room, behind its own scrim: the bars were
              // drawn across the MICROPHONE row and its "NOTHING RECORDED"
              // note, so the beat that proves the conclusion was defacing the
              // beat that proves the absence.
              const barHeight = Math.min(46, outer.height * 0.07);
              const gap = barHeight * 0.8;
              const barTop = outer.y + outer.height * 0.44;
              const maxWidth = lane.width * 0.5;
              const scale = Math.max(1, live.score, live.runnerUpScore);
              const bars = [
                { key: live.winner, score: live.score, lead: true },
                { key: live.runnerUp, score: live.runnerUpScore, lead: false },
              ].filter((bar) => bar.key !== null);
              return (
                <g>
                  <rect x={0} y={0} width={width} height={height} fill={colors.ground} opacity={0.55} />
                  {confidentX !== null && reached ? (
                    <g>
                      <line x1={confidentX} y1={outer.y} x2={confidentX} y2={outer.y + outer.height} stroke="#16a34a" strokeWidth={2.5} strokeDasharray="7 6" />
                      <circle cx={confidentX} cy={barTop - gap * 1.6} r={7} fill="#16a34a" />
                    </g>
                  ) : null}
                  {bars.map((bar, index) => {
                    const y = barTop + index * (barHeight + gap);
                    const w = (bar.score / scale) * maxWidth;
                    return (
                      <g key={bar.key ?? index}>
                        <rect x={lane.x} y={y} width={Math.max(2, w)} height={barHeight} rx={5} fill={bar.lead && reached ? "#16a34a" : bar.lead ? "#0ea5e9" : colors.dim} opacity={bar.lead ? 1 : 0.5} />
                        <text
                          x={lane.x + Math.max(2, w) + 14}
                          y={y + barHeight / 2}
                          fill={colors.text}
                          fontFamily={UI_FONT}
                          fontSize={Math.min(width * 0.0115, 19)}
                          fontWeight={bar.lead ? 800 : 600}
                          dominantBaseline="middle"
                        >
                          {labelFor(bar.key)} · {bar.score}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()
          : null}

        {readout ? (
          <g opacity={state.readout!.weight}>
            {/* The band starts BELOW the axis. At its old position it washed
                out the hour labels, which is the same fault as swallowing a
                channel row: a backdrop that covers content is in the wrong
                place, not merely too strong. */}
            <rect x={0} y={height * 0.8} width={width} height={height * 0.2} fill={`url(#${BAND_GRADIENT_ID})`} />
            <text x={width / 2} y={height * 0.875} fill={colors.text} fontFamily={DISPLAY_FONT_FAMILY} fontSize={Math.min(width * 0.05, 78)} fontWeight={900} textAnchor="middle" dominantBaseline="middle">
              {readout.value}
            </text>
            <text x={width / 2} y={height * 0.945} fill={colors.dim} fontFamily={UI_FONT} fontSize={Math.min(width * 0.017, 27)} fontWeight={600} letterSpacing={2.4} textAnchor="middle" dominantBaseline="middle">
              {readout.label}
            </text>
          </g>
        ) : null}

        {state.beat
          ? (() => {
              const y = state.beat.at === "top" ? height * 0.075 : state.beat.at === "bottom" ? height * 0.93 : height * 0.5;
              const fontSize = state.beat.size === "huge" ? Math.min(width * 0.055, 84) : Math.min(width * 0.031, 50);
              return (
                <g opacity={state.beat.weight}>
                  <rect x={0} y={y - fontSize * 1.7} width={width} height={fontSize * 3.4} fill={`url(#${BAND_GRADIENT_ID})`} />
                  <text x={width / 2} y={y} fill={beatColor} fontFamily={DISPLAY_FONT_FAMILY} fontSize={fontSize} fontWeight={900} letterSpacing={1.2} textAnchor="middle" dominantBaseline="middle">
                    {state.beat.text}
                  </text>
                </g>
              );
            })()
          : null}
      </svg>
    </div>
  );
};
