import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont, fontFamily as jetBrainsMonoFamily } from "@remotion/google-fonts/JetBrainsMono";
import { COLORS } from "../theme";
import { SceneFrame } from "./SceneFrame";
import type { SharedVisualProps, WorkspaceData } from "../sharedVisualProps";
import { TerminalChrome, BrowserChrome } from "./workspaceChrome";
import { VSCodeWindow, VSCODE_TOKENS } from "./VSCodeChrome";
import { typingStateAt, horizontalScrollFor, verticalScrollLines, type TypingRun } from "../../script/typewriter";
import { BrowserPage, type BlockState } from "./BrowserPage";

// A real developer environment, and the medium for teaching code.
//
// Deliberately NOT an extension of CodeSnippetCard. That component is built
// around "show a snippet, maybe swap in a second one": whole-panel reveals at a
// FRACTION of the scene's duration, a hard two-panel cap, and no concept of an
// individual line — it has no line numbers at all. The teaching move this file
// exists for is the opposite granularity: keep a file on screen and direct the
// viewer's eye to line 7 while the narrator talks about line 7, then to the
// terminal below it, then back. That needs lines to be addressable, and it
// needs its own design pass rather than more props bolted onto a snippet card.
//
// Two rules it inherits from the doctrine:
//
//   1. Every time in `timeline` is ABSOLUTE seconds, matching Canvas, so
//      narrationFit re-times this medium onto real spoken audio exactly like it
//      does a diagram. A fraction-of-duration reveal (CodeSnippetCard's
//      `revealAt`, TerminalMockCard's `revealSteps.at`) cannot be fitted,
//      because the duration it is a fraction OF is the thing being fitted.
//   2. Focus is highlight-AND-DIM. The rest of the file stays legible for
//      context rather than disappearing — that is what makes a viewer able to
//      place the highlighted line inside the whole.

loadFont("normal", { weights: ["400", "500", "700"] });
const MONO_FONT_FAMILY = `"${jetBrainsMonoFamily}", monospace`;
/** Titles use a UI sans, not the project display serif — a serif heading over a
 * code panel reads as a book chapter rather than a lesson. */
const UI_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';

type Pane = WorkspaceData["panes"][number];
type EditorPane = Extract<Pane, { type: "editor" }>;
type TerminalPane = Extract<Pane, { type: "terminal" }>;
type WorkspaceAction = NonNullable<WorkspaceData["timeline"]>[number];

/** Same semantic palette as CodeSnippetCard — an author tags a token's role,
 * this owns what the role looks like, and the two media stay visually
 * consistent because they share the vocabulary. */
const TOKEN_COLORS: Record<EditorPane["lines"][number][number]["token"], string> = VSCODE_TOKENS;

const TERMINAL_COLORS: Record<TerminalPane["lines"][number]["kind"], string> = {
  command: "#f8fafc",
  output: "#b0bec5",
  success: "#4ade80",
  error: "#f87171",
  comment: "#6b7a99",
};

/** How far a non-highlighted line recedes. Low enough to clearly subordinate
 * it, high enough that the reader can still see the shape of the whole file —
 * dropping it to near-zero would defeat the point of keeping it on screen. */
const DIMMED_OPACITY = 0.32;
const HIGHLIGHT_BG = "rgba(255, 255, 255, 0.075)";

const LINE_HEIGHT = 1.85;
const TRANSITION_SECONDS = 0.35;
const CAPTION_CLEARANCE = 170;
/** Safe margins so nothing touches the frame edge. Deliberately tight: the
 * editor is the subject of the scene and should own the frame the way a real
 * screen recording does, leaving room for the title above and nothing else. */
const PAGE_MARGIN_X = 36;
const PAGE_MARGIN_Y = 24;

/** State of one pane at a moment in time, folded from every timeline action
 * that has already fired. Kept as a plain fold (rather than per-action
 * animation) because these are discrete editor states — a line is highlighted
 * or it isn't; only the opacity/scroll TRANSITION between states animates. */
interface PaneState {
  revealedThrough: number | null;
  highlighted: number[];
  scrollToLine: number | null;
  /** Seconds at which the current highlight/scroll state began, so the
   * transition into it can be eased rather than popping. */
  changedAt: number;
  /** The typing run currently on screen, if any. */
  typing: TypingRun | null;
}

function foldPaneState(paneId: string, timeline: WorkspaceAction[], atSeconds: number, totalLines: number): PaneState {
  const state: PaneState = { revealedThrough: null, highlighted: [], scrollToLine: null, changedAt: 0, typing: null };
  const relevant = timeline
    .filter((action) => action.pane === paneId && action.startSeconds <= atSeconds)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  for (const action of relevant) {
    switch (action.type) {
      case "reveal":
        state.revealedThrough = Math.min(action.throughLine, totalLines);
        state.changedAt = action.startSeconds;
        break;
      case "highlight":
        state.highlighted = action.lines;
        state.changedAt = action.startSeconds;
        break;
      case "clear":
        state.highlighted = [];
        state.changedAt = action.startSeconds;
        break;
      case "scroll":
        state.scrollToLine = action.toLine;
        state.changedAt = action.startSeconds;
        break;
      case "type":
        // A run starts from wherever the pane had already got to, so `reveal`
        // then `type` reads as "here is the setup, now watch me write the rest".
        state.typing = {
          fromLine: (state.revealedThrough ?? 0) + 1,
          throughLine: Math.min(action.throughLine, totalLines),
          startSeconds: action.startSeconds,
          durationSeconds: action.durationSeconds,
          charsPerSecond: action.charsPerSecond,
        };
        state.revealedThrough = Math.min(action.throughLine, totalLines);
        state.changedAt = action.startSeconds;
        break;
      default:
        break;
    }
  }
  return state;
}

/** How long a click's depress-and-release takes. Short enough to read as a
 * press rather than a hold. */
const CLICK_SECONDS = 0.32;

/** A browser block's state, addressed by the same `reveal` / `highlight`
 * actions a code line uses (1-based), plus `click` for a real press. Keeping
 * one timeline vocabulary across all three surfaces is deliberate: an author
 * who can direct attention in an editor can direct it on a page. */
function blockStateFor(
  paneId: string,
  index: number,
  timeline: WorkspaceAction[],
  atSeconds: number,
  paneState: PaneState,
): BlockState {
  const blockNumber = index + 1;
  let press = 0;
  for (const action of timeline) {
    if (action.type !== "click" || action.pane !== paneId || action.block !== blockNumber) continue;
    const duration = action.durationSeconds ?? CLICK_SECONDS;
    const elapsed = atSeconds - action.startSeconds;
    if (elapsed < 0 || elapsed > duration) continue;
    // Down fast, back up slower — the shape of an actual press.
    const half = duration / 2;
    press = elapsed < half ? elapsed / half : 1 - (elapsed - half) / half;
  }
  return {
    highlighted: paneState.highlighted.includes(blockNumber),
    anyHighlighted: paneState.highlighted.length > 0,
    press: Math.max(0, Math.min(1, press)),
    visible: blockNumber <= (paneState.revealedThrough ?? Number.POSITIVE_INFINITY),
  };
}

/** How tall a pane needs to be to show all of its content, chrome included.
 * Used to size a window to its file rather than stretching it to the frame. */
function paneContentHeight(pane: Pane, fontSize: number): number {
  if (pane.type === "browser") return Number.POSITIVE_INFINITY;
  const rows = pane.visibleLines ?? pane.lines.length;
  const body = rows * fontSize * LINE_HEIGHT + fontSize * 1.4;
  // Tabs + breadcrumbs + status bar for an editor; a title bar for a terminal.
  const chrome = pane.type === "editor" ? fontSize * 4.6 : fontSize * 2.2;
  return body + chrome;
}

/** Where the status bar says the cursor is. Follows whatever the lesson is
 * pointing at, so Ln/Col is never stale furniture. */
function caretFor(pane: EditorPane, state: PaneState): { line: number; column: number } {
  const line = state.highlighted.length > 0 ? Math.max(...state.highlighted) : (state.revealedThrough ?? pane.lines.length);
  const tokens = pane.lines[line - 1] ?? [];
  const column = tokens.reduce((sum, token) => sum + token.text.length, 0) + 1;
  return { line: Math.max(1, line), column: Math.max(1, column) };
}

/** Which pane (if any) is the focused one right now — the most recent
 * `focusPane` wins, and everything else in the workspace dims. */
function focusedPaneAt(timeline: WorkspaceAction[], atSeconds: number): string | null {
  let focused: string | null = null;
  for (const action of timeline) {
    if (action.type === "focusPane" && action.startSeconds <= atSeconds) focused = action.pane;
  }
  return focused;
}

/** Eased 0->1 progress since a state change, for transitioning highlight and
 * scroll rather than snapping between them. */
function transitionProgress(atSeconds: number, changedAt: number): number {
  return interpolate(atSeconds, [changedAt, changedAt + TRANSITION_SECONDS], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

/** One rendered line, with its gutter number, highlight bar and dim state. */
const WorkspaceLine: React.FC<{
  lineNumber: number | null;
  content: React.ReactNode;
  highlighted: boolean;
  anyHighlighted: boolean;
  visible: boolean;
  emphasis: number;
  fontSize: number;
  gutterWidth: string;
  /** Horizontal offset so a long line follows the caret instead of being cut. */
  scrollX?: number;
  caret?: boolean;
}> = ({ lineNumber, content, highlighted, anyHighlighted, visible, emphasis, fontSize, gutterWidth, scrollX = 0, caret = false }) => {
  // When nothing is highlighted every line reads normally; once something is,
  // the others recede to DIMMED_OPACITY. `emphasis` eases that transition.
  const restingOpacity = !anyHighlighted || highlighted ? 1 : DIMMED_OPACITY;
  const previousOpacity = 1;
  const opacity = visible ? previousOpacity + (restingOpacity - previousOpacity) * emphasis : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        opacity,
        // VS Code tints the whole active row edge to edge rather than drawing a
        // coloured bar down the side of a warm plate.
        background: highlighted ? HIGHLIGHT_BG : "transparent",
        paddingLeft: 14,
        overflow: "hidden",
      }}
    >
      {lineNumber !== null && (
        <span
          style={{
            fontFamily: MONO_FONT_FAMILY,
            fontSize: fontSize * 0.88,
            lineHeight: LINE_HEIGHT,
            color: highlighted ? "#cccccc" : "#6e7681",
            width: gutterWidth,
            textAlign: "right",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          {lineNumber}
        </span>
      )}
      {/* The code gets its own clipping box so a horizontally scrolled line
          slides UNDER nothing — the gutter stays put, exactly as in an editor. */}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "block" }}>
      <span
        style={{
          display: "inline-block",
          fontFamily: MONO_FONT_FAMILY,
          fontSize,
          lineHeight: LINE_HEIGHT,
          whiteSpace: "pre",
          // JetBrains Mono ligatures read as rendering glitches at video
          // compression — same call as CodeSnippetCard.
          fontVariantLigatures: "none",
          fontFeatureSettings: '"liga" 0, "calt" 0',
          // Follows the caret on a line too wide for the pane. Without this the
          // pane's `overflow: hidden` simply ate the end of the line.
          transform: `translateX(${scrollX}px)`,
          flexShrink: 0,
        }}
      >
        {content}
        {caret && (
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: fontSize * 1.1,
              background: "#aeafad",
              verticalAlign: "text-bottom",
              marginLeft: 1,
            }}
          />
        )}
      </span>
      </span>
    </div>
  );
};

const PaneBody: React.FC<{
  pane: EditorPane | TerminalPane;
  state: PaneState;
  atSeconds: number;
  fontSize: number;
  /** Width available for code, so a long line knows when it has to scroll. */
  viewportPx?: number;
}> = ({ pane, state, atSeconds, fontSize, viewportPx }) => {
  const totalLines = pane.lines.length;
  const revealed = state.revealedThrough ?? totalLines;
  const emphasis = transitionProgress(atSeconds, state.changedAt);
  const anyHighlighted = state.highlighted.length > 0;
  const startLine = pane.type === "editor" ? pane.startLine : 1;
  const gutterWidth = pane.showLineNumbers ? `${String(startLine + totalLines).length}ch` : "0ch";

  // Per-character state, when a typing run is on screen.
  const lineLengths = React.useMemo(
    () =>
      pane.type === "editor"
        ? pane.lines.map((tokens) => tokens.reduce((sum, token) => sum + token.text.length, 0))
        : pane.lines.map((line) => line.text.length),
    [pane],
  );
  const typing = state.typing ? typingStateAt(lineLengths, state.typing, atSeconds) : null;

  // Scrolling keeps the target line a third of the way down the visible
  // window rather than at its very top, so the reader keeps the lines above it
  // as context — the same reason highlighting dims rather than hides.
  const visibleLines = pane.visibleLines ?? totalLines;
  // The view follows whatever is live: the caret while typing, the scrolled-to
  // line otherwise. A typing run that walks off the bottom of the pane used to
  // just keep typing out of sight.
  const activeLine = typing?.caret?.line ?? state.scrollToLine ?? null;
  const desiredScroll =
    activeLine !== null ? verticalScrollLines({ activeLine, totalLines, visibleLines }) : 0;
  // A caret-driven scroll must not ease, or the view lags behind the typing.
  const scrollLines = typing?.caret ? desiredScroll : desiredScroll * emphasis;

  // JetBrains Mono sits at ~0.6em per character.
  const charWidthPx = fontSize * 0.6;
  const caretLine = typing?.caret?.line ?? null;
  const caretIsComment =
    caretLine !== null && pane.type === "editor"
      ? (pane.lines[caretLine - 1] ?? []).every((token) => token.token === "comment")
      : false;
  const scrollX =
    typing?.caret && viewportPx
      ? horizontalScrollFor({
          caretColumn: typing.caret.column,
          lineIsComment: caretIsComment,
          charWidthPx,
          viewportPx,
        })
      : 0;

  /** Cuts a line's tokens off at however many characters have been typed. */
  const truncate = (tokens: { text: string; token: string }[], limit: number) => {
    if (limit === Number.POSITIVE_INFINITY) return tokens;
    const out: { text: string; token: string }[] = [];
    let left = limit;
    for (const token of tokens) {
      if (left <= 0) break;
      out.push(left >= token.text.length ? token : { ...token, text: token.text.slice(0, left) });
      left -= token.text.length;
    }
    return out;
  };

  return (
    <div style={{ overflow: "hidden", height: pane.visibleLines ? `${visibleLines * fontSize * LINE_HEIGHT}px` : undefined }}>
      <div style={{ transform: `translateY(${-scrollLines * fontSize * LINE_HEIGHT}px)` }}>
        {pane.type === "editor"
          ? pane.lines.map((tokens, index) => {
              const lineNo = index + 1;
              // A line inside a typing run shows only what has been typed so
              // far; everything else behaves exactly as it always did.
              const typedLimit = typing?.visibleChars.get(lineNo);
              const shown = typedLimit === undefined ? tokens : truncate(tokens, typedLimit);
              const isCaretLine = typing?.caret?.line === lineNo;
              const visible = typedLimit !== undefined ? typedLimit > 0 || isCaretLine : lineNo <= revealed;
              return (
                <WorkspaceLine
                  key={index}
                  lineNumber={pane.showLineNumbers ? startLine + index : null}
                  highlighted={state.highlighted.includes(lineNo)}
                  anyHighlighted={anyHighlighted}
                  visible={visible}
                  emphasis={emphasis}
                  fontSize={fontSize}
                  gutterWidth={gutterWidth}
                  scrollX={isCaretLine ? scrollX : 0}
                  caret={isCaretLine}
                  content={
                    shown.length === 0 ? (
                      " "
                    ) : (
                      shown.map((token, tokenIndex) => (
                        <span key={tokenIndex} style={{ color: TOKEN_COLORS[token.token as keyof typeof TOKEN_COLORS] }}>
                          {token.text}
                        </span>
                      ))
                    )
                  }
                />
              );
            })
          : pane.lines.map((line, index) => (
              <WorkspaceLine
                key={index}
                lineNumber={pane.showLineNumbers ? index + 1 : null}
                highlighted={state.highlighted.includes(index + 1)}
                anyHighlighted={anyHighlighted}
                visible={index + 1 <= revealed}
                emphasis={emphasis}
                fontSize={fontSize}
                gutterWidth={gutterWidth}
                content={
                  <>
                    {line.kind === "command" && <span style={{ color: "#4ade80" }}>$ </span>}
                    {line.kind === "comment" && <span style={{ color: "#6b7a99" }}># </span>}
                    <span style={{ color: TERMINAL_COLORS[line.kind] }}>{line.text}</span>
                  </>
                }
              />
            ))}
      </div>
    </div>
  );
};

export const WorkspaceCard: React.FC<SharedVisualProps & { data: WorkspaceData }> = ({ data, hasCaption }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const atSeconds = frame / fps;
  const isPortrait = height > width;

  const timeline = data.timeline ?? [];
  const focused = focusedPaneAt(timeline, atSeconds);
  // A terminal belongs UNDER the editor it is running, never beside it — that
  // is where it sits in every real editor and in every coding lesson, and the
  // vertical arrangement is what makes "I ran this file, here is the output"
  // read as cause and effect instead of as two unrelated panels. `split` is
  // still available, but it now has to be asked for, and it is for genuine
  // side-by-side COMPARISONS only. Portrait never splits: two panes side by
  // side in a 9:16 frame cannot stay legible.
  const hasTerminal = data.panes.some((pane) => pane.type === "terminal");
  const defaultLayout =
    data.panes.length === 1 ? "single" : isPortrait || hasTerminal ? "stacked" : "split";
  const layout = data.layout ?? defaultLayout;
  const direction = layout === "split" ? "row" : "column";

  // Type size is derived from how much content there actually is, rather than
  // fixed. A real editor window legitimately has empty space below a short
  // file, but on a 1080-line frame that reads as half the screen being wasted
  // — a short file should fill the frame and be comfortably readable, while a
  // long one shrinks (and can scroll) instead of overflowing. Panes side by
  // side share the height, so the tallest one sets the size; stacked panes
  // divide it between them.
  // A browser block is far taller than a code line, so it counts for more when
  // working out how much has to fit.
  const rowsOf = (pane: Pane) => (pane.type === "browser" ? pane.blocks.length * 2.6 : pane.visibleLines ?? pane.lines.length);
  const rowsToFit =
    direction === "row" ? Math.max(...data.panes.map(rowsOf)) : data.panes.reduce((sum, pane) => sum + rowsOf(pane), 0);
  const titleAllowance = data.title ? 74 : 12;
  const chromeAllowance = (direction === "row" ? 1 : data.panes.length) * 110;
  const availableHeight = height - titleAllowance - chromeAllowance - (hasCaption ? CAPTION_CLEARANCE : 0);
  // Floor of 18px: below that, code stops being readable on a phone, which is
  // the whole point of putting it on screen. The ceiling used to be 32, which
  // rendered a short file at a size no editor is ever set to and made the code
  // read as a slide bullet rather than as a file — an editor's job is to look
  // like an editor, and 22-24px at 1080p is what that looks like.
  const fontSize = Math.max(18, Math.min(isPortrait ? 26 : 24, (availableHeight * 0.78) / (Math.max(1, rowsToFit) * LINE_HEIGHT)));

  // One editor plus one terminal is the canonical lesson shot, and in a real
  // editor that terminal is DOCKED inside the same window rather than floating
  // beside it. Anything else (two editors, a browser, no editor) keeps separate
  // windows, which is also what those combinations look like in real life.
  const editorPanes = data.panes.filter((pane) => pane.type === "editor");
  const terminalPanes = data.panes.filter((pane) => pane.type === "terminal");
  const dockTerminal =
    direction === "column" && editorPanes.length === 1 && terminalPanes.length === 1 && data.panes.length === 2;
  const dockedTerminal = dockTerminal ? (terminalPanes[0] as TerminalPane) : null;
  const visiblePanes = dockedTerminal ? data.panes.filter((pane) => pane.id !== dockedTerminal.id) : data.panes;

  return (
    <SceneFrame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          width: "100%",
          height: "100%",
          // Real page margins. Without these the title sat flush against x=0
          // and the panes ran to the very edge of the frame.
          padding: `${PAGE_MARGIN_Y}px ${PAGE_MARGIN_X}px`,
          paddingBottom: hasCaption ? CAPTION_CLEARANCE : PAGE_MARGIN_Y,
          boxSizing: "border-box",
        }}
      >
        {data.title && (
          <div style={{ fontFamily: UI_FONT_FAMILY, fontSize: isPortrait ? 30 : 34, fontWeight: 600, color: COLORS.text, letterSpacing: -0.3, flexShrink: 0 }}>
            {data.title}
          </div>
        )}
        <div
        style={{
          display: "flex",
          flexDirection: direction,
          gap: 24,
          width: "100%",
          height: "100%",
          alignItems: "stretch",
          color: COLORS.text,
          flex: 1,
          minHeight: 0,
        }}
      >
        {visiblePanes.map((pane) => {
          const rowCount = pane.type === "browser" ? pane.blocks.length : pane.lines.length;
          const state = foldPaneState(pane.id, timeline, atSeconds, rowCount);
          // A docked terminal lives INSIDE the editor window, so focusing it
          // must not dim the window it is sitting in — the focus is between the
          // editor body and the panel, not between two windows.
          const ownsFocus = focused === pane.id || (pane.type === "editor" && dockedTerminal?.id === focused);
          const dimmed = focused !== null && !ownsFocus;
          // An editor gets the room; a terminal reporting on it is a supporting
          // surface and should not claim half the frame.
          // Windows fill the height available to them. An earlier pass sized
          // them to their content instead, which fixed a dead gap but left the
          // editor looking clamped — a stubby window floating in a tall frame.
          // The gap it was solving is gone anyway now that the terminal docks
          // INSIDE the editor: a real editor is full height, and a short file
          // simply leaves empty editor below it, which is what a screen
          // recording actually looks like.
          const grow = pane.flex ?? (pane.type === "terminal" && direction === "column" ? 0.62 : 1);
          const contentPx =
            paneContentHeight(pane, fontSize) +
            (pane.type === "editor" && dockedTerminal ? paneContentHeight(dockedTerminal, fontSize) : 0);
          // Width actually left for code, after VS Code's furniture. This is
          // what decides when a long line has to start following the caret
          // instead of being cut off at the pane's edge.
          const paneWidthPx = width - PAGE_MARGIN_X * 2;
          const gutterPx = fontSize * 0.88 * 3 + 28;
          const codeViewportPx =
            pane.type === "editor"
              ? paneWidthPx -
                fontSize * 2.1 -
                (pane.files && pane.files.length > 0 ? fontSize * 8.5 : 0) -
                (pane.showMinimap ? fontSize * 3.2 : 0) -
                gutterPx
              : paneWidthPx - gutterPx;
          // Only a pane sharing the frame with an UNDOCKED sibling still sizes
          // to content, so two separate windows do not each claim half a frame
          // they cannot fill.
          const sizeToContent =
            direction === "column" &&
            pane.type !== "browser" &&
            pane.visibleLines === undefined &&
            !dockedTerminal &&
            visiblePanes.length > 1 &&
            contentPx < availableHeight;

          return (
            <div
              key={pane.id}
              style={{
                flex: sizeToContent ? `0 0 ${contentPx}px` : grow,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
              }}
            >
              {pane.type === "editor" && (
                <VSCodeWindow
                  dimmed={dimmed}
                  fontSize={fontSize}
                  filename={pane.filename ?? "untitled"}
                  language={pane.language}
                  tabs={pane.tabs}
                  files={pane.files}
                  branch={pane.branch}
                  problems={pane.problems}
                  showMinimap={pane.showMinimap}
                  minimapLines={pane.lines.map((tokens) => tokens.map((t) => ({ text: t.text, color: TOKEN_COLORS[t.token] })))}
                  caret={caretFor(pane, state)}
                  panel={
                    dockedTerminal
                      ? {
                          title: dockedTerminal.title ?? "zsh",
                          // Sized to its own output rather than to a flex
                          // ratio, which was cutting the last line off.
                          heightPx: paneContentHeight(dockedTerminal, fontSize),
                          content: (
                            <PaneBody
                              pane={dockedTerminal}
                              state={foldPaneState(dockedTerminal.id, timeline, atSeconds, dockedTerminal.lines.length)}
                              atSeconds={atSeconds}
                              fontSize={fontSize}
                            />
                          ),
                        }
                      : undefined
                  }
                >
                  <PaneBody pane={pane} state={state} atSeconds={atSeconds} fontSize={fontSize} viewportPx={codeViewportPx} />
                </VSCodeWindow>
              )}
              {pane.type === "terminal" && (
                <TerminalChrome dimmed={dimmed} fontSize={fontSize} title={pane.title}>
                  <PaneBody pane={pane} state={state} atSeconds={atSeconds} fontSize={fontSize} />
                </TerminalChrome>
              )}
              {pane.type === "browser" && (
                <BrowserChrome dimmed={dimmed} fontSize={fontSize} title={pane.title} url={pane.url} theme={pane.theme}>
                  <BrowserPage
                    pane={pane}
                    size={fontSize * 0.92}
                    stateFor={(index) => blockStateFor(pane.id, index, timeline, atSeconds, state)}
                  />
                </BrowserChrome>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </SceneFrame>
  );
};
