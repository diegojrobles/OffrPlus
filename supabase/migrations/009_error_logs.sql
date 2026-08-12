-- 009: client-side error log
--
-- Insert-only from the browser: a user can report their own errors but cannot
-- read anyone's, including their own. You read these from the dashboard's SQL
-- editor or table view, which uses the service role.

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  context text,
  stack text,
  component_stack text,
  -- Action trail leading up to the failure. Route names and action labels
  -- only — never form contents. See src/lib/telemetry.ts.
  breadcrumbs jsonb not null default '[]'::jsonb,
  fatal boolean not null default false,
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx
  on public.error_logs (created_at desc);
create index if not exists error_logs_user_id_idx
  on public.error_logs (user_id);

alter table public.error_logs enable row level security;

-- Insert only. No select policy means the browser can never read this table,
-- so one user's stack traces can't leak to another.
drop policy if exists "Users can report own errors" on public.error_logs;
create policy "Users can report own errors"
  on public.error_logs for insert
  with check (auth.uid() = user_id);
