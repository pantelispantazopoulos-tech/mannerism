"use client";

import type { Player } from "@/lib/supabase/types";
import { useTranslation } from "@/lib/i18n/LocaleContext";
import { useReducedMotion } from "@/lib/theme/useReducedMotion";

// Avatar variety without reaching for a second accent color — coral is
// reserved for key actions/the reveal moment, so these rotate through ink,
// sage, and grayscale instead of the old rainbow of hues.
const AVATAR_SWATCHES = [
  { bg: "bg-ink", text: "text-parchment" },
  { bg: "bg-sage", text: "text-ink" },
  { bg: "bg-gray-500", text: "text-parchment" },
  { bg: "bg-gray-300", text: "text-ink" },
];

function swatchFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_SWATCHES[hash % AVATAR_SWATCHES.length];
}

export function PlayerList({
  players,
  guesserId,
  showScores = false,
  // Waiting-room bob: low-amplitude, only meaningful while everyone's
  // sitting in the lobby waiting for the round to start.
  waiting = false,
  // Spotlight sweep: plays once, staggered across avatars, when a new
  // guesser has just been chosen — the caller re-keys the whole list (see
  // ActiveRoundView) so this replays on every rotation rather than just once.
  sweep = false,
}: {
  players: Player[];
  guesserId?: string | null;
  showScores?: boolean;
  waiting?: boolean;
  sweep?: boolean;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <ul className="flex w-full flex-col gap-2">
      {players.map((player, i) => {
        const swatch = swatchFor(player.id);
        const isGuesser = player.id === guesserId;
        return (
          <li
            key={player.id}
            className={[
              "flex items-center gap-3 rounded-2xl border-2 bg-parchment px-4 py-3",
              isGuesser ? "border-coral" : "border-ink/10",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-black",
                swatch.bg,
                swatch.text,
                waiting && !reducedMotion ? "animate-bob-slow" : "",
                sweep && !reducedMotion ? "animate-spotlight-sweep" : "",
              ].join(" ")}
              style={sweep && !reducedMotion ? { animationDelay: `${i * 70}ms` } : undefined}
            >
              {player.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="flex-1 truncate text-lg font-bold text-ink">
              {player.name}
              {player.is_host && <span className="ml-2 align-middle text-sm">👑</span>}
            </span>
            {isGuesser && (
              <span className="flex-none rounded-full bg-coral px-3 py-1 text-xs font-bold uppercase text-parchment">
                {t("guesserBadge")}
              </span>
            )}
            {showScores && <span className="flex-none text-lg font-black text-ink">{player.score}</span>}
          </li>
        );
      })}
    </ul>
  );
}
