"use client";

import { useId } from "react";

const LENGTH = 5;

// The join-screen room code field. A single real <input> handles typing,
// paste, and autofill (so this stays fully accessible and behaves like a
// normal text field for screen readers/keyboards) while five boxes drawn on
// top show the flip-clock-style digit animation described in the design
// brief. Each box is keyed by its character, so typing a new letter into a
// slot remounts that box and replays the flip-in animation — no timers or
// animation orchestration needed.
export function RoomCodeInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const chars = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("");

  return (
    <div className="block w-full text-left">
      <label htmlFor={id} className="mb-2 block text-sm font-bold uppercase tracking-wide text-parchment/60">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          className="absolute inset-0 h-full w-full cursor-text text-transparent caret-transparent outline-none"
          style={{ WebkitTextFillColor: "transparent" }}
          aria-describedby={`${id}-boxes`}
        />
        <div id={`${id}-boxes`} className="flex justify-between gap-2" aria-hidden="true">
          {chars.map((ch, i) => (
            <div
              key={`${i}-${ch}`}
              className={[
                "flex h-16 flex-1 items-center justify-center rounded-2xl border-2 font-display text-3xl font-bold shadow-note-sm [perspective:400px]",
                ch.trim()
                  ? "animate-flip-in border-coral bg-parchment text-ink"
                  : "border-parchment/25 bg-ink-light text-parchment/30",
              ].join(" ")}
            >
              {ch.trim() || "·"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
