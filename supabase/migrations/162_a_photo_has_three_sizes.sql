-- 162: a travel photo has THREE sizes, not two.
--
-- The board loses drag-to-resize (an invisible bottom-right hit zone nobody
-- found) for a button in the corner of each tile that cycles small -> medium
-- -> large. Ethan: "rather than the ability to drag to resize, we should have
-- a simple button in top right of each photo and clicking it alters the size,
-- there should be three sizes."
--
-- `size` was a two-value CHECK, so writing 'medium' against it would have been
-- rejected - and the client would have shown the new size and lost it on the
-- next load, which is EXACTLY how creator_photos_pos_bounds ate every
-- arrangement for three rewrites (see migration 151). Widen it FIRST.
alter table creator_photos drop constraint if exists creator_photos_size_check;
alter table creator_photos
  add constraint creator_photos_size_check
  check (size in ('small', 'medium', 'large'));

-- And the level has to be TRUE for the rows that already exist, or reading it
-- would shrink every photo anybody had ever widened: every row carries the
-- column's 'small' default whatever width it was actually arranged at. Derive
-- it from pos_w, the per-mille width the board itself wrote - three columns are
-- ~320 / ~660 / 1000 thousandths, two are ~490 / 1000.
update creator_photos
set size = case
  when pos_w >= 900 then 'large'
  when pos_w >= 550 then 'medium'
  else 'small'
end
where pos_w is not null and pos_w >= 40;
