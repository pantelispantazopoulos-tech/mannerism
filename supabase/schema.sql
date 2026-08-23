-- =============================================================================
-- Mannerism — Supabase schema
-- =============================================================================
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh
-- project. It sets up:
--   1. Tables: rooms, players, patterns, custom_patterns, rounds, users,
--      pattern_library, public_patterns
--   2. Row Level Security (RLS) so the app can run entirely from the browser
--      with the public anon key + anonymous auth (no server needed)
--   3. A `rounds_secure` view that hides the secret pattern from the Guesser
--      until the round is revealed — this is the core anti-cheat mechanism
--   4. SECURITY DEFINER RPC functions that are the *only* way to mutate game
--      state (create room, join room, start round, submit guess, grade round,
--      create/save/publish/report a pattern)
--   5. Realtime publication for `rooms`, `players`, and `custom_patterns`
--      (NOT `rounds` — see the comment above `rounds_secure` for why)
--
-- Auth model — two tiers:
--   - Every device signs in with Supabase Anonymous Auth
--     (supabase.auth.signInAnonymously()) on first load. That gives each
--     browser a stable auth.uid() with no signup form, which is what
--     `players.user_id` and `rooms.host_user_id` point at. This is enough
--     to host/join rooms and add free, session-only custom patterns.
--   - A player who wants to save patterns permanently, publish to the
--     shared pool, or subscribe links an email to that *same* anonymous
--     session via `supabase.auth.updateUser({ email })` (Supabase's
--     documented anonymous-to-permanent upgrade path). auth.uid() never
--     changes, so their room history/identity carries over — they just
--     gain an email. Once confirmed, a row appears in `public.users` (see
--     the trigger below), which is what subscription state hangs off of.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.rooms (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique,
  host_user_id             uuid not null,
  status                   text not null default 'lobby'
                             check (status in ('lobby', 'active', 'reveal', 'ended')),
  -- Chosen by the host when the room is created (see create_room). Drives
  -- every piece of in-room UI text and pattern text for *all* players in
  -- the room, via the LocaleProvider on the client and the text_i18n
  -- lookups in rounds_secure/pattern_catalog below.
  language                 text not null default 'en'
                             check (language in ('en', 'el', 'fr', 'it', 'es', 'ru', 'de')),
  round_number             integer not null default 0,
  current_round_id         uuid, -- fk added below, after `rounds` exists
  current_guesser_player_id uuid,
  round_seconds            integer not null default 600,
  round_started_at         timestamptz,
  -- Host-only confirmation gate for the Flirty & Cheeky pack (see packs
  -- below): some of its patterns involve light physical contact, so
  -- start_round/skip_round exclude that pack's patterns from this room's
  -- pool until the host confirms consent via confirm_flirty_pack_consent.
  -- Sticky per room, not per round — the host confirms once per room.
  flirty_consent_confirmed boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.players (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms (id) on delete cascade,
  user_id           uuid not null,
  name              text not null check (char_length(trim(name)) between 1 and 24),
  is_host           boolean not null default false,
  has_been_guesser  boolean not null default false,
  score             integer not null default 0,
  joined_at         timestamptz not null default now(),
  unique (room_id, user_id)
);

-- One row per pattern pack (Starter, Spicy Adult, Movies & Celebrities,
-- Office & Coworkers, ...). Separated out from `patterns` (which used to
-- just carry a free-text `pack_name` column) so a pack has a stable id to
-- hang metadata off of — an icon, display ordering — without that metadata
-- being duplicated across every pattern row in the pack. No RLS SELECT
-- policy (same reasoning as `rounds` — see rounds_secure below): the client
-- never reads this table directly, only through `pattern_catalog`, which
-- is owned by the table owner and bypasses RLS.
create table if not exists public.packs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  -- Looked up client-side via PackIcon (src/components/icons/PackIcons.tsx)
  -- to render the right inline SVG — not a path/URL, just a small fixed
  -- vocabulary of keys ("starter", "adult", "hollywood", "office", ...).
  icon_key      text not null,
  -- Descriptive, pack-level flag for UI (badges, grouping). The actual
  -- gating decision still lives on `patterns.is_free` per-row (unchanged
  -- by this migration) rather than deriving from this column, so existing
  -- RLS/RPC logic didn't need to change shape — see has_pack_access below.
  is_premium    boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- The fixed, known set of packs this app ships with. Reference data, not
-- demo content — unlike supabase/seed.sql (the actual patterns), this
-- lives in schema.sql so a fresh install always has packs for
-- supabase/seed.sql's patterns to attach to via pack_id.
--
-- ANDROID/PLAY STORE REMINDER: Flirty & Cheeky (below) contains sexual
-- references/innuendo (see supabase/seed.sql's patterns for this pack) and
-- already gets a host consent prompt in-app before use (see
-- confirm_flirty_pack_consent and flirty_consent_confirmed on rooms,
-- further down this file). Before submitting to Play Console, answer the
-- content rating questionnaire HONESTLY based on this pack's actual
-- content — don't undersell it to chase a lower rating. This will likely
-- land the app at a Teen rating rather than Everyone; that's expected and
-- fine, but must be declared correctly, not guessed at or left as
-- whatever the default happens to be.
insert into public.packs (name, icon_key, is_premium, display_order) values
  ('Starter Pack', 'starter', false, 0),
  ('Flirty & Cheeky', 'adult', true, 1),
  ('Movies & Celebrities Pack', 'hollywood', true, 2),
  ('Office & Coworkers Pack', 'office', true, 3)
on conflict (name) do nothing;

create table if not exists public.patterns (
  id         uuid primary key default gen_random_uuid(),
  -- One row per pattern, translated into every supported language rather
  -- than one row per (pattern, language) pair — that keeps random
  -- selection and "don't repeat a pattern in this room" logic in
  -- start_round simple, since it's still choosing from one pool per pack,
  -- not per pack-per-language. Shape: {"en": "...", "el": "...", "fr":
  -- "...", "it": "...", "es": "...", "ru": "...", "de": "..."}. Views
  -- below pick the right key for the room's language, falling back to
  -- English if a translation is ever missing.
  text_i18n  jsonb not null,
  pack_id    uuid not null references public.packs (id),
  -- true  = included in the free starter pack, always playable
  -- false = belongs to a premium pack, only usable in a room whose HOST
  --         has an active subscription or has individually purchased this
  --         pack — see has_pack_access() and start_round below.
  -- (MONETIZATION: this used to be a per-room premium_unlocked flag; it's
  -- now driven by the real subscription/purchase system in `public.users`
  -- / `public.pack_purchases`.)
  is_free    boolean not null default true,
  created_at timestamptz not null default now()
);

-- Player-written patterns, scoped to a single room's session. Free, no
-- login required (any anonymous room member can add one) — this is
-- deliberately a *separate* table from `patterns` rather than a "custom"
-- row in it, so the free/no-login path can never accidentally leak into
-- the shared catalog, and so cleanup is automatic (on delete cascade with
-- the room; nothing to garbage-collect).
create table if not exists public.custom_patterns (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  created_by uuid not null,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.rooms (id) on delete cascade,
  round_number       integer not null,
  guesser_player_id  uuid not null references public.players (id),
  -- Exactly one of these is set. A round's pattern comes either from the
  -- shared catalog (starter/premium packs) or from this room's own
  -- custom_patterns — see the combined-pool selection in start_round.
  pattern_id         uuid references public.patterns (id),
  custom_pattern_id  uuid references public.custom_patterns (id),
  status             text not null default 'active'
                       -- 'skipped' = the host bailed on this mannerism before
                       -- anyone guessed (see skip_round below); it's excluded
                       -- from scoring and from the "already used" pool check
                       -- the same way a normal round would be, just with no
                       -- guess ever recorded.
                       check (status in ('active', 'revealed', 'skipped')),
  guess_text         text,
  guess_correct      boolean,
  created_at         timestamptz not null default now(),
  revealed_at        timestamptz,
  constraint rounds_pattern_source_check check (
    (pattern_id is not null and custom_pattern_id is null) or
    (pattern_id is null and custom_pattern_id is not null)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_current_round_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_current_round_id_fkey
      foreign key (current_round_id) references public.rounds (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_current_guesser_player_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_current_guesser_player_id_fkey
      foreign key (current_guesser_player_id) references public.players (id);
  end if;
end $$;

-- One row per real (email-linked) identity. Purely anonymous devices never
-- get a row here — see the trigger below — which is exactly the set of
-- people who could ever have a subscription, a saved library, or a
-- published pattern.
create table if not exists public.users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text,
  subscription_status     text not null default 'free'
                            check (subscription_status in ('free', 'active', 'past_due', 'canceled')),
  subscribed_until        timestamptz,
  -- Populated by the Stripe checkout/webhook routes (src/app/api/stripe/*).
  -- Never set from the browser.
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- A subscriber's private, reusable pattern collection. Gated behind
-- is_subscribed() in save_pattern_to_library — see RPCs below.
create table if not exists public.pattern_library (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  created_at timestamptz not null default now()
);

-- The shared pool subscribers publish into and browse from. Reported
-- patterns are hidden, never deleted, so there's a moderation trail.
create table if not exists public.public_patterns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

-- A one-time, $1 purchase of a single premium pack — an alternative to the
-- $4.99/month subscription for a player who only wants e.g. the Office pack.
-- Written by the Stripe webhook handler (service role, bypasses RLS) after
-- checkout.session.completed on a one-time (`mode: "payment"`) session; the
-- client never inserts here directly. One row per (user, pack) — buying the
-- same pack twice is a no-op via the unique constraint below.
create table if not exists public.pack_purchases (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (id) on delete cascade,
  pack_name                text not null,
  stripe_payment_intent_id text,
  purchased_at             timestamptz not null default now(),
  unique (user_id, pack_name)
);

create index if not exists players_room_id_idx on public.players (room_id);
create index if not exists rounds_room_id_idx on public.rounds (room_id);
create index if not exists patterns_pack_id_idx on public.patterns (pack_id);
create index if not exists custom_patterns_room_id_idx on public.custom_patterns (room_id);
create index if not exists pattern_library_user_id_idx on public.pattern_library (user_id);
create index if not exists pack_purchases_user_id_idx on public.pack_purchases (user_id);
create index if not exists public_patterns_created_at_idx on public.public_patterns (created_at desc);

-- -----------------------------------------------------------------------------
-- auth.users -> public.users sync
-- -----------------------------------------------------------------------------
-- Fires whenever a user is created or their email changes. Anonymous
-- sign-ins insert an auth.users row with email = null, so this is a no-op
-- for them (intentionally — see the table comment on public.users above).
-- Only once `supabase.auth.updateUser({ email })` is confirmed does
-- auth.users.email get set, which is what creates/updates the row here.
create or replace function public.handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    insert into public.users (id, email)
    values (new.id, new.email)
    on conflict (id) do update set email = excluded.email, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upsert on auth.users;
create trigger on_auth_user_upsert
  after insert or update of email on auth.users
  for each row execute function public.handle_auth_user_upsert();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Strategy: enable RLS everywhere. Grant narrow, safe SELECT policies for
-- direct reads the client legitimately needs. Every write goes through a
-- SECURITY DEFINER function below (never direct INSERT/UPDATE/DELETE), so
-- there are intentionally no write policies on these tables.

alter table public.rooms           enable row level security;
alter table public.players         enable row level security;
alter table public.packs           enable row level security;
alter table public.patterns        enable row level security;
alter table public.custom_patterns enable row level security;
alter table public.rounds          enable row level security;
alter table public.users           enable row level security;
alter table public.pattern_library enable row level security;
alter table public.public_patterns enable row level security;
alter table public.pack_purchases  enable row level security;

-- Anyone signed in (including anonymous auth) can look up a room by its
-- share code, and can see the room's own public state (status, round
-- number, current guesser). None of that is sensitive.
create policy rooms_select_authenticated
  on public.rooms for select
  to authenticated
  using (true);

-- Membership check used by several policies below. This has to be a
-- SECURITY DEFINER function rather than an inline `exists (select 1 from
-- public.players ...)` in the policy itself — a policy on `players` that
-- queries `players` re-triggers the same RLS check on the inner query,
-- which Postgres detects as infinite recursion (error 42P17). Running the
-- membership check as the function owner (bypassing RLS internally) breaks
-- that cycle.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Subscription check reused by RLS policies, RPCs, and views. A user
-- counts as subscribed only while subscription_status is 'active' AND
-- subscribed_until hasn't passed — both get updated together by the
-- Stripe webhook handler, but checking both here is cheap insurance
-- against them ever drifting out of sync.
create or replace function public.is_subscribed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = p_user_id
      and subscription_status = 'active'
      and subscribed_until is not null
      and subscribed_until > now()
  );
$$;

-- A player has access to a given pack either by subscribing (unlocks every
-- premium pack) or by having bought that one pack individually for $1 — see
-- public.pack_purchases. Used by pattern_catalog, start_round, and
-- skip_round instead of checking is_subscribed() alone.
create or replace function public.has_pack_access(p_user_id uuid, p_pack_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_subscribed(p_user_id) or exists (
    select 1 from public.pack_purchases
    where user_id = p_user_id and pack_name = p_pack_name
  );
$$;

-- Player rosters are only visible to people already in that room.
create policy players_select_room_members
  on public.players for select
  to authenticated
  using (public.is_room_member(room_id));

-- Free patterns are visible to everyone (used for the starter-pack preview
-- on the premium page). Premium pattern *text* is only readable by
-- subscribers/purchasers of that pattern's pack. (Gameplay delivery doesn't
-- depend on this policy at all — rounds_secure and start_round are
-- SECURITY DEFINER and bypass it; this is a defense-in-depth guard against
-- direct table reads.) has_pack_access() takes the pack's *name*, so this
-- resolves patterns.pack_id -> packs.name via subquery rather than a join,
-- since a USING clause can't join.
create policy patterns_select_gated
  on public.patterns for select
  to authenticated
  using (
    is_free = true
    or public.has_pack_access(auth.uid(), (select name from public.packs where id = patterns.pack_id))
  );

-- No SELECT policy on `packs` itself (same reasoning as `rounds` below) —
-- the client never reads it directly, only through `pattern_catalog`,
-- which is owned by the table owner and bypasses RLS.

-- Custom patterns are visible to the room they belong to, full stop — no
-- subscription needed, matching the "free, no login" design goal.
create policy custom_patterns_select_room_members
  on public.custom_patterns for select
  to authenticated
  using (public.is_room_member(room_id));

-- Users can see their own account/subscription row. Nothing else reads or
-- writes this table from the browser — inserts happen via the trigger
-- above, updates happen via the Stripe webhook using the service role key
-- (which bypasses RLS entirely).
create policy users_select_own
  on public.users for select
  to authenticated
  using (id = auth.uid());

-- A subscriber's library is private to them.
create policy pattern_library_select_own
  on public.pattern_library for select
  to authenticated
  using (user_id = auth.uid());

-- A player can see which packs they've individually purchased (used to
-- render "unlocked" state on the premium page). Writes only ever happen
-- via the Stripe webhook using the service role key.
create policy pack_purchases_select_own
  on public.pack_purchases for select
  to authenticated
  using (user_id = auth.uid());

-- The shared pool is a subscriber perk to browse, and hidden (reported)
-- entries never show up even to subscribers — moderation hides, the row
-- stays for review rather than being deleted.
create policy public_patterns_select_subscribed
  on public.public_patterns for select
  to authenticated
  using (is_hidden = false and public.is_subscribed(auth.uid()));

-- No policy on `rounds` for direct SELECT: rounds are only ever read through
-- the `rounds_secure` view below, so a row that fails those checks is
-- unreadable full stop.

-- -----------------------------------------------------------------------------
-- pattern_catalog — lets the premium-packs screen list ALL pack names/counts
-- -----------------------------------------------------------------------------
-- The `patterns_select_gated` policy above hides entire premium pattern
-- *rows* from non-subscribers, which is correct for direct table access
-- but too strict for browsing: the /premium page needs to show "Movies &
-- Celebrities Pack — 5 patterns" and an Unlock button even for patterns
-- the caller can't read yet. This view (owned by the table owner, so it
-- bypasses the base RLS policy like rounds_secure does) always exposes
-- pack metadata, but masks `text` behind the same subscription check. Not
-- tied to any one room, so unlike rounds_secure below it always shows
-- English — there's no single "the room's language" to key off of here.
-- Also the only place `packs` metadata (icon, ordering) reaches the client
-- — see the comment on `packs` itself for why there's no direct policy.
create or replace view public.pattern_catalog
  with (security_invoker = false)
as
select
  p.id,
  pk.name as pack_name,
  p.is_free,
  case
    when p.is_free = true then p.text_i18n ->> 'en'
    when public.has_pack_access(auth.uid(), pk.name) then p.text_i18n ->> 'en'
    else null
  end as text,
  -- Appended at the end, not interleaved with the original columns above —
  -- CREATE OR REPLACE VIEW can only add columns at the tail, never reorder
  -- or insert them among existing ones (Postgres error 42P16).
  pk.icon_key,
  pk.display_order
from public.patterns p
join public.packs pk on pk.id = p.pack_id;

grant select on public.pattern_catalog to authenticated;

-- -----------------------------------------------------------------------------
-- rounds_secure — the anti-cheat view
-- -----------------------------------------------------------------------------
-- The whole game hinges on the Guesser NOT being able to see the secret
-- pattern while a round is active. Postgres Realtime broadcasts raw table
-- rows, so we deliberately never put `rounds` on the realtime publication
-- (clients instead watch `rooms` for round-change signals and re-query this
-- view over plain REST/select, which *does* enforce the masking below).
--
-- This view is owned by the table owner, so it can read the underlying
-- `rounds`/`patterns`/`custom_patterns` tables even though clients have no
-- direct grant on `rounds` — but it manually re-implements row-level
-- scoping (room membership) and column-level masking (hide pattern
-- text/pack pre-reveal from the guesser) using auth.uid() itself.
--
-- A round's pattern is a left join across *two* possible sources (the
-- shared catalog or this room's custom_patterns — see the check
-- constraint on `rounds`), so both are joined and coalesce() picks
-- whichever one is actually set.
create or replace view public.rounds_secure
  with (security_invoker = false)
as
select
  r.id,
  r.room_id,
  r.round_number,
  r.guesser_player_id,
  gp.name as guesser_name,
  r.status,
  r.guess_text,
  r.guess_correct,
  r.created_at,
  r.revealed_at,
  case
    -- Once revealed, everybody (including the guesser) sees the answer.
    when r.status = 'revealed' then coalesce(p.text_i18n ->> rm.language, p.text_i18n ->> 'en', cp.text)
    -- Pre-reveal: the guesser gets NULL, everyone else sees the pattern.
    when gp.user_id = auth.uid() then null
    else coalesce(p.text_i18n ->> rm.language, p.text_i18n ->> 'en', cp.text)
  end as pattern_text,
  case
    when r.status = 'revealed' then coalesce(pk.name, 'Custom')
    when gp.user_id = auth.uid() then null
    else coalesce(pk.name, 'Custom')
  end as pattern_pack_name
from public.rounds r
left join public.patterns p on p.id = r.pattern_id
left join public.packs pk on pk.id = p.pack_id
left join public.custom_patterns cp on cp.id = r.custom_pattern_id
join public.players gp on gp.id = r.guesser_player_id
join public.rooms rm on rm.id = r.room_id
where exists (
  -- Only members of the round's room can see it at all.
  select 1 from public.players me
  where me.room_id = r.room_id
    and me.user_id = auth.uid()
);

grant select on public.rounds_secure to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public._generate_room_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I, easy to read aloud
  new_code text;
  attempt int := 0;
begin
  loop
    new_code := '';
    for i in 1..5 loop
      new_code := new_code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;

    exit when not exists (select 1 from public.rooms where code = new_code);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique room code, try again';
    end if;
  end loop;

  return new_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: create_room
-- -----------------------------------------------------------------------------
create or replace function public.create_room(
  p_host_name text,
  p_round_seconds int default 600,
  p_language text default 'en'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms;
  v_player public.players;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to create a room';
  end if;
  if p_round_seconds < 15 or p_round_seconds > 600 then
    raise exception 'round_seconds must be between 15 and 600';
  end if;
  if p_language not in ('en', 'el', 'fr', 'it', 'es', 'ru', 'de') then
    raise exception 'Unsupported language: %', p_language;
  end if;

  insert into public.rooms (code, host_user_id, round_seconds, language)
  values (public._generate_room_code(), auth.uid(), p_round_seconds, p_language)
  returning * into v_room;

  insert into public.players (room_id, user_id, name, is_host)
  values (v_room.id, auth.uid(), trim(p_host_name), true)
  returning * into v_player;

  return json_build_object('room', row_to_json(v_room), 'player', row_to_json(v_player));
end;
$$;

grant execute on function public.create_room(text, int, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: join_room
-- -----------------------------------------------------------------------------
create or replace function public.join_room(p_code text, p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms;
  v_player public.players;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to join a room';
  end if;

  select * into v_room from public.rooms where code = upper(trim(p_code));
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.status = 'ended' then
    raise exception 'This room has ended';
  end if;

  insert into public.players (room_id, user_id, name)
  values (v_room.id, auth.uid(), trim(p_name))
  on conflict (room_id, user_id)
    do update set name = excluded.name
  returning * into v_player;

  return json_build_object('room', row_to_json(v_room), 'player', row_to_json(v_player));
end;
$$;

grant execute on function public.join_room(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: start_round — also used for "next round" (host only)
-- -----------------------------------------------------------------------------
create or replace function public.start_round(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room              public.rooms;
  v_player_count      int;
  v_guesser           public.players;
  v_pattern_id        uuid;
  v_custom_pattern_id uuid;
  v_round             public.rounds;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can start a round';
  end if;
  if v_room.status not in ('lobby', 'reveal') then
    raise exception 'Round already in progress';
  end if;

  select count(*) into v_player_count from public.players where room_id = p_room_id;
  -- 2 is the floor for the game to make sense at all: one Guesser and at
  -- least one other player to share the secret mannerism.
  if v_player_count < 2 then
    raise exception 'Need at least 2 players to start';
  end if;

  -- Pick the next guesser: prefer someone who hasn't gone yet this cycle.
  select * into v_guesser
  from public.players
  where room_id = p_room_id and has_been_guesser = false
  order by random()
  limit 1;

  if not found then
    -- Everyone has had a turn — start a fresh rotation cycle.
    update public.players set has_been_guesser = false where room_id = p_room_id;

    select * into v_guesser
    from public.players
    where room_id = p_room_id
    order by random()
    limit 1;
  end if;

  -- Premium packs ride on the HOST's access, not each individual player's —
  -- whoever hosts brings their subscription (or individually purchased
  -- packs, see has_pack_access) to the room for everyone playing in it.
  -- Build one combined pool — the shared catalog (starter pack, plus any
  -- premium pack the host has access to) and this room's own custom
  -- patterns (always eligible, free, no subscription needed) — and pick a
  -- single random row across both, preferring ones not yet used this room.
  with pool as (
    select pt.id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns pt
    join public.packs pk on pk.id = pt.pack_id
    where (pt.is_free = true or public.has_pack_access(v_room.host_user_id, pk.name))
      -- Flirty & Cheeky's patterns involve light physical contact — hold
      -- them out of the pool until the host has confirmed consent for
      -- this room (see flirty_consent_confirmed on rooms).
      and (pk.name <> 'Flirty & Cheeky' or v_room.flirty_consent_confirmed)
      and pt.id not in (
        select pattern_id from public.rounds
        where room_id = p_room_id and pattern_id is not null
      )
    union all
    select null::uuid, id
    from public.custom_patterns
    where room_id = p_room_id
      and id not in (
        select custom_pattern_id from public.rounds
        where room_id = p_room_id and custom_pattern_id is not null
      )
  )
  select pattern_id, custom_pattern_id into v_pattern_id, v_custom_pattern_id
  from pool
  order by random()
  limit 1;

  if v_pattern_id is null and v_custom_pattern_id is null then
    -- Every eligible pattern has been used already — allow repeats, same
    -- combined pool minus the "not yet used" exclusion.
    with pool as (
      select pt.id as pattern_id, null::uuid as custom_pattern_id
      from public.patterns pt
      join public.packs pk on pk.id = pt.pack_id
      where (pt.is_free = true or public.has_pack_access(v_room.host_user_id, pk.name))
        and (pk.name <> 'Flirty & Cheeky' or v_room.flirty_consent_confirmed)
      union all
      select null::uuid, id
      from public.custom_patterns
      where room_id = p_room_id
    )
    select pattern_id, custom_pattern_id into v_pattern_id, v_custom_pattern_id
    from pool
    order by random()
    limit 1;
  end if;

  if v_pattern_id is null and v_custom_pattern_id is null then
    raise exception 'No patterns available';
  end if;

  insert into public.rounds (room_id, round_number, guesser_player_id, pattern_id, custom_pattern_id, status)
  values (p_room_id, v_room.round_number + 1, v_guesser.id, v_pattern_id, v_custom_pattern_id, 'active')
  returning * into v_round;

  update public.players set has_been_guesser = true where id = v_guesser.id;

  update public.rooms
  set status = 'active',
      round_number = v_room.round_number + 1,
      current_round_id = v_round.id,
      current_guesser_player_id = v_guesser.id,
      round_started_at = now(),
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return json_build_object('room', row_to_json(v_room), 'round_id', v_round.id);
end;
$$;

grant execute on function public.start_round(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: skip_round — host-only "I don't want to play this one" button. Bails
-- on the current mannerism before anyone's guessed, keeps the SAME guesser
-- (their turn isn't wasted, they just never saw the discarded pattern
-- either way), and deals a fresh one with a reset timer. Mirrors the
-- pattern-selection half of start_round rather than calling it, since
-- start_round always rolls a new (random) guesser.
-- -----------------------------------------------------------------------------
create or replace function public.skip_round(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room              public.rooms;
  v_old_round         public.rounds;
  v_pattern_id        uuid;
  v_custom_pattern_id uuid;
  v_round             public.rounds;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can skip a mannerism';
  end if;
  if v_room.status <> 'active' then
    raise exception 'No active round to skip';
  end if;

  select * into v_old_round from public.rounds where id = v_room.current_round_id for update;
  if not found then
    raise exception 'Round not found';
  end if;

  update public.rounds set status = 'skipped' where id = v_old_round.id;

  with pool as (
    select pt.id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns pt
    join public.packs pk on pk.id = pt.pack_id
    where (pt.is_free = true or public.has_pack_access(v_room.host_user_id, pk.name))
      and (pk.name <> 'Flirty & Cheeky' or v_room.flirty_consent_confirmed)
      and pt.id not in (
        select pattern_id from public.rounds
        where room_id = p_room_id and pattern_id is not null
      )
    union all
    select null::uuid, id
    from public.custom_patterns
    where room_id = p_room_id
      and id not in (
        select custom_pattern_id from public.rounds
        where room_id = p_room_id and custom_pattern_id is not null
      )
  )
  select pattern_id, custom_pattern_id into v_pattern_id, v_custom_pattern_id
  from pool
  order by random()
  limit 1;

  if v_pattern_id is null and v_custom_pattern_id is null then
    with pool as (
      select pt.id as pattern_id, null::uuid as custom_pattern_id
      from public.patterns pt
      join public.packs pk on pk.id = pt.pack_id
      where (pt.is_free = true or public.has_pack_access(v_room.host_user_id, pk.name))
        and (pk.name <> 'Flirty & Cheeky' or v_room.flirty_consent_confirmed)
      union all
      select null::uuid, id
      from public.custom_patterns
      where room_id = p_room_id
    )
    select pattern_id, custom_pattern_id into v_pattern_id, v_custom_pattern_id
    from pool
    order by random()
    limit 1;
  end if;

  if v_pattern_id is null and v_custom_pattern_id is null then
    raise exception 'No patterns available';
  end if;

  insert into public.rounds (room_id, round_number, guesser_player_id, pattern_id, custom_pattern_id, status)
  values (p_room_id, v_room.round_number + 1, v_old_round.guesser_player_id, v_pattern_id, v_custom_pattern_id, 'active')
  returning * into v_round;

  update public.rooms
  set round_number = v_room.round_number + 1,
      current_round_id = v_round.id,
      round_started_at = now(),
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return json_build_object('room', row_to_json(v_room), 'round_id', v_round.id);
end;
$$;

grant execute on function public.skip_round(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: confirm_flirty_pack_consent (host only) — one-time-per-room ack that
-- everyone present is comfortable with the Flirty & Cheeky pack's light
-- physical-contact patterns (taps, shoulder bumps, arm touches). Until this
-- is called, start_round/skip_round exclude that pack's patterns from the
-- room's pool even if the host has access to it (see flirty_consent_confirmed
-- on rooms above).
-- -----------------------------------------------------------------------------
create or replace function public.confirm_flirty_pack_consent(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can confirm this';
  end if;

  update public.rooms
  set flirty_consent_confirmed = true, updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.confirm_flirty_pack_consent(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: submit_guess (guesser only)
-- -----------------------------------------------------------------------------
create or replace function public.submit_guess(p_round_id uuid, p_guess_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.rounds;
  v_guesser public.players;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'Round not found';
  end if;
  if v_round.status <> 'active' then
    raise exception 'Round is not active';
  end if;

  select * into v_guesser from public.players where id = v_round.guesser_player_id;
  if v_guesser.user_id <> auth.uid() then
    raise exception 'Only the guesser can submit a guess';
  end if;

  update public.rounds
  set guess_text = trim(p_guess_text),
      status = 'revealed',
      revealed_at = now()
  where id = p_round_id;

  update public.rooms
  set status = 'reveal', updated_at = now()
  where id = v_round.room_id;
end;
$$;

grant execute on function public.submit_guess(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: grade_round — host (or the group, via the host's phone) marks the
-- guess correct/incorrect and awards points. Self-graded, like the original
-- parlor game: the room decides out loud, the host just taps the result.
-- -----------------------------------------------------------------------------
create or replace function public.grade_round(p_round_id uuid, p_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.rounds;
  v_room  public.rooms;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception 'Round not found';
  end if;
  if v_round.status <> 'revealed' then
    raise exception 'Round has not been revealed yet';
  end if;
  if v_round.guess_correct is not null then
    raise exception 'Round already graded';
  end if;

  select * into v_room from public.rooms where id = v_round.room_id;
  if v_room.host_user_id <> auth.uid() then
    raise exception 'Only the host can grade a round';
  end if;

  update public.rounds set guess_correct = p_correct where id = p_round_id;

  if p_correct then
    update public.players set score = score + 1 where id = v_round.guesser_player_id;
  else
    update public.players
    set score = score + 1
    where room_id = v_round.room_id and id <> v_round.guesser_player_id;
  end if;

  -- `rounds` isn't on the realtime publication (see rounds_secure), so
  -- touch `rooms` too — that's what clients are actually subscribed to,
  -- and it's their cue to re-fetch rounds_secure and pick up guess_correct.
  update public.rooms set updated_at = now() where id = v_round.room_id;
end;
$$;

grant execute on function public.grade_round(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: end_room (host only)
-- -----------------------------------------------------------------------------
create or replace function public.end_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rooms
  set status = 'ended', updated_at = now()
  where id = p_room_id and host_user_id = auth.uid();
end;
$$;

grant execute on function public.end_room(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: create_custom_pattern — free, no login beyond the anonymous session
-- already in place, no subscription. Any player already in the room can
-- add one; it becomes part of that room's start_round pool immediately and
-- never leaves the room (see the table comment on custom_patterns).
-- -----------------------------------------------------------------------------
create or replace function public.create_custom_pattern(p_room_id uuid, p_text text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern public.custom_patterns;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'Only players already in the room can add a pattern';
  end if;
  if char_length(trim(p_text)) < 3 then
    raise exception 'Pattern text is too short';
  end if;

  insert into public.custom_patterns (room_id, created_by, text)
  values (p_room_id, auth.uid(), trim(p_text))
  returning * into v_pattern;

  return row_to_json(v_pattern);
end;
$$;

grant execute on function public.create_custom_pattern(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: save_pattern_to_library — SUBSCRIPTION REQUIRED. The 'SUBSCRIPTION_
-- REQUIRED:' prefix on the exception is a convention the client (see
-- src/lib/game/patternsApi.ts) matches on to show an upgrade prompt instead
-- of a generic error message.
-- -----------------------------------------------------------------------------
create or replace function public.save_pattern_to_library(p_text text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pattern_library;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if not public.is_subscribed(auth.uid()) then
    raise exception 'SUBSCRIPTION_REQUIRED: an active subscription is required to save patterns to your library';
  end if;
  if char_length(trim(p_text)) < 3 then
    raise exception 'Pattern text is too short';
  end if;

  insert into public.pattern_library (user_id, text)
  values (auth.uid(), trim(p_text))
  returning * into v_row;

  return row_to_json(v_row);
end;
$$;

grant execute on function public.save_pattern_to_library(text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: publish_pattern_to_pool — SUBSCRIPTION REQUIRED, same convention as
-- save_pattern_to_library above.
-- -----------------------------------------------------------------------------
create or replace function public.publish_pattern_to_pool(p_text text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.public_patterns;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if not public.is_subscribed(auth.uid()) then
    raise exception 'SUBSCRIPTION_REQUIRED: an active subscription is required to publish to the shared pool';
  end if;
  if char_length(trim(p_text)) < 3 then
    raise exception 'Pattern text is too short';
  end if;

  insert into public.public_patterns (user_id, text)
  values (auth.uid(), trim(p_text))
  returning * into v_row;

  return row_to_json(v_row);
end;
$$;

grant execute on function public.publish_pattern_to_pool(text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: report_public_pattern — moderation. Deliberately NOT gated behind a
-- subscription (unlike browsing) — flagging bad content shouldn't require
-- payment. Hides rather than deletes, so there's something to review.
-- -----------------------------------------------------------------------------
create or replace function public.report_public_pattern(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  update public.public_patterns
  set is_hidden = true
  where id = p_id;
end;
$$;

grant execute on function public.report_public_pattern(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- `rooms`, `players`, and `custom_patterns` are broadcast (the last one so
-- the create-pattern screen updates live as other players add patterns).
-- `rounds` is deliberately left off — see the comment on `rounds_secure`
-- above. Clients react to a `rooms` change by re-selecting `rounds_secure`,
-- which applies the masking rules server-side on every fetch.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_patterns'
  ) then
    alter publication supabase_realtime add table public.custom_patterns;
  end if;
end $$;
