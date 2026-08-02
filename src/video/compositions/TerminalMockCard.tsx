import React from "react";
import { useCurrentFrame } from "remotion";
import { loadFont, fontFamily as jetBrainsMonoFamily } from "@remotion/google-fonts/JetBrainsMono";
import { COLORS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import { fadeIn, slideIn } from "../motion";
import type { SharedVisualProps, TerminalMockData } from "../sharedVisualProps";

loadFont("normal", { weights: ["400", "500", "700"] });
const MONO_FONT_FAMILY = `"${jetBrainsMonoFamily}", monospace`;

const LINE_STAGGER_FRAMES = 6;
const LINE_FADE_FRAMES = 12;
const CAPTION_CLEARANCE = 170;

type TerminalLine = { text: string; kind: "command" | "output" | "success" | "error" | "comment" };

const LINE_COLOR: Record<TerminalLine["kind"], string> = {
  command: "#f8fafc",
  output: "#b0bec5",
  success: "#4ade80",
  error: "#f87171",
  comment: "#5c6170",
};

/** A realistic terminal/CLI window — traffic-light chrome, a monospace `$`
 * prompt, typed commands and their real output. Standalone visual kind for
 * the same reason CodeSnippetCard and BrowserMockCard are: a command-line
 * session has its own register (a prompt glyph, a near-black terminal
 * background distinct from an editor's tinted one, command/output/success/
 * error as first-class line kinds) that Canvas's generic label objects
 * can't carry, and building it out of rectangles every time it comes up
 * would drift in look from script to script. */
export const TerminalMockCard: React.FC<{ data: TerminalMockData } & SharedVisualProps> = ({
  data: { title, lines, revealSteps },
  backgroundColor,
  orientation,
  durationInFrames,
  hasCaption,
}) => {
  const frame = useCurrentFrame();
  const isPortrait = orientation === "portrait";
  const maxWidth = isPortrait ? 920 : 1460;
  const fontSize = isPortrait ? 24 : 28;

  const steps: { atFrame: number; lines: TerminalLine[] }[] = [{ atFrame: 0, lines }];
  for (const step of revealSteps ?? []) {
    steps.push({ atFrame: durationInFrames ? Math.round(durationInFrames * step.at) : 0, lines: step.lines });
  }

  let activeIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    if (frame >= steps[i].atFrame) activeIndex = i;
  }
  const { atFrame: stepStart, lines: activeLines } = steps[activeIndex];

  const lastFrame = stepStart + (activeLines.length - 1) * LINE_STAGGER_FRAMES + LINE_FADE_FRAMES;
  const cursorVisible = frame >= lastFrame && Math.floor((frame - lastFrame) / 15) % 2 === 0;

  return (
    <SceneFrame backgroundColor={backgroundColor} orientation={orientation}>
      <div
        style={{
          width: "88%",
          maxWidth,
          marginBottom: hasCaption ? CAPTION_CLEARANCE : 0,
          borderRadius: 14,
          border: "1px solid #2a2c30",
          background: "#0b0c0e",
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 22px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f87171" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fbbf24" }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#4ade80" }} />
          </div>
          {title && (
            <span style={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 500, fontSize: 16, color: COLORS.textDim }}>
              {title}
            </span>
          )}
        </div>
        <div style={{ padding: "6px 30px 32px 30px" }}>
          {activeLines.map((line, index) => {
            const start = stepStart + index * LINE_STAGGER_FRAMES;
            const opacity = fadeIn(frame, start, LINE_FADE_FRAMES);
            const y = slideIn(frame, start, LINE_FADE_FRAMES, 8);
            const isLast = index === activeLines.length - 1;
            const color = LINE_COLOR[line.kind];
            return (
              <div
                key={index}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize,
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  fontVariantLigatures: "none",
                  display: "flex",
                  gap: 12,
                }}
              >
                {line.kind === "command" && <span style={{ color: "#4ade80", flexShrink: 0 }}>$</span>}
                {line.kind === "comment" && <span style={{ color, flexShrink: 0 }}>#</span>}
                <span style={{ color }}>
                  {line.text}
                  {isLast && <span style={{ color: "#f8fafc", opacity: cursorVisible ? 1 : 0 }}>▏</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
