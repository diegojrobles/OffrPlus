-- 1) Add email field to contacts
alter table public.contacts
add column if not exists email text not null default '';

create index if not exists contacts_email_idx on public.contacts (email);

-- 2) Link contacts to applications (many-to-many)
create table if not exists public.application_contacts (
  application_id uuid not null references public.applications (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (application_id, contact_id)
);

create index if not exists application_contacts_user_id_idx
  on public.application_contacts (user_id);

alter table public.application_contacts enable row level security;

-- User can only relate rows they own (user_id enforced in app)
create policy "Users can view own application_contacts"
  on public.application_contacts for select
  using (auth.uid() = user_id);

create policy "Users can insert own application_contacts"
  on public.application_contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own application_contacts"
  on public.application_contacts for delete
  using (auth.uid() = user_id);

-- 3) Resume vault
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company text not null default '',
  title text not null default '',
  resume_text text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_user_id_idx on public.resumes (user_id);
create index if not exists resumes_company_idx on public.resumes (company);

alter table public.resumes enable row level security;

create policy "Users can view own resumes"
  on public.resumes for select
  using (auth.uid() = user_id);

create policy "Users can insert own resumes"
  on public.resumes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own resumes"
  on public.resumes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own resumes"
  on public.resumes for delete
  using (auth.uid() = user_id);

create trigger resumes_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

