-- 270: A NUMBER A PERSON TYPED IS AN ANSWER (28 Sep 2026).
--
-- Facebook now sends every server to its login page - measured from Supabase's
-- own network this morning, under a browser agent, a phone agent and every
-- crawler agent the sync uses - so a Facebook entry fails every sync. The sync
-- then wrote its error back onto the row even after an admin had typed the
-- views in, and the entry went straight back on the "needs a person" list.
--
-- Once a row carries a hand-typed number (views_source = 'manual'), a failed
-- read is not news, so the error is not stored. A DELETED video still is: that
-- changes what should happen to the entry. Done here rather than in view-sync
-- so it holds for every writer.

create or replace function public.keep_typed_views_quiet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.views_sync_error is not null
     and new.views_sync_error <> 'removed'
     and old.views_source = 'manual'
     and old.logged_views is not null
     and new.logged_views is not distinct from old.logged_views
     and new.views_source is not distinct from old.views_source then
    new.views_sync_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_typed_views_quiet on public.submissions;
create trigger keep_typed_views_quiet
  before update of views_sync_error on public.submissions
  for each row execute function public.keep_typed_views_quiet();

-- The entries already typed in by hand and still flagged: clear them now.
update public.submissions
   set views_sync_error = null
 where views_source = 'manual'
   and logged_views is not null
   and views_sync_error is not null
   and views_sync_error <> 'removed';
