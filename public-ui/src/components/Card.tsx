import type { ReactNode } from "react";

const SPAN_CLASS: Record<number, string> = {
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

/** "accent" is the one hot-pink hero tile a bento layout gets per screen (the
 * primary script input, the primary preview once it exists) — everything
 * else stays white/cream so the accent tile actually reads as the focal
 * point instead of competing with a wall of equally-loud panels. "mint" is a
 * secondary flat color for informational panels that want some variety
 * without competing with the one true accent. Every tone shares the same
 * thick black border + hard offset shadow — that pairing is what reads as
 * "neo-brutalist" rather than just "colorful". */
const TONE_CLASS: Record<"default" | "alt" | "accent" | "mint", string> = {
  default: "bg-panel",
  alt: "bg-panel-alt",
  accent: "bg-accent text-accent-ink",
  mint: "bg-mint text-accent-ink",
};

export const Card: React.FC<{
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  eyebrow?: string;
  tone?: "default" | "alt" | "accent" | "mint";
  className?: string;
  children: ReactNode;
}> = ({ span = 12, eyebrow, tone = "default", className = "", children }) => {
  const isColorTone = tone === "accent" || tone === "mint";
  return (
    <div
      className={`col-span-12 ${SPAN_CLASS[span]} ${TONE_CLASS[tone]} border-2 border-border rounded-2xl brutal-shadow p-6 flex flex-col ${className}`}
    >
      {eyebrow && (
        <div
          className={`inline-flex self-start text-[10.5px] font-bold uppercase tracking-[1.5px] px-2.5 py-1 rounded-full border-2 border-border mb-4 ${
            isColorTone ? "bg-white/70 text-accent-ink" : "bg-panel-alt text-text"
          }`}
        >
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  );
};
