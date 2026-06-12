insert into storage.buckets (id, name, public)
values
  ('videos', 'videos', false),
  ('saved-frames', 'saved-frames', false),
  ('reports', 'reports', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 536870912000)
where id = 'videos';

alter table public.profiles add column if not exists default_athlete text;
alter table public.profiles add column if not exists coach_display_name text;
alter table public.profiles add column if not exists report_footer text;
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.videos alter column storage_path drop not null;
alter table public.videos add column if not exists local_file_id text;
alter table public.videos add column if not exists local_file_name text;
alter table public.videos add column if not exists source text not null default 'original';
alter table public.videos add column if not exists mime_type text;
alter table public.videos add column if not exists file_size_bytes bigint;
alter table public.videos add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.saved_frames add column if not exists base_image_path text;
alter table public.saved_frames add column if not exists source text not null default 'Original';
alter table public.saved_frames add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notes add column if not exists kind text not null default 'mechanics';
alter table public.notes add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

create index if not exists lessons_player_id_idx on public.lessons(player_id);
create index if not exists videos_player_id_idx on public.videos(player_id);
create index if not exists videos_lesson_id_idx on public.videos(lesson_id);
create index if not exists saved_frames_player_id_idx on public.saved_frames(player_id);
create index if not exists saved_frames_lesson_id_idx on public.saved_frames(lesson_id);
create index if not exists saved_frames_video_id_idx on public.saved_frames(video_id);
create index if not exists annotations_saved_frame_id_idx on public.annotations(saved_frame_id);
create index if not exists notes_player_id_idx on public.notes(player_id);
create index if not exists notes_lesson_id_idx on public.notes(lesson_id);
create index if not exists reports_player_id_idx on public.reports(player_id);
create index if not exists reports_lesson_id_idx on public.reports(lesson_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users manage their own videos'
  ) then
    create policy "users manage their own videos" on storage.objects
      for all
      using (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users manage their own saved frames'
  ) then
    create policy "users manage their own saved frames" on storage.objects
      for all
      using (bucket_id = 'saved-frames' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'saved-frames' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users manage their own reports'
  ) then
    create policy "users manage their own reports" on storage.objects
      for all
      using (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'reports' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;
