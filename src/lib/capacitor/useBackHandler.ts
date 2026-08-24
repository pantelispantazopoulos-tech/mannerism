"use client";

import { useEffect, useRef } from "react";
import { pushBackHandler, popBackHandler } from "./backHandlerStack";

// Registers `handler` to intercept the Android hardware back button while
// this component is mounted — see backHandlerStack.ts for why this exists
// instead of just relying on router/browser history. `handler` should
// return true if it consumed the press (e.g. stepped back to a local
// "sub-view" like the landing page's create/join form), false to let it
// fall through to normal history-based navigation. A ref keeps the
// registered callback current across re-renders without re-registering.
export function useBackHandler(handler: () => boolean) {
  const handlerRef = useRef(handler);

  // Keeping the ref current is an effect, not a render-time assignment —
  // refs are only safe to read/write outside of render (event handlers,
  // effects), never in the component body itself.
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const stable = () => handlerRef.current();
    pushBackHandler(stable);
    return () => popBackHandler(stable);
  }, []);
}
