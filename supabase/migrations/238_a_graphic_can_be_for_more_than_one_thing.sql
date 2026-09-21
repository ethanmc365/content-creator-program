-- 238: A KIT GRAPHIC CAN BE FOR MORE THAN ONE THING.
-- Ethan, 21 Sep 2026: "I want to be able to click Post and LinkedIn." `kinds`
-- holds every use; `kind` stays as the first of them so every reader of the
-- single column keeps working. Backfilled from `kind`.
alter table public.creator_kit_assets add column if not exists kinds text[];
update public.creator_kit_assets set kinds = array[coalesce(kind, 'other')] where kinds is null or cardinality(kinds) = 0;
