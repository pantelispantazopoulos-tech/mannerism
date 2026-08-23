"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "success" | "ghost" | "danger";

// Coral is the single accent, reserved for the one key action per screen —
// so only `primary` uses it. Everything else reaches for ink, parchment,
// or sage instead of a second "loud" color.
const variantClasses: Record<Variant, string> = {
  primary: "bg-coral text-parchment shadow-note active:shadow-none active:translate-y-1",
  // A step lighter than the page's own ink background, plus a parchment
  // border, so it reads as a distinct button on the dark ink page without
  // needing a second accent color.
  secondary:
    "bg-ink-light text-parchment border-2 border-parchment/40 shadow-note active:shadow-none active:translate-y-1",
  // Sage = success/calm, used for the one "that's correct" moment.
  success: "bg-sage text-ink shadow-note active:shadow-none active:translate-y-1",
  ghost: "bg-parchment text-ink border-2 border-ink/10 active:bg-parchment-dim",
  // Deliberately not red — "wrong" gets the same quiet parchment
  // treatment as ghost, just visually distinct enough to sit next to the
  // sage "correct" button.
  danger: "bg-parchment/90 text-ink border-2 border-ink/15 active:bg-parchment-dim",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", fullWidth = true, className = "", disabled, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={[
        "rounded-2xl px-6 py-4 text-lg font-bold tracking-tight transition-all",
        "disabled:opacity-40 disabled:pointer-events-none",
        fullWidth ? "w-full" : "",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});
