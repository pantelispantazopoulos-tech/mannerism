"use client";

import { supabase } from "@/lib/supabase/client";

// Google Play prohibits a WebView-wrapped app from processing payments any
// way other than the platform's own billing system UNLESS the payment
// happens somewhere the user recognizes as leaving the app — the system
// browser, not the app's own WebView, qualifies. There is no Google Play
// Billing integration in this app (there's nothing digital being sold that
// Play's billing rules would even require it for — packs/subscription
// unlock server-side game content, not in-app digital goods delivered
// through Android itself), so every Checkout redirect goes through
// @capacitor/browser's system browser on native instead of a same-WebView
// navigation. On the web this is exactly the redirect it always was —
// Browser.open() is only imported/called when actually running natively.
async function redirectToCheckout(url: string): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}

// Kicks off Stripe Checkout for the $4.99/month subscription and redirects
// the browser there. `returnTo` is where Checkout sends the player back
// after success/cancel (defaults to the premium packs page).
export async function startCheckout(returnTo?: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You need to be signed in to subscribe");
  }

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ returnTo }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't start checkout");
  }

  const { url } = (await res.json()) as { url: string };
  await redirectToCheckout(url);
}

// Kicks off Stripe Checkout for a one-time $1 purchase of a single premium
// pack and redirects the browser there — the alternative to
// startCheckout() (the $4.99/month subscription) for a player who only
// wants one pack.
export async function startPackCheckout(packName: string, returnTo?: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You need to be signed in to buy a pack");
  }

  const res = await fetch("/api/stripe/checkout-pack", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ packName, returnTo }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't start checkout");
  }

  const { url } = (await res.json()) as { url: string };
  await redirectToCheckout(url);
}
