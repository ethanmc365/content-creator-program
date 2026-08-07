-- 074: the scope helpers, and RLS for the four tables created in 071.
--
-- SCOPE OF THIS MIGRATION, read this before adding to it.
--
-- It adds policies to `communities`, `community_members`, `channels` and
-- `community_invites` ONLY. Those four tables are currently deny-all (RLS on,
-- zero policies) and nothing in the live app reads them, so giving them their
-- first policies cannot change what a UK creator sees anywhere.
--
-- It does NOT touch a single policy on an existing table. That is the whole of
-- phase 3 and it needs the four-persona shadow diff first. The 119 policies in
-- `public` must still be 119 plus exactly the ones added here when this is done.
--
-- WHY MEMBERSHIP IS READ FROM A TABLE AND NEVER FROM A JWT CLAIM
--
-- The standard multi-tenant advice is to denormalise membership into a custom
-- claim so policies avoid a join. We deliberately do the opposite. `jwt_exp` on
-- this project is 604800 (one week) and refresh tokens never expire by design, so
-- a claim can be a full week stale: a creator removed from a chapter would keep
-- reading its data for a week, and there would be no way to boot them short of a
-- global sign-out. A join against an indexed table is the cheaper mistake.

-- ------------------------------------------------------------------- helpers
-- SECURITY DEFINER is required here, not a convenience. `community_members` is
-- itself RLS-protected, so querying it from an invoker-rights function that is
-- called inside a policy on that same table gives
-- "infinite recursion detected in policy for relation community_members".
--
-- STABLE (not VOLATILE) is what lets Postgres hoist the call into an InitPlan
-- when it is written as `(select my_scopes())`, so it runs once per query rather
-- than once per row. Always call these wrapped in a select inside a policy.

create or replace function public.my_scopes()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select community_id
  from public.community_members
  where profile_id = auth.uid()
    and status = 'active';
$$;

comment on function public.my_scopes() is
  'Community ids the current user is an active member of. Call as (select my_scopes()) inside a policy so it evaluates once per query.';

-- Platform role, not a membership. A global admin manages every community; a
-- country manager manages only the chapters they hold a manager row for.
create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select platform_role = 'global_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.my_managed_scopes()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.communities where public.is_global_admin()
  union
  select community_id
  from public.community_members
  where profile_id = auth.uid()
    and status = 'active'
    and role = 'manager';
$$;

comment on function public.my_managed_scopes() is
  'Community ids the current user may administer: every community for a global admin, otherwise the chapters they are a manager of.';

grant execute on function public.my_scopes()          to authenticated;
grant execute on function public.my_managed_scopes()  to authenticated;
grant execute on function public.is_global_admin()    to authenticated;

-- --------------------------------------------------------------- communities
-- Active communities are readable by any signed-in creator: the whole point of
-- the network is that you can see the other markets exist and ask to join one.
-- Inactive chapters stay invisible unless you are already in them or you run the
-- platform.
create policy communities_read on public.communities
  for select to authenticated
  using (
    is_active
    or id in (select public.my_scopes())
    or (select public.is_global_admin())
  );

-- Creating and renaming chapters is a platform action. A country manager may
-- edit their own chapter's settings but may not create new ones, and may not
-- reach another chapter's row.
create policy communities_insert on public.communities
  for insert to authenticated
  with check ((select public.is_global_admin()));

create policy communities_update on public.communities
  for update to authenticated
  using (id in (select public.my_managed_scopes()))
  with check (id in (select public.my_managed_scopes()));

-- ---------------------------------------------------------- community_members
-- You can see the roster of any community you are in. Everyone is in Worldwide,
-- so this is the same visibility the creator directory already gives today.
create policy community_members_read on public.community_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or community_id in (select public.my_scopes())
    or community_id in (select public.my_managed_scopes())
  );

-- WITH CHECK is not optional on any of these. A USING-only write policy is the
-- most common multi-tenant RLS hole there is: it checks the row you are
-- modifying but not the row you are writing, which lets a Spain manager insert a
-- membership into UK.
create policy community_members_manage on public.community_members
  for insert to authenticated
  with check (community_id in (select public.my_managed_scopes()));

create policy community_members_update on public.community_members
  for update to authenticated
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

-- A creator may leave a chapter themselves, but nobody may leave the network:
-- Worldwide membership is permanent, and that is enforced here rather than by
-- the UI hiding a button.
create policy community_members_leave on public.community_members
  for delete to authenticated
  using (
    (
      profile_id = (select auth.uid())
      and community_id not in (select id from public.communities where kind = 'network')
    )
    or community_id in (select public.my_managed_scopes())
  );

-- ------------------------------------------------------------------ channels
-- Staff rooms are invisible to creators. This is a visibility rule on the
-- channel, checked in the database, so a creator who guesses the URL still gets
-- nothing back.
create policy channels_read on public.channels
  for select to authenticated
  using (
    community_id in (select public.my_scopes())
    and (
      visibility = 'scope'
      or community_id in (select public.my_managed_scopes())
    )
  );

create policy channels_manage on public.channels
  for all to authenticated
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

-- ---------------------------------------------------------- community_invites
-- Invites are staff-only in both directions. A creator never selects from this
-- table: redeeming a token goes through a SECURITY DEFINER RPC in a later phase,
-- so the token itself is never exposed to a client that did not create it.
create policy community_invites_manage on public.community_invites
  for all to authenticated
  using (community_id in (select public.my_managed_scopes()))
  with check (community_id in (select public.my_managed_scopes()));

-- ------------------------------------------------------- snapshot stays shut
-- The 073 snapshot is a reversal record for the team, not application data. It
-- keeps zero policies (deny-all, service role only) on purpose.
