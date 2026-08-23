-- =============================================================================
-- Migration: $1 individual pack purchases (alternative to subscribing)
-- =============================================================================
-- Run this on a database that already has 0003_min_players.sql applied.
-- `schema.sql` has already been updated to the post-migration shape, so a
-- *fresh* project should just run schema.sql + seed.sql directly and skip
-- this file entirely; this is only for bringing an existing database
-- forward.
--
-- Order: new table + RLS first (no dependencies) -> has_pack_access()
-- (depends on is_subscribed(), which already exists) -> replace
-- pattern_catalog / patterns_select_gated / start_round / skip_round to use
-- it instead of is_subscribed() alone.
-- =============================================================================

-- 1. New table
create table if not exists public.pack_purchases (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (id) on delete cascade,
  pack_name                text not null,
  stripe_payment_intent_id text,
  purchased_at             timestamptz not null default now(),
  unique (user_id, pack_name)
);

create index if not exists pack_purchases_user_id_idx on public.pack_purchases (user_id);

alter table public.pack_purchases enable row level security;

drop policy if exists pack_purchases_select_own on public.pack_purchases;
create policy pack_purchases_select_own
  on public.pack_purchases for select
  to authenticated
  using (user_id = auth.uid());

-- 2. Helper function
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

-- 3. patterns_select_gated — same defense-in-depth guard, now pack-aware.
drop policy if exists patterns_select_gated on public.patterns;
create policy patterns_select_gated
  on public.patterns for select
  to authenticated
  using (is_free = true or public.has_pack_access(auth.uid(), pack_name));

-- 4. pattern_catalog view — reveal text if the pack was purchased, not just subscribed.
create or replace view public.pattern_catalog
  with (security_invoker = false)
as
select
  p.id,
  p.pack_name,
  p.is_free,
  case
    when p.is_free = true then p.text_i18n ->> 'en'
    when public.has_pack_access(auth.uid(), p.pack_name) then p.text_i18n ->> 'en'
    else null
  end as text
from public.patterns p;

grant select on public.pattern_catalog to authenticated;

-- 5. start_round — same body as 0003_min_players.sql, minus the
--    v_host_subscribed precompute, using has_pack_access() per pattern's
--    pack_name instead.
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
  if v_player_count < 2 then
    raise exception 'Need at least 2 players to start';
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

  with pool as (
    select id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns
    where (is_free = true or public.has_pack_access(v_room.host_user_id, pack_name))
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
      where (is_free = true or public.has_pack_access(v_room.host_user_id, pack_name))
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

-- 6. skip_round — same treatment.
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
    select id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns
    where (is_free = true or public.has_pack_access(v_room.host_user_id, pack_name))
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
      where (is_free = true or public.has_pack_access(v_room.host_user_id, pack_name))
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
