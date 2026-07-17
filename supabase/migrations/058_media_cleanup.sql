-- 058: auto-delete storage media for deleted content.
-- One generic trigger fn POSTs the row's media URLs to the media-cleanup
-- edge function (service role deletes the objects). Fires when:
--   * a chat message is moderated (deleted flag flips true) or hard-deleted
--   * a DM is deleted (incl. conversation-delete cascades)
--   * a gallery photo row is deleted (backstop for the client-side delete)
--   * a feedback report is deleted (screenshot)

create or replace function public.dispatch_media_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  urls text[];
begin
  if tg_table_name = 'messages' then
    urls := array_remove(array[old.image_url, old.video_url, old.audio_url], null);
  elsif tg_table_name = 'direct_messages' then
    urls := array_remove(array[old.image_url], null);
  elsif tg_table_name = 'creator_photos' then
    urls := array_remove(array[old.photo_url], null);
  elsif tg_table_name = 'feedback' then
    urls := array_remove(array[old.screenshot_url], null);
  end if;
  if urls is null or coalesce(array_length(urls, 1), 0) = 0 then
    return coalesce(new, old);
  end if;
  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/media-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'apikey', 'sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object('urls', to_jsonb(urls))
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.dispatch_media_cleanup() from public, anon, authenticated;

drop trigger if exists trg_media_cleanup_message_moderated on public.messages;
create trigger trg_media_cleanup_message_moderated
  after update of deleted on public.messages
  for each row
  when (old.deleted is distinct from true and new.deleted = true)
  execute function public.dispatch_media_cleanup();

drop trigger if exists trg_media_cleanup_message_deleted on public.messages;
create trigger trg_media_cleanup_message_deleted
  after delete on public.messages
  for each row execute function public.dispatch_media_cleanup();

drop trigger if exists trg_media_cleanup_dm_deleted on public.direct_messages;
create trigger trg_media_cleanup_dm_deleted
  after delete on public.direct_messages
  for each row execute function public.dispatch_media_cleanup();

drop trigger if exists trg_media_cleanup_photo_deleted on public.creator_photos;
create trigger trg_media_cleanup_photo_deleted
  after delete on public.creator_photos
  for each row execute function public.dispatch_media_cleanup();

drop trigger if exists trg_media_cleanup_feedback_deleted on public.feedback;
create trigger trg_media_cleanup_feedback_deleted
  after delete on public.feedback
  for each row execute function public.dispatch_media_cleanup();
