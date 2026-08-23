-- =============================================================================
-- Migration: skip_round — host can bail on the current mannerism
-- =============================================================================
-- Run this on a database that already has 0001_monetization.sql applied.
-- `schema.sql` has already been updated to the post-migration shape, so a
-- *fresh* project should just run schema.sql + seed.sql directly and skip
-- this file entirely; this is only for bringing an existing database
-- forward.
-- =============================================================================

-- 1. Allow 'skipped' as a rounds.status value. The constraint was created
--    inline without an explicit name, so Postgres auto-named it
--    <table>_<column>_check.
alter table public.rounds drop constraint if exists rounds_status_check;
alter table public.rounds
  add constraint rounds_status_check check (status in ('active', 'revealed', 'skipped'));

-- 2. The skip_round RPC itself — see the matching comment in schema.sql for
--    the full rationale (keeps the same guesser, mirrors start_round's
--    pattern-selection logic, resets the timer).
create or replace function public.skip_round(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room              public.rooms;
  v_old_round         public.rounds;
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
