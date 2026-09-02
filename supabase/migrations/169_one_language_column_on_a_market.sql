-- 169: `communities.language` IS the market's language. There is not a second one.
--
-- Migration 168 added `locale` before noticing that `language` already existed -
-- unused, defaulted to 'en' on every row, and already selected by
-- CommunityContext. Two columns for one idea is how a product ends up asking
-- which of them is true, so the older name wins (it is the one the client
-- already reads) and the new one goes.
--
-- `can_edit_locale` is repointed in the same transaction, because a market
-- manager losing the ability to edit their own language between two migrations
-- is exactly the kind of gap that gets noticed in production.
update communities set language = 'es' where slug = 'spain';

comment on column communities.language is
  'Which language this market reads the platform in (an i18n locale code: en, es). Drives who may edit that language''s translation overrides. See migration 168.';

create or replace function public.can_edit_locale(p_locale text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.is_global_admin(), false)
      or exists (
        select 1
          from public.communities c
          join public.community_members m on m.community_id = c.id
         where m.profile_id = auth.uid()
           and m.status = 'active'
           and m.role = 'manager'
           and c.language = p_locale
      );
$function$;

alter table communities drop column if exists locale;
