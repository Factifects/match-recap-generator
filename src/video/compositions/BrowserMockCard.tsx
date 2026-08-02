import React from "react";
import { useCurrentFrame } from "remotion";
import { loadFont, fontFamily as jetBrainsMonoFamily } from "@remotion/google-fonts/JetBrainsMono";
import { COLORS, FONT_FAMILY } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn, pulse } from "../motion";
import type { SharedVisualProps, BrowserMockData } from "../sharedVisualProps";

loadFont("normal", { weights: ["400", "500", "700"] });
const MONO_FONT_FAMILY = `"${jetBrainsMonoFamily}", monospace`;

const ROW_STAGGER_FRAMES = 6;
const ROW_FADE_FRAMES = 12;
const CAPTION_CLEARANCE = 170;

type RequestRow = { method: string; path: string; status?: number | "pending" | "blocked" };
type ConsoleRow = { text: string; level: "error" | "warn" | "log" };
type Panel = "network" | "console";

const METHOD_COLORS: Record<string, string> = {
  GET: "#38bdf8",
  POST: "#4ade80",
  PUT: "#fbbf24",
  PATCH: "#c084fc",
  DELETE: "#f87171",
  OPTIONS: "#94a3b8",
};

function methodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] ?? "#94a3b8";
}

function statusColor(status: RequestRow["status"]): string {
  if (status === "blocked") return "#f87171";
  if (status === "pending") return "#94a3b8";
  if (typeof status === "number") {
    if (status < 300) return "#4ade80";
    if (status < 400) return "#38bdf8";
    return "#f87171";
  }
  return "#475569";
}

function statusLabel(status: RequestRow["status"]): string {
  if (status === "blocked") return "blocked";
  if (status === "pending") return "pending";
  if (typeof status === "number") return String(status);
  return "—";
}

// The highlighted-row ring used to always render red regardless of the
// row's own status — confirmed via a real render as a bug, not a style
// choice: a highlighted 200 success got an error-red outline, reading as
// "this request failed" when it hadn't. Deriving the ring/tint from the
// row's own statusColor()/LEVEL_COLORS instead means "highlighted" only
// ever means "narration is pointing here," with no implied verdict.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const LEVEL_COLORS: Record<ConsoleRow["level"], string> = {
  error: "#f87171",
  warn: "#facc15",
  log: "#e2e8f0",
};

const LEVEL_GLYPH: Record<ConsoleRow["level"], string> = {
  error: "✕",
  warn: "▲",
  log: "›",
};

interface ResolvedState {
  panel: Panel;
  requests: RequestRow[];
  consoleLines: ConsoleRow[];
  highlightIndex?: number;
}

/** A realistic browser-window-plus-DevTools mockup — traffic-light chrome
 * and a real address bar (or a flat "API client" header for `chrome:
 * "tool"`, contrasting a non-browser HTTP client that has no address bar
 * and doesn't enforce CORS at all), with a Network-tab request table or a
 * Console-tab log underneath. A standalone visual kind rather than another
 * Canvas primitive for the same reason CodeSnippetCard is: Canvas has no
 * per-row table layout, colored status pills, or monospace log rendering,
 * and hand-building that out of rectangles/labels every time it's needed
 * read as "boxes with text" instead of an actual browser screen.
 *
 * `revealSteps` cascades: each entry only needs to name the fields that
 * actually changed (e.g. just `highlightIndex`, or one more `requests`
 * row) — anything omitted carries forward from the previous step, the same
 * "build on what's already there" convention Canvas's own phases use,
 * rather than requiring every step to repeat the full state. */
export const BrowserMockCard: React.FC<{ data: BrowserMockData } & SharedVisualProps> = ({
  data: { chrome = "browser", url, toolLabel, panel, requests, consoleLines, highlightIndex, revealSteps },
  backgroundColor,
  orientation,
  durationInFrames,
  hasCaption,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const isBrowser = chrome === "browser";

  const initial: ResolvedState = {
    panel: panel ?? "network",
    requests: requests ?? [],
    consoleLines: consoleLines ?? [],
    highlightIndex,
  };

  const steps: { atFrame: number; state: ResolvedState }[] = [{ atFrame: 0, state: initial }];
  let running = initial;
  for (const step of revealSteps ?? []) {
    running = {
      panel: step.panel ?? running.panel,
      requests: step.requests ?? running.requests,
      consoleLines: step.consoleLines ?? running.consoleLines,
      highlightIndex: step.highlightIndex ?? running.highlightIndex,
    };
    steps.push({ atFrame: durationInFrames ? Math.round(durationInFrames * step.at) : 0, state: running });
  }

  let activeIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    if (frame >= steps[i].atFrame) activeIndex = i;
  }
  const { atFrame: stepStart, state } = steps[activeIndex];
  const stepLocalFrame = frame - stepStart;

  const maxWidth = isPortrait ? 920 : 1500;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div
        style={{
          width: "90%",
          maxWidth,
          marginBottom: hasCaption ? CAPTION_CLEARANCE : 0,
          borderRadius: 16,
          border: "1px solid #2f3140",
          background: "#14151f",
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {isBrowser ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 22px 12px 22px" }}>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f87171" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fbbf24" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#4ade80" }} />
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#1e2028",
                  borderRadius: 999,
                  padding: "10px 20px",
                }}
              >
                <span style={{ color: "#5b8cff", fontSize: 16 }}>🔒</span>
                <span
                  style={{
                    fontFamily: MONO_FONT_FAMILY,
                    fontWeight: 500,
                    fontSize: 20,
                    color: COLORS.textDim,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {url ?? ""}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px" }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fbbf24" }} />
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 700,
                fontSize: 20,
                color: COLORS.text,
              }}
            >
              {toolLabel ?? "API Client"}
            </span>
            {url && (
              <span
                style={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontWeight: 500,
                  fontSize: 18,
                  color: COLORS.textDim,
                  marginLeft: 6,
                }}
              >
                {url}
              </span>
            )}
          </div>
        )}

        {isBrowser && (
          <div style={{ display: "flex", gap: 28, padding: "0 26px", borderBottom: "1px solid #2a2c38" }}>
            {(["network", "console"] as Panel[]).map((tab) => {
              const active = state.panel === tab;
              return (
                <div
                  key={tab}
                  style={{
                    padding: "10px 4px 12px 4px",
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: active ? COLORS.text : "#5c6170",
                    borderBottom: active ? "3px solid #5b8cff" : "3px solid transparent",
                  }}
                >
                  {tab}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: "20px 26px 30px 26px" }}>
          {state.panel === "network" ? (
            <NetworkPanel
              rows={state.requests}
              highlightIndex={state.highlightIndex}
              frame={frame}
              stepStart={stepStart}
              stepLocalFrame={stepLocalFrame}
            />
          ) : (
            <ConsolePanel
              rows={state.consoleLines}
              highlightIndex={state.highlightIndex}
              stepLocalFrame={stepLocalFrame}
            />
          )}
        </div>
      </div>
    </SceneFrame>
  );
};

const NetworkPanel: React.FC<{
  rows: RequestRow[];
  highlightIndex?: number;
  frame: number;
  stepStart: number;
  stepLocalFrame: number;
}> = ({ rows, highlightIndex, frame, stepStart, stepLocalFrame }) => {
  if (rows.length === 0) return null;
  return (
    <div>
      <div
        style={{
          display: "flex",
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#5c6170",
          padding: "0 16px 10px 16px",
          borderBottom: "1px solid #24262f",
        }}
      >
        <div style={{ flex: 1 }}>Name</div>
        <div style={{ width: 130 }}>Method</div>
        <div style={{ width: 160 }}>Status</div>
      </div>
      {rows.map((row, index) => {
        const start = stepStart + index * ROW_STAGGER_FRAMES;
        const opacity = fadeIn(frame, start, ROW_FADE_FRAMES);
        const x = slideIn(frame, start, ROW_FADE_FRAMES, -24);
        const highlighted = highlightIndex === index;
        const highlightColor = statusColor(row.status);
        const blinkPending = row.status === "pending" ? pulse(stepLocalFrame, 40, 0.4, 1, index) : 1;
        return (
          <div
            key={index}
            style={{
              opacity: opacity * (row.status === "pending" ? blinkPending : 1),
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              padding: "14px 16px",
              marginTop: 6,
              borderRadius: 10,
              background: highlighted ? hexToRgba(highlightColor, 0.1) : "transparent",
              boxShadow: highlighted ? `0 0 0 2px ${highlightColor}` : "none",
            }}
          >
            <div
              style={{
                flex: 1,
                fontFamily: MONO_FONT_FAMILY,
                fontWeight: 500,
                fontSize: 19,
                color: COLORS.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.path}
            </div>
            <div style={{ width: 130 }}>
              <span
                style={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontWeight: 700,
                  fontSize: 15,
                  color: methodColor(row.method),
                  border: `1px solid ${methodColor(row.method)}`,
                  borderRadius: 6,
                  padding: "3px 10px",
                }}
              >
                {row.method.toUpperCase()}
              </span>
            </div>
            <div style={{ width: 160, display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontWeight: 700,
                  fontSize: 15,
                  color: statusColor(row.status),
                }}
              >
                {statusLabel(row.status)}
              </span>
              {row.status === "blocked" && (
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: 0.5,
                    color: "#f87171",
                    border: "1px solid #f87171",
                    borderRadius: 4,
                    padding: "2px 6px",
                  }}
                >
                  CORS
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ConsolePanel: React.FC<{ rows: ConsoleRow[]; highlightIndex?: number; stepLocalFrame: number }> = ({
  rows,
  highlightIndex,
  stepLocalFrame,
}) => {
  if (rows.length === 0) return null;
  return (
    <div>
      {rows.map((row, index) => {
        const start = index * ROW_STAGGER_FRAMES;
        const opacity = fadeIn(stepLocalFrame, start, ROW_FADE_FRAMES);
        const y = slideIn(stepLocalFrame, start, ROW_FADE_FRAMES, 12);
        const highlighted = highlightIndex === index;
        const color = LEVEL_COLORS[row.level];
        return (
          <div
            key={index}
            style={{
              opacity,
              transform: `translateY(${y}px)`,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "10px 14px",
              marginTop: 4,
              borderRadius: 8,
              background: highlighted ? hexToRgba(color, 0.1) : "transparent",
              boxShadow: highlighted ? `0 0 0 2px ${color}` : "none",
            }}
          >
            <span style={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700, fontSize: 17, color, flexShrink: 0 }}>
              {LEVEL_GLYPH[row.level]}
            </span>
            <span
              style={{
                fontFamily: MONO_FONT_FAMILY,
                fontWeight: 400,
                fontSize: 17,
                lineHeight: 1.5,
                color,
                whiteSpace: "pre-wrap",
              }}
            >
              {row.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};
