-- Migration 044: private DM media, storage cleanup on photo delete,
-- auto-archive of past-deadline challenges, and drop the dead wall_of_fame table.

-- ---------------------------------------------------------------------------
-- 1) Private "dm-media" bucket for direct-message images.
--    Direct messages should not be readable by anyone with the URL (the old
--    shared, public "chat-media" bucket exposed them). This bucket is PRIVATE:
--    the client reads images back only via short-lived signed URLs, and can do
--    so only if it's one of the two conversation participants.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-media', 'dm-media', false, 15728640, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reads: only the two participants of the conversation the image is filed under
-- (path is dm-media/<conversation_id>/...). Uploads happen through the `upload`
-- edge function with the service role, so no INSERT policy is needed here.
drop policy if exists "dm-media: participants read" on storage.objects;
create policy "dm-media: participants read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-media'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and ((select auth.uid()) = c.participant_a or (select auth.uid()) = c.participant_b)
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Let a creator delete their own gallery/avatar objects from storage, so
--    removing a travel photo also frees the underlying file (previously only
--    the DB row was deleted, orphaning the object and slowly eating quota).
-- ---------------------------------------------------------------------------
drop policy if exists "gallery: owner deletes own folder" on storage.objects;
create policy "gallery: owner deletes own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('gallery', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 3) Auto-archive challenges whose deadline has passed. A challenge dated
--    "30 Jun" stays open through the 30th and closes at 00:00 on 1 Jul, so we
--    archive active challenges once end_date is strictly before today. This
--    stops a finished contest showing as "Live" on Home / Challenges.
-- ---------------------------------------------------------------------------
create or replace function public.archive_ended_challenges()
returns void
language sql
security definer
set search_path = public
as $$
  update public.challenges
     set status = 'archived'
   where status = 'active'
     and end_date < current_date;
$$;

revoke execute on function public.archive_ended_challenges() from public, anon, authenticated;

select cron.schedule('archive-ended-challenges', '10 0 * * *', $$select public.archive_ended_challenges()$$);

-- Archive any already-past-deadline active challenge right now.
select public.archive_ended_challenges();

-- ---------------------------------------------------------------------------
-- 4) Drop the dead wall_of_fame table (removed from the UI long ago).
-- ---------------------------------------------------------------------------
drop table if exists public.wall_of_fame cascade;
