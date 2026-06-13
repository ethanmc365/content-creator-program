-- ============================================================================
-- 002 — image attachments in chat and DMs
-- ============================================================================
-- Adds an optional image to group-chat messages and direct messages.
-- Images live in the public "chat-media" storage bucket; any active member
-- can upload into their own folder (chat-media/<user id>/...).

-- 1. Optional image on both message types.
alter table public.messages add column if not exists image_url text;
alter table public.direct_messages add column if not exists image_url text;

-- 2. Allow an empty body when a message is image-only
--    (previously body had to be 1-4000 characters).
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000 and (body <> '' or image_url is not null));

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(body) <= 4000 and (body <> '' or image_url is not null));

-- 3. Public bucket for chat images.
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "chat-media: user uploads own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_post()
  );

create policy "chat-media: user deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);
