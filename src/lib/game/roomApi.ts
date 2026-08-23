import { supabase } from "@/lib/supabase/client";
import type { Locale, Player, PatternCatalogRow, Room, RoundSecure } from "@/lib/supabase/types";

// Thin wrappers around the Postgres RPC functions defined in
// supabase/schema.sql. These are the *only* way game state gets mutated —
// there is no direct table insert/update from the client, RLS forbids it.

export async function createRoom(hostName: string, roundSeconds = 600, language: Locale = "en") {
  const { data, error } = await supabase.rpc("create_room", {
    p_host_name: hostName,
    p_round_seconds: roundSeconds,
    p_language: language,
  });
  if (error) throw error;
  return data as unknown as { room: Room; player: Player };
}

export async function joinRoom(code: string, name: string) {
  const { data, error } = await supabase.rpc("join_room", {
    p_code: code,
    p_name: name,
  });
  if (error) throw error;
  return data as unknown as { room: Room; player: Player };
}

export async function startRound(roomId: string) {
  const { data, error } = await supabase.rpc("start_round", { p_room_id: roomId });
  if (error) throw error;
  return data as unknown as { room: Room; round_id: string };
}

export async function skipRound(roomId: string) {
  const { data, error } = await supabase.rpc("skip_round", { p_room_id: roomId });
  if (error) throw error;
  return data as unknown as { room: Room; round_id: string };
}

// Host-only ack that everyone in the room is comfortable with the Flirty &
// Cheeky pack's light physical-contact patterns — see
// confirm_flirty_pack_consent in supabase/schema.sql. Until this is called,
// start_round/skip_round silently exclude that pack from the room's pool.
export async function confirmFlirtyPackConsent(roomId: string) {
  const { data, error } = await supabase.rpc("confirm_flirty_pack_consent", { p_room_id: roomId });
  if (error) throw error;
  return data as unknown as Room;
}

export async function submitGuess(roundId: string, guessText: string) {
  const { error } = await supabase.rpc("submit_guess", {
    p_round_id: roundId,
    p_guess_text: guessText,
  });
  if (error) throw error;
}

export async function gradeRound(roundId: string, correct: boolean) {
  const { error } = await supabase.rpc("grade_round", {
    p_round_id: roundId,
    p_correct: correct,
  });
  if (error) throw error;
}

export async function endRoom(roomId: string) {
  const { error } = await supabase.rpc("end_room", { p_room_id: roomId });
  if (error) throw error;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlayers(roomId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getRoundSecure(roundId: string): Promise<RoundSecure | null> {
  const { data, error } = await supabase
    .from("rounds_secure")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Pack listing for the /premium page, via the `pattern_catalog` view so
// locked premium pack names/counts still show up (just with text = null).
// See the comment above that view in supabase/schema.sql.
export async function listPatternCatalog(): Promise<PatternCatalogRow[]> {
  const { data, error } = await supabase.from("pattern_catalog").select("*");
  if (error) throw error;
  return data ?? [];
}

// Which packs the current player has individually bought for $1 (see
// has_pack_access in supabase/schema.sql) — used by /premium to show
// "Unlocked" instead of a buy button for packs they already own outright,
// separately from whether they're subscribed.
export async function listMyPackPurchases(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("pack_purchases")
    .select("pack_name")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.pack_name);
}
