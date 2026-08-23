"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/theme/useReducedMotion";

type Piece = {
  id: number;
  left: string;
  delay: string;
  x: string;
  r: string;
  size: number;
};

// A brief coral confetti burst for the one moment the brief calls out for
// it — a correct guess. Coral is otherwise reserved for key actions, so
// this is deliberately the only place in the app confetti appears at all.
// Absolutely positioned over whatever parent renders it (give the parent
// `relative`), plays once on mount, and never loops.
export function Confetti({ count = 16 }: { count?: number }) {
  const reducedMotion = useReducedMotion();
  const [pieces, setPieces] = useState<Piece[]>([]);

  // Math.random() is an impure call, so it has to happen in an effect
  // rather than during render (e.g. inside useMemo) — this runs once on
  // mount to lay out the particles, then never again.
  useEffect(() => {
    function layOutParticles() {
      setPieces(
        Array.from({ length: count }, (_, i) => ({
          id: i,
          left: `${8 + Math.random() * 84}%`,
          delay: `${Math.random() * 150}ms`,
          x: `${(Math.random() - 0.5) * 60}px`,
          r: `${180 + Math.random() * 240}deg`,
          size: 6 + Math.round(Math.random() * 5),
        }))
      );
    }
    layOutParticles();
  }, [count]);

  // A one-shot celebratory burst is exactly the kind of non-essential
  // motion prefers-reduced-motion asks us to skip outright, not just speed
  // up — so this component simply renders nothing for those users.
  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 animate-confetti-fall rounded-sm bg-coral"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size * 0.4,
              animationDelay: p.delay,
              "--confetti-x": p.x,
              "--confetti-r": p.r,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
