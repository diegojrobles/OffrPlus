-- 011: user profiles (real names)
--
-- The app was greeting people with the local part of their email address
-- ("Welcome back, diegorobles444"), which is nobody's name. This stores an
-- actual name, pre-filled from OAuth where the provider gives us one.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile"
  on public.profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- Auto-create a profile on signup
-- ============================================================
-- Microsoft/Azure returns the user's name in raw_user_meta_data, so OAuth
-- users never have to type it. Email/password users get blank fields and are
-- asked during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text;
begin
  full_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  );

  insert into public.profiles (user_id, first_name, last_name)
  values (
    new.id,
    trim(split_part(full_name, ' ', 1)),
    trim(substring(full_name from position(' ' in full_name) + 1))
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Backfill anyone who already signed up
-- ============================================================
insert into public.profiles (user_id, first_name, last_name)
select
  u.id,
  trim(split_part(coalesce(u.raw_user_meta_data ->> 'full_name',
                           u.raw_user_meta_data ->> 'name', ''), ' ', 1)),
  ''
from auth.users u
on conflict (user_id) do nothing;
