"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, className = "", id, ...rest },
  ref
) {
  return (
    <label className="block w-full text-left" htmlFor={id}>
      {label && (
        <span className="mb-2 block text-sm font-bold uppercase tracking-wide text-parchment/60">{label}</span>
      )}
      <input
        ref={ref}
        id={id}
        className={[
          "w-full rounded-2xl border-2 border-ink/15 bg-parchment px-5 py-4 text-xl font-semibold text-ink",
          "placeholder:text-ink/30 focus:border-coral",
          className,
        ].join(" ")}
        {...rest}
      />
    </label>
  );
});
