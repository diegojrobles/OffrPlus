-- 005: contact phone, application extra + custom columns, resume PDF storage
-- Safe to run once on top of 001-004.

-- ============================================================
-- 1) Contacts: phone
-- ============================================================
alter table public.contacts
  add column if not exists phone text not null default '';

-- ============================================================
-- 2) Applications: optional structured columns
-- ============================================================
alter table public.applications
  add column if not exists salary text not null default '',
  add column if not exists expected_reply_date date,
  add column if not exists location text not null default '',
  add column if not exists link text not null default '',
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists applications_expected_reply_date_idx
  on public.applications (expected_reply_date);

-- ============================================================
-- 3) User-defined custom field definitions for applications
-- ============================================================
create table if not exists public.app_custom_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  field_type text not null default 'text',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_custom_fields_type_check
    check (field_type in ('text', 'number', 'date')),
  constraint app_custom_fields_unique_name unique (user_id, name)
);

create index if not exists app_custom_fields_user_id_idx
  on public.app_custom_fields (user_id);

alter table public.app_custom_fields enable row level security;

drop policy if exists "Users can view own app_custom_fields" on public.app_custom_fields;
create policy "Users can view own app_custom_fields"
  on public.app_custom_fields for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own app_custom_fields" on public.app_custom_fields;
create policy "Users can insert own app_custom_fields"
  on public.app_custom_fields for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own app_custom_fields" on public.app_custom_fields;
create policy "Users can update own app_custom_fields"
  on public.app_custom_fields for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own app_custom_fields" on public.app_custom_fields;
create policy "Users can delete own app_custom_fields"
  on public.app_custom_fields for delete
  using (auth.uid() = user_id);

drop trigger if exists app_custom_fields_updated_at on public.app_custom_fields;
create trigger app_custom_fields_updated_at
  before update on public.app_custom_fields
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4) Resumes: attached PDF metadata
-- ============================================================
alter table public.resumes
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint;

-- Resume text is no longer required when a PDF is attached.
alter table public.resumes
  alter column resume_text set default '';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resumes'
      and column_name = 'resume_text'
      and is_nullable = 'NO'
  ) then
    update public.resumes set resume_text = '' where resume_text is null;
  end if;
end $$;

-- ============================================================
-- 5) Storage bucket for resume PDFs (private, per-user folders)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored at: <user_id>/<uuid>.pdf
-- so the first path segment must match the caller's uid.

drop policy if exists "Users can read own resume files" on storage.objects;
create policy "Users can read own resume files"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload own resume files" on storage.objects;
create policy "Users can upload own resume files"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own resume files" on storage.objects;
create policy "Users can update own resume files"
  on storage.objects for update
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own resume files" on storage.objects;
create policy "Users can delete own resume files"
  on storage.objects for delete
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
