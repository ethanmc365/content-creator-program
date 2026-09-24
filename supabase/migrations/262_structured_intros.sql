-- 262: AN INTRODUCTION IS A CARD, NOT A PARAGRAPH (24 Sep 2026)
--
-- Ethan: "Currently, whenever they fill in the introduction, it just comes as
-- [text]. It doesn't structure it very well and doesn't look great... pull out
-- more stats from their profile... Make it colourful, show some icons like flags
-- for places they've been to or they're interested in, and connect buttons right
-- inside the chat where they can immediately connect with creators."
--
-- `intro` holds the structured introduction the room draws as a card (see
-- lib/intro.js for the shape). `body` keeps a plain-text copy of it, so search,
-- notifications and anything that only reads `body` still say the right thing.

alter table public.messages add column if not exists intro jsonb;
comment on column public.messages.intro is
  'A structured introduction (the introductions room). body keeps a plain-text copy for search and notifications.';
