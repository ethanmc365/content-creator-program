-- MAKING SOMEBODY AN ADMIN DID NOT PUT THEM ON THE TEAM.
--
-- Ethan, 8 Sep 2026: "another bug I found is that giving someone admin should
-- add them to team automatically. Currently, if I add someone as an admin, it
-- doesn't automatically add them to the team, which doesn't make sense - if
-- they're an admin they're part of the team, so they should automatically
-- appear there, and then I can easily give them a title. I think it does work
-- the other way. So if I add them to the team, they automatically get admin,
-- which is how it should be."
--
-- His reading of the asymmetry is exactly right, and here is where it lived.
--
-- There are TWO grant paths and they disagreed about what "admin" means:
--
--   set_team_member()   (the Tryp.com team page) sets is_admin AND moves
--                       platform_role to 'global_admin'.
--   admin_set_admin()   (the Promote to admin button on /admin/creators) set
--                       is_admin AND NOTHING ELSE.
--
-- `team_roster()` - the only thing the team page reads - selects on
--   platform_role in ('global_admin','owner') or they manage a market
-- and never looks at `is_admin` at all. So somebody promoted from the creator
-- roster got every admin power in the product and was invisible on the page
-- that lists the people who have them. There was no way to give them a title,
-- and the team page quietly under-reported who could do what - which is a
-- security-review problem as much as a UI one.
--
-- `platform_role` is the column of record and `is_admin` is the fast check.
-- They must move together or not at all; this makes the second path do what the
-- first already did.
--
-- THE OWNER IS UNTOUCHED, as in `set_team_member`: 'owner' outranks
-- 'global_admin' and demoting the programme lead to it would be a promotion in
-- reverse. The existing guard already refuses to change the owner at all.
--
-- AND THE AUDIT LOG GETS THE ROW IT WAS MISSING. Promotion from the team page
-- was logged; promotion from the creator roster was not, so half of the grants
-- of full admin power on this platform left no trace. Same wording as
-- `set_team_member` writes, so the log reads as one sequence.
--
-- Applied 8 Sep 2026. Checked afterwards: no existing row was left behind by
-- the old behaviour (`is_admin and platform_role not in (global_admin, owner)`
-- returns 0), so no backfill was needed.
create or replace function public.admin_set_admin(target uuid, make_admin boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own admin status'; end if;
  if (select platform_role from public.profiles where id = target) = 'owner' then
    raise exception 'The programme lead cannot be removed as an admin';
  end if;

  update public.profiles set
    is_admin = make_admin,
    -- The half that was missing. Same rule as set_team_member: admin means
    -- global_admin, and taking it away means none.
    platform_role = case
      when platform_role = 'owner' then platform_role
      when make_admin then 'global_admin'
      else 'none'
    end
  where id = target;
  if not found then raise exception 'Creator not found'; end if;

  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select auth.uid(), (select name from public.profiles where id = auth.uid()),
         case when make_admin then 'Promoted to Tryp.com team'
              else 'Removed from Tryp.com team' end,
         target, (select name from public.profiles where id = target);
end;
$function$;
