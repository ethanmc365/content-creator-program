-- Sharing a resource was a rooms-only thing, so the answer to "have you read
-- the brand rules?" in a DM was to paste a URL. `messages` has carried
-- `resource_id` since the library shipped; `direct_messages` never did.
alter table public.direct_messages
  add column if not exists resource_id uuid references public.resources(id) on delete set null;

create index if not exists direct_messages_resource_idx
  on public.direct_messages (resource_id) where resource_id is not null;

comment on column public.direct_messages.resource_id is
  'A resource-library card posted into the conversation. Body is empty for these.';

notify pgrst, 'reload schema';
