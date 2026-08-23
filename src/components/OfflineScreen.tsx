"use client";

import { useSyncExternalStore } from "react";

// Full-screen overlay shown whenever the device loses connectivity —
// without this, a Capacitor WebView with no network just freezes on
// whatever was last rendered (or shows Chrome's bare "no internet"
// dinosaur page if a navigation was in flight), which reads as a broken
// app rather than a network hiccup. Works identically in the regular web
// app too (no Capacitor dependency here — navigator.onLine and the
// online/offline events are standard browser APIs), it just matters most
// natively since every screen in this game depends on a live Supabase
// connection.
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

// getServerSnapshot always returns "online" — navigator.onLine doesn't
// exist during SSR, and guessing offline here would flash this screen on
// every normal page load until hydration catches up.
function getSnapshot() {
  return !navigator.onLine;
}

function getServerSnapshot() {
  return false;
}

export function OfflineScreen() {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink px-8 text-center">
      <span className="text-5xl" aria-hidden="true">
        📡
      </span>
      <p className="font-display text-2xl font-bold text-parchment">You&apos;re offline</p>
      <p className="max-w-xs text-sm font-medium text-parchment/60">
        Mannerism needs an internet connection to keep the game in sync. Reconnect and this screen
        will clear itself automatically.
      </p>
    </div>
  );
}
