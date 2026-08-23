// Hand-written types mirroring supabase/schema.sql.
// If you add columns/tables, update this alongside the SQL (or generate it
// with `supabase gen types typescript` once the project is linked).

export type RoomStatus = "lobby" | "active" | "reveal" | "ended";
export type RoundStatus = "active" | "revealed" | "skipped";
export type SubscriptionStatus = "free" | "active" | "past_due" | "canceled";

// Keep this list in sync with the `language` check constraint on
// `public.rooms` in supabase/schema.sql and the keys used in every
// pattern's `text_i18n` jsonb blob (see supabase/seed.sql).
export type Locale = "en" | "el" | "fr" | "it" | "es" | "ru" | "de";

// NOTE: these are `type` aliases, not `interface`s, on purpose. When they're
// referenced from inside the `Database` type below, supabase-js's generic
// inference for `.rpc()` / `.from()` silently breaks if the Row/Insert/etc.
// fields point at named interfaces instead of plain object types — the
// conditional types it uses to resolve `Database['public']` don't expand
// interfaces the same way. Object type aliases work fine. (Confirmed by
// bisecting against a minimal repro; this is why official
// `supabase gen types typescript` output also always uses `type`, never
// `interface`, for table rows.)
export type Room = {
  id: string;
  code: string;
  host_user_id: string;
  status: RoomStatus;
  language: Locale;
  round_number: number;
  current_round_id: string | null;
  current_guesser_player_id: string | null;
  round_seconds: number;
  round_started_at: string | null;
  // Host-only consent ack for the Flirty & Cheeky pack (light physical
  // contact patterns). Sticky per room — see confirm_flirty_pack_consent.
  flirty_consent_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  is_host: boolean;
  has_been_guesser: boolean;
  score: number;
  joined_at: string;
};

// Mirrors `public.packs`. No RLS SELECT policy grants direct client reads
// (same as `rounds`) — the client only ever sees this data through the
// `pattern_catalog` view, which folds icon_key/display_order into
// PatternCatalogRow below. Kept here anyway for completeness/parity with
// what `supabase gen types typescript` would emit.
export type Pack = {
  id: string;
  name: string;
  icon_key: string;
  is_premium: boolean;
  display_order: number;
  created_at: string;
};

export type Pattern = {
  id: string;
  text_i18n: Partial<Record<Locale, string>>;
  pack_id: string;
  is_free: boolean;
  created_at: string;
};

// Free, no-login, room-session-only patterns players type in live. See
// supabase/schema.sql for why this is a separate table from `patterns`.
export type CustomPattern = {
  id: string;
  room_id: string;
  created_by: string;
  text: string;
  created_at: string;
};

// Mirrors `public.users` — only exists for players who've linked an email
// (see useAccount.ts). subscription_status/subscribed_until are the only
// fields the Stripe webhook writes to; everything else is set once.
export type AppUser = {
  id: string;
  email: string | null;
  subscription_status: SubscriptionStatus;
  subscribed_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LibraryPattern = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
};

export type PublicPattern = {
  id: string;
  user_id: string;
  text: string;
  is_hidden: boolean;
  created_at: string;
};

// A one-time $1 unlock of a single premium pack — an alternative to
// subscribing. Only ever inserted by the Stripe webhook (service role).
export type PackPurchase = {
  id: string;
  user_id: string;
  pack_name: string;
  stripe_payment_intent_id: string | null;
  purchased_at: string;
};

// Row shape from the `pattern_catalog` view. `text` is null when the
// pattern is premium and the caller isn't subscribed/hasn't purchased that
// pack. icon_key/display_order come from a join to `packs` — see the view
// definition in supabase/schema.sql.
export type PatternCatalogRow = {
  id: string;
  pack_name: string;
  icon_key: string;
  display_order: number;
  is_free: boolean;
  text: string | null;
};

// Row shape returned by the `rounds_secure` view. `pattern_text` /
// `pattern_pack_name` are null for the guesser until the round is revealed
// — see the CASE logic in supabase/schema.sql.
export type RoundSecure = {
  id: string;
  room_id: string;
  round_number: number;
  guesser_player_id: string;
  guesser_name: string;
  status: RoundStatus;
  guess_text: string | null;
  guess_correct: boolean | null;
  created_at: string;
  revealed_at: string | null;
  pattern_text: string | null;
  pattern_pack_name: string | null;
};

// `rounds` deliberately has no entry here — clients never query it
// directly (no RLS SELECT policy grants that either); it's only reached
// through the `rounds_secure` view. See supabase/schema.sql.
export interface Database {
  // Matches the shape `supabase gen types typescript` emits, so this file
  // can be swapped for a generated one later without touching call sites.
  __InternalSupabase: { PostgrestVersion: string };
  public: {
    Tables: {
      rooms: { Row: Room; Insert: Partial<Room>; Update: Partial<Room>; Relationships: [] };
      players: { Row: Player; Insert: Partial<Player>; Update: Partial<Player>; Relationships: [] };
      packs: { Row: Pack; Insert: Partial<Pack>; Update: Partial<Pack>; Relationships: [] };
      patterns: { Row: Pattern; Insert: Partial<Pattern>; Update: Partial<Pattern>; Relationships: [] };
      custom_patterns: {
        Row: CustomPattern;
        Insert: Partial<CustomPattern>;
        Update: Partial<CustomPattern>;
        Relationships: [];
      };
      users: { Row: AppUser; Insert: Partial<AppUser>; Update: Partial<AppUser>; Relationships: [] };
      pattern_library: {
        Row: LibraryPattern;
        Insert: Partial<LibraryPattern>;
        Update: Partial<LibraryPattern>;
        Relationships: [];
      };
      public_patterns: {
        Row: PublicPattern;
        Insert: Partial<PublicPattern>;
        Update: Partial<PublicPattern>;
        Relationships: [];
      };
      pack_purchases: {
        Row: PackPurchase;
        Insert: Partial<PackPurchase>;
        Update: Partial<PackPurchase>;
        Relationships: [];
      };
    };
    Views: {
      rounds_secure: { Row: RoundSecure; Relationships: [] };
      pattern_catalog: { Row: PatternCatalogRow; Relationships: [] };
    };
    Functions: {
      create_room: {
        Args: { p_host_name: string; p_round_seconds?: number; p_language?: Locale };
        Returns: { room: Room; player: Player };
      };
      join_room: {
        Args: { p_code: string; p_name: string };
        Returns: { room: Room; player: Player };
      };
      start_round: {
        Args: { p_room_id: string };
        Returns: { room: Room; round_id: string };
      };
      skip_round: {
        Args: { p_room_id: string };
        Returns: { room: Room; round_id: string };
      };
      confirm_flirty_pack_consent: {
        Args: { p_room_id: string };
        Returns: Room;
      };
      submit_guess: {
        Args: { p_round_id: string; p_guess_text: string };
        Returns: void;
      };
      grade_round: {
        Args: { p_round_id: string; p_correct: boolean };
        Returns: void;
      };
      end_room: {
        Args: { p_room_id: string };
        Returns: void;
      };
      create_custom_pattern: {
        Args: { p_room_id: string; p_text: string };
        Returns: CustomPattern;
      };
      save_pattern_to_library: {
        Args: { p_text: string };
        Returns: LibraryPattern;
      };
      publish_pattern_to_pool: {
        Args: { p_text: string };
        Returns: PublicPattern;
      };
      report_public_pattern: {
        Args: { p_id: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
