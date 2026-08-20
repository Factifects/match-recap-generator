import React from "react";
import { appBlockHeight, type StageBox, type StageAppBlock } from "../../script/stageLayout";
import { DISPLAY_FONT_FAMILY } from "../theme";

// A BELIEVABLE PRODUCT, rendered as the scene's environment.
//
// The point of this file is fidelity, and fidelity here is not decoration. The
// failures this medium exists to show — an agent taking a prefilled value, a
// user missing a disclosure, a system confirming the wrong thing — are only
// visible if the audience recognises the surface they happen on. A generic
// rectangle with a label reads as "a diagram of an app", and nobody has ever
// made a mistake on a diagram.
//
// So: a wordmark, a nav, an account chip, real fields, a real month grid, real
// result cards, a real seat map. The shell persists across screens; the content
// is replaced. That separation is what lets one scene stay in a single world
// while recomposing completely between beats.

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

type AppConfig = NonNullable<StageBox["app"]>;
type Block = StageAppBlock;

/** Product palette. Deliberately its own system rather than the stage accents:
 * an application has its own visual language, and borrowing the diagram colours
 * is what made earlier attempts look like a mockup of a product instead of one. */
const SURFACE = "#12161f";
const SURFACE_RAISED = "#1a2029";
const LINE = "rgba(148,163,184,0.22)";
const TEXT = "#e8edf7";
const MUTED = "#8b9ab4";

export const AppSurface: React.FC<{
  box: StageBox;
  unit: number;
  accent: string;
  /** Which screen is showing, and how far through the transition to it. */
  screen: string;
  previousScreen?: string;
  transition: number;
  transitionKind: "slide" | "fade" | "expand";
  overlay?: string;
  overlayProgress: number;
  /** Element ids the actor is currently touching, and how. */
  focusId?: string;
  focusMode?: "observe" | "assume" | "press";
  typed: Map<string, string>;
}> = ({
  box,
  unit,
  accent,
  screen,
  previousScreen,
  transition,
  transitionKind,
  overlay,
  overlayProgress,
  focusId,
  focusMode,
  typed,
}) => {
  const app = box.app;
  if (!app) return null;

  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  const w = box.width;
  const h = box.height;
  const px = Math.max(22, unit * 0.026);
  const chrome = px * 3.2;
  const pad = px * 1.1;
  const radius = px * 0.9;

  // Never trust a screen id blindly. A mistyped or missing one should degrade
  // to the declared screen and be reported by the validator, not take down the
  // render — an environment that crashes on a bad name is worse than one that
  // shows the wrong page.
  const current = app.screens[screen] ?? app.screens[app.screen];
  if (!current) return null;
  const outgoing = previousScreen && previousScreen !== screen ? app.screens[previousScreen] : undefined;
  const overlayScreen = overlay ? app.screens[overlay] : undefined;

  // Content sits below the shell; a transition slides the incoming screen in
  // from the right while the outgoing one leaves, which is what navigation
  // looks like in every product anyone uses.
  const contentTop = y + chrome;
  const contentH = h - chrome;
  const slide = transitionKind === "slide" ? (1 - transition) * w * 0.5 : 0;

  return (
    <g>
      {/* ---- shell -------------------------------------------------------- */}
      <rect x={x} y={y} width={w} height={h} rx={radius} fill={SURFACE} stroke={LINE} strokeWidth={1.6} />
      <rect x={x} y={y} width={w} height={chrome} rx={radius} fill={SURFACE_RAISED} />
      <rect x={x} y={y + chrome - radius} width={w} height={radius} fill={SURFACE_RAISED} />
      <line x1={x} y1={y + chrome} x2={x + w} y2={y + chrome} stroke={LINE} strokeWidth={1.4} />

      {/* THE LOCKUP: mark plus wordmark, at a size you would actually put in a
          product header. This is the difference between a believable company
          and a wireframe with a name written on it. */}
      <g>
        <BrandLogo mark={app.mark ?? markFor(app.brand)} cx={x + pad + px * 0.95} cy={y + chrome / 2} size={px * 1.9} accent={accent} />
        <text
          x={x + pad + px * 2.35}
          y={y + chrome / 2 + px * 0.38}
          fill={TEXT}
          fontFamily={DISPLAY_FONT_FAMILY}
          fontWeight={800}
          fontSize={px * 1.16}
          letterSpacing="0.02em"
        >
          {app.brand}
        </text>
      </g>

      {app.nav.map((item, i) => (
        <text
          key={item}
          x={x + w * 0.44 + i * px * 4.4}
          y={y + chrome / 2 + px * 0.3}
          fill={i === 0 ? TEXT : MUTED}
          fontFamily={DISPLAY_FONT_FAMILY}
          fontWeight={i === 0 ? 700 : 500}
          fontSize={px * 0.78}
        >
          {item}
        </text>
      ))}

      {app.account ? (
        <g>
          <circle cx={x + w - pad - px * 0.7} cy={y + chrome / 2} r={px * 0.72} fill="rgba(148,163,184,0.18)" stroke={LINE} strokeWidth={1.2} />
          <text
            x={x + w - pad - px * 0.7}
            y={y + chrome / 2 + px * 0.28}
            textAnchor="middle"
            fill={TEXT}
            fontFamily={DISPLAY_FONT_FAMILY}
            fontWeight={700}
            fontSize={px * 0.72}
          >
            {app.account}
          </text>
        </g>
      ) : null}

      {/* ---- screens ------------------------------------------------------ */}
      {outgoing && transition < 1 ? (
        <g opacity={1 - transition} transform={`translate(${-transition * w * 0.35} 0)`}>
          <ScreenBody
            screen={outgoing}
            x={x}
            y={contentTop}
            w={w}
            h={contentH}
            px={px}
            accent={accent}
            focusId={undefined}
            focusMode={undefined}
            typed={typed}
          />
        </g>
      ) : null}

      <g opacity={outgoing ? transition : 1} transform={`translate(${outgoing ? slide : 0} 0)`}>
        <ScreenBody
          screen={current}
          x={x}
          y={contentTop}
          w={w}
          h={contentH}
          px={px}
          accent={accent}
          focusId={overlayScreen && overlayProgress > 0.5 ? undefined : focusId}
          focusMode={focusMode}
          typed={typed}
        />
      </g>

      {/* ---- overlay ------------------------------------------------------ */}
      {overlayScreen && overlayProgress > 0.01 ? (
        <g opacity={overlayProgress}>
          {/* What is behind a modal dims rather than disappearing — the product
              is still there, which is why an overlay reads as a layer. */}
          <rect x={x} y={contentTop} width={w} height={contentH} fill="rgba(8,11,16,0.72)" />
          <g transform={`translate(0 ${(1 - overlayProgress) * px * 2})`}>
            <ScreenBody
              screen={overlayScreen}
              x={x + w * 0.06}
              y={contentTop + contentH * 0.12}
              w={w * 0.88}
              h={contentH * 0.72}
              px={px}
              accent={accent}
              focusId={focusId}
              focusMode={focusMode}
              typed={typed}
              raised
            />
          </g>
        </g>
      ) : null}
    </g>
  );
};


/** A product mark that does not look drafted.
 *
 * Five abstract forms, each built to read at header size and to suit a kind of
 * company — a fictional brand is only useful if it looks like it was designed,
 * and every one of these is a shape a real identity could plausibly use. */
const BrandLogo: React.FC<{ mark: string; cx: number; cy: number; size: number; accent: string }> = ({ mark, cx, cy, size, accent }) => {
  const r = size / 2;
  switch (mark) {
    case "wing":
      // Travel: a swept wing rising out of a horizon, which is where the name
      // Skyline comes from — the line is the horizon, the sweep is the flight.
      return (
        <g>
          <path
            d={`M ${cx - r} ${cy + r * 0.62} L ${cx + r * 0.28} ${cy - r * 0.86} L ${cx + r * 0.62} ${cy - r * 0.1} L ${cx - r * 0.12} ${cy + r * 0.62} Z`}
            fill={accent}
          />
          <path d={`M ${cx + r * 0.1} ${cy + r * 0.62} L ${cx + r * 0.86} ${cy - r * 0.34} L ${cx + r} ${cy + r * 0.16} L ${cx + r * 0.52} ${cy + r * 0.62} Z`} fill={accent} opacity={0.55} />
          <rect x={cx - r} y={cy + r * 0.78} width={size} height={Math.max(2, size * 0.09)} rx={size * 0.045} fill={accent} opacity={0.9} />
        </g>
      );
    case "incognito":
      // The hat and glasses, as a product mark. A private window's identity IS
      // that symbol, so the shell wears it instead of having a second icon
      // floating beside the app competing for the same idea.
      return (
        <g>
          <path
            d={`M ${cx - r * 0.62} ${cy + r * 0.05} L ${cx - r * 0.44} ${cy - r * 0.62} Q ${cx} ${cy - r * 0.86} ${cx + r * 0.44} ${cy - r * 0.62} L ${cx + r * 0.62} ${cy + r * 0.05} Z`}
            fill={accent}
          />
          <rect x={cx - r} y={cy + r * 0.05} width={r * 2} height={r * 0.2} rx={r * 0.1} fill={accent} />
          <circle cx={cx - r * 0.42} cy={cy + r * 0.55} r={r * 0.3} fill="none" stroke={accent} strokeWidth={Math.max(2, size * 0.07)} />
          <circle cx={cx + r * 0.42} cy={cy + r * 0.55} r={r * 0.3} fill="none" stroke={accent} strokeWidth={Math.max(2, size * 0.07)} />
          <line x1={cx - r * 0.12} y1={cy + r * 0.5} x2={cx + r * 0.12} y2={cy + r * 0.5} stroke={accent} strokeWidth={Math.max(2, size * 0.06)} />
        </g>
      );
    case "orbit":
      return (
        <g>
          <circle cx={cx} cy={cy} r={r * 0.42} fill={accent} />
          <ellipse cx={cx} cy={cy} rx={r * 0.95} ry={r * 0.42} fill="none" stroke={accent} strokeWidth={Math.max(2, size * 0.09)} transform={`rotate(-28 ${cx} ${cy})`} />
        </g>
      );
    case "spark":
      return (
        <path
          d={`M ${cx} ${cy - r} L ${cx + r * 0.28} ${cy - r * 0.28} L ${cx + r} ${cy} L ${cx + r * 0.28} ${cy + r * 0.28} L ${cx} ${cy + r} L ${cx - r * 0.28} ${cy + r * 0.28} L ${cx - r} ${cy} L ${cx - r * 0.28} ${cy - r * 0.28} Z`}
          fill={accent}
        />
      );
    case "layers":
      return (
        <g fill={accent}>
          <path d={`M ${cx} ${cy - r * 0.9} L ${cx + r} ${cy - r * 0.3} L ${cx} ${cy + r * 0.3} L ${cx - r} ${cy - r * 0.3} Z`} />
          <path d={`M ${cx} ${cy + r * 0.18} L ${cx + r} ${cy - r * 0.42} L ${cx + r} ${cy - r * 0.06} L ${cx} ${cy + r * 0.54} L ${cx - r} ${cy - r * 0.06} L ${cx - r} ${cy - r * 0.42} Z`} opacity={0.55} />
        </g>
      );
    default:
      return (
        <path
          d={`M ${cx - r} ${cy} L ${cx - r * 0.4} ${cy} L ${cx - r * 0.16} ${cy - r * 0.7} L ${cx + r * 0.16} ${cy + r * 0.7} L ${cx + r * 0.4} ${cy} L ${cx + r} ${cy}`}
          fill="none"
          stroke={accent}
          strokeWidth={Math.max(2.4, size * 0.12)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
};

/** A brand with no declared mark still gets a consistent one, derived from its
 * own name so the same product looks the same in every video it appears in. */
function markFor(brand: string): string {
  const marks = ["wing", "orbit", "spark", "layers", "pulse"];
  let hash = 0;
  for (const ch of brand) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return marks[hash % marks.length];
}

const ScreenBody: React.FC<{
  screen: AppConfig["screens"][string];
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  accent: string;
  focusId?: string;
  focusMode?: "observe" | "assume" | "press";
  typed: Map<string, string>;
  raised?: boolean;
}> = ({ screen, x, y, w, h, px, accent, focusId, focusMode, typed, raised }) => {
  const pad = px * 1.2;
  let cursorY = y + pad;

  return (
    <g>
      {raised ? (
        <rect x={x} y={y} width={w} height={h} rx={px} fill={SURFACE_RAISED} stroke={LINE} strokeWidth={1.6} />
      ) : null}
      {screen.title ? (
        <text x={x + pad} y={(cursorY += px * 1.3) - px * 0.2} fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 1.24}>
          {screen.title}
        </text>
      ) : null}
      {screen.blocks.map((block, i) => {
        const top = (cursorY += px * 1.1);
        const rendered = <BlockView key={i} block={block} x={x + pad} y={top} w={w - pad * 2} px={px} accent={accent} focusId={focusId} focusMode={focusMode} typed={typed} />;
        cursorY += appBlockHeight(block, px);
        return rendered;
      })}
    </g>
  );
};


/** Focus treatments, and they are deliberately DIFFERENT from one another.
 * Observing is not pressing, and assuming is not verifying — if all three drew
 * the same ring, the one moment that matters in an agent failure would look
 * exactly like the moments that do not. */
function focusStroke(mode: string | undefined, accent: string): { stroke: string; width: number; dash?: string } {
  if (mode === "assume") return { stroke: "#f59e0b", width: 3.2 };
  if (mode === "press") return { stroke: accent, width: 3.2 };
  return { stroke: "rgba(226,232,240,0.75)", width: 2.2, dash: "8 6" };
}

const BlockView: React.FC<{
  block: Block;
  x: number;
  y: number;
  w: number;
  px: number;
  accent: string;
  focusId?: string;
  focusMode?: "observe" | "assume" | "press";
  typed: Map<string, string>;
}> = ({ block, x, y, w, px, accent, focusId, focusMode, typed }) => {
  switch (block.kind) {
    case "heading":
      return (
        <text x={x} y={y + px} fill={MUTED} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={700} fontSize={px * 0.86} letterSpacing="0.14em">
          {block.text.toUpperCase()}
        </text>
      );

    case "fields": {
      const gap = px * 0.6;
      const fw = (w - gap * (block.items.length - 1)) / block.items.length;
      return (
        <g>
          {block.items.map((field, i) => {
            const fx = x + i * (fw + gap);
            const lit = focusId === field.id;
            const ring = focusStroke(focusMode, accent);
            const value = typed.get(field.id) ?? field.value;
            return (
              <g key={field.id}>
                <rect
                  x={fx}
                  y={y}
                  width={fw}
                  height={px * 3.4}
                  rx={px * 0.4}
                  fill={SURFACE_RAISED}
                  stroke={lit ? ring.stroke : LINE}
                  strokeWidth={lit ? ring.width : 1.4}
                  strokeDasharray={lit ? ring.dash : undefined}
                />
                <text x={fx + px * 0.7} y={y + px * 1.25} fill={MUTED} fontFamily={MONO} fontSize={px * 0.66} letterSpacing="0.1em">
                  {field.label.toUpperCase()}
                </text>
                <text x={fx + px * 0.7} y={y + px * 2.5} fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={700} fontSize={px * 1.0}>
                  {value}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    case "calendar": {
          const names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
      const cols = Math.min(7, block.days.length);
      const cw = w / cols;
      const ring = focusStroke(focusMode, accent);
      return (
        <g>
          <text x={x} y={y + px} fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px}>
            {block.month}
          </text>
          {Array.from({ length: cols }, (_, i) => (
            <text
              key={`n${i}`}
              x={x + i * cw + cw / 2}
              y={y + px * 2.5}
              textAnchor="middle"
              fill={MUTED}
              fontFamily={MONO}
              fontSize={px * 0.62}
              letterSpacing="0.08em"
            >
              {names[((block.startDay ?? 0) + i) % 7]}
            </text>
          ))}
          {block.days.slice(0, cols).map((day, i) => {
            const isSelected = block.selected === day;
            // The requested day is drawn as an outline that was never taken —
            // present, available, and visibly not chosen. Two days on one
            // calendar is the entire tension of a default being accepted.
            const isRequested = block.requested === day;
            const cx = x + i * cw + cw / 2;
            const cy = y + px * 4.4;
            const r = Math.min(cw * 0.4, px * 1.32);
            return (
              <g key={day}>
                {isSelected ? <circle cx={cx} cy={cy} r={r} fill={accent} /> : null}
                {isRequested && !isSelected ? (
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffd76a" strokeWidth={2.6} strokeDasharray="7 5" />
                ) : null}
                {isSelected && focusId === "date" ? (
                  <circle cx={cx} cy={cy} r={r + px * 0.42} fill="none" stroke={ring.stroke} strokeWidth={ring.width} strokeDasharray={ring.dash} />
                ) : null}
                <text
                  x={cx}
                  y={cy + px * 0.34}
                  textAnchor="middle"
                  fill={isSelected ? "#0b1017" : isRequested ? "#ffd76a" : TEXT}
                  fontFamily={DISPLAY_FONT_FAMILY}
                  fontWeight={isSelected || isRequested ? 800 : 600}
                  fontSize={px * 0.96}
                >
                  {day}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    case "cards":
      return (
        <g>
          {block.items.map((item, i) => {
            const cy = y + i * px * 3.4;
            const lit = focusId === item.id;
            const ring = focusStroke(focusMode, accent);
            return (
              <g key={item.id}>
                <rect
                  x={x}
                  y={cy}
                  width={w}
                  height={px * 3}
                  rx={px * 0.4}
                  fill={SURFACE_RAISED}
                  stroke={lit ? ring.stroke : LINE}
                  strokeWidth={lit ? ring.width : 1.4}
                  strokeDasharray={lit ? ring.dash : undefined}
                />
                <text x={x + px * 0.8} y={cy + px * 1.24} fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={700} fontSize={px * 0.96}>
                  {item.title}
                </text>
                {item.sub ? (
                  <text x={x + px * 0.8} y={cy + px * 2.24} fill={MUTED} fontFamily={MONO} fontSize={px * 0.68}>
                    {item.sub}
                  </text>
                ) : null}
                {item.value ? (
                  <text x={x + w - px * 0.8} y={cy + px * 1.9} textAnchor="end" fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 1.1}>
                    {item.value}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      );

    case "seatmap": {
      const gap = px * 0.28;
      const size = Math.min((w - gap * (block.cols - 1)) / block.cols, px * 1.5);
      return (
        <g>
          {Array.from({ length: block.rows }, (_, r) =>
            Array.from({ length: block.cols }, (_, c) => {
              const id = `${r + 1}${String.fromCharCode(65 + c)}`;
              const taken = (r * 7 + c * 3) % 5 === 0;
              const chosen = block.selected === id;
              return (
                <rect
                  key={id}
                  x={x + c * (size + gap)}
                  y={y + r * (size + gap)}
                  width={size}
                  height={size}
                  rx={size * 0.22}
                  fill={chosen ? accent : taken ? "rgba(148,163,184,0.22)" : SURFACE_RAISED}
                  stroke={chosen ? accent : LINE}
                  strokeWidth={chosen ? 2.4 : 1.2}
                />
              );
            }),
          )}
        </g>
      );
    }

    case "summary":
      return (
        <g>
          {block.items.map((item, i) => {
            const iy = y + i * px * 2.1;
            const colour = item.state === "good" ? "#7ee2a8" : item.state === "bad" ? "#ff9db0" : TEXT;
            return (
              <g key={item.label}>
                <text x={x} y={iy + px} fill={MUTED} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={600} fontSize={px * 0.88}>
                  {item.label}
                </text>
                {item.value ? (
                  <text x={x + w} y={iy + px} textAnchor="end" fill={colour} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 0.96}>
                    {item.value}
                  </text>
                ) : null}
                <line x1={x} y1={iy + px * 1.5} x2={x + w} y2={iy + px * 1.5} stroke={LINE} strokeWidth={1} />
              </g>
            );
          })}
        </g>
      );

    case "status": {
      const good = block.state === "approved";
      const bad = block.state === "failed";
      const colour = good ? "#22c55e" : bad ? "#f43f5e" : accent;
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={w}
            height={px * 2.8}
            rx={px * 0.4}
            fill={good ? "rgba(34,197,94,0.12)" : bad ? "rgba(244,63,94,0.12)" : "rgba(148,163,184,0.1)"}
            stroke={colour}
            strokeWidth={1.8}
          />
          {block.state === "processing" ? (
            <circle cx={x + px * 1.4} cy={y + px * 1.4} r={px * 0.5} fill="none" stroke={colour} strokeWidth={2.4} strokeDasharray="6 5" />
          ) : (
            <path
              d={`M ${x + px * 0.95} ${y + px * 1.4} l ${px * 0.34} ${px * 0.4} l ${px * 0.72} ${-px * 0.86}`}
              fill="none"
              stroke={colour}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <text x={x + px * 2.4} y={y + px * 1.75} fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={700} fontSize={px * 0.94}>
            {block.label}
          </text>
        </g>
      );
    }

    case "confirmation":
      return (
        <g>
          <rect x={x} y={y} width={w} height={px * 8.4} rx={px * 0.7} fill={SURFACE_RAISED} stroke="rgba(34,197,94,0.5)" strokeWidth={2} />
          <circle cx={x + w / 2} cy={y + px * 1.9} r={px * 1.1} fill="rgba(34,197,94,0.16)" stroke="#22c55e" strokeWidth={2.4} />
          <path
            d={`M ${x + w / 2 - px * 0.5} ${y + px * 1.9} l ${px * 0.34} ${px * 0.4} l ${px * 0.72} ${-px * 0.86}`}
            fill="none"
            stroke="#22c55e"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x={x + w / 2} y={y + px * 3.9} textAnchor="middle" fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 1.16}>
            {block.title}
          </text>
          {block.route ? (
            <text x={x + w / 2} y={y + px * 5.4} textAnchor="middle" fill={TEXT} fontFamily={DISPLAY_FONT_FAMILY} fontWeight={700} fontSize={px * 1.0}>
              {block.route}
            </text>
          ) : null}
          {block.date ? (
            <text x={x + w / 2} y={y + px * 6.7} textAnchor="middle" fill="#ffd76a" fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 1.2}>
              {block.date}
            </text>
          ) : null}
          {block.reference ? (
            <text x={x + w / 2} y={y + px * 7.8} textAnchor="middle" fill={MUTED} fontFamily={MONO} fontSize={px * 0.72}>
              {block.reference}
            </text>
          ) : null}
        </g>
      );

    case "button": {
      const lit = focusId === block.id;
      const ring = focusStroke(focusMode, accent);
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={w}
            height={px * 3}
            rx={px * 0.42}
            fill={accent}
            stroke={lit ? ring.stroke : "transparent"}
            strokeWidth={lit ? ring.width : 0}
          />
          <text x={x + w / 2} y={y + px * 1.95} textAnchor="middle" fill="#0b1017" fontFamily={DISPLAY_FONT_FAMILY} fontWeight={800} fontSize={px * 1.0}>
            {block.label}
          </text>
        </g>
      );
    }

    default:
      return null;
  }
};
