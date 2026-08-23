"use client";

import { supabase } from "@/lib/supabase/client";

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
  window.location.href = url;
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
  window.location.href = url;
}
