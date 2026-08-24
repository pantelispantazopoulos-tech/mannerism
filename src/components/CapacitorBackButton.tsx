"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dispatchBackPress } from "@/lib/capacitor/backHandlerStack";

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
        // Some "screens" (the landing page's create/join forms) are local
        // component state, not a real Next.js route — canGoBack/router.back()
        // have nothing to undo for those, so give registered handlers (see
        // useBackHandler) first refusal before falling back to real
        // history. canGoBack reflects the WebView's own history stack for
        // everything that *is* a real navigation (room join/create redirect,
        // /premium, /room/[code]/patterns).
        if (dispatchBackPress()) return;
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
