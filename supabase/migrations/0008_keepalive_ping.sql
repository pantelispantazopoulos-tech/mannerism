-- Single-row heartbeat table for the automated Supabase keepalive workflow
-- (.github/workflows/supabase-keepalive.yml). Free-tier Supabase projects auto-pause
-- after ~7 days with no real database activity; a plain anon-key REST read
-- did not reset that clock (confirmed 2026-09-12), so the keepalive now
-- performs an actual write instead, via the service_role key (bypasses RLS).
create table if not exists keepalive_ping (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint keepalive_ping_singleton check (id = 1)
);

alter table keepalive_ping enable row level security;
-- Deliberately no policies: only the service_role key (used exclusively by
-- the keepalive script) can read/write this table; anon/authenticated
-- clients get nothing, which is correct since this table has no product use.

insert into keepalive_ping (id, pinged_at) values (1, now())
on conflict (id) do update set pinged_at = excluded.pinged_at;
