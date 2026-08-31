-- The photo board's position columns changed units, and the old values stayed.
--
-- WHAT WENT WRONG
--
-- `creator_photos.pos_x/pos_y/pos_w/pos_h` used to hold 12-COLUMN GRID CELLS:
-- pos_w = 4 meant "four columns wide", pos_h = 6 meant "six rows tall". The
-- rebuilt board stores the same four columns as PER-MILLE FRACTIONS of the
-- board's width, so a full-width photo is pos_w = 1000.
--
-- Nothing translated the old rows, and the two schemes are both plain smallint,
-- so the new board read `pos_w = 4` as four thousandths - 0.4% of the board.
-- Every arranged photo collapsed into an invisible sliver in the top-left
-- corner. Ethan: "on my personal one I've got nine out of ten photos on it, but
-- only one of them is showing up on the arrange board" - the one that showed
-- was the single row that had never been arranged and therefore fell through to
-- the automatic layout.
--
-- WHAT THIS DOES
--
-- Clears the position on any row that cannot be a per-mille arrangement. The
-- board enforces a minimum tile width of 80px, which is never less than about
-- 6% of the board, so a stored width below 40 per-mille (4%) is not a position
-- this code could ever have written - it is a leftover column count. Those rows
-- go back to NULL, which the board reads as "not arranged yet" and lays out
-- automatically at each photo's own aspect ratio.
--
-- Nothing is lost that was worth keeping: the values described a layout on a
-- grid that no longer exists.

update public.creator_photos
   set pos_x = null, pos_y = null, pos_w = null, pos_h = null
 where pos_w is not null
   and pos_w < 40;

-- Belt and braces for the other axis: a row with a legal width but an
-- impossible height is equally unreadable.
update public.creator_photos
   set pos_x = null, pos_y = null, pos_w = null, pos_h = null
 where pos_h is not null
   and pos_h < 40;
