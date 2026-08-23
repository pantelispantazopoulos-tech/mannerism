"use client";

import { useEffect, useState } from "react";

// Purely visual — every player's phone computes the same countdown from the
// shared `round_started_at` timestamp, so nobody needs a server tick.
// Running out just means "wrap it up," the app doesn't force-end the round.
export function RoundTimer({
  startedAt,
  seconds,
}: {
  startedAt: string | null;
  seconds: number;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    // No round running yet — nothing to count down. `remaining` already
    // starts at `seconds`, so there's nothing to set here.
    if (!startedAt) return;

    const startMs = new Date(startedAt).getTime();
    function tick() {
      const elapsed = (Date.now() - startMs) / 1000;
      setRemaining(Math.max(0, Math.ceil(seconds - elapsed)));
    }

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt, seconds]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const isLow = remaining <= 10 && remaining > 0;
  const isDone = remaining <= 0;

  return (
    <div
      className={[
        "flex h-32 w-32 items-center justify-center rounded-full border-4 font-display text-4xl font-bold tabular-nums",
        isDone
          ? "border-parchment/20 bg-parchment/5 text-parchment/40"
          : isLow
          ? "animate-pulse border-coral bg-coral/10 text-coral"
          : "border-parchment/30 bg-parchment/5 text-parchment",
      ].join(" ")}
    >
      {mm}:{ss.toString().padStart(2, "0")}
    </div>
  );
}
