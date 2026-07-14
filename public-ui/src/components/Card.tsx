import type { ReactNode } from "react";

const SPAN_CLASS: Record<number, string> = {
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

/** "accent" is the one lime hero tile a bento layout gets per screen (the
 * primary script input, the primary preview once it exists) — everything
 * else stays a dark tile so the accent tile actually reads as the focal
 * point instead of competing with a wall of equally-loud panels. */
const TONE_CLASS: Record<"default" | "alt" | "accent", string> = {
  default: "bg-panel border border-border",
  alt: "bg-panel-alt border border-border",
  accent: "bg-accent border border-accent text-accent-ink",
};

export const Card: React.FC<{
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  eyebrow?: string;
  tone?: "default" | "alt" | "accent";
  className?: string;
  children: ReactNode;
}> = ({ span = 12, eyebrow, tone = "default", className = "", children }) => {
  const isAccent = tone === "accent";
  return (
    <div
      className={`col-span-12 ${SPAN_CLASS[span]} ${TONE_CLASS[tone]} rounded-2xl p-6 flex flex-col ${className}`}
    >
      {eyebrow && (
        <div
          className={`inline-flex self-start text-[10.5px] font-bold uppercase tracking-[1.5px] px-2.5 py-1 rounded-full mb-4 ${
            isAccent ? "bg-accent-ink/10 text-accent-ink" : "bg-white/5 text-text-dim"
          }`}
        >
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  );
};
