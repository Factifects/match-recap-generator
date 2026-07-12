import type { ReactNode } from "react";

const SPAN_CLASS: Record<number, string> = {
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

export const Card: React.FC<{
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  eyebrow?: string;
  className?: string;
  children: ReactNode;
}> = ({ span = 12, eyebrow, className = "", children }) => {
  return (
    <div
      className={`col-span-12 ${SPAN_CLASS[span]} bg-panel border border-border rounded-xl p-5 flex flex-col ${className}`}
    >
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim mb-3">{eyebrow}</div>
      )}
      {children}
    </div>
  );
};
