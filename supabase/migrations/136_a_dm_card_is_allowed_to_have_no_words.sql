-- A DM had to carry either words or a picture:
--   check (body <> '' or image_url is not null)
--
-- which is right for the two things a DM could be when it was written, and
-- wrong the moment one can be a CARD. Sharing a resource with no covering note
-- is the normal case - the card says everything - and the insert was rejected,
-- so the message sat in the outbox retrying forever behind "Not sent yet".
--
-- FOUND BY SENDING ONE. The picker opened, the card drew optimistically in the
-- thread, and only the small grey line under it said anything was wrong. Worth
-- remembering: an optimistic UI will happily show you a message that the
-- database is refusing.
--
-- The constraint still does its real job, which is to stop a completely empty
-- message: a row now has to be words, a picture, or a card.
alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check
  check (
    char_length(body) <= 4000
    and (body <> '' or image_url is not null or resource_id is not null)
  );

notify pgrst, 'reload schema';
