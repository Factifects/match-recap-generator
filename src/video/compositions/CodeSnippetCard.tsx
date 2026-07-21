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

/** A real code-editor window: monospace font, left-aligned, per-token
 * syntax-highlight coloring, traffic-light chrome, an optional filename tab
 * — a standalone visual kind rather than another Canvas primitive, because
 * Canvas's label objects are center-anchored SVG text in the project's
 * display font with no per-token color support, which is exactly what made
 * hand-built "code" scenes there read as "a box with code-shaped text"
 * instead of actual code (see this file's originating conversation). */
export const CodeSnippetCard: React.FC<{ data: CodeData } & SharedVisualProps> = ({
  data: { filename, language, lines },
  backgroundColor,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const fontSize = isPortrait ? 26 : 32;
  const maxWidth = isPortrait ? 820 : 1180;

  const lastNonEmptyIndex = [...lines].map((l) => l.length > 0).lastIndexOf(true);
  const cursorRevealFrame = lastNonEmptyIndex >= 0 ? lastNonEmptyIndex * LINE_STAGGER_FRAMES + LINE_FADE_FRAMES : 0;
  const cursorVisible = frame >= cursorRevealFrame && Math.floor((frame - cursorRevealFrame) / 15) % 2 === 0;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div
        style={{
          maxWidth,
          width: "88%",
          borderRadius: 14,
          border: "1px solid #7c3aed",
          background: "#1a1b26",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
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
        <div style={{ padding: "8px 32px 32px 32px" }}>
          {lines.map((line, index) => {
            const start = index * LINE_STAGGER_FRAMES;
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
                  " "
                ) : (
                  <>
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} style={{ color: TOKEN_COLORS[token.token] }}>
                        {token.text}
                      </span>
                    ))}
                    {isLast && (
                      <span style={{ color: "#e2e8f0", opacity: cursorVisible ? 1 : 0 }}>▏</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
