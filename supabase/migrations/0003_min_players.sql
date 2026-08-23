-- =============================================================================
-- Migration: lower the minimum player count from 4 to 2
-- =============================================================================
-- Run this on a database that already has 0002_skip_round.sql applied.
-- `schema.sql` has already been updated to the post-migration shape, so a
-- *fresh* project should just run schema.sql + seed.sql directly and skip
-- this file entirely; this is only for bringing an existing database
-- forward.
--
-- start_round has no other dependents to worry about (unlike the earlier
-- migrations), so this is a straight create-or-replace with just the
-- player-count floor changed from 4 to 2 — the rest of the function is
-- identical to the one already live (including skip_round support from
-- 0002). Copy-pasting the whole body because Postgres has no partial
-- ALTER FUNCTION for a function body.
-- =============================================================================

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
