-- =============================================================================
-- Migration: proper packs table (icon_key, is_premium, display_order)
-- =============================================================================
-- Run this on a database that already has 0004_pack_purchases.sql applied.
-- `schema.sql` has already been updated to the post-migration shape, so a
-- *fresh* project should just run schema.sql + seed.sql directly and skip
-- this file entirely; this is only for bringing an existing database
-- forward.
--
-- Order: create + seed `packs` first (patterns.pack_name still exists to
-- seed from) -> add patterns.pack_id and backfill it -> drop/replace every
-- object that references patterns.pack_name (policy, both views) *before*
-- dropping that column, same lesson learned in earlier migrations -> drop
-- the column -> recreate the policy and start_round/skip_round against the
-- new pack_id/packs join shape.
-- =============================================================================

-- 1. New table.
create table if not exists public.packs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  icon_key      text not null,
  is_premium    boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.packs enable row level security;
-- No SELECT policy — same reasoning as `rounds`. The client only ever
-- reaches pack metadata through `pattern_catalog` below.

-- 2. Seed one row per existing distinct pack_name, deriving is_premium from
--    whether every pattern currently in that pack is free.
insert into public.packs (name, icon_key, is_premium, display_order)
select
  pack_name,
  case pack_name
    when 'Starter Pack' then 'starter'
    when 'Spicy Adult Pack' then 'adult'
    when 'Movies & Celebrities Pack' then 'hollywood'
    when 'Office & Coworkers Pack' then 'office'
    else 'starter'
  end,
  not bool_and(is_free),
  case pack_name
    when 'Starter Pack' then 0
    when 'Spicy Adult Pack' then 1
    when 'Movies & Celebrities Pack' then 2
    when 'Office & Coworkers Pack' then 3
    else 99
  end
from public.patterns
group by pack_name
on conflict (name) do nothing;

-- 3. Add + backfill the FK, then require it.
alter table public.patterns add column if not exists pack_id uuid references public.packs (id);

update public.patterns p
set pack_id = pk.id
from public.packs pk
where pk.name = p.pack_name
  and p.pack_id is null;

alter table public.patterns alter column pack_id set not null;

-- 4. Drop/replace everything that still references patterns.pack_name,
--    *before* the column is dropped.
drop policy if exists patterns_select_gated on public.patterns;

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
  -- or insert them among existing ones (Postgres error 42P16, hit live
  -- while first running this migration).
  pk.icon_key,
  pk.display_order
from public.patterns p
join public.packs pk on pk.id = p.pack_id;

grant select on public.pattern_catalog to authenticated;

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
  select 1 from public.players me
  where me.room_id = r.room_id
    and me.user_id = auth.uid()
);

grant select on public.rounds_secure to authenticated;

-- 5. Now safe to drop the old column.
drop index if exists public.patterns_pack_name_idx;
alter table public.patterns drop column if exists pack_name;
create index if not exists patterns_pack_id_idx on public.patterns (pack_id);

-- 6. Recreate the RLS policy against pack_id (has_pack_access still takes a
--    pack *name*, so this resolves it via subquery).
create policy patterns_select_gated
  on public.patterns for select
  to authenticated
  using (
    is_free = true
    or public.has_pack_access(auth.uid(), (select name from public.packs where id = patterns.pack_id))
  );

-- 7. start_round / skip_round — same bodies as before, pool CTE now joins
--    packs instead of reading patterns.pack_name directly.
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
    select pt.id as pattern_id, null::uuid as custom_pattern_id
    from public.patterns pt
    join public.packs pk on pk.id = pt.pack_id
    where (pt.is_free = true or public.has_pack_access(v_room.host_user_id, pk.name))
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
