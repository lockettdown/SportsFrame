create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  default_athlete text,
  coach_display_name text,
  report_footer text,
  settings jsonb not null default '{}'::jsonb,
  stripe_customer_id text unique,
  subscription_status text not null default 'free',
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  handedness text,
  position text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  lesson_date date not null default current_date,
  title text not null,
  focus_area text not null check (focus_area in ('hitting', 'pitching')),
  created_at timestamptz not null default now()
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  drill_type text not null check (drill_type in ('hitting', 'pitching')),
  source text not null default 'original',
  mime_type text,
  duration_seconds numeric,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.saved_frames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  video_id uuid references public.videos(id) on delete cascade,
  frame_time_seconds numeric not null default 0,
  image_path text not null,
  base_image_path text,
  source text not null default 'Original',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.saved_frames add column if not exists base_image_path text;
alter table public.saved_frames add column if not exists source text not null default 'Original';
alter table public.saved_frames add column if not exists metadata jsonb not null default '{}'::jsonb;

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_frame_id uuid not null references public.saved_frames(id) on delete cascade,
  tool text not null check (tool in ('draw', 'line', 'arrow', 'circle', 'text')),
  color text not null,
  line_width integer not null default 4,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete cascade,
  kind text not null default 'mechanics',
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists default_athlete text;
alter table public.profiles add column if not exists coach_display_name text;
alter table public.profiles add column if not exists report_footer text;
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.videos add column if not exists source text not null default 'original';
alter table public.videos add column if not exists mime_type text;
alter table public.videos add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notes add column if not exists kind text not null default 'mechanics';
alter table public.notes add column if not exists metadata jsonb not null default '{}'::jsonb;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  report_path text,
  frame_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.lessons enable row level security;
alter table public.videos enable row level security;
alter table public.saved_frames enable row level security;
alter table public.annotations enable row level security;
alter table public.notes enable row level security;
alter table public.reports enable row level security;

create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "players are owned by user" on public.players
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "lessons are owned by user" on public.lessons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "videos are owned by user" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "saved frames are owned by user" on public.saved_frames
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "annotations are owned by user" on public.annotations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notes are owned by user" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reports are owned by user" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index players_user_id_idx on public.players(user_id);
create index lessons_user_id_player_id_idx on public.lessons(user_id, player_id);
create index videos_user_id_player_id_idx on public.videos(user_id, player_id);
create index saved_frames_user_id_lesson_id_idx on public.saved_frames(user_id, lesson_id);
create index annotations_user_id_saved_frame_id_idx on public.annotations(user_id, saved_frame_id);
create index notes_user_id_lesson_id_idx on public.notes(user_id, lesson_id);
create index reports_user_id_player_id_idx on public.reports(user_id, player_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public)
values
  ('videos', 'videos', false),
  ('saved-frames', 'saved-frames', false),
  ('reports', 'reports', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 524288000)
where id = 'videos';

create policy "users manage their own videos" on storage.objects
  for all
  using (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users manage their own saved frames" on storage.objects
  for all
  using (bucket_id = 'saved-frames' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'saved-frames' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users manage their own reports" on storage.objects
  for all
  using (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);
