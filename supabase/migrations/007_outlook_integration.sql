-- 007: Microsoft Outlook / Teams integration
--
-- Stores per-user Microsoft OAuth tokens so the outlook-sync edge function can
-- push events to Graph on the user's behalf, plus the sync state on each event.

-- ============================================================
-- 1) Token storage
-- ============================================================
create table if not exists public.ms_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ms_email text not null default '',
  access_token text,
  refresh_token text,
  -- When the current access token stops working. The edge function refreshes
  -- a minute or two before this rather than waiting for a 401.
  expires_at timestamptz,
  scopes text not null default '',
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ms_connections enable row level security;

-- Deliberately NO select policy: with RLS on and no policy, the browser cannot
-- read this table at all, so refresh tokens can never reach the client. The
-- edge function uses the service role key, which bypasses RLS. The client reads
-- connection status through the view below instead.
drop policy if exists "Users can insert own ms_connection" on public.ms_connections;
create policy "Users can insert own ms_connection"
  on public.ms_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ms_connection" on public.ms_connections;
create policy "Users can delete own ms_connection"
  on public.ms_connections for delete
  using (auth.uid() = user_id);

drop trigger if exists ms_connections_updated_at on public.ms_connections;
create trigger ms_connections_updated_at
  before update on public.ms_connections
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Safe status view (no tokens)
-- ============================================================
create or replace view public.ms_connection_status
with (security_invoker = true) as
  select
    user_id,
    ms_email,
    scopes,
    last_error,
    connected_at,
    (refresh_token is not null) as is_connected
  from public.ms_connections;

-- security_invoker means the view runs as the caller, so the policy below is
-- what actually grants access.
drop policy if exists "Users can view own ms_connection status" on public.ms_connections;
create policy "Users can view own ms_connection status"
  on public.ms_connections for select
  using (auth.uid() = user_id);

-- Revoke direct column access to the secrets. The select policy above lets a
-- user read their own row, so lock the token columns at the grant level.
revoke all on public.ms_connections from anon, authenticated;
grant select (user_id, ms_email, scopes, last_error, connected_at, updated_at)
  on public.ms_connections to authenticated;
grant insert (user_id, ms_email, scopes, connected_at) on public.ms_connections to authenticated;
grant delete on public.ms_connections to authenticated;
grant select on public.ms_connection_status to authenticated;

-- ============================================================
-- 3) Event sync state
-- ============================================================
alter table public.events
  add column if not exists outlook_event_id text,
  add column if not exists teams_join_url text,
  add column if not exists wants_teams boolean not null default false,
  add column if not exists sync_error text,
  add column if not exists synced_at timestamptz;

create index if not exists events_outlook_event_id_idx
  on public.events (outlook_event_id);
