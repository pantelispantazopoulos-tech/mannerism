"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Wires the Android hardware back button to the app's own navigation
// history instead of the platform default (which, unhandled inside a
// Capacitor WebView, either does nothing or closes the app outright —
// neither is acceptable for Play Store review, which expects back to
// behave like it does in any other Android app). A no-op everywhere else:
// Capacitor.isNativePlatform() is false in the regular web app, and the
// dynamic import means @capacitor/app's native bridge code never even
// loads there.
export function CapacitorBackButton() {
  const router = useRouter();

  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    async function setup() {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        // canGoBack reflects the WebView's own history stack — since every
        // screen change in this app (room join/create, /premium, /room/
        // [code]/patterns) is a real Next.js navigation, this retraces the
        // same path the player took forward, landing back on e.g. the join
        // screen rather than leaving WebView state half-torn-down.
        if (canGoBack) {
          router.back();
        } else {
          App.exitApp();
        }
      });
      if (cancelled) {
        handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    }

    setup();
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [router]);

  return null;
}
