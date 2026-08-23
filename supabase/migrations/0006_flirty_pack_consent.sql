-- =============================================================================
-- Migration: rename Spicy Adult Pack -> Flirty & Cheeky with real content,
-- plus a host consent gate for it (light physical contact patterns).
-- =============================================================================
-- Run this on a database that already has 0005_packs_table.sql applied.
-- `schema.sql` has already been updated to the post-migration shape, so a
-- *fresh* project should just run schema.sql + seed.sql directly and skip
-- this file entirely; this is only for bringing an existing database
-- forward.
-- =============================================================================

-- 1. Rename the pack. Dynamic name lookups (has_pack_access, the RLS
--    policy's subquery, pattern_catalog, rounds_secure, start_round/
--    skip_round) all resolve packs.name live, so renaming the row is
--    sufficient for them — no view/policy/function body references the old
--    literal 'Spicy Adult Pack' string.
update public.packs set name = 'Flirty & Cheeky' where name = 'Spicy Adult Pack';

-- 2. Carry over any existing $1 individual-pack purchases so buyers of the
--    old name don't lose access under the new one (has_pack_access matches
--    pack_purchases.pack_name against packs.name by exact string).
update public.pack_purchases set pack_name = 'Flirty & Cheeky' where pack_name = 'Spicy Adult Pack';

-- 3. Swap the 5 placeholder patterns for the 20 real ones.
delete from public.patterns
where pack_id = (select id from public.packs where name = 'Flirty & Cheeky');

insert into public.patterns (text_i18n, pack_id, is_free) values
  ('{"en":"Compliment something about the person you''re answering before each answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Bite your lip slightly before speaking."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Show some skin while you answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Lightly touch the arm of whoever is sitting closest to you."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Wink at someone new after every answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Lean in slightly closer than normal when answering."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Fan yourself dramatically like they said something hot."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Answer every question like you''re flirting with the asker."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Gently tap the shoulder of the person to your left before speaking."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Speak in a slightly lower, teasing tone than usual."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Play with your collar or sleeve while thinking of an answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Give a slow, playful smile before every answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Answer as if you''re trying to impress a crush."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Brush your hand against the table dramatically before speaking."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Twirl an imaginary mustache like you''re plotting something smooth."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Answer every question with a hint of mock jealousy."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"The person to your left must flirt with someone else in the room before your next answer."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Bump shoulders lightly with your neighbor before speaking."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Speak as if you''re trying to make someone jealous."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false),
  ('{"en":"Act like you have a crush on someone of the same gender sitting nearby."}'::jsonb, (select id from public.packs where name = 'Flirty & Cheeky'), false);

-- 4. Host consent gate: sticky per room, not per round.
alter table public.rooms
  add column if not exists flirty_consent_confirmed boolean not null default false;

-- 5. Gate the Flirty & Cheeky pack out of the pool in both round-selection
--    RPCs until the host has confirmed consent for this room.
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

-- 6. New RPC: host-only, one-time-per-room consent ack.
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
