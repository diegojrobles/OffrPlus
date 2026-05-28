-- Calendar events + follow-up sync

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  notes text not null default '',
  meeting_link text,
  meeting_platform text,
  -- extra field to support automatic syncing from contacts
  event_type text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists events_user_date_idx on public.events (user_id, event_date);
create index if not exists events_contact_idx on public.events (contact_id);

alter table public.events enable row level security;

create policy "Users can view own events"
  on public.events for select
  using (auth.uid() = user_id);

create policy "Users can insert own events"
  on public.events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own events"
  on public.events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own events"
  on public.events for delete
  using (auth.uid() = user_id);

-- One auto follow-up event per contact (when applicable)
create unique index if not exists events_follow_up_unique
  on public.events (user_id, contact_id)
  where event_type = 'contact_follow_up';

create or replace function public.detect_meeting_platform(url text)
returns text as $$
begin
  if url is null or btrim(url) = '' then
    return null;
  end if;
  if url like '%zoom.us%' then
    return 'zoom';
  elsif url like '%teams.microsoft.com%' then
    return 'teams';
  elsif url like '%skype.com%' then
    return 'skype';
  else
    return null;
  end if;
end;
$$ language plpgsql immutable;

create or replace function public.events_set_platform()
returns trigger as $$
begin
  new.meeting_platform = public.detect_meeting_platform(new.meeting_link);
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_platform_trigger on public.events;
create trigger events_platform_trigger
  before insert or update of meeting_link on public.events
  for each row execute function public.events_set_platform();

create or replace function public.sync_contact_follow_up_event()
returns trigger as $$
declare
  should_have boolean;
begin
  should_have := (new.pipeline_stage = 'Follow Up' and new.follow_up_date is not null);

  if should_have then
    insert into public.events (
      user_id, contact_id, title, event_date, start_time, end_time, notes, meeting_link, meeting_platform, event_type
    ) values (
      new.user_id,
      new.id,
      'Follow up: ' || new.name,
      new.follow_up_date,
      null,
      null,
      coalesce(new.notes, ''),
      null,
      null,
      'contact_follow_up'
    )
    on conflict on constraint events_follow_up_unique
    do update set
      title = excluded.title,
      event_date = excluded.event_date,
      notes = excluded.notes,
      meeting_link = null,
      meeting_platform = null;
  else
    delete from public.events
      where user_id = new.user_id
        and contact_id = new.id
        and event_type = 'contact_follow_up';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists contacts_follow_up_sync on public.contacts;
create trigger contacts_follow_up_sync
  after insert or update of pipeline_stage, follow_up_date, notes, name
  on public.contacts
  for each row
  execute function public.sync_contact_follow_up_event();

