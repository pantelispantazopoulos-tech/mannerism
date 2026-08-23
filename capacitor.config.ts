import type { CapacitorConfig } from "@capacitor/cli";

// Uses the io.github.<username>.<app> convention — the standard free
// option for indie/OSS Android apps that don't have a registered domain.
// Google only requires the package name to be unique on Play Store, not
// domain-verified, so this is a legitimate, permanent app ID as-is — not
// a placeholder. It CANNOT be changed after your first Play Store
// release, though, so if you register a real domain before then and want
// e.g. app.mannerism.android instead, swap it now.
const APP_ID = "io.github.pantelispantazopoulostech.mannerism";

// The Android app is a thin native shell: it loads the same deployed
// Next.js site everyone plays on in the browser, so the web app stays the
// single source of truth for game logic, packs, and billing — nothing
// here duplicates that.
//
// PLACEHOLDER — currently pointed at the linked Vercel project's default
// URL (https://omniroute-khaki.vercel.app), which is live but stale (it
// predates the branding/pattern-pack work done earlier this session).
// Swap this for your real production domain once you have one, and
// redeploy so the native app doesn't ship the old emoji-logo build.
const DEPLOYED_APP_URL = "https://omniroute-khaki.vercel.app";

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: "Mannerism",
  // Required even in remote mode (see www/index.html) — never actually
  // shown once the app has loaded once.
  webDir: "www",
  backgroundColor: "#1B1830",
  server: {
    url: DEPLOYED_APP_URL,
    // The WebView loads exclusively from this origin. Everything else
    // (Stripe Checkout, any external link) must go through the system
    // browser via @capacitor/browser instead of a same-webview navigation
    // — see src/lib/stripe/checkout.ts and src/components/ExternalLink.tsx.
    // allowNavigation is a defense-in-depth belt-and-suspenders check on
    // top of that, not the only thing preventing it.
    allowNavigation: [new URL(DEPLOYED_APP_URL).hostname],
    cleartext: false,
  },
  android: {
    backgroundColor: "#1B1830",
  },
};

export default config;
