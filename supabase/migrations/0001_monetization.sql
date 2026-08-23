-- =============================================================================
-- Migration: custom patterns + accounts/subscriptions + Stripe monetization
-- =============================================================================
-- Run this on a database that already has the original schema.sql applied
-- (rooms/players/patterns/rounds, the old `premium_unlocked` flag). It's
-- NOT idempotent the same way schema.sql is — run it once. `schema.sql`
-- has already been updated to the post-migration shape, so a *fresh*
-- project should just run schema.sql + seed.sql directly and skip this
-- file entirely; this is only for bringing an existing database forward.
--
-- Order matters here: the old `patterns_select_gated` policy and
-- `pattern_catalog` view both reference `rooms.premium_unlocked`, so they
-- have to be dropped/replaced *before* that column can be dropped, and the
-- new `is_subscribed()` helper has to exist before anything that uses it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New tables (no dependencies on existing objects, safe to create first)
-- -----------------------------------------------------------------------------

create table if not exists public.custom_patterns (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  created_by uuid not null,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text,
  subscription_status     text not null default 'free'
                            check (subscription_status in ('free', 'active', 'past_due', 'canceled')),
  subscribed_until        timestamptz,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.pattern_library (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  created_at timestamptz not null default now()
);

create table if not exists public.public_patterns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  text       text not null check (char_length(trim(text)) between 3 and 200),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists custom_patterns_room_id_idx on public.custom_patterns (room_id);
create index if not exists pattern_library_user_id_idx on public.pattern_library (user_id);
create index if not exists public_patterns_created_at_idx on public.public_patterns (created_at desc);

alter table public.custom_patterns enable row level security;
alter table public.users           enable row level security;
alter table public.pattern_library enable row level security;
alter table public.public_patterns enable row level security;

-- -----------------------------------------------------------------------------
-- 2. auth.users -> public.users sync trigger
-- -----------------------------------------------------------------------------

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
-- 3. is_subscribed() helper — needed before we touch anything that uses it
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 4. Drop the old premium_unlocked-based policy/view before the column goes
-- -----------------------------------------------------------------------------

drop policy if exists patterns_select_gated on public.patterns;

create or replace view public.pattern_catalog
  with (security_invoker = false)
as
select
  p.id,
  p.pack_name,
  p.is_free,
  case
    when p.is_free = true then p.text_i18n ->> 'en'
    when public.is_subscribed(auth.uid()) then p.text_i18n ->> 'en'
    else null
  end as text
from public.patterns p;

grant select on public.pattern_catalog to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Now safe to drop premium_unlocked, and re-add the patterns policy
-- -----------------------------------------------------------------------------

alter table public.rooms drop column if exists premium_unlocked;

create policy patterns_select_gated
  on public.patterns for select
  to authenticated
  using (is_free = true or public.is_subscribed(auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. rounds: pattern_id becomes optional, custom_pattern_id is added
-- -----------------------------------------------------------------------------

alter table public.rounds alter column pattern_id drop not null;

alter table public.rounds
  add column if not exists custom_pattern_id uuid references public.custom_patterns (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_pattern_source_check'
  ) then
    alter table public.rounds
      add constraint rounds_pattern_source_check check (
        (pattern_id is not null and custom_pattern_id is null) or
        (pattern_id is null and custom_pattern_id is not null)
      );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. rounds_secure — updated to resolve pattern text from either source
-- -----------------------------------------------------------------------------

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
    when r.status = 'revealed' then coalesce(p.text_i18n ->> rm.language, p.text_i18n ->> 'en', cp.text)
    when gp.user_id = auth.uid() then null
    else coalesce(p.text_i18n ->> rm.language, p.text_i18n ->> 'en', cp.text)
  end as pattern_text,
  case
    when r.status = 'revealed' then coalesce(p.pack_name, 'Custom')
    when gp.user_id = auth.uid() then null
    else coalesce(p.pack_name, 'Custom')
  end as pattern_pack_name
from public.rounds r
left join public.patterns p on p.id = r.pattern_id
left join public.custom_patterns cp on cp.id = r.custom_pattern_id
join public.players gp on gp.id = r.guesser_player_id
join public.rooms rm on rm.id = r.room_id
where exists (
  select 1 from public.players me
  where me.room_id = r.room_id
    and me.user_id = auth.uid()
);

grant select on public.rounds_secure to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RLS policies for the new tables
-- -----------------------------------------------------------------------------

drop policy if exists custom_patterns_select_room_members on public.custom_patterns;
create policy custom_patterns_select_room_members
  on public.custom_patterns for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users for select
  to authenticated
  using (id = auth.uid());

drop policy if exists pattern_library_select_own on public.pattern_library;
create policy pattern_library_select_own
  on public.pattern_library for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists public_patterns_select_subscribed on public.public_patterns;
create policy public_patterns_select_subscribed
  on public.public_patterns for select
  to authenticated
  using (is_hidden = false and public.is_subscribed(auth.uid()));

-- -----------------------------------------------------------------------------
-- 9. start_round — combined pool (catalog + this room's custom patterns),
--    premium packs gated by the HOST's subscription instead of the old
--    premium_unlocked flag
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
  v_host_subscribed   boolean;
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
  if v_player_count < 4 then
    raise exception 'Need at least 4 players to start';
  end if;

  select * into v_guesser
  from public.players
  where room_id = p_room_id and has_been_guesser = false
  order by random()
  limit 1;

  if not found then
    update public.players set has_been_guesser = false where room_id = p_room_id;
    select * into v_guesser
    from public.players
    where room_id = p_room_id
    order by random()
    limit 1;
  end if;

  v_host_subscribed := public.is_subscribed(v_room.host_user_id);

  with pool as (
    select id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns
    where (is_free = true or v_host_subscribed)
      and id not in (
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
      select id as pattern_id, null::uuid as custom_pattern_id
      from public.patterns
      where (is_free = true or v_host_subscribed)
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
-- 10. New RPCs: create/save/publish/report patterns
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
-- 11. Realtime — custom_patterns joins rooms/players on the publication
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_patterns'
  ) then
    alter publication supabase_realtime add table public.custom_patterns;
  end if;
end $$;
