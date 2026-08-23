"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Spinner } from "@/components/Spinner";
import { PlayerList } from "@/components/PlayerList";
import { PatternCard } from "@/components/PatternCard";
import { RoomCodeBadge } from "@/components/RoomCodeBadge";
import { RoundTimer } from "@/components/RoundTimer";
import { Confetti } from "@/components/Confetti";
import { Logo } from "@/components/Logo";
import { extractErrorMessage, translateErrorMessage } from "@/lib/game/errorMessages";
import { useAnonymousAuth } from "@/lib/supabase/useAnonymousAuth";
import { useAccount } from "@/lib/supabase/useAccount";
import { useRoomState } from "@/lib/game/useRoomState";
import {
  confirmFlirtyPackConsent,
  gradeRound,
  joinRoom,
  listMyPackPurchases,
  skipRound,
  startRound,
  submitGuess,
} from "@/lib/game/roomApi";
import type { Player, RoundSecure } from "@/lib/supabase/types";
import { LocaleProvider, useTranslation } from "@/lib/i18n/LocaleContext";

// The one premium pack whose patterns call for a host consent check before
// a room's first round — see FlirtyConsentPanel below.
const FLIRTY_PACK_NAME = "Flirty & Cheeky";

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { userId, loading: authLoading } = useAnonymousAuth();
  const { room, players, round, myPlayer, loading, error } = useRoomState(
    code.toUpperCase(),
    userId
  );
  // Only the host's pack access matters here (see start_round/skip_round —
  // premium packs ride on whoever hosts, not each player individually), but
  // there's no harm fetching it for every player; it's just their own
  // purchases under RLS.
  const account = useAccount(userId);
  const [purchasedPacks, setPurchasedPacks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    listMyPackPurchases(userId)
      .then((names) => setPurchasedPacks(new Set(names)))
      .catch(() => {});
  }, [userId]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showFlirtyConsent, setShowFlirtyConsent] = useState(false);

  if (authLoading || loading) {
    return (
      <Screen>
        <Spinner label="Loading room…" />
      </Screen>
    );
  }

  // Room (and therefore its language) isn't known yet — this state can't
  // be localized, so it stays in English.
  if (error || !room) {
    return (
      <Screen>
        <ScreenTitle>Hmm.</ScreenTitle>
        <p className="text-center text-parchment/60">{error ?? "Room not found."}</p>
        <Link href="/">
          <Button>Back home</Button>
        </Link>
      </Screen>
    );
  }

  const isHost = myPlayer?.is_host ?? false;
  const isGuesser = myPlayer && room.current_guesser_player_id === myPlayer.id;

  // Whether the host brings the Flirty & Cheeky pack into this room at all
  // (subscribed, or bought it individually) — matches the access check
  // start_round/skip_round make server-side via has_pack_access.
  const hostHasFlirtyAccess = account.isSubscribed || purchasedPacks.has(FLIRTY_PACK_NAME);
  const needsFlirtyConsent = isHost && hostHasFlirtyAccess && !room.flirty_consent_confirmed;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      // Stored untranslated — Supabase RPC errors are plain PostgrestError
      // objects, not Error instances, and either way `run` itself sits
      // outside the LocaleProvider tree below (it's defined in RoomPage,
      // which renders that provider rather than being a descendant of it),
      // so it has no access to the room's language. Translation happens at
      // render time in ActionErrorBanner instead, which does.
      setActionError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const roomId = room.id;

  function handleStartClick() {
    if (needsFlirtyConsent) {
      setShowFlirtyConsent(true);
      return;
    }
    run(() => startRound(roomId));
  }

  function handleConfirmFlirtyConsent() {
    setShowFlirtyConsent(false);
    run(async () => {
      await confirmFlirtyPackConsent(roomId);
      await startRound(roomId);
    });
  }

  // From here on the room (and its language) is known, so everything below
  // renders inside the room's chosen locale — same language for every
  // participant, not a per-device preference.
  return (
    <LocaleProvider locale={room.language}>
      {!myPlayer ? (
        // Not in this room yet (e.g. followed a share link) — ask for a name.
        <JoinPanel code={code} busy={busy} error={actionError} onJoin={(name) => run(() => joinRoom(code, name))} />
      ) : (
        <Screen>
          <ScreenTitle>Mannerism</ScreenTitle>

          {actionError && <ActionErrorBanner message={actionError} />}

          {room.status === "lobby" && (
            <LobbyView
              code={room.code}
              players={players}
              isHost={isHost}
              busy={busy}
              onStart={handleStartClick}
              showFlirtyConsent={showFlirtyConsent}
              onConfirmFlirtyConsent={handleConfirmFlirtyConsent}
              onCancelFlirtyConsent={() => setShowFlirtyConsent(false)}
            />
          )}

          {room.status === "active" && (
            <ActiveRoundView
              key={round?.id}
              isGuesser={!!isGuesser}
              isHost={isHost}
              guesserName={round?.guesser_name ?? ""}
              patternText={round?.pattern_text ?? null}
              startedAt={room.round_started_at}
              seconds={room.round_seconds}
              players={players}
              guesserId={room.current_guesser_player_id}
              busy={busy}
              onSubmitGuess={(guessText) =>
                round && run(() => submitGuess(round.id, guessText))
              }
              onSkip={() => run(() => skipRound(room.id))}
            />
          )}

          {room.status === "reveal" && round && (
            <RevealView
              round={round}
              players={players}
              isHost={isHost}
              busy={busy}
              onGrade={(correct) => run(() => gradeRound(round.id, correct))}
              onNextRound={() => run(() => startRound(room.id))}
            />
          )}

          {room.status === "ended" && <EndedView players={players} />}

          {room.status !== "ended" && <RoomFooterLinks code={room.code} />}
        </Screen>
      )}
    </LocaleProvider>
  );
}

function RoomFooterLinks({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex w-full flex-col gap-3">
      <Link href={`/room/${code}/patterns`}>
        <Button variant="ghost">{t("createPattern")}</Button>
      </Link>
      <Link href="/">
        <Button variant="ghost">{t("exitToHome")}</Button>
      </Link>
    </div>
  );
}

function EndedView({ players }: { players: Player[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-4">
      <p className="text-center text-xl font-bold text-parchment/70">{t("gameOver")}</p>
      <PlayerList players={[...players].sort((a, b) => b.score - a.score)} showScores />
      <Link href="/">
        <Button>{t("backHome")}</Button>
      </Link>
    </div>
  );
}

// The room's language is only known once `room` has loaded, and `run`
// (in RoomPage) sits outside the LocaleProvider tree — see the comment
// there — so `actionError` is stored untranslated and translated here
// instead, where useTranslation() actually resolves to the room's locale.
function ActionErrorBanner({ message }: { message: string }) {
  const { t } = useTranslation();
  return <p className="text-center font-semibold text-coral">{translateErrorMessage(t, message)}</p>;
}

function JoinPanel({
  code,
  busy,
  error,
  onJoin,
}: {
  code: string;
  busy: boolean;
  error: string | null;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const { t } = useTranslation();
  return (
    <Screen>
      <ScreenTitle>{t("joinRoomTitle", { code: code.toUpperCase() })}</ScreenTitle>
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <TextField
          label={t("yourName")}
          placeholder={t("namePlaceholder")}
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="text-center font-semibold text-coral">{translateErrorMessage(t, error)}</p>}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? t("joining") : t("join")}
        </Button>
      </form>
    </Screen>
  );
}

function LobbyView({
  code,
  players,
  isHost,
  busy,
  onStart,
  showFlirtyConsent,
  onConfirmFlirtyConsent,
  onCancelFlirtyConsent,
}: {
  code: string;
  players: Player[];
  isHost: boolean;
  busy: boolean;
  onStart: () => void;
  showFlirtyConsent: boolean;
  onConfirmFlirtyConsent: () => void;
  onCancelFlirtyConsent: () => void;
}) {
  // Matches the floor enforced server-side in start_round (supabase/schema.sql).
  const MIN_PLAYERS = 2;
  const canStart = players.length >= MIN_PLAYERS;
  const { t } = useTranslation();
  const needed = MIN_PLAYERS - players.length;
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Logo size={48} />
      <RoomCodeBadge code={code} />
      <div className="w-full">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">
          {t("playersCount", { count: players.length })}
        </p>
        {/* Waiting-room bob — low amplitude, only while everyone's sitting
            around waiting for the host to start. */}
        <PlayerList players={players} waiting />
      </div>

      {isHost ? (
        showFlirtyConsent ? (
          <FlirtyConsentPanel busy={busy} onConfirm={onConfirmFlirtyConsent} onCancel={onCancelFlirtyConsent} />
        ) : (
          <>
            <Button onClick={onStart} disabled={!canStart || busy}>
              {busy
                ? t("starting")
                : canStart
                ? t("startRound")
                : needed === 1
                ? t("needMorePlayersOne")
                : t("needMorePlayersMany", { count: needed })}
            </Button>
            <Link href="/premium" className="text-sm font-bold text-sage">
              {t("browsePacks")}
            </Link>
          </>
        )
      ) : (
        <p className="text-center font-semibold text-parchment/60">{t("waitingHostStart")}</p>
      )}
    </div>
  );
}

// Host-only, shown once per room in place of the Start button when the host
// brings the Flirty & Cheeky pack but hasn't yet confirmed everyone's
// comfortable with its light physical-contact patterns (taps, shoulder
// bumps, arm touches) — see confirm_flirty_pack_consent in
// supabase/schema.sql. Styled like UpgradePrompt's inline card rather than
// a true modal, matching the rest of the app's panel-based UI.
function FlirtyConsentPanel({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="w-full rounded-3xl border-2 border-coral/40 bg-parchment p-5 text-center shadow-note">
      <p className="text-lg font-black text-ink">🤏 {t("flirtyConsentTitle")}</p>
      <p className="mt-1 text-sm font-medium text-ink/60">{t("flirtyConsentBody")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? t("starting") : t("flirtyConsentConfirm")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("flirtyConsentCancel")}
        </Button>
      </div>
    </div>
  );
}

function ActiveRoundView({
  isGuesser,
  isHost,
  guesserName,
  patternText,
  startedAt,
  seconds,
  players,
  guesserId,
  busy,
  onSubmitGuess,
  onSkip,
}: {
  isGuesser: boolean;
  isHost: boolean;
  guesserName: string;
  patternText: string | null;
  startedAt: string | null;
  seconds: number;
  players: Player[];
  guesserId: string | null;
  busy: boolean;
  onSubmitGuess: (guess: string) => void;
  onSkip: () => void;
}) {
  const [guess, setGuess] = useState("");
  const { t } = useTranslation();

  return (
    <div
      className={[
        "flex w-full flex-col items-center gap-6 rounded-[2rem] p-1",
        // Slow breathing glow around the screen edge while the Guesser is
        // on the spot — a continuous ambient loop, deliberately the one
        // exception to "animations play once."
        isGuesser ? "animate-breathing-glow" : "",
      ].join(" ")}
    >
      <RoundTimer startedAt={startedAt} seconds={seconds} />

      {isGuesser ? (
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <div className="w-full rounded-3xl border-2 border-coral bg-coral/10 p-6">
            <p className="text-2xl font-black text-coral">{t("youAreGuesser")}</p>
            <p className="mt-2 font-medium text-parchment/80">{t("guesserInstructions")}</p>
          </div>
          <form
            className="flex w-full flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (guess.trim()) onSubmitGuess(guess.trim());
            }}
          >
            <TextField
              label={t("yourGuess")}
              placeholder={t("guessPlaceholder")}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
            />
            <Button type="submit" disabled={busy || !guess.trim()}>
              {busy ? t("submitting") : t("submitGuess")}
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-center font-semibold text-parchment/60">
            {t("guesserAsking", { name: guesserName })}
          </p>
          {patternText && <PatternCard text={patternText} />}
        </div>
      )}

      <div className="w-full">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">{t("players")}</p>
        {/* Spotlight sweep across avatars, landing on the newly chosen
            guesser — plays once because ActiveRoundView remounts fresh for
            every new round (it's swapped out for RevealView in between). */}
        <PlayerList players={players} guesserId={guesserId} sweep />
      </div>

      {isHost && (
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          {busy ? t("skipping") : t("skipMannerism")}
        </Button>
      )}
    </div>
  );
}

function RevealView({
  round,
  players,
  isHost,
  busy,
  onGrade,
  onNextRound,
}: {
  round: RoundSecure;
  players: Player[];
  isHost: boolean;
  busy: boolean;
  onGrade: (correct: boolean) => void;
  onNextRound: () => void;
}) {
  const graded = round.guess_correct !== null;
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div
        className={[
          "relative w-full rounded-3xl border-2 border-ink/10 bg-parchment p-5 text-center shadow-note",
          // Incorrect guess: a gentle, playful wobble — never a harsh red flash.
          graded && round.guess_correct === false ? "animate-wobble" : "",
        ].join(" ")}
      >
        {/* Correct guess: a brief coral confetti burst — the one other spot
            (besides key actions) coral is allowed to appear. */}
        {graded && round.guess_correct === true && <Confetti />}
        <p className="text-xs font-bold uppercase tracking-widest text-ink/50">
          {t("guessLabel", { name: round.guesser_name })}
        </p>
        <p className="mt-1 text-xl font-bold text-ink">&ldquo;{round.guess_text}&rdquo;</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-ink/50">
          {t("actualMannerism")}
        </p>
        <p className="mt-1 font-display text-2xl font-bold text-coral">{round.pattern_text}</p>
      </div>

      {!graded && isHost && (
        <div className="flex w-full gap-3">
          <Button variant="success" onClick={() => onGrade(true)} disabled={busy}>
            ✅ {t("correct")}
          </Button>
          <Button variant="danger" onClick={() => onGrade(false)} disabled={busy}>
            ❌ {t("wrong")}
          </Button>
        </div>
      )}
      {!graded && !isHost && (
        <p className="text-center font-semibold text-parchment/60">{t("waitingHostGrade")}</p>
      )}

      {graded && (
        <p className={`text-center text-2xl font-black ${round.guess_correct ? "text-sage" : "text-parchment"}`}>
          {round.guess_correct ? t("gotIt") : t("groupScores")}
        </p>
      )}

      <div className="w-full">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-parchment/50">{t("scores")}</p>
        <PlayerList players={[...players].sort((a, b) => b.score - a.score)} showScores />
      </div>

      {graded && isHost && (
        <Button onClick={onNextRound} disabled={busy}>
          {busy ? t("starting") : t("nextRound")}
        </Button>
      )}
      {graded && !isHost && (
        <p className="text-center font-semibold text-parchment/60">{t("waitingNextRound")}</p>
      )}
    </div>
  );
}
