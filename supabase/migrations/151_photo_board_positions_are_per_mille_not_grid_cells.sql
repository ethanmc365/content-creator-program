-- The photo board could never save. The database was refusing every write.
--
-- WHAT WENT WRONG
--
-- `creator_photos_pos_bounds` was written for the 12-column grid the board
-- started life as:
--
--   pos_x between 0 and 11, pos_w between 2 and 12, pos_x + pos_w <= 12
--
-- The board stores per-mille fractions of its own width now, so a photo half
-- way across a board is pos_x = 500 and a third-width photo is pos_w = 333.
-- Every one of those violates the constraint, and the client never looked at
-- the result of the update - so a creator dragged a photo, watched it move,
-- and it was back where it started on the next load.
--
-- This is the real reason the note "every row in prod has pos_x = null, nobody
-- has ever arranged a board" was true through three rewrites of the UI. It was
-- never a usability problem. Postgres was rejecting the write.
--
-- WHAT THE NEW BOUNDS MEAN
--
--   pos_x   0..1000    left edge, in thousandths of the board's width
--   pos_y   0..32000   top edge, same unit - a board may be several screens
--                      tall, and smallint tops out at 32767
--   pos_w   40..1000   width. The floor matches MIN_PLACED_MILLE in
--                      PhotoBoard.jsx: below 4% of the board a tile cannot be
--                      grabbed, and a stored value that small is a leftover
--                      grid cell rather than a width (see migration 150).
--   pos_h   40..32000  height, same floor, same reasoning
--
-- NO CONSTRAINT ON pos_x + pos_w. The client already clamps a photo to the
-- board's right edge, and rounding two independently-rounded per-mille values
-- can legitimately sum to 1001 - which would have made this constraint reject
-- a photo dragged flush to the edge, reintroducing exactly the bug it is
-- replacing.

alter table public.creator_photos
  drop constraint if exists creator_photos_pos_bounds;

alter table public.creator_photos
  add constraint creator_photos_pos_bounds check (
        (pos_x is null or (pos_x >= 0 and pos_x <= 1000))
    and (pos_y is null or (pos_y >= 0 and pos_y <= 32000))
    and (pos_w is null or (pos_w >= 40 and pos_w <= 1000))
    and (pos_h is null or (pos_h >= 40 and pos_h <= 32000))
  );
