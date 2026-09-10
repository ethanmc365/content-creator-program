-- 215 - A VIDEO FRAME THAT DOES NOT EXPIRE
--
-- Ethan, 10 Sep 2026, on the note left in the tracker's memory ("copy video
-- thumbnails into our own storage - Instagram's URLs expire; today that
-- self-heals, but at fifty videos it's fifty probes a month"): "is this
-- necessary? I want you to ensure that everything's working correctly. We don't
-- want it to take up an insane amount of storage, but maybe even with thousands
-- of videos it won't take up that much. So we can do it if we need to."
--
-- IT IS NECESSARY, AND HIS INSTINCT ABOUT THE SIZE IS RIGHT. A cover frame is
-- 640px on its long edge and lands between 20KB and 60KB as JPEG. A thousand
-- videos is therefore about 40MB - a rounding error next to the chat media
-- already in this project, and less than four of the videos themselves would
-- be. Against that: an Instagram cover URL is SIGNED and expires in days, so
-- every card carrying one is a picture that works today and a broken image icon
-- next month. The self-healing probe covers that and costs one edge-function
-- call per expiry per video - fine at three rows, a standing tax at fifty, and
-- on the CREATOR-facing pages (a profile, a challenge board) it is not even
-- available, because the probe is admin-only. A stored file is the only version
-- of this that works for the people the pages are for.
--
-- 1) WHERE THE FILE GOES. Public, because everything it holds is a frame of a
--    video that is already public on TikTok or Instagram, and a signed URL for
--    each of forty entries on a challenge board is forty round trips to look at
--    one page. 2MB and images only: the writer is our own edge function, and a
--    limit is what stops a bug there becoming a storage bill.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-thumbs', 'video-thumbs', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reads are the bucket's own `public` flag. Writes happen through the
-- `thumb-cache` edge function with the service role, exactly like `dm-media`
-- and for the same reason, so there is no INSERT policy here on purpose: no
-- browser, signed in or not, can put anything in this bucket.

-- 2) WHERE THE ADDRESS GOES. `tracked_videos` has had `thumbnail_url` since
--    211; entries never did, which is why a challenge board and a creator's
--    profile draw an orange platform slab where the tracker draws a picture.
--    Same column, same meaning: the permanent public URL of a stored frame.
alter table public.submissions
  add column if not exists thumbnail_url text;

comment on column public.submissions.thumbnail_url is
  'Permanent public URL of the cover frame in the video-thumbs bucket. Written '
  'only by the thumb-cache edge function. Never a platform CDN URL: those are '
  'signed and expire, which is the whole reason this column exists.';

-- Only the frame's OWNER may clear it, and only by deleting the entry. Nothing
-- else changes about submissions RLS - the existing policies already decide who
-- may update a row, and this column rides along with them.
