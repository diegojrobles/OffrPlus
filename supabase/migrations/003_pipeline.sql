-- Pipeline stages + contact stage assignment

alter table public.contacts
add column if not exists pipeline_stage text not null default 'Not Started';

create index if not exists contacts_pipeline_stage_idx
  on public.contacts (pipeline_stage);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#22c55e',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists pipeline_stages_user_id_idx
  on public.pipeline_stages (user_id);

alter table public.pipeline_stages enable row level security;

create policy "Users can view own pipeline_stages"
  on public.pipeline_stages for select
  using (auth.uid() = user_id);

create policy "Users can insert own pipeline_stages"
  on public.pipeline_stages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pipeline_stages"
  on public.pipeline_stages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own pipeline_stages"
  on public.pipeline_stages for delete
  using (auth.uid() = user_id);

create trigger pipeline_stages_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

