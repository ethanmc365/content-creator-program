-- A BUCKET FOR THE GRAPHICS CREATORS REPOST.
--
-- APPLIED 16 Sep 2026 as `a_bucket_for_the_creator_kit`.
--
-- PUBLIC, because these graphics exist to be reposted on Instagram and
-- LinkedIn. A signed URL that expires is exactly wrong for a file whose whole
-- purpose is to end up somewhere else. 15MB matches `avatars` and `gallery`; a
-- story graphic that does not fit in 15MB is a mistake, not a big picture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-kit', 'creator-kit', true, 15728640,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anybody may READ (the bucket is public and the files are meant to travel).
-- Only an admin may put anything in it or take anything out: a creator
-- uploading into the library everyone downloads from is not a feature.
drop policy if exists "creator kit is readable" on storage.objects;
create policy "creator kit is readable" on storage.objects
  for select using (bucket_id = 'creator-kit');

drop policy if exists "admins write the creator kit" on storage.objects;
create policy "admins write the creator kit" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'creator-kit' and (select public.is_admin()));

drop policy if exists "admins replace the creator kit" on storage.objects;
create policy "admins replace the creator kit" on storage.objects
  for update to authenticated
  using (bucket_id = 'creator-kit' and (select public.is_admin()));

drop policy if exists "admins clear the creator kit" on storage.objects;
create policy "admins clear the creator kit" on storage.objects
  for delete to authenticated
  using (bucket_id = 'creator-kit' and (select public.is_admin()));
