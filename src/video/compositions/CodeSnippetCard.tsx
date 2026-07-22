import React from "react";
import { useCurrentFrame } from "remotion";
import { loadFont, fontFamily as jetBrainsMonoFamily } from "@remotion/google-fonts/JetBrainsMono";
import { COLORS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, CodeData } from "../sharedVisualProps";

loadFont("normal", { weights: ["400", "500", "700"] });
const MONO_FONT_FAMILY = `"${jetBrainsMonoFamily}", monospace`;

// A small, fixed semantic palette (not raw hex per token) so every code
// panel across every script reads consistently, the same way COLORS does
// for the rest of the project — an author tags a token's ROLE, this file
// owns what that role actually looks like.
const TOKEN_COLORS: Record<CodeData["lines"][number][number]["token"], string> = {
  keyword: "#fbbf24",
  string: "#8be9fd",
  function: "#50fa7b",
  variable: "#e2e8f0",
  comment: "#6b7a99",
  number: "#bd93f9",
  plain: "#e2e8f0",
};

const LINE_STAGGER_FRAMES = 5;
const LINE_FADE_FRAMES = 10;
// Stacked layout only — how long after the primary panel's cursor appears
// the second panel starts revealing ("code runs, then this happens"). A
// side-by-side comparison reveals both panels together instead (see below).
const SECOND_PANEL_DELAY_FRAMES = 20;
// Reserved bottom margin when the segment also has a caption
// (PhaseCaptionOverlay pins a caption box to the bottom of the frame, on
// top of whatever the card draws) so a tall panel doesn't sit under it.
const CAPTION_CLEARANCE = 170;

type CodeLine = CodeData["lines"][number];

/** Renders one panel's worth of staggered, per-token-colored lines — shared
 * between every panel so they all reveal the same way instead of
 * duplicating the fade/slide math per panel. */
const CodeLines: React.FC<{
  lines: readonly CodeLine[];
  fontSize: number;
  startFrame: number;
  frame: number;
  showCursor: boolean;
}> = ({ lines, fontSize, startFrame, frame, showCursor }) => {
  const lastNonEmptyIndex = [...lines].map((l) => l.length > 0).lastIndexOf(true);
  const cursorRevealFrame =
    startFrame + (lastNonEmptyIndex >= 0 ? lastNonEmptyIndex * LINE_STAGGER_FRAMES + LINE_FADE_FRAMES : 0);
  const cursorVisible = showCursor && frame >= cursorRevealFrame && Math.floor((frame - cursorRevealFrame) / 15) % 2 === 0;

  return (
    <>
      {lines.map((line, index) => {
        const start = startFrame + index * LINE_STAGGER_FRAMES;
        const opacity = fadeIn(frame, start, LINE_FADE_FRAMES);
        const y = slideIn(frame, start, LINE_FADE_FRAMES, 10);
        const isLast = index === lastNonEmptyIndex;
        return (
          <div
            key={index}
            style={{
              opacity,
              transform: `translateY(${y}px)`,
              fontFamily: MONO_FONT_FAMILY,
              fontSize,
              lineHeight: 1.9,
              whiteSpace: "pre",
              // JetBrains Mono ships programming ligatures (===, =>, !=
              // render as merged glyphs) — great in a real editor, but
              // at video resolution/compression they read as a rendering
              // glitch rather than a stylistic choice, so they're off.
              fontVariantLigatures: "none",
              fontFeatureSettings: '"liga" 0, "calt" 0',
            }}
          >
            {line.length === 0 ? (
              " "
            ) : (
              <>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={{ color: TOKEN_COLORS[token.token] }}>
                    {token.text}
                  </span>
                ))}
                {isLast && <span style={{ color: "#e2e8f0", opacity: cursorVisible ? 1 : 0 }}>▏</span>}
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

/** One editor/console window — the primary panel and an optional
 * secondPanel both render through this so their chrome/spacing never drift
 * apart. "editor" gets the traffic-light dots + filename/language tab (a
 * real second file, e.g. a before/after or clean/dirty comparison);
 * "console" gets a plain uppercase label pill instead (a result/output
 * box) — CodeSnippetCard infers which variant a secondPanel gets from
 * whether it names a file, so there's no separate flag for an author to
 * get out of sync with their own intent. */
const PanelWindow: React.FC<{
  variant: "editor" | "console";
  filename?: string;
  language?: string;
  label?: string;
  lines: readonly CodeLine[];
  fontSize: number;
  startFrame: number;
  frame: number;
  showCursor: boolean;
  opacity?: number;
  flex?: boolean;
}> = ({ variant, filename, language, label, lines, fontSize, startFrame, frame, showCursor, opacity = 1, flex }) => {
  const isEditor = variant === "editor";
  return (
    <div
      style={{
        opacity,
        flex: flex ? 1 : undefined,
        minWidth: flex ? 0 : undefined,
        borderRadius: 14,
        border: `1px solid ${isEditor ? "#7c3aed" : "#2f3140"}`,
        background: isEditor ? "#1a1b26" : "#14151f",
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        overflow: "hidden",
      }}
    >
      {isEditor ? (
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f87171" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fbbf24" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#4ade80" }} />
          </div>
          {(filename || language) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#252736",
                borderRadius: "8px 8px 0 0",
                padding: "8px 16px",
                marginBottom: -16,
              }}
            >
              {language && (
                <span style={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700, fontSize: 15, color: "#fbbf24" }}>{language}</span>
              )}
              {filename && (
                <span style={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 500, fontSize: 15, color: COLORS.textDim }}>{filename}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "12px 20px 0 20px" }}>
          <span
            style={{
              fontFamily: MONO_FONT_FAMILY,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: COLORS.textDim,
            }}
          >
            {label ?? "Output"}
          </span>
        </div>
      )}
      <div style={{ padding: isEditor ? "8px 32px 32px 32px" : "8px 32px 28px 32px" }}>
        <CodeLines lines={lines} fontSize={fontSize} startFrame={startFrame} frame={frame} showCursor={showCursor} />
      </div>
    </div>
  );
};

/** A real code-editor window: monospace font, left-aligned, per-token
 * syntax-highlight coloring, traffic-light chrome, an optional filename tab
 * — a standalone visual kind rather than another Canvas primitive, because
 * Canvas's label objects are center-anchored SVG text in the project's
 * display font with no per-token color support, which is exactly what made
 * hand-built "code" scenes there read as "a box with code-shaped text"
 * instead of actual code (see this file's originating conversation).
 *
 * `secondPanel` adds a second window: naming a `filename`/`language` makes
 * it a real second editor (a clean-vs-dirty or before-vs-after
 * comparison); leaving both unset makes it a plain console/output box.
 * `layout: "side-by-side"` (landscape only — see below) places both
 * columns next to each other and reveals them together, since a
 * comparison needs both visible at once; the default "stacked" keeps the
 * original below-the-editor placement with a delayed reveal ("code runs,
 * then this happens"). */
export const CodeSnippetCard: React.FC<{ data: CodeData } & SharedVisualProps> = ({
  data: { filename, language, lines, secondPanel, layout },
  backgroundColor,
  orientation,
  hasCaption,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  // A 9:16 frame can't fit two legible code columns, so side-by-side
  // silently falls back to stacked in portrait rather than being an error.
  const isSideBySide = !isPortrait && layout === "side-by-side" && !!secondPanel;

  const fontSize = isPortrait ? 26 : isSideBySide ? 28 : 34;
  const secondIsEditor = !!(secondPanel?.filename || secondPanel?.language);
  const secondFontSize = secondIsEditor ? fontSize : Math.round(fontSize * 0.85);
  const maxWidth = isPortrait ? 960 : isSideBySide ? 1700 : 1460;

  const codeLastNonEmptyIndex = [...lines].map((l) => l.length > 0).lastIndexOf(true);
  const codeCursorRevealFrame =
    codeLastNonEmptyIndex >= 0 ? codeLastNonEmptyIndex * LINE_STAGGER_FRAMES + LINE_FADE_FRAMES : 0;
  const secondStartFrame = isSideBySide ? 0 : codeCursorRevealFrame + SECOND_PANEL_DELAY_FRAMES;
  const secondOpacity = !secondPanel ? 0 : isSideBySide ? 1 : fadeIn(frame, secondStartFrame, LINE_FADE_FRAMES);

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div
        style={{
          display: "flex",
          flexDirection: isSideBySide ? "row" : "column",
          gap: isSideBySide ? 28 : 20,
          width: "88%",
          maxWidth,
          alignItems: "stretch",
          marginBottom: hasCaption ? CAPTION_CLEARANCE : 0,
        }}
      >
        <PanelWindow
          variant="editor"
          filename={filename}
          language={language}
          lines={lines}
          fontSize={fontSize}
          startFrame={0}
          frame={frame}
          showCursor={!secondPanel || isSideBySide}
          flex={isSideBySide}
        />
        {secondPanel && (
          <PanelWindow
            variant={secondIsEditor ? "editor" : "console"}
            filename={secondPanel.filename}
            language={secondPanel.language}
            label={secondPanel.label}
            lines={secondPanel.lines}
            fontSize={secondFontSize}
            startFrame={secondStartFrame}
            frame={frame}
            showCursor={true}
            opacity={secondOpacity}
            flex={isSideBySide}
          />
        )}
      </div>
    </SceneFrame>
  );
};
