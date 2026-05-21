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

alter table public.videos add column if not exists source text not null default 'original';
alter table public.videos add column if not exists mime_type text;
alter table public.videos add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.saved_frames add column if not exists base_image_path text;
alter table public.saved_frames add column if not exists source text not null default 'Original';
alter table public.saved_frames add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notes add column if not exists kind text not null default 'mechanics';
alter table public.notes add column if not exists metadata jsonb not null default '{}'::jsonb;

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
