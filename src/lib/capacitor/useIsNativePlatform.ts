"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

// Never changes during a session, so there's nothing to actually subscribe
// to — useSyncExternalStore is used here purely for its getServerSnapshot
// fallback, which is the correct primitive for "a value that isn't knowable
// during SSR" (returns false on the server/during hydration, then the real
// value once mounted in the browser) without the cascading-render issue an
// effect + setState has for this same pattern.
const noopSubscribe = () => () => {};

export function useIsNativePlatform(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => Capacitor.isNativePlatform(),
    () => false
  );
}
