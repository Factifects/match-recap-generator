import type { ButtonHTMLAttributes } from "react";

/** Only one "primary" (filled, accent) button belongs on a given surface —
 * everything else should be "secondary" (outlined), per the hierarchy-of-
 * actions convention: most screens have exactly one true primary action.
 * Both variants share the same thick border + hard shadow that "presses
 * down" (shadow collapses, button shifts into its own shadow's spot) on
 * click — the tactile interaction neo-brutalist UI is built around. */
export const Button: React.FC<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }
> = ({ variant = "primary", className = "", ...props }) => {
  const variantClass = variant === "primary" ? "bg-accent text-accent-ink" : "bg-panel text-text";

  return (
    <button
      className={`self-start px-5 py-2.5 rounded-full text-[13px] font-bold cursor-pointer mt-5 border-2 border-border brutal-shadow-sm transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 ${variantClass} ${className}`}
      {...props}
    />
  );
};
