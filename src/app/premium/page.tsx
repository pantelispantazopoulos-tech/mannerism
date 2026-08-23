"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useAnonymousAuth } from "@/lib/supabase/useAnonymousAuth";
import { useAccount } from "@/lib/supabase/useAccount";
import { listMyPackPurchases, listPatternCatalog } from "@/lib/game/roomApi";
import { startPackCheckout } from "@/lib/stripe/checkout";
import { PackIcon } from "@/components/icons/PackIcons";
import { useIsNativePlatform } from "@/lib/capacitor/useIsNativePlatform";
import type { PatternCatalogRow } from "@/lib/supabase/types";

const PACK_BLURBS: Record<string, string> = {
  "Starter Pack": "30 free patterns, ready to play right now.",
  "Flirty & Cheeky": "Playful, a little bold — heads-up: some patterns involve light physical contact. 😉",
  "Movies & Celebrities Pack": "Act it out like your favorite stars.",
  "Office & Coworkers Pack": "For your next team happy hour.",
};

// A pack-specific $1 buy button — the alternative to subscribing for a
// player who only wants one pack. Only actionable once an email is linked
// (Checkout can't complete without one); the shared UpgradePrompt further
// down the page is where that email gets linked in the first place.
function PackBuyButton({ packName, isEmailLinked }: { packName: string; isEmailLinked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNative = useIsNativePlatform();

  async function handleBuy() {
    setBusy(true);
    setError(null);
    try {
      await startPackCheckout(packName, "/premium");
      // Redirects the browser away on success — nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setBusy(false);
    }
  }

  if (!isEmailLinked) {
    return <p className="mt-4 text-xs font-medium text-ink/40">Link an email below to buy packs individually.</p>;
  }

  return (
    <div className="mt-4">
      <Button fullWidth={false} onClick={handleBuy} disabled={busy}>
        {busy ? "Starting checkout…" : isNative ? "Continue on mannerism.app" : "$1 — Unlock just this pack"}
      </Button>
      {error && <p className="mt-2 text-xs font-semibold text-coral">{error}</p>}
    </div>
  );
}

export default function PremiumPage() {
  const { userId, loading: authLoading } = useAnonymousAuth();
  const account = useAccount(userId);
  const [rows, setRows] = useState<PatternCatalogRow[] | null>(null);
  const [purchasedPacks, setPurchasedPacks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    listPatternCatalog()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load packs"));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    listMyPackPurchases(userId)
      .then((names) => setPurchasedPacks(new Set(names)))
      .catch(() => {});
  }, [userId]);

  const packs = useMemo(() => {
    if (!rows) return [];
    const byPack = new Map<
      string,
      {
        pack_name: string;
        icon_key: string;
        display_order: number;
        is_free: boolean;
        count: number;
        samples: string[];
      }
    >();
    for (const row of rows) {
      const existing = byPack.get(row.pack_name);
      if (existing) {
        existing.count += 1;
        if (row.text && existing.samples.length < 2) existing.samples.push(row.text);
      } else {
        byPack.set(row.pack_name, {
          pack_name: row.pack_name,
          icon_key: row.icon_key,
          display_order: row.display_order,
          is_free: row.is_free,
          count: 1,
          samples: row.text ? [row.text] : [],
        });
      }
    }
    return Array.from(byPack.values()).sort((a, b) => a.display_order - b.display_order);
  }, [rows]);

  const hasLockedPacks = packs.some(
    (p) => !p.is_free && !account.isSubscribed && !purchasedPacks.has(p.pack_name)
  );

  return (
    <Screen>
      <ScreenTitle>Pattern Packs</ScreenTitle>
      <p className="-mt-2 text-center text-parchment/60">
        Every room starts with the free Starter Pack. Unlock a premium pack for $1 each, or
        subscribe to unlock all of them at once —
        {" "}
        <strong>whoever hosts a room</strong> brings their unlocked packs to that room&apos;s games.
      </p>

      {(authLoading || (!rows && !error)) && <Spinner label="Loading packs…" />}
      {error && <p className="font-semibold text-coral">{error}</p>}

      <div className="flex w-full flex-col gap-4">
        {packs.map((pack) => {
          const unlocked = pack.is_free || account.isSubscribed || purchasedPacks.has(pack.pack_name);
          return (
            <div
              key={pack.pack_name}
              className={[
                "rounded-3xl border-2 bg-parchment p-5 shadow-note",
                unlocked ? "border-sage" : "border-ink/10",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <PackIcon iconKey={pack.icon_key} size={64} className="flex-none" />
                  <div>
                    <h2 className="text-xl font-black text-ink">{pack.pack_name}</h2>
                    <p className="text-sm font-medium text-ink/60">
                      {PACK_BLURBS[pack.pack_name] ?? "A pattern pack."}
                    </p>
                  </div>
                </div>
                <span className="flex-none rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink/60">
                  {pack.count} patterns
                </span>
              </div>

              {unlocked ? (
                <span className="mt-4 inline-block rounded-full bg-sage px-4 py-1.5 text-sm font-bold text-ink">
                  ✓ Unlocked
                </span>
              ) : (
                <>
                  {pack.samples.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm italic text-ink/50">
                      {pack.samples.map((s) => (
                        <li key={s}>&ldquo;{s}&rdquo;</li>
                      ))}
                    </ul>
                  )}
                  <span className="mt-4 inline-block rounded-full bg-ink/10 px-4 py-1.5 text-sm font-bold text-ink/50">
                    🔒 $1 to unlock, or subscribe below
                  </span>
                  <PackBuyButton packName={pack.pack_name} isEmailLinked={!!account.email} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {!authLoading && !account.loading && hasLockedPacks && !account.isSubscribed && (
        <UpgradePrompt
          reason="Unlock every premium pack"
          isEmailLinked={!!account.email}
          onLinkEmail={account.linkEmail}
          returnTo="/premium"
        />
      )}

      <Link href="/" className="mt-2 text-center text-sm font-bold text-sage">
        ← Back home
      </Link>
    </Screen>
  );
}
