-- 164: a travel photo board is arranged TWICE - once for a phone, once for a
-- desktop.
--
-- Ethan: "the travel photo section should be separated for desktop and mobile.
-- The changes I make on desktop should appear on desktop because that's a nice
-- view there, but the mobile view is different, so making a change on mobile
-- shouldn't change the desktop view. Currently, making it look nice on mobile
-- messes it up on desktop."
--
-- He is right and it is not a styling problem: the board runs at a different
-- number of columns at the two widths, so the SAME running order and the SAME
-- spans genuinely pack into two different collages, and there is exactly one of
-- each stored. Tidying the phone rewrote `sort_order`, and the desktop board
-- read that order back.
--
-- TWO NULLABLE OVERRIDES, NOT TWO FULL SETS. `sort_order_mobile` and
-- `size_mobile` are null until somebody actually arranges the board on a phone,
-- and null means "use the desktop value" - so every existing board keeps
-- exactly the arrangement it has at both widths, and a creator who never opens
-- the editor on a phone never gets a second layout to maintain.
--
-- The CHECK is widened the same way migration 162 had to be: a constraint that
-- silently refuses a value is how this table ate three rewrites of the board
-- (see 151, 162). Null is allowed here on purpose.
alter table creator_photos
  add column if not exists sort_order_mobile integer,
  add column if not exists size_mobile text;

alter table creator_photos drop constraint if exists creator_photos_size_mobile_check;
alter table creator_photos
  add constraint creator_photos_size_mobile_check
  check (size_mobile is null or size_mobile in ('small', 'medium', 'large'));
