import React from "react";
import { UI_FONT_FAMILY, MONO_STACK } from "./workspaceChrome";
import type { WorkspaceData } from "../sharedVisualProps";

// Renders the DECLARED page inside a browser pane.
//
// The author says "a heading, a paragraph, a primary button"; this file owns
// what those look like. That split is the same one diagramLayout makes for
// nodes, and for the same reason: freeform markup in a script renders once,
// beautifully, and is then impossible to review, re-time or keep consistent
// across videos. Blocks stay a small, closed vocabulary so every mocked page in
// every lesson looks like it came from the same product.

type BrowserPane = Extract<WorkspaceData["panes"][number], { type: "browser" }>;
type Block = BrowserPane["blocks"][number];

interface Palette {
  text: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
}

const PALETTES: Record<"light" | "dark", Palette> = {
  light: { text: "#202124", muted: "#5f6368", surface: "#f1f3f4", border: "#dadce0", accent: "#1a73e8" },
  dark: { text: "#e8eaed", muted: "#9aa0a6", surface: "#1f2430", border: "rgba(148,163,184,0.2)", accent: "#8ab4f8" },
};

/** Highlight and press states are driven from the timeline, exactly like a
 * highlighted code line — a browser block is addressable the same way. */
export interface BlockState {
  highlighted: boolean;
  anyHighlighted: boolean;
  /** 0 -> 1 -> 0 over the press, so a click is a real depress and release. */
  press: number;
  visible: boolean;
}

const DIMMED = 0.34;

function TextRun({ text, lines, palette, size }: { text?: string; lines: number; palette: Palette; size: number }) {
  // With no text, draw placeholder bars — a real page has body copy that the
  // viewer is not meant to read, and rendering lorem ipsum invites them to try.
  if (text) {
    return <p style={{ margin: 0, fontFamily: UI_FONT_FAMILY, fontSize: size, lineHeight: 1.55, color: palette.muted }}>{text}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.5 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          style={{
            height: size * 0.62,
            borderRadius: 999,
            background: palette.surface,
            // A ragged last line is what stops a stack of bars reading as a table.
            width: i === lines - 1 ? "62%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

export const BrowserBlock: React.FC<{ block: Block; state: BlockState; palette: Palette; size: number }> = ({
  block,
  state,
  palette,
  size,
}) => {
  const opacity = state.visible ? (!state.anyHighlighted || state.highlighted ? 1 : DIMMED) : 0;
  const wrap = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div
      style={{
        opacity,
        transition: "none",
        borderRadius: 10,
        // A highlighted block gets a soft plate behind it rather than a border,
        // so nothing shifts position when it lights up.
        background: state.highlighted ? "rgba(251, 191, 36, 0.16)" : "transparent",
        padding: state.highlighted ? size * 0.4 : 0,
        margin: state.highlighted ? -size * 0.4 : 0,
        ...extra,
      }}
    >
      {children}
    </div>
  );

  switch (block.kind) {
    case "nav":
      return wrap(
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: size * 1.2,
            paddingBottom: size * 0.7,
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          {block.brand && (
            <span style={{ fontFamily: UI_FONT_FAMILY, fontWeight: 700, fontSize: size * 1.05, color: palette.text }}>{block.brand}</span>
          )}
          <div style={{ display: "flex", gap: size * 0.9, marginLeft: "auto" }}>
            {block.links.map((link) => (
              <span key={link} style={{ fontFamily: UI_FONT_FAMILY, fontSize: size * 0.88, color: palette.muted }}>
                {link}
              </span>
            ))}
          </div>
        </div>,
      );

    case "heading": {
      const scale = block.level === 1 ? 1.9 : block.level === 2 ? 1.45 : 1.18;
      return wrap(
        <h2 style={{ margin: 0, fontFamily: UI_FONT_FAMILY, fontWeight: 700, fontSize: size * scale, color: palette.text, letterSpacing: -0.4 }}>
          {block.text}
        </h2>,
      );
    }

    case "text":
      return wrap(<TextRun text={block.text} lines={block.lines} palette={palette} size={size} />);

    case "button": {
      const primary = block.variant === "primary";
      // A press is a real depress: it sinks and darkens, then comes back.
      const sink = state.press * 2;
      return wrap(
        <div style={{ display: "flex" }}>
          <span
            style={{
              fontFamily: UI_FONT_FAMILY,
              fontWeight: 600,
              fontSize: size * 0.95,
              color: primary ? "#ffffff" : palette.accent,
              background: primary ? palette.accent : "transparent",
              border: primary ? "none" : `1px solid ${palette.border}`,
              borderRadius: 8,
              padding: `${size * 0.5}px ${size * 1.3}px`,
              transform: `translateY(${sink}px) scale(${1 - state.press * 0.03})`,
              filter: state.press > 0 ? `brightness(${1 - state.press * 0.18})` : undefined,
              boxShadow: primary ? `0 ${Math.max(0, 4 - sink)}px ${10 - sink * 2}px rgba(26, 115, 232, 0.35)` : "none",
            }}
          >
            {block.text}
          </span>
        </div>,
      );
    }

    case "input":
      return wrap(
        <div style={{ display: "flex", flexDirection: "column", gap: size * 0.35 }}>
          {block.label && (
            <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: size * 0.8, fontWeight: 600, color: palette.text }}>{block.label}</span>
          )}
          <div
            style={{
              border: `1px solid ${state.highlighted ? palette.accent : palette.border}`,
              borderRadius: 8,
              padding: `${size * 0.5}px ${size * 0.7}px`,
              background: palette.surface,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: block.value ? MONO_STACK : UI_FONT_FAMILY,
                fontSize: size * 0.88,
                color: block.value ? palette.text : palette.muted,
              }}
            >
              {block.value ?? block.placeholder ?? ""}
            </span>
          </div>
        </div>,
      );

    case "cards":
      return wrap(
        <div style={{ display: "flex", gap: size * 0.8 }}>
          {block.items.map((item, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                minWidth: 0,
                border: `1px solid ${palette.border}`,
                borderRadius: 12,
                padding: size * 0.8,
                display: "flex",
                flexDirection: "column",
                gap: size * 0.35,
              }}
            >
              <span style={{ fontFamily: UI_FONT_FAMILY, fontWeight: 600, fontSize: size * 0.95, color: palette.text }}>{item.title}</span>
              {item.text && (
                <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: size * 0.82, color: palette.muted, lineHeight: 1.45 }}>{item.text}</span>
              )}
            </div>
          ))}
        </div>,
      );

    case "image":
      return wrap(
        <div
          style={{
            width: "100%",
            paddingTop: `${block.heightRatio * 100}%`,
            position: "relative",
            background: palette.surface,
            borderRadius: 12,
          }}
        >
          {block.label && (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: UI_FONT_FAMILY,
                fontSize: size * 0.85,
                color: palette.muted,
              }}
            >
              {block.label}
            </span>
          )}
        </div>,
      );

    case "list":
      return wrap(
        <div style={{ display: "flex", flexDirection: "column", gap: size * 0.5 }}>
          {block.items.map((item, index) => (
            <div key={index} style={{ display: "flex", alignItems: "baseline", gap: size * 0.6 }}>
              <span style={{ width: size * 0.4, height: size * 0.4, borderRadius: "50%", background: palette.accent, flexShrink: 0 }} />
              <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: size * 0.9, color: palette.text }}>{item}</span>
            </div>
          ))}
        </div>,
      );

    case "spinner":
      return wrap(
        <div style={{ display: "flex", alignItems: "center", gap: size * 0.7 }}>
          {/* Three dots at different opacities read as "working" in a still
              frame, where a rotating ring only reads in motion. */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{ width: size * 0.55, height: size * 0.55, borderRadius: "50%", background: palette.accent, opacity: 0.35 + i * 0.25 }}
            />
          ))}
          {block.label && <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: size * 0.85, color: palette.muted }}>{block.label}</span>}
        </div>,
      );

    case "json":
      return wrap(
        <div
          style={{
            background: palette.surface,
            borderRadius: 10,
            padding: size * 0.8,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {block.lines.map((line, index) => (
            <span
              key={index}
              style={{
                fontFamily: MONO_STACK,
                fontSize: size * 0.85,
                lineHeight: 1.65,
                whiteSpace: "pre",
                color: palette.text,
              }}
            >
              {line}
            </span>
          ))}
        </div>,
      );

    default:
      return null;
  }
};

export const BrowserPage: React.FC<{
  pane: BrowserPane;
  stateFor: (index: number) => BlockState;
  size: number;
}> = ({ pane, stateFor, size }) => {
  const palette = PALETTES[pane.theme];
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        padding: `${size * 1.5}px ${size * 1.8}px`,
        display: "flex",
        flexDirection: "column",
        gap: size * 1.1,
      }}
    >
      {pane.blocks.map((block, index) => (
        <BrowserBlock key={index} block={block} state={stateFor(index)} palette={palette} size={size} />
      ))}
    </div>
  );
};
