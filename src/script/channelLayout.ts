// Geometry and inference for the `channels` medium.
//
// THE THESIS THIS MEDIUM EXISTS TO DEMONSTRATE
//
// People believe their phone is listening because an ad matched a conversation.
// The real mechanism is duller and worse: the ad was derivable from what they
// DID — where they went, what they searched, what they bought, who they were
// near — and no audio was needed at all.
//
// A claim about what was captured, and when, has one natural shape: a stack of
// time channels with a shared clock. And it has one decisive move available to
// it that no other shape has — leaving a channel visibly EMPTY for the whole
// video while the conclusion still lands. The microphone track is not special-
// cased anywhere in this file; it is simply a channel nobody put marks on, and
// the emptiness is therefore a property of the data rather than a thing the
// renderer draws to make a point.
//
// The same discipline as holdingsLayout: a script may ask for a prediction but
// may never assert one. `derive` computes what the marks actually support, and
// `deriveWithout` computes what survives when a channel is removed — which is
// what makes the closing beat ("turn off location and it still lands, just
// later") a measured fact instead of a claim.

export interface Moment {
  /** Hour of the day, as a float — 13.5 is half past one. */
  at: number;
  label: string;
}

export interface Mark {
  at: number;
  /** Which channel this landed on. */
  channel: string;
  label?: string;
  /** What this trace is evidence FOR. A location ping outside a running shop
   * and a search for blister plasters are evidence for the same thing, which is
   * the entire reason no microphone is required. */
  signals: string[];
  /** How strong this single trace is. Defaults to 1. */
  weight?: number;
}

export interface Channel {
  id: string;
  label: string;
}

export interface Inference {
  /** The best-supported conclusion, or null when nothing is supported. */
  winner: string | null;
  score: number;
  runnerUp: string | null;
  runnerUpScore: number;
  /** How far ahead the winner is. A small margin is a weak guess. */
  margin: number;
  /** Marks that contributed to the winner — what the conclusion was built from. */
  supporting: Mark[];
}

/** What the traces actually support, optionally as of a moment in the day.
 *
 * Deliberately a plain weighted vote rather than anything cleverer: the point
 * being taught is that ordinary, boring traces converge, not that the inference
 * is sophisticated. Overstating the machinery would teach the wrong lesson. */
export function derive(marks: readonly Mark[], asOf = Infinity): Inference {
  const scores = new Map<string, number>();
  const supporting = new Map<string, Mark[]>();
  for (const mark of marks) {
    if (mark.at > asOf) continue;
    for (const signal of mark.signals) {
      scores.set(signal, (scores.get(signal) ?? 0) + (mark.weight ?? 1));
      supporting.set(signal, [...(supporting.get(signal) ?? []), mark]);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return { winner: null, score: 0, runnerUp: null, runnerUpScore: 0, margin: 0, supporting: [] };
  const [winner, score] = ranked[0];
  const [runnerUp, runnerUpScore] = ranked[1] ?? [null, 0];
  return { winner, score, runnerUp, runnerUpScore, margin: score - runnerUpScore, supporting: supporting.get(winner) ?? [] };
}

/** The same question with one channel switched off.
 *
 * This is the closing beat of the episode, and it must be measured rather than
 * asserted: turning off location genuinely should not rescue you, and if for
 * some population it did, this would say so. */
export function deriveWithout(marks: readonly Mark[], channelId: string, asOf = Infinity): Inference {
  return derive(
    marks.filter((mark) => mark.channel !== channelId),
    asOf,
  );
}

/** The earliest moment the conclusion is safely ahead of its nearest rival.
 *
 * "It still works without your location, it just takes longer" is only worth
 * saying if the delay is real, so it is computed by walking the day and asking
 * when the lead first opens up — not by an author typing a number of hours. */
export function firstConfidentAt(marks: readonly Mark[], requiredMargin = 2): number | null {
  const times = [...new Set(marks.map((mark) => mark.at))].sort((a, b) => a - b);
  for (const time of times) {
    const inference = derive(marks, time);
    if (inference.winner && inference.margin >= requiredMargin) return time;
  }
  return null;
}

/** Channels that carry nothing at all. The microphone is expected to be in
 * here, and the episode's central claim fails if it is not — see
 * validateChannels.ts, which refuses to let a script narrate an empty mic while
 * quietly putting marks on it. */
export function silentChannels(channels: readonly Channel[], marks: readonly Mark[]): string[] {
  const used = new Set(marks.map((mark) => mark.channel));
  return channels.filter((channel) => !used.has(channel.id)).map((channel) => channel.id);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface TimeWindow {
  from: number;
  to: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** THE SHARED CLOCK. Every mark, every moment on the day strip and the playhead
 * all convert time to x through this one function.
 *
 * Load-bearing, not tidiness: the entire argument of the medium is that a trace
 * lands UNDER the ordinary moment that produced it. Two conversions computed
 * separately would eventually disagree by a few pixels, and the causal reading —
 * this happened, so that was emitted — would quietly stop being true. */
export function timeToX(at: number, window: TimeWindow, rect: Rect): number {
  const span = Math.max(0.0001, window.to - window.from);
  const t = (at - window.from) / span;
  return rect.x + Math.max(0, Math.min(1, t)) * rect.width;
}

/** Rough on-screen width of a line of text, in px. Deliberately generous — a
 * label placer that under-estimates lets two labels touch, which is the fault
 * this exists to prevent. */
export function estimateTextWidthPx(text: string, fontSize: number, tracking = 0): number {
  const AVERAGE_ADVANCE = 0.63;
  return text.length * (fontSize * AVERAGE_ADVANCE + tracking);
}

/** Assigns each label a STACK LEVEL so no two on the same level overlap.
 *
 * Straight from a rendered frame: the day strip alternated labels above and
 * below the line by index, which works only when neighbours are evenly spaced.
 * Two moments an hour apart both landed below and printed
 * "shop on the way homescrolling in bed" straight through each other. The same
 * fault hit the trace labels — "protein bars" and "pasta, passata" forty
 * minutes apart on the same channel.
 *
 * Alternation is a guess about spacing. This measures instead: walk the labels
 * left to right and drop each one to the first level where it clears the last
 * label already on that level. */
export function stackLabels(
  labels: readonly { centerX: number; width: number }[],
  gap = 12,
): number[] {
  const order = labels.map((label, index) => ({ ...label, index })).sort((a, b) => a.centerX - b.centerX);
  /** Right edge currently occupied on each level. */
  const occupied: number[] = [];
  const levels = new Array<number>(labels.length).fill(0);
  for (const label of order) {
    const left = label.centerX - label.width / 2;
    let level = occupied.findIndex((rightEdge) => left >= rightEdge + gap);
    if (level === -1) {
      level = occupied.length;
      occupied.push(0);
    }
    occupied[level] = label.centerX + label.width / 2;
    levels[label.index] = level;
  }
  return levels;
}

export interface ChannelRow {
  id: string;
  y: number;
  height: number;
  /** Centre line marks sit on. */
  centerY: number;
}

/** Lays the stack out with a WEIGHT per channel, so a beat can collapse the
 * rows it isn't about instead of merely dimming them.
 *
 * Dimming leaves the same picture on screen with less contrast; collapsing
 * changes what the frame IS. A beat whose whole point is one empty line reads
 * far harder when that line is the only thing there, at full height, than when
 * it is one faint row among five. Weights are continuous so the collapse can be
 * animated rather than cut. */
export function weightedRows(rect: Rect, weights: readonly number[], stripRatio = 0.26): { strip: Rect; rows: ChannelRow[]; gap: number } {
  const count = weights.length;
  const stripHeight = count === 0 ? rect.height : rect.height * stripRatio;
  const strip: Rect = { x: rect.x, y: rect.y, width: rect.width, height: stripHeight };
  if (count === 0) return { strip, rows: [], gap: 0 };

  const remaining = rect.height - stripHeight;
  const gap = Math.min(14, (remaining / count) * 0.18);
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  // A fully collapsed stack would divide by zero; fall back to even.
  const share = total <= 0.001 ? weights.map(() => 1 / count) : weights.map((w) => Math.max(0, w) / total);
  const usable = remaining - gap * (count + 1);
  let cursor = strip.y + strip.height + gap;
  const rows: ChannelRow[] = share.map((fraction, index) => {
    const height = usable * fraction;
    const row = { id: `row${index}`, y: cursor, height, centerY: cursor + height / 2 };
    cursor += height + gap;
    return row;
  });
  return { strip, rows, gap };
}

/** Lays the day strip and the channel rows into a rect.
 *
 * The strip is given real weight rather than being a thin header: the first
 * beat of the episode is the day AS LIVED, with no data on screen at all, and
 * that beat needs room to be a picture in its own right rather than a label
 * above the real content. */
export function stackRows(rect: Rect, channelCount: number, stripRatio = 0.26): { strip: Rect; rows: ChannelRow[]; gap: number } {
  const stripHeight = channelCount === 0 ? rect.height : rect.height * stripRatio;
  const strip: Rect = { x: rect.x, y: rect.y, width: rect.width, height: stripHeight };
  if (channelCount === 0) return { strip, rows: [], gap: 0 };

  const remaining = rect.height - stripHeight;
  const gap = Math.min(14, (remaining / channelCount) * 0.18);
  const rowHeight = (remaining - gap * (channelCount + 1)) / channelCount;
  const rows: ChannelRow[] = Array.from({ length: channelCount }, (_, index) => {
    const y = strip.y + strip.height + gap * (index + 1) + rowHeight * index;
    return { id: `row${index}`, y, height: rowHeight, centerY: y + rowHeight / 2 };
  });
  return { strip, rows, gap };
}

/** Hour labels for the axis, at a spacing that never crowds. */
export function axisTicks(window: TimeWindow, rect: Rect, maxTicks = 9): { at: number; x: number; label: string }[] {
  const span = window.to - window.from;
  const step = Math.max(1, Math.ceil(span / maxTicks));
  const ticks: { at: number; x: number; label: string }[] = [];
  for (let at = Math.ceil(window.from); at <= window.to; at += step) {
    const hour = ((Math.floor(at) % 24) + 24) % 24;
    const suffix = hour < 12 ? "AM" : "PM";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    ticks.push({ at, x: timeToX(at, window, rect), label: `${display}${suffix}` });
  }
  return ticks;
}
