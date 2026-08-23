"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Spinner } from "@/components/Spinner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useAnonymousAuth } from "@/lib/supabase/useAnonymousAuth";
import { useAccount } from "@/lib/supabase/useAccount";
import { useRoomState } from "@/lib/game/useRoomState";
import {
  createCustomPattern,
  getErrorMessage,
  getMyLibrary,
  getPublicPatternPool,
  getRoomCustomPatterns,
  isSubscriptionRequiredError,
  publishPatternToPool,
  reportPublicPattern,
  savePatternToLibrary,
} from "@/lib/game/patternsApi";
import type { CustomPattern, LibraryPattern, PublicPattern } from "@/lib/supabase/types";

// Not localized into the room's language (unlike the core game screens) —
// this is new, account-level UI in the same vein as /premium, which is
// also English-only. Keeping it that way avoids re-translating a fast-
// moving feature into all 7 languages before it's settled.
export default function PatternsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { userId, loading: authLoading } = useAnonymousAuth();
  const { room, myPlayer, loading: roomLoading } = useRoomState(code.toUpperCase(), userId);
  const account = useAccount(userId);

  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([]);
  const [library, setLibrary] = useState<LibraryPattern[]>([]);
  const [pool, setPool] = useState<PublicPattern[]>([]);
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatedReason, setGatedReason] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());

  const loadCustomPatterns = useCallback(async () => {
    if (!room) return;
    setCustomPatterns(await getRoomCustomPatterns(room.id));
  }, [room]);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    getRoomCustomPatterns(room.id).then((rows) => {
      if (!cancelled) setCustomPatterns(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [room]);

  useEffect(() => {
    if (!userId || account.loading) return;
    if (account.email) {
      getMyLibrary(userId).then(setLibrary).catch(() => {});
    }
    if (account.isSubscribed) {
      getPublicPatternPool().then(setPool).catch(() => {});
    }
  }, [userId, account.loading, account.email, account.isSubscribed]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!room || !newText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCustomPattern(room.id, newText.trim());
      setNewText("");
      await loadCustomPatterns();
    } catch (err) {
      setError(getErrorMessage(err) ?? "Couldn't add that pattern");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(pattern: CustomPattern) {
    setGatedReason(null);
    setError(null);
    try {
      await savePatternToLibrary(pattern.text);
      setSavedIds((s) => new Set(s).add(pattern.id));
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setGatedReason("Saving patterns to your library needs a subscription.");
      } else {
        setError(getErrorMessage(err) ?? "Couldn't save that pattern");
      }
    }
  }

  async function handlePublish(pattern: CustomPattern) {
    setGatedReason(null);
    setError(null);
    try {
      await publishPatternToPool(pattern.text);
      setPublishedIds((s) => new Set(s).add(pattern.id));
    } catch (err) {
      if (isSubscriptionRequiredError(err)) {
        setGatedReason("Publishing to the shared pool needs a subscription.");
      } else {
        setError(getErrorMessage(err) ?? "Couldn't publish that pattern");
      }
    }
  }

  async function handleAddFromLibraryOrPool(text: string) {
    if (!room) return;
    setError(null);
    try {
      await createCustomPattern(room.id, text);
      await loadCustomPatterns();
    } catch (err) {
      setError(getErrorMessage(err) ?? "Couldn't add that pattern");
    }
  }

  async function handleReport(pattern: PublicPattern) {
    try {
      await reportPublicPattern(pattern.id);
      setPool((p) => p.filter((row) => row.id !== pattern.id));
    } catch (err) {
      setError(getErrorMessage(err) ?? "Couldn't report that pattern");
    }
  }

  if (authLoading || roomLoading) {
    return (
      <Screen>
        <Spinner label="Loading…" />
      </Screen>
    );
  }

  if (!room || !myPlayer) {
    return (
      <Screen>
        <ScreenTitle>Hmm.</ScreenTitle>
        <p className="text-center text-parchment/60">
          Join the room first before adding patterns.
        </p>
        <Link href={`/room/${code}`}>
          <Button>Back to room</Button>
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>Custom Patterns</ScreenTitle>
      <p className="-mt-2 text-center text-sm font-medium text-parchment/60">
        Add your own mannerism for room {room.code} — it joins the pool for this room&apos;s
        rounds right away, free, no account needed.
      </p>

      {error && <p className="text-center font-semibold text-coral">{error}</p>}

      <form className="flex w-full flex-col gap-3" onSubmit={handleAdd}>
        <TextField
          label="New pattern"
          placeholder="e.g. Answer every question with a pun"
          value={newText}
          maxLength={200}
          onChange={(e) => setNewText(e.target.value)}
        />
        <Button type="submit" disabled={busy || !newText.trim()}>
          {busy ? "Adding…" : "Add to this room"}
        </Button>
      </form>

      <div className="w-full">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">
          This room&apos;s custom patterns ({customPatterns.length})
        </p>
        <ul className="flex w-full flex-col gap-2">
          {customPatterns.map((p) => (
            <li key={p.id} className="rounded-2xl border-2 border-ink/10 bg-parchment p-4">
              <p className="font-semibold text-ink">{p.text}</p>
              {p.created_by === userId && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="flex-1 !py-2 !text-sm"
                    onClick={() => handleSave(p)}
                    disabled={savedIds.has(p.id)}
                  >
                    {savedIds.has(p.id) ? "✓ Saved" : "Save to library"}
                  </Button>
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="flex-1 !py-2 !text-sm"
                    onClick={() => handlePublish(p)}
                    disabled={publishedIds.has(p.id)}
                  >
                    {publishedIds.has(p.id) ? "✓ Published" : "Publish to pool"}
                  </Button>
                </div>
              )}
            </li>
          ))}
          {customPatterns.length === 0 && (
            <p className="text-center text-sm text-parchment/40">No custom patterns yet — add one above.</p>
          )}
        </ul>
      </div>

      {gatedReason && (
        <UpgradePrompt
          reason={gatedReason}
          isEmailLinked={!!account.email}
          onLinkEmail={account.linkEmail}
          returnTo={`/room/${code}/patterns`}
        />
      )}

      {account.email && (
        <div className="w-full">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">
            My library ({library.length})
          </p>
          <ul className="flex w-full flex-col gap-2">
            {library.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl border-2 border-ink/10 bg-parchment p-4"
              >
                <p className="font-semibold text-ink">{p.text}</p>
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="flex-none !py-2 !text-sm"
                  onClick={() => handleAddFromLibraryOrPool(p.text)}
                >
                  Add to this room
                </Button>
              </li>
            ))}
            {library.length === 0 && (
              <p className="text-center text-sm text-parchment/40">
                Nothing saved yet — save one of your patterns above once you&apos;re subscribed.
              </p>
            )}
          </ul>
        </div>
      )}

      <div className="w-full">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">Shared pattern pool</p>
        {account.isSubscribed ? (
          <ul className="flex w-full flex-col gap-2">
            {pool.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl border-2 border-ink/10 bg-parchment p-4"
              >
                <p className="flex-1 font-semibold text-ink">{p.text}</p>
                <div className="flex flex-none gap-2">
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="!py-2 !text-sm"
                    onClick={() => handleAddFromLibraryOrPool(p.text)}
                  >
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="!py-2 !text-sm text-coral"
                    onClick={() => handleReport(p)}
                  >
                    Report
                  </Button>
                </div>
              </li>
            ))}
            {pool.length === 0 && (
              <p className="text-center text-sm text-parchment/40">
                Nobody&apos;s published a pattern yet — be the first!
              </p>
            )}
          </ul>
        ) : (
          <UpgradePrompt
            reason="Browsing the shared pattern pool needs a subscription."
            isEmailLinked={!!account.email}
            onLinkEmail={account.linkEmail}
            returnTo={`/room/${code}/patterns`}
          />
        )}
      </div>

      <Link href={`/room/${code}`} className="mt-2">
        <Button variant="ghost">Back to room</Button>
      </Link>
    </Screen>
  );
}
