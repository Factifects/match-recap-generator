import React from "react";
import { useCurrentFrame, staticFile, Img } from "remotion";
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
type Panel = "network" | "console" | "page";

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

interface PageContent {
  logoPath?: string;
  heading?: string;
  subheading?: string;
  fields?: { kind: "text" | "password" | "button" | "note" | "divider"; label?: string; value?: string; active: boolean }[];
  prompt?: { title: string; body?: string; icon?: string };
}

interface ResolvedState {
  panel: Panel;
  requests: RequestRow[];
  consoleLines: ConsoleRow[];
  highlightIndex?: number;
  /** The rendered page, swappable per reveal step so a passkey sheet can slide
   * up over a form instead of the beat being a still image. */
  page?: PageContent;
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
/** An ACTUAL PAGE inside the chrome — the thing a viewer recognises as being on
 * the web, rather than a developer panel.
 *
 * Deliberately plain: a card, a heading, a couple of fields and one action. The
 * point is never to draw a beautiful website; it is that the viewer is looking
 * at a page and not at a log, so that when the DevTools panel does appear later
 * it reads as lifting the lid on something real.
 */
const PagePanel: React.FC<{
  page?: PageContent;
  stepLocalFrame: number;
}> = ({ page, stepLocalFrame }) => {
  if (!page) return null;
  const appear = Math.min(1, Math.max(0, stepLocalFrame / 14));
  return (
    <div
      style={{
        position: "relative",
        background: "#F5F6F8",
        minHeight: 430,
        // Room reserved UNDER the content for the system sheet. Without it the
        // sheet sat on top of the very button it is responding to, hiding the
        // action the beat is about.
        padding: page.prompt ? "44px 0 150px 0" : "44px 0",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "min(560px, 78%)", opacity: appear }}>
        {page.logoPath ? (
          <Img src={staticFile(page.logoPath)} style={{ width: 44, height: 44, objectFit: "contain", marginBottom: 20 }} />
        ) : null}
        {page.heading ? (
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 34, fontWeight: 800, color: "#10141B", marginBottom: 8 }}>{page.heading}</div>
        ) : null}
        {page.subheading ? (
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 19, color: "#5A6478", marginBottom: 28 }}>{page.subheading}</div>
        ) : null}
        {(page.fields ?? []).map((field, index) => {
          if (field.kind === "divider") {
            return <div key={index} style={{ height: 1, background: "#dcdbd6", margin: "26px 0" }} />;
          }
          if (field.kind === "note") {
            return (
              <div key={index} style={{ fontFamily: FONT_FAMILY, fontSize: 16, color: "#7b8090", marginTop: 14 }}>
                {field.label}
              </div>
            );
          }
          if (field.kind === "button") {
            return (
              <div
                key={index}
                style={{
                  marginTop: 22,
                  padding: "16px 20px",
                  borderRadius: 10,
                  background: field.active ? "#4C8DFF" : "#E3E6EC",
                  color: field.active ? "#ffffff" : "#5f6472",
                  fontFamily: FONT_FAMILY,
                  fontSize: 19,
                  fontWeight: 700,
                  textAlign: "center",
                  boxShadow: field.active ? "0 8px 24px rgba(76,141,255,0.32)" : "none",
                }}
              >
                {field.label}
              </div>
            );
          }
          return (
            <div key={index} style={{ marginBottom: 18 }}>
              {field.label ? (
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 600, color: "#5A6478", marginBottom: 7 }}>{field.label}</div>
              ) : null}
              <div
                style={{
                  padding: "15px 16px",
                  borderRadius: 9,
                  border: field.active ? "2px solid #4C8DFF" : "1px solid #D5D9E0",
                  background: "#ffffff",
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: 18,
                  color: field.value ? "#15171c" : "#a7abb6",
                }}
              >
                {field.kind === "password" && field.value ? "•".repeat(field.value.length) : (field.value ?? "")}
              </div>
            </div>
          );
        })}
      </div>

      {/* The system sheet — the moment the browser, not the page, takes over. */}
      {page.prompt ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 22,
            transform: "translateX(-50%)",
            width: "min(520px, 76%)",
            background: "rgba(16,20,27,0.97)",
            borderRadius: 16,
            padding: "22px 26px",
            border: "1px solid #3a3d४a".replace("४", "4"),
            boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            opacity: Math.min(1, Math.max(0, (stepLocalFrame - 18) / 14)),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 30 }}>{page.prompt.icon ?? "🔑"}</span>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: "#f2f4f8" }}>{page.prompt.title}</div>
              {page.prompt.body ? (
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, color: "#9aa0b0", marginTop: 4 }}>{page.prompt.body}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const BrowserMockCard: React.FC<{ data: BrowserMockData } & SharedVisualProps> = ({
  data: { chrome = "browser", url, toolLabel, panel, requests, consoleLines, highlightIndex, revealSteps, tabs, page },
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
    page,
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
      page: step.page ?? running.page,
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
            {/* TAB STRIP. A browser scene that is only an address bar over a log
                reads as a developer tool, not as being on the web. The tabs are
                what make the chrome recognisable at a glance. */}
            {tabs && tabs.length > 0 ? (
              <div style={{ display: "flex", gap: 6, padding: "10px 16px 0 16px", background: "#0f1017" }}>
                {tabs.map((tab, index) => (
                  <div
                    key={tab}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "10px 10px 0 0",
                      background: index === 0 ? "#14151f" : "transparent",
                      color: index === 0 ? COLORS.text : "#5c6170",
                      fontFamily: FONT_FAMILY,
                      fontSize: 15,
                      fontWeight: 600,
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>
            ) : null}
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

        {isBrowser && state.panel !== "page" && (
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

        <div style={{ padding: state.panel === "page" ? 0 : "20px 26px 30px 26px" }}>
          {state.panel === "page" ? (
            <PagePanel page={state.page} stepLocalFrame={stepLocalFrame} />
          ) : state.panel === "network" ? (
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
