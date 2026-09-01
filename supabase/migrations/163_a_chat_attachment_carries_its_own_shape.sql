-- 163: a chat attachment records its own shape.
--
-- THE GLITCH THIS FIXES. Ethan, about opening any room or DM: "there is still
-- the weird lag when first opening a chat, for example it flashes, glitches and
-- then shows the current chats, sometimes it's scrolled up a bit, its
-- inconsistent, sometimes it jutters more."
--
-- An <img> with no width or height has NO INTRINSIC SIZE until its bytes
-- decode, so on the first paint every photo in a thread is a zero-height box.
-- The scroller is therefore the wrong height, the pin puts it at a bottom that
-- is not the real bottom, and then each photo that decodes grows the document
-- and yanks the thread again. That is the flash, the jump and - because decode
-- order depends on the network - the inconsistency.
--
-- Recording the shape at UPLOAD means the box is reserved on the very first
-- render, the scroll height is right before anything decodes, and there is
-- nothing left to correct. Smallint: 1280px is the compressor's cap.
--
-- Nullable, and every existing message stays null - ChatMedia keeps its
-- measure-on-load path for those, so nothing that is already sent changes.
alter table messages add column if not exists media_w smallint;
alter table messages add column if not exists media_h smallint;
alter table direct_messages add column if not exists media_w smallint;
alter table direct_messages add column if not exists media_h smallint;
