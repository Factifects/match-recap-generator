import type { ButtonHTMLAttributes } from "react";

/** Only one "primary" (filled, accent) button belongs on a given surface —
 * everything else should be "secondary" (outlined), per the hierarchy-of-
 * actions convention: most screens have exactly one true primary action. */
export const Button: React.FC<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }
> = ({ variant = "primary", className = "", ...props }) => {
  const variantClass =
    variant === "primary"
      ? "bg-accent text-white hover:brightness-110"
      : "bg-transparent text-text border border-border hover:border-[#3d444a]";

  return (
    <button
      className={`self-start px-[18px] py-[10px] rounded-[7px] text-[13px] font-semibold cursor-pointer mt-5 disabled:opacity-50 disabled:cursor-not-allowed ${variantClass} ${className}`}
      {...props}
    />
  );
};
