-- 006: LinkedIn profile URL on contacts
alter table public.contacts
  add column if not exists linkedin_url text not null default '';
