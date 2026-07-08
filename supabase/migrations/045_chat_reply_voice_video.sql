-- ============================================================================
-- 045 - richer community chat: quoted replies, voice notes, video clips
-- ============================================================================
set check_function_bodies = off;

-- Reply/quote: a message can point at the message it is replying to. Null the
-- link (rather than cascade-delete) if the original is removed so the reply
-- survives with a "message unavailable" placeholder.
alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;

-- Voice notes + video clips live in the public chat-media bucket, same as chat
-- images, and are referenced here by URL.
alter table public.messages add column if not exists audio_url text;
alter table public.messages add column if not exists video_url text;

create index if not exists idx_messages_reply_to on public.messages (reply_to);

-- A message body may be empty when the message carries media or an inline card.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (body <> '' or image_url is not null or poll_id is not null
         or game_event_id is not null or birthday_for is not null
         or resource_id is not null or audio_url is not null or video_url is not null)
  );

-- Allow audio + video (and keep images) in the community chat bucket, and raise
-- the size cap so short, lightly-compressed clips fit. Clients still cap uploads
-- well below this (images/audio ~15MB, video ~25MB) to protect the storage tier.
update storage.buckets
  set file_size_limit = 62914560, -- 60MB
      allowed_mime_types = array[
        'image/jpeg','image/png','image/webp','image/gif',
        'audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/aac','audio/wav','audio/x-m4a',
        'video/mp4','video/webm','video/quicktime','video/ogg'
      ]
  where id = 'chat-media';
