-- SOLO TRAVEL REPLACES COMMUTE AS A REASON FOR A FLIGHT.
--
-- Ethan: "I want you to redo the 'commute' option and icon to Solo Travel
-- instead as I'd say that's a more popular option."
--
-- He is right about the population. The six purposes exist so the field can be
-- COUNTED (see migration 100), and a taxonomy is only worth counting if its
-- buckets are ones people actually fall into. "Commute" describes a very small
-- number of creators who fly the same hop for work every week; travelling alone
-- is a thing a large share of this community does and currently has to file
-- under Holiday or Other, which is where a distinction goes to die.
--
-- THE KEY CHANGES, NOT JUST THE LABEL. Leaving the stored value as 'commute'
-- and printing "Solo travel" over it would mean every query, export and future
-- chart reads a word that contradicts the interface - the kind of mismatch that
-- is invisible until somebody writes a report off the raw column. So the
-- constraint learns the new value, the existing rows are rewritten, and the old
-- value is then removed from the constraint so nothing can write it again.
--
-- The rewrite is not a reinterpretation of anyone's data: a commute is a solo
-- trip in all but name, and there are only a handful of these rows.

alter table public.flights drop constraint if exists flights_purpose_known;

update public.flights set purpose = 'solo' where purpose = 'commute';

alter table public.flights add constraint flights_purpose_known
  check (purpose is null or purpose in ('leisure', 'work', 'creator', 'family', 'solo', 'other'));
