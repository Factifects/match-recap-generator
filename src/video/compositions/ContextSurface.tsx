import React from "react";
import type { StageBox } from "../../script/stageLayout";
import { DISPLAY_FONT_FAMILY } from "../theme";

// THE MODEL'S CONTEXT, drawn as the place everything lands.
//
// This exists because the usual explanation of why a language model gets things
// wrong — "it hallucinated", "it ignored the instruction" — describes the
// symptom and hides the cause. The cause is visible the moment you draw the
// context honestly: the user's goal and the page's contents arrive in the same
// stream, as the same kind of thing, and the only difference between them is a
// label the model is under no obligation to respect.
//
// So entries carry a SOURCE tag, they accumulate in arrival order, and the
// value the model ends up using appears in a slot at the foot. "It picked this
// one" then happens on screen instead of being asserted by narration.

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const PANEL = "#12161f";
const RAISED = "#1a2029";
const LINE = "rgba(148,163,184,0.22)";
const TEXT = "#e8edf7";
const MUTED = "#8b9ab4";

/** Source colours. The user's goal and everything the model merely read are
 * deliberately close in weight — making the instruction visually dominant would
 * tell the opposite of the truth, which is that nothing marks it as special. */
const SOURCE: Record<string, { label: string; colour: string }> = {
  user: { label: "USER", colour: "#8b7cf6" },
  page: { label: "PAGE", colour: "#8b9ab4" },
  tool: { label: "TOOL", colour: "#38bdf8" },
  model: { label: "MODEL", colour: "#f59e0b" },
};

export const ContextSurface: React.FC<{
  box: StageBox;
  unit: number;
  accent: string;
  /** Entry ids currently visible; absent means all of them. */
  visible: Set<string> | null;
  /** The entry being looked at, and how. */
  focusId?: string;
  focusMode?: "observe" | "assume" | "press";
  /** The value shown in the slot at the foot. */
  chosen?: string;
  chosenTone?: "neutral" | "warn" | "good";
}> = ({ box, unit, accent, visible, focusId, focusMode, chosen, chosenTone }) => {
  const ctx = box.context;
  if (!ctx) return null;

  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  const w = box.width;
  const h = box.height;
  const px = Math.max(20, unit * 0.025);
  const pad = px * 1.1;
  const rowH = px * 3.1;

  const shown = ctx.entries.filter((e) => (visible ? visible.has(e.id) : !e.hidden));
  const slotH = px * 3.6;

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={px * 0.8} fill={PANEL} stroke={LINE} strokeWidth={1.6} />

      {/* Header: what this pile IS. Naming it plainly matters, because the
          whole point is that a viewer stops imagining the model has a mind and
          starts seeing a buffer. */}
      <text x={x + pad} y={y + px * 1.9} fill={MUTED} fontFamily={MONO} fontWeight={700} fontSize={px * 0.8} letterSpacing="0.16em">
        {ctx.label.toUpperCase()}
      </text>
      <line x1={x + pad} y1={y + px * 2.6} x2={x + w - pad} y2={y + px * 2.6} stroke={LINE} strokeWidth={1.2} />

      {shown.map((entry, i) => {
        const ey = y + px * 3.4 + i * rowH;
        const lit = focusId === entry.id;
        const src = SOURCE[entry.source] ?? SOURCE.page;
        const ring = focusMode === "assume" ? "#f59e0b" : focusMode === "press" ? accent : "rgba(226,232,240,0.8)";
        return (
          <g key={entry.id}>
            <rect
              x={x + pad}
              y={ey}
              width={w - pad * 2}
              height={rowH * 0.82}
              rx={px * 0.35}
              fill={RAISED}
              stroke={lit ? ring : LINE}
              strokeWidth={lit ? 3 : 1.3}
              strokeDasharray={lit && focusMode === "observe" ? "8 6" : undefined}
            />
            {/* The source tag: small, quiet, and the ONLY thing distinguishing
                a goal from a scraped value. */}
            <rect x={x + pad + px * 0.6} y={ey + px * 0.55} width={px * 3.1} height={px * 1.1} rx={px * 0.25} fill={`${src.colour}22`} stroke={src.colour} strokeWidth={1.2} />
            <text
              x={x + pad + px * 2.15}
              y={ey + px * 1.35}
              textAnchor="middle"
              fill={src.colour}
              fontFamily={MONO}
              fontWeight={700}
              fontSize={px * 0.62}
              letterSpacing="0.1em"
            >
              {src.label}
            </text>
            <text x={x + pad + px * 4.3} y={ey + px * 1.42} fill={TEXT} fontFamily={MONO} fontSize={px * 0.86}>
              {entry.text}
            </text>
          </g>
        );
      })}

      {/* The slot at the foot: what the model actually went with. Empty until
          something is chosen, so the choosing is an event. */}
      <g>
        <rect
          x={x + pad}
          y={y + h - slotH - px * 0.8}
          width={w - pad * 2}
          height={slotH}
          rx={px * 0.4}
          fill={chosen ? (chosenTone === "warn" ? "rgba(245,158,11,0.14)" : chosenTone === "good" ? "rgba(34,197,94,0.14)" : RAISED) : "rgba(148,163,184,0.06)"}
          stroke={chosen ? (chosenTone === "warn" ? "#f59e0b" : chosenTone === "good" ? "#22c55e" : LINE) : LINE}
          strokeWidth={chosen ? 2.4 : 1.3}
          strokeDasharray={chosen ? undefined : "8 7"}
        />
        <text x={x + pad + px * 0.9} y={y + h - slotH + px * 0.5} fill={MUTED} fontFamily={MONO} fontWeight={700} fontSize={px * 0.66} letterSpacing="0.14em">
          VALUE USED
        </text>
        <text
          x={x + pad + px * 0.9}
          y={y + h - slotH + px * 2.2}
          fill={chosen ? (chosenTone === "warn" ? "#ffd76a" : chosenTone === "good" ? "#9ff0b8" : TEXT) : "rgba(148,163,184,0.45)"}
          fontFamily={DISPLAY_FONT_FAMILY}
          fontWeight={800}
          fontSize={px * 1.3}
        >
          {chosen ?? "—"}
        </text>
      </g>
    </g>
  );
};
