insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do update set public = excluded.public;

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 536870912000)
where id = 'videos';

alter table public.videos
  alter column storage_path drop not null,
  add column if not exists local_file_id text,
  add column if not exists local_file_name text,
  add column if not exists file_size_bytes bigint;

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
end $$;

comment on table public.videos is
  'Metadata for user media. Uploaded files live in private Supabase Storage when cloud sync succeeds.';

comment on column public.videos.storage_path is
  'Supabase Storage object path for uploaded media. Null only when a media item is local-only after upload failure.';

comment on column public.videos.local_file_id is
  'Browser-local identifier used to reconnect a project record to media stored on the user device.';
