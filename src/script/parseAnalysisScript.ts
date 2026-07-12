import { type TimedSegment, type Visual, segmentSchema, visualSchema } from "../model/Segment";
import { estimateDurationSeconds } from "./estimateDuration";

const CHAPTER_HEADER = /^##\s+(.+)$/;
const STAT_TAG = /^\[STAT:\s*(.+)\]$/i;
const SEQUENCE_TAG = /^\[SEQUENCE:\s*(.+)\]$/i;
const BARCHART_TAG = /^\[BARCHART:\s*(.+)\]$/i;
const ICON_TAG = /^\[ICON:\s*(.+)\]$/i;
const ZONE_TAG = /^\[ZONE:\s*(.+)\]$/i;
const SHAPE_TAG = /^\[SHAPE:\s*(.+)\]$/i;
const TACTICAL_BOARD_TAG = /^\[TACTICAL_BOARD:\s*(.+)\]$/i;
const FORMATION_TAG = /^\[FORMATION:\s*(.+)\]$/i;
const SHOTMAP_TAG = /^\[SHOTMAP:\s*(.+)\]$/i;
const COMPARISON_TAG = /^\[COMPARISON:\s*(.+)\]$/i;
// "Label 21" / "Label 3.04" — value is the trailing number, everything before it is the label.
const LABEL_VALUE = /^(.+?)\s+(-?\d+(?:\.\d+)?)$/;
// "60': Curls the equalizer" — marker is everything before the first colon.
const BEAT = /^([^:]+):\s*(.+)$/;

// How many sentences share one on-screen "beat" — small enough that the visual
// changes every 10-20s of narration instead of sitting static for a whole section.
const SENTENCES_PER_CHUNK = 2;

function splitIntoSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function chunkSentences(sentences: string[], size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += size) {
    chunks.push(sentences.slice(i, i + size).join(" "));
  }
  return chunks;
}

function parseStatTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [title, leftRaw, rightRaw] = parts;

  const left = leftRaw.match(LABEL_VALUE);
  const right = rightRaw.match(LABEL_VALUE);
  if (!left || !right) return null;

  const leftValue = Number(left[2]);
  const rightValue = Number(right[2]);
  const format = left[2].includes(".") || right[2].includes(".") ? "decimal" : "integer";

  const result = visualSchema.safeParse({
    kind: "statburst",
    label: title,
    leftLabel: left[1].trim(),
    leftValue,
    rightLabel: right[1].trim(),
    rightValue,
    format,
  });
  return result.success ? result.data : null;
}

function parseSequenceTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length < 2) return null;
  const [title, ...beatParts] = parts;

  const beats = beatParts.map((part) => {
    const match = part.match(BEAT);
    return match ? { marker: match[1].trim(), label: match[2].trim() } : null;
  });
  if (beats.some((b) => b === null)) return null;

  const result = visualSchema.safeParse({ kind: "sequence", title, beats });
  return result.success ? result.data : null;
}

function parseBarChartTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length < 3) return null;
  const [title, ...barParts] = parts;

  const bars = barParts.map((part) => {
    const match = part.match(LABEL_VALUE);
    return match ? { label: match[1].trim(), value: Number(match[2]) } : null;
  });
  if (bars.some((b) => b === null)) return null;

  const result = visualSchema.safeParse({ kind: "barchart", title, bars });
  return result.success ? result.data : null;
}

function parseIconTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [icon, headline, caption] = parts;

  const result = visualSchema.safeParse({ kind: "icon", icon, headline, caption });
  return result.success ? result.data : null;
}

function parseZoneTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [zone, label, caption] = parts;

  const result = visualSchema.safeParse({ kind: "zone", zone, label, caption });
  return result.success ? result.data : null;
}

function parseShapeTag(content: string): Visual | null {
  const parts = content.split("|").map((p) => p.trim());
  if (parts.length < 3) return null;
  const [title, ...segmentParts] = parts;

  const segments = segmentParts.map((part) => {
    const match = part.match(LABEL_VALUE);
    return match ? { label: match[1].trim(), value: Number(match[2]) } : null;
  });
  if (segments.some((s) => s === null)) return null;

  const result = visualSchema.safeParse({ kind: "shape", title, segments });
  return result.success ? result.data : null;
}

// Shared by every JSON-payload tag (TACTICAL_BOARD, FORMATION, and future
// data-heavy visuals) — pipe-delimited syntax doesn't scale to nested,
// variable-length shapes like a players array or an arrows array.
function parseJsonVisualTag(kind: string, content: string): Visual | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const result = visualSchema.safeParse({ kind, ...(parsed as Record<string, unknown>) });
  return result.success ? result.data : null;
}

/**
 * Parses a markdown-style article script into TimedSegment[]. Every ## header
 * becomes a chapter beat and every sentence-chunk of prose becomes a statement
 * beat — durations are word-count estimates until real narration audio replaces
 * them. Inline tags never remove narration text; they attach a graphic to
 * whichever statement beat immediately precedes them, so the underlying
 * narration (and its audio) keeps playing under the graphic instead of vanishing:
 *
 *   Six minutes later he laid it back for Dembele, who curled a low finish in.
 *   [SEQUENCE: Redemption | 60': Curls it in | 66': Squares it for Dembele]
 */
export function parseAnalysisScript(scriptText: string): TimedSegment[] {
  const lines = scriptText.split(/\r?\n/);
  const segments: TimedSegment[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (paragraph.length === 0) return;

    const sentences = splitIntoSentences(paragraph);
    for (const chunk of chunkSentences(sentences, SENTENCES_PER_CHUNK)) {
      const result = segmentSchema.safeParse({ type: "statement", text: chunk });
      if (result.success) {
        segments.push({ ...result.data, durationSeconds: estimateDurationSeconds(chunk, "statement") });
      }
    }
  };

  const attachVisual = (visual: Visual | null) => {
    if (!visual) return;
    const last = segments[segments.length - 1];
    if (!last || last.type !== "statement") return;
    last.visual = visual;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headerMatch = line.match(CHAPTER_HEADER);
    if (headerMatch) {
      flushParagraph();
      const result = segmentSchema.safeParse({ type: "chapter", text: headerMatch[1].trim() });
      if (result.success) {
        segments.push({ ...result.data, durationSeconds: estimateDurationSeconds(headerMatch[1], "chapter") });
      }
      continue;
    }

    const statMatch = line.match(STAT_TAG);
    if (statMatch) {
      flushParagraph();
      attachVisual(parseStatTag(statMatch[1]));
      continue;
    }

    const sequenceMatch = line.match(SEQUENCE_TAG);
    if (sequenceMatch) {
      flushParagraph();
      attachVisual(parseSequenceTag(sequenceMatch[1]));
      continue;
    }

    const barChartMatch = line.match(BARCHART_TAG);
    if (barChartMatch) {
      flushParagraph();
      attachVisual(parseBarChartTag(barChartMatch[1]));
      continue;
    }

    const iconMatch = line.match(ICON_TAG);
    if (iconMatch) {
      flushParagraph();
      attachVisual(parseIconTag(iconMatch[1]));
      continue;
    }

    const zoneMatch = line.match(ZONE_TAG);
    if (zoneMatch) {
      flushParagraph();
      attachVisual(parseZoneTag(zoneMatch[1]));
      continue;
    }

    const shapeMatch = line.match(SHAPE_TAG);
    if (shapeMatch) {
      flushParagraph();
      attachVisual(parseShapeTag(shapeMatch[1]));
      continue;
    }

    const tacticalBoardMatch = line.match(TACTICAL_BOARD_TAG);
    if (tacticalBoardMatch) {
      flushParagraph();
      attachVisual(parseJsonVisualTag("tactical-board", tacticalBoardMatch[1]));
      continue;
    }

    const formationMatch = line.match(FORMATION_TAG);
    if (formationMatch) {
      flushParagraph();
      attachVisual(parseJsonVisualTag("formation", formationMatch[1]));
      continue;
    }

    const shotMapMatch = line.match(SHOTMAP_TAG);
    if (shotMapMatch) {
      flushParagraph();
      attachVisual(parseJsonVisualTag("shot-map", shotMapMatch[1]));
      continue;
    }

    const comparisonMatch = line.match(COMPARISON_TAG);
    if (comparisonMatch) {
      flushParagraph();
      attachVisual(parseJsonVisualTag("player-comparison", comparisonMatch[1]));
      continue;
    }

    if (line === "") {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(line);
  }
  flushParagraph();

  return segments;
}
