alter table public.saved_frames add column if not exists base_image_path text;
alter table public.saved_frames add column if not exists source text not null default 'Original';
alter table public.saved_frames add column if not exists metadata jsonb not null default '{}'::jsonb;
