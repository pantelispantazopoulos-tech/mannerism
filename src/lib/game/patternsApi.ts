import { supabase } from "@/lib/supabase/client";
import type { CustomPattern, LibraryPattern, PublicPattern } from "@/lib/supabase/types";

// The save/publish RPCs raise an exception prefixed with this string when
// the caller isn't subscribed (see supabase/schema.sql). The UI matches on
// it to show an upgrade prompt instead of a generic error toast.
const SUBSCRIPTION_REQUIRED_PREFIX = "SUBSCRIPTION_REQUIRED:";

// Supabase RPC errors come back as PostgrestError objects, which are plain
// objects with a `message` field — not actual Error instances — so error
// handling here can't rely on `instanceof Error` alone.
export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return undefined;
}

export function isSubscriptionRequiredError(err: unknown): boolean {
  const message = getErrorMessage(err);
  return typeof message === "string" && message.includes(SUBSCRIPTION_REQUIRED_PREFIX);
}

// Free, no login beyond the anonymous session already in place. Also used
// to "add" a library/shared-pool pattern into the current room — that's
// just creating a new session-scoped copy with the same text.
export async function createCustomPattern(roomId: string, text: string): Promise<CustomPattern> {
  const { data, error } = await supabase.rpc("create_custom_pattern", {
    p_room_id: roomId,
    p_text: text,
  });
  if (error) throw error;
  return data as unknown as CustomPattern;
}

export async function savePatternToLibrary(text: string): Promise<LibraryPattern> {
  const { data, error } = await supabase.rpc("save_pattern_to_library", { p_text: text });
  if (error) throw error;
  return data as unknown as LibraryPattern;
}

export async function publishPatternToPool(text: string): Promise<PublicPattern> {
  const { data, error } = await supabase.rpc("publish_pattern_to_pool", { p_text: text });
  if (error) throw error;
  return data as unknown as PublicPattern;
}

export async function reportPublicPattern(id: string): Promise<void> {
  const { error } = await supabase.rpc("report_public_pattern", { p_id: id });
  if (error) throw error;
}

export async function getRoomCustomPatterns(roomId: string): Promise<CustomPattern[]> {
  const { data, error } = await supabase
    .from("custom_patterns")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// RLS scopes this to the caller's own rows, but filtering explicitly keeps
// the query's intent obvious.
export async function getMyLibrary(userId: string): Promise<LibraryPattern[]> {
  const { data, error } = await supabase
    .from("pattern_library")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// RLS silently returns an empty list for non-subscribers (see
// public_patterns_select_subscribed in supabase/schema.sql) rather than an
// error — the UI decides whether to show this list or an upgrade prompt
// based on the caller's own subscription status, not on whether this
// happens to come back empty.
export async function getPublicPatternPool(): Promise<PublicPattern[]> {
  const { data, error } = await supabase
    .from("public_patterns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
