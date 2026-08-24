"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { RoomCodeInput } from "@/components/RoomCodeInput";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";
import { useAnonymousAuth } from "@/lib/supabase/useAnonymousAuth";
import { useBackHandler } from "@/lib/capacitor/useBackHandler";
import { createRoom, joinRoom } from "@/lib/game/roomApi";
import { localeNames, supportedLocales } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/supabase/types";
import Link from "next/link";

type Mode = "landing" | "create" | "join";

export default function HomePage() {
  const router = useRouter();
  const { userId, loading: authLoading, error: authError } = useAnonymousAuth();
  const [mode, setMode] = useState<Mode>("landing");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<Locale>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The create/join forms are local `mode` state, not a real route change
  // — there's no browser-history entry for CapacitorBackButton's default
  // router.back()/exitApp() logic to fall back on, so register directly:
  // step back to the landing view first, only let the hardware back
  // button close the app once we're already there.
  useBackHandler(() => {
    if (mode !== "landing") {
      setMode("landing");
      return true;
    }
    return false;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await createRoom(name.trim(), 600, language);
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create room");
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name.trim() || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { room } = await joinRoom(code.trim(), name.trim());
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join room");
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <Screen>
        <Spinner label="Getting things ready…" />
      </Screen>
    );
  }

  if (authError) {
    return (
      <Screen>
        <p className="mt-16 text-center text-coral">
          Couldn&apos;t connect: {authError}. Check your Supabase env vars.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Logo size={72} />
        <ScreenTitle>Mannerism</ScreenTitle>
        <p className="text-center text-lg font-medium text-parchment/60">
          One Guesser. Everyone else acts out a secret mannerism. Can they crack it?
        </p>
      </div>

      {mode === "landing" && (
        <div className="mt-4 flex w-full flex-col gap-4">
          <Button onClick={() => setMode("create")}>Host a room</Button>
          <Button variant="secondary" onClick={() => setMode("join")}>
            Join a room
          </Button>
          <Link href="/premium" className="mt-2 text-center text-sm font-bold text-sage">
            Browse pattern packs →
          </Link>
          <div className="mt-2 flex justify-center gap-4 text-xs font-semibold text-parchment/40">
            <Link href="/privacy" className="hover:text-parchment/60">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-parchment/60">
              Terms
            </Link>
          </div>
        </div>
      )}

      {mode === "create" && (
        <form onSubmit={handleCreate} className="mt-4 flex w-full flex-col gap-4">
          <TextField
            label="Your name"
            placeholder="e.g. Alex"
            value={name}
            maxLength={24}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <label className="block w-full text-left">
            <span className="mb-2 block text-sm font-bold uppercase tracking-wide text-parchment/60">
              Room language
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="w-full rounded-2xl border-2 border-ink/15 bg-parchment px-5 py-4 text-xl font-semibold text-ink focus:border-coral"
            >
              {supportedLocales.map((loc) => (
                <option key={loc} value={loc}>
                  {localeNames[loc]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-medium text-parchment/40">
              Everyone in this room will see the game in this language.
            </span>
          </label>
          {error && <p className="text-center font-semibold text-coral">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create room"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("landing")} disabled={busy}>
            Back
          </Button>
        </form>
      )}

      {mode === "join" && (
        <form onSubmit={handleJoin} className="mt-4 flex w-full flex-col gap-4">
          <RoomCodeInput label="Room code" value={code} onChange={setCode} autoFocus />
          <TextField
            label="Your name"
            placeholder="e.g. Sam"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="text-center font-semibold text-coral">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim() || !code.trim()}>
            {busy ? "Joining…" : "Join room"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("landing")} disabled={busy}>
            Back
          </Button>
        </form>
      )}
    </Screen>
  );
}
