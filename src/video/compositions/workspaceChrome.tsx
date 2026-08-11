import React from "react";

// The three windows a coding lesson actually shows, drawn as three genuinely
// different objects.
//
// WHY THIS EXISTS
//
// The workspace medium used ONE chrome — macOS traffic lights plus a text
// label — for every pane, so a terminal was an editor with a different caption
// and there was no browser at all. On screen that reads as one widget repeated,
// which is precisely the "we seem to be using code editor view for every single
// thing" complaint. A viewer should know which surface they are looking at
// before they read a single character on it, the way they do in a real screen
// recording.
//
// So: the editor is a full VS Code window (see VSCodeChrome.tsx). A terminal
// has a shell title and no tab. A browser has a tab strip, navigation controls
// and an address bar, and its page is LIGHT — which is most of what sells it as
// a browser sitting next to a dark editor.

export const MONO_STACK = "monospace";
export const UI_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';

const DIMMED_PANE_OPACITY = 0.4;

/** Shared shell: rounded window, border, shadow, and the dim state that makes
 * focusPane mean something. Only the TITLE BAR differs per surface. */
const Window: React.FC<{
  dimmed: boolean;
  children: React.ReactNode;
  titleBar: React.ReactNode;
  /** A browser's page is light, so its body must not sit on the editor slate. */
  bodyBackground: string;
}> = ({ dimmed, children, titleBar, bodyBackground }) => (
  <div
    style={{
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      borderRadius: 18,
      border: "1px solid rgba(148, 163, 184, 0.18)",
      overflow: "hidden",
      opacity: dimmed ? DIMMED_PANE_OPACITY : 1,
      boxShadow: dimmed ? "none" : "0 24px 60px rgba(0,0,0,0.45)",
      background: bodyBackground,
    }}
  >
    {titleBar}
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
  </div>
);

const TrafficLights: React.FC = () => (
  <>
    {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
      <span key={color} style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
    ))}
  </>
);

/** A terminal gets a centred shell title and NO tab — the plain, quiet bar a
 * real terminal has. Its body is near-black rather than the editor's slate, so
 * the two surfaces separate even when stacked directly on top of each other. */
export const TerminalChrome: React.FC<{
  title?: string;
  dimmed: boolean;
  fontSize: number;
  children: React.ReactNode;
}> = ({ title, dimmed, fontSize, children }) => (
  <Window
    dimmed={dimmed}
    bodyBackground="#0a0e14"
    titleBar={
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "rgba(10, 14, 20, 0.95)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          position: "relative",
        }}
      >
        <TrafficLights />
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: MONO_STACK,
            fontSize: fontSize * 0.72,
            color: "#94a3b8",
            pointerEvents: "none",
          }}
        >
          {title ?? "zsh"}
        </span>
      </div>
    }
  >
    {children}
  </Window>
);

const NavButton: React.FC<{ glyph: string; size: number; muted?: boolean }> = ({ glyph, size, muted }) => (
  <span
    style={{
      fontFamily: UI_FONT_FAMILY,
      fontSize: size,
      color: muted ? "rgba(100, 116, 139, 0.5)" : "#64748b",
      width: size * 1.4,
      textAlign: "center",
      flexShrink: 0,
    }}
  >
    {glyph}
  </span>
);

/** A browser gets the full kit: a tab with a favicon, navigation controls and
 * an address bar. This is the pane that most needed to stop being an editor —
 * "open the page and look at the response" is a different teaching move from
 * "read this file", and it has to look different to land. */
export const BrowserChrome: React.FC<{
  title?: string;
  url?: string;
  theme: "light" | "dark";
  dimmed: boolean;
  fontSize: number;
  children: React.ReactNode;
}> = ({ title, url, theme, dimmed, fontSize, children }) => {
  const light = theme === "light";
  const barBackground = light ? "#e8eaed" : "#1f2430";
  const tabBackground = light ? "#ffffff" : "#2b3240";
  const addressBackground = light ? "#ffffff" : "#161a22";
  const textColor = light ? "#3c4043" : "#cbd5f5";
  const tabFontSize = fontSize * 0.72;

  return (
    <Window
      dimmed={dimmed}
      bodyBackground={light ? "#ffffff" : "#12161f"}
      titleBar={
        <div style={{ background: barBackground, borderBottom: light ? "1px solid #d2d5d9" : "1px solid rgba(148,163,184,0.14)" }}>
          {/* Tab strip */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "8px 14px 0 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6 }}>
              <TrafficLights />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: `7px 16px`,
                background: tabBackground,
                borderRadius: "10px 10px 0 0",
                maxWidth: "62%",
              }}
            >
              <span style={{ width: tabFontSize * 0.9, height: tabFontSize * 0.9, borderRadius: 3, background: "#4f6bff", flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: UI_FONT_FAMILY,
                  fontSize: tabFontSize,
                  color: textColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title ?? "New Tab"}
              </span>
              <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: tabFontSize, color: "#80868b", flexShrink: 0 }}>×</span>
            </div>
            <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: tabFontSize, color: "#80868b", paddingBottom: 8 }}>+</span>
          </div>

          {/* Navigation row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 10px 16px" }}>
            <NavButton glyph="←" size={fontSize * 0.82} />
            <NavButton glyph="→" size={fontSize * 0.82} muted />
            <NavButton glyph="⟳" size={fontSize * 0.82} />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 9,
                background: addressBackground,
                borderRadius: 999,
                padding: `${fontSize * 0.22}px ${fontSize * 0.6}px`,
                border: light ? "1px solid #d2d5d9" : "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <span style={{ fontSize: fontSize * 0.62, color: "#5f6368", flexShrink: 0 }}>🔒</span>
              <span
                style={{
                  fontFamily: UI_FONT_FAMILY,
                  fontSize: fontSize * 0.7,
                  color: textColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {url ?? "localhost:3000"}
              </span>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </Window>
  );
};
