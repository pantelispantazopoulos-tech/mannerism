import type { translations } from "@/lib/i18n/translations";

// Supabase RPC errors come back as PostgrestError objects (plain objects
// with a `message` field), not actual Error instances — see the identical
// note in patternsApi.ts. Extract the message the same way regardless of
// shape, without assuming `instanceof Error`.
export function extractErrorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return null;
}

// Maps the exact, fixed English text of every `raise exception` a
// room-scoped RPC can throw (create_room, join_room, start_round,
// skip_round, submit_guess, grade_round, confirm_flirty_pack_consent — see
// supabase/schema.sql) to a translation key, so a host/player in any
// supported language sees the error in their own language instead of raw
// Postgres text. Keyed on the literal message since these functions always
// raise the same fixed string, never templated at runtime.
const KNOWN_ERROR_KEYS: Record<string, keyof (typeof translations)["en"]> = {
  "Must be signed in to join a room": "errMustBeSignedInToJoin",
  "Room not found": "errRoomNotFound",
  "This room has ended": "errRoomEnded",
  "Only the host can start a round": "errOnlyHostCanStart",
  "Round already in progress": "errRoundInProgress",
  "Need at least 2 players to start": "errNeedMorePlayersToStart",
  "No patterns available": "errNoPatternsAvailable",
  "Only the host can skip a mannerism": "errOnlyHostCanSkip",
  "No active round to skip": "errNoActiveRoundToSkip",
  "Round not found": "errRoundNotFound",
  "Round is not active": "errRoundNotActive",
  "Only the guesser can submit a guess": "errOnlyGuesserCanSubmit",
  "Round has not been revealed yet": "errRoundNotRevealed",
  "Round already graded": "errRoundAlreadyGraded",
  "Only the host can grade a round": "errOnlyHostCanGrade",
  "Only the host can confirm this": "errOnlyHostCanConfirm",
};

// Translates an already-extracted error message into the caller's current
// locale via `t`. Falls back to the raw message for anything not in the
// map above (should be rare — every exception these RPCs can raise is
// listed) rather than hiding it behind a vague generic string, and to the
// translated generic fallback when there's no message at all (e.g. a
// network failure).
export function translateErrorMessage(t: (key: string) => string, rawMessage: string | null): string {
  if (!rawMessage) return t("errSomethingWentWrong");
  const key = KNOWN_ERROR_KEYS[rawMessage];
  return key ? t(key) : rawMessage;
}
