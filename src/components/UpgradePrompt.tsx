"use client";

import { useState } from "react";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { startCheckout } from "@/lib/stripe/checkout";
import { useIsNativePlatform } from "@/lib/capacitor/useIsNativePlatform";

interface Props {
  // What the player was trying to do — shown as the headline reason.
  reason: string;
  isEmailLinked: boolean;
  onLinkEmail: (email: string) => Promise<void>;
  returnTo?: string;
  // Defaults to the $4.99/mo subscription. Pack-purchase buttons (see
  // /premium) pass a pack-specific one-time checkout instead, along with
  // matching copy for the blurb/button/price.
  onUpgrade?: () => Promise<void>;
  blurb?: string;
  ctaLabel?: string;
}

// Shown inline wherever a free player hits a gated action: saving a
// pattern, publishing to the shared pool, browsing the pool, unlocking a
// premium pack (by subscribing) or unlocking just one pack for $1. Two
// steps because either path needs a real, reachable email first (see
// useAccount.ts) — Checkout can't complete without one.
export function UpgradePrompt({
  reason,
  isEmailLinked,
  onLinkEmail,
  returnTo,
  onUpgrade,
  blurb = "Mannerism Premium unlocks your private pattern library, the shared pattern pool, and all premium packs — $4.99/month.",
  ctaLabel = "Upgrade — $4.99/mo",
}: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  // Checkout always opens the system browser on native (see
  // src/lib/stripe/checkout.ts) rather than the app's own WebView, so the
  // button copy says so explicitly instead of quoting a price the player
  // won't see until they land there.
  const isNative = useIsNativePlatform();

  async function handleLinkEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onLinkEmail(email.trim());
      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send confirmation link");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpgrade() {
    setBusy(true);
    setError(null);
    try {
      await (onUpgrade ? onUpgrade() : startCheckout(returnTo));
      // Both paths redirect the browser away on success, so there's no
      // "finally" state to reach here in the happy path.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-3xl border-2 border-ink/10 bg-parchment p-5 text-center shadow-note">
      <p className="text-lg font-black text-ink">🔒 {reason}</p>
      <p className="mt-1 text-sm font-medium text-ink/60">{blurb}</p>

      {!isEmailLinked ? (
        linkSent ? (
          <p className="mt-4 text-sm font-bold text-ink">
            Check your inbox! Click the confirmation link, then come back here to upgrade.
          </p>
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={handleLinkEmail}>
            <TextField
              label="Email (needed to subscribe)"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send confirmation link"}
            </Button>
          </form>
        )
      ) : (
        <Button className="mt-4" onClick={handleUpgrade} disabled={busy} variant="primary">
          {busy ? "Starting checkout…" : isNative ? "Continue on mannerism.app" : ctaLabel}
        </Button>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-coral">{error}</p>}
    </div>
  );
}
