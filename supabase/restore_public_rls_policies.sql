do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles are private') then
    create policy "profiles are private" on public.profiles
      for all using (auth.uid() = id) with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'players' and policyname = 'players are owned by user') then
    create policy "players are owned by user" on public.players
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lessons' and policyname = 'lessons are owned by user') then
    create policy "lessons are owned by user" on public.lessons
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'videos' and policyname = 'videos are owned by user') then
    create policy "videos are owned by user" on public.videos
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saved_frames' and policyname = 'saved frames are owned by user') then
    create policy "saved frames are owned by user" on public.saved_frames
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'annotations' and policyname = 'annotations are owned by user') then
    create policy "annotations are owned by user" on public.annotations
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notes' and policyname = 'notes are owned by user') then
    create policy "notes are owned by user" on public.notes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports are owned by user') then
    create policy "reports are owned by user" on public.reports
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
