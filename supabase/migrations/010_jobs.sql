-- 010: job preferences + cached job postings
--
-- The postings cache is deliberately SHARED across users rather than
-- per-user. Adzuna's free tier allows ~1,000 calls/month, so if every user
-- triggered their own fetch the quota would be gone in a day. Instead a
-- posting search is keyed by its query, and any user whose preferences map to
-- that query reads the same cached rows.

-- ============================================================
-- 1) What the user is looking for
-- ============================================================
create table if not exists public.job_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  major text not null default '',
  -- e.g. Investment Banking, Sales & Trading, Private Equity
  career_focus text not null default '',
  -- summer_internship | offcycle_internship | full_time | part_time
  work_type text not null default 'summer_internship',
  location text not null default '',
  graduation_year int,
  -- Set once the questionnaire is finished, so we know not to show it again.
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_preferences enable row level security;

drop policy if exists "Users manage own job preferences" on public.job_preferences;
create policy "Users manage own job preferences"
  on public.job_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists job_preferences_updated_at on public.job_preferences;
create trigger job_preferences_updated_at
  before update on public.job_preferences
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Shared cache of fetched postings
-- ============================================================
create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  -- Normalised search this posting came back for, e.g. "investment banking
  -- intern|new york". Lets us serve many users from one API call.
  query_key text not null,
  source text not null default 'adzuna',
  -- Provider's own id, so refetching updates rather than duplicates.
  external_id text not null,
  title text not null,
  company text not null default '',
  location text not null default '',
  description text not null default '',
  url text not null,
  salary_min numeric,
  salary_max numeric,
  contract_time text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  constraint job_postings_unique_external unique (source, external_id)
);

create index if not exists job_postings_query_key_idx
  on public.job_postings (query_key, posted_at desc);
create index if not exists job_postings_fetched_at_idx
  on public.job_postings (fetched_at desc);

alter table public.job_postings enable row level security;

-- Public job ads: any signed-in user may read the cache. Only the edge
-- function (service role) writes to it.
drop policy if exists "Signed-in users can read job postings" on public.job_postings;
create policy "Signed-in users can read job postings"
  on public.job_postings for select
  to authenticated
  using (true);

-- ============================================================
-- 3) Per-user saved / dismissed postings
-- ============================================================
create table if not exists public.job_interactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  posting_id uuid not null references public.job_postings (id) on delete cascade,
  -- saved | dismissed | applied
  state text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, posting_id),
  constraint job_interactions_state_check
    check (state in ('saved', 'dismissed', 'applied'))
);

alter table public.job_interactions enable row level security;

drop policy if exists "Users manage own job interactions" on public.job_interactions;
create policy "Users manage own job interactions"
  on public.job_interactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
