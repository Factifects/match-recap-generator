import React from "react";
import { UI_FONT_FAMILY } from "./workspaceChrome";

// VS Code, rebuilt as furniture rather than suggested by a dark rectangle.
//
// A viewer recognises an editor from its FRAME long before they read a line of
// code in it: the activity rail down the left, the file tabs, the breadcrumb,
// the minimap, and the blue status bar along the bottom. A rounded dark panel
// with three traffic lights has none of those, which is why the first pass read
// as "a code box" rather than "someone's editor" — the note was
// "we need the code scene mimicking so much like an actual VS Code".
//
// Everything here is derived from what the author already wrote (the filename,
// the lines, the language) unless they explicitly say otherwise. Dressing the
// set should not be a per-scene authoring chore.

/** Dark+ (Default Dark Modern), the theme most viewers picture. */
export const VSCODE = {
  editorBg: "#1f1f1f",
  sidebarBg: "#181818",
  activityBg: "#181818",
  tabBarBg: "#181818",
  tabActiveBg: "#1f1f1f",
  tabInactiveFg: "#9d9d9d",
  border: "#2b2b2b",
  statusBg: "#181818",
  statusFg: "#cccccc",
  lineNumber: "#6e7681",
  lineNumberActive: "#cccccc",
  activeLineBg: "rgba(255, 255, 255, 0.045)",
  text: "#cccccc",
  accent: "#0078d4",
};

/** Dark+ token colours. Deliberately the real ones — a viewer who writes code
 * every day clocks a wrong keyword colour instantly, and it is the cheapest
 * possible way to look inauthentic. */
export const VSCODE_TOKENS = {
  keyword: "#569cd6",
  string: "#ce9178",
  function: "#dcdcaa",
  variable: "#9cdcfe",
  comment: "#6a9955",
  number: "#b5cea8",
  plain: "#d4d4d4",
};

/** File-type dot colours for tabs and the explorer, matching the language
 * colours GitHub and VS Code icon themes use. */
function fileColor(name: string): string {
  if (/\.tsx?$/.test(name)) return "#3178c6";
  if (/\.jsx?$/.test(name)) return "#f1e05a";
  if (/\.py$/.test(name)) return "#3572A5";
  if (/\.go$/.test(name)) return "#00ADD8";
  if (/\.rs$/.test(name)) return "#dea584";
  if (/\.(json|jsonc)$/.test(name)) return "#cbcb41";
  if (/\.(css|scss)$/.test(name)) return "#563d7c";
  if (/\.html?$/.test(name)) return "#e34c26";
  if (/\.(yml|yaml)$/.test(name)) return "#cb171e";
  if (/\.(md|txt)$/.test(name)) return "#9d9d9d";
  if (/\.sql$/.test(name)) return "#e38c00";
  return "#9d9d9d";
}

const FileDot: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: 3,
      background: fileColor(name),
      flexShrink: 0,
      // A rounded square reads as a file-type icon at this size, where a real
      // glyph would just be mush.
      opacity: 0.95,
    }}
  />
);

/** The vertical icon rail. Drawn as glyphs rather than an icon font so it
 * survives having no network at render time. */
const ActivityBar: React.FC<{ width: number; fontSize: number }> = ({ width, fontSize }) => {
  const icons = ["🗎", "⌕", "⑂", "▷", "◫"];
  return (
    <div
      style={{
        width,
        background: VSCODE.activityBg,
        borderRight: `1px solid ${VSCODE.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: fontSize * 0.6,
        gap: fontSize * 0.95,
        flexShrink: 0,
      }}
    >
      {icons.map((icon, index) => (
        <span
          key={index}
          style={{
            fontSize: fontSize * 0.95,
            lineHeight: 1,
            color: index === 0 ? "#ffffff" : "#868686",
            // The active item carries a lit left edge, the way VS Code marks it.
            borderLeft: `2px solid ${index === 0 ? "#ffffff" : "transparent"}`,
            paddingLeft: 6,
            marginLeft: -8,
          }}
        >
          {icon}
        </span>
      ))}
    </div>
  );
};

const Explorer: React.FC<{ files: string[]; activeFile?: string; width: number; fontSize: number }> = ({
  files,
  activeFile,
  width,
  fontSize,
}) => (
  <div
    style={{
      width,
      background: VSCODE.sidebarBg,
      borderRight: `1px solid ${VSCODE.border}`,
      flexShrink: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div
      style={{
        fontFamily: UI_FONT_FAMILY,
        fontSize: fontSize * 0.6,
        letterSpacing: 0.8,
        color: "#bbbbbb",
        padding: `${fontSize * 0.7}px ${fontSize * 0.8}px ${fontSize * 0.45}px`,
        textTransform: "uppercase",
      }}
    >
      Explorer
    </div>
    {files.map((entry) => {
      const isFolder = entry.startsWith("/");
      const name = isFolder ? entry.slice(1) : entry;
      const active = !isFolder && name === activeFile;
      return (
        <div
          key={entry}
          style={{
            display: "flex",
            alignItems: "center",
            gap: fontSize * 0.42,
            padding: `${fontSize * 0.2}px ${fontSize * 0.8}px`,
            paddingLeft: isFolder ? fontSize * 0.8 : fontSize * 1.7,
            background: active ? "rgba(255,255,255,0.07)" : "transparent",
            whiteSpace: "nowrap",
          }}
        >
          {isFolder ? (
            <span style={{ fontSize: fontSize * 0.6, color: "#cccccc" }}>▾</span>
          ) : (
            <FileDot name={name} size={fontSize * 0.55} />
          )}
          <span
            style={{
              fontFamily: UI_FONT_FAMILY,
              fontSize: fontSize * 0.68,
              color: active ? "#ffffff" : "#cccccc",
              fontWeight: isFolder ? 600 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
        </div>
      );
    })}
  </div>
);

const TabStrip: React.FC<{ active: string; others: string[]; fontSize: number }> = ({ active, others, fontSize }) => (
  <div style={{ display: "flex", alignItems: "stretch", background: VSCODE.tabBarBg, flexShrink: 0 }}>
    {[{ name: active, isActive: true }, ...others.map((name) => ({ name, isActive: false }))].map((tab) => (
      <div
        key={tab.name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: fontSize * 0.42,
          padding: `${fontSize * 0.5}px ${fontSize * 0.85}px`,
          background: tab.isActive ? VSCODE.tabActiveBg : "transparent",
          // VS Code marks the active tab with a lit TOP border, and gives
          // inactive tabs a right divider.
          borderTop: `1px solid ${tab.isActive ? VSCODE.accent : "transparent"}`,
          borderRight: `1px solid ${VSCODE.border}`,
          whiteSpace: "nowrap",
        }}
      >
        <FileDot name={tab.name} size={fontSize * 0.55} />
        <span
          style={{
            fontFamily: UI_FONT_FAMILY,
            fontSize: fontSize * 0.7,
            color: tab.isActive ? "#ffffff" : VSCODE.tabInactiveFg,
            fontStyle: tab.isActive ? "normal" : "italic",
          }}
        >
          {tab.name}
        </span>
        <span style={{ fontSize: fontSize * 0.7, color: tab.isActive ? "#cccccc" : "transparent", marginLeft: fontSize * 0.2 }}>×</span>
      </div>
    ))}
  </div>
);

const Breadcrumbs: React.FC<{ path: string[]; fontSize: number }> = ({ path, fontSize }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: fontSize * 0.35,
      padding: `${fontSize * 0.3}px ${fontSize * 0.9}px`,
      background: VSCODE.editorBg,
      flexShrink: 0,
    }}
  >
    {path.map((part, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span style={{ fontSize: fontSize * 0.62, color: "#6e7681" }}>›</span>}
        <span style={{ fontFamily: UI_FONT_FAMILY, fontSize: fontSize * 0.62, color: "#9d9d9d" }}>{part}</span>
      </React.Fragment>
    ))}
  </div>
);

/** The minimap: each line drawn as short bars proportional to its real token
 * lengths. That abstracted shape is precisely what VS Code shows, and it is
 * what makes a long file feel long. */
const Minimap: React.FC<{ lines: { text: string; color: string }[][]; width: number; visible: boolean }> = ({ lines, width, visible }) => {
  if (!visible) return null;
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: VSCODE.editorBg,
        padding: "8px 6px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        overflow: "hidden",
      }}
    >
      {lines.map((tokens, index) => (
        <div key={index} style={{ display: "flex", gap: 2, height: 2, alignItems: "center" }}>
          {tokens.map((token, tokenIndex) => {
            const trimmed = token.text.replace(/\s+/g, " ");
            if (!trimmed.trim()) return <span key={tokenIndex} style={{ width: trimmed.length * 1.1 }} />;
            return (
              <span
                key={tokenIndex}
                style={{ height: 2, width: Math.max(2, trimmed.length * 1.1), background: token.color, opacity: 0.55, borderRadius: 1 }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

const StatusBar: React.FC<{
  branch: string;
  errors: number;
  warnings: number;
  line: number;
  column: number;
  language: string;
  fontSize: number;
}> = ({ branch, errors, warnings, line, column, language, fontSize }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: fontSize * 0.9,
      background: VSCODE.statusBg,
      borderTop: `1px solid ${VSCODE.border}`,
      color: VSCODE.statusFg,
      padding: `${fontSize * 0.28}px ${fontSize * 0.8}px`,
      fontFamily: UI_FONT_FAMILY,
      fontSize: fontSize * 0.6,
      flexShrink: 0,
      whiteSpace: "nowrap",
    }}
  >
    <span>⑂ {branch}</span>
    <span>
      ⊗ {errors}　⚠ {warnings}
    </span>
    <span style={{ marginLeft: "auto" }}>
      Ln {line}, Col {column}
    </span>
    <span>Spaces: 2</span>
    <span>UTF-8</span>
    <span>{language}</span>
  </div>
);

/** The integrated panel VS Code docks under the editor. A separate floating
 * terminal window is what a screen recording never looks like — the terminal
 * lives INSIDE the editor, under a row of panel tabs, and that is the shape
 * that makes "I ran this file, here is the output" read as one place. */
const PanelTabs: React.FC<{ title: string; fontSize: number }> = ({ title, fontSize }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: fontSize * 1.1,
      padding: `${fontSize * 0.35}px ${fontSize * 0.9}px`,
      borderTop: `1px solid ${VSCODE.border}`,
      background: VSCODE.editorBg,
      flexShrink: 0,
    }}
  >
    {["PROBLEMS", "OUTPUT", "DEBUG CONSOLE", "TERMINAL"].map((tab) => {
      const active = tab === "TERMINAL";
      return (
        <span
          key={tab}
          style={{
            fontFamily: UI_FONT_FAMILY,
            fontSize: fontSize * 0.58,
            letterSpacing: 0.5,
            color: active ? "#ffffff" : "#9d9d9d",
            borderBottom: `1px solid ${active ? "#ffffff" : "transparent"}`,
            paddingBottom: 3,
          }}
        >
          {tab}
        </span>
      );
    })}
    <span style={{ marginLeft: "auto", fontFamily: UI_FONT_FAMILY, fontSize: fontSize * 0.58, color: "#9d9d9d" }}>{title}</span>
  </div>
);

export const VSCodeWindow: React.FC<{
  filename: string;
  language?: string;
  tabs?: string[];
  files?: string[];
  branch?: string;
  problems?: { errors: number; warnings: number };
  showMinimap: boolean;
  /** Flattened tokens per line, used for the minimap only. */
  minimapLines: { text: string; color: string }[][];
  /** Caret position for the status bar. */
  caret: { line: number; column: number };
  dimmed: boolean;
  fontSize: number;
  children: React.ReactNode;
  /** Rendered in the docked panel under the editor, with its own tab row. */
  panel?: { title: string; content: React.ReactNode; heightPx: number };
}> = ({
  filename,
  language,
  tabs,
  files,
  branch,
  problems,
  showMinimap,
  minimapLines,
  caret,
  dimmed,
  fontSize,
  children,
  panel,
}) => {
  const activityWidth = fontSize * 2.1;
  const sidebarWidth = fontSize * 8.5;
  const minimapWidth = fontSize * 3.2;
  // Only worth drawing the explorer when the author actually named files — an
  // empty sidebar is set dressing that costs real width.
  const showSidebar = !!files && files.length > 0;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${VSCODE.border}`,
        background: VSCODE.editorBg,
        opacity: dimmed ? 0.4 : 1,
        boxShadow: dimmed ? "none" : "0 24px 60px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <ActivityBar width={activityWidth} fontSize={fontSize} />
        {showSidebar && <Explorer files={files!} activeFile={filename} width={sidebarWidth} fontSize={fontSize} />}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TabStrip active={filename} others={tabs ?? []} fontSize={fontSize} />
          <Breadcrumbs path={["src", filename]} fontSize={fontSize} />
          <div style={{ flex: 1, minHeight: 0, display: "flex", background: VSCODE.editorBg }}>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>{children}</div>
            <Minimap lines={minimapLines} width={minimapWidth} visible={showMinimap} />
          </div>
          {panel && (
            <div style={{ flex: `0 0 ${panel.heightPx}px`, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <PanelTabs title={panel.title} fontSize={fontSize} />
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: VSCODE.editorBg }}>{panel.content}</div>
            </div>
          )}
        </div>
      </div>
      <StatusBar
        branch={branch ?? "main"}
        errors={problems?.errors ?? 0}
        warnings={problems?.warnings ?? 0}
        line={caret.line}
        column={caret.column}
        language={language ?? "Plain Text"}
        fontSize={fontSize}
      />
    </div>
  );
};
