"use client";

import { useEffect, useState } from "react";

// CSS alone (see the @media query in globals.css) handles most of the
// reduced-motion story for free — this hook is only for the handful of
// effects that are driven from JS rather than a pure CSS animation
// (confetti particles, the room-code digit flip, the guesser spotlight
// sweep), where "reduced motion" means skip mounting the effect entirely
// rather than letting it play at 0ms.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
