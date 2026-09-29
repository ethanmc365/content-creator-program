-- A LINK THE TRYP.COM TEAM CAN BE SENT, WHICH STILL ENDS IN YOUR APPROVAL.
--
-- Outstanding from the brief: "a shareable link for the Tryp.com team to apply
-- for admin access, with your approval still required, a shortened signup
-- (name, photo, bio, tutorial; no bank details or socials) and a settable role
-- title."
--
-- THE LINK GRANTS NOTHING. That is the whole design, and it is worth being
-- explicit because a URL that leads to admin access is the most dangerous
-- object this platform could own. Holding the token lets somebody FILL IN A
-- SHORTER FORM and be marked as having applied for the team. It does not set
-- `is_admin`, it cannot set `is_admin`, and nothing reachable with the token
-- can: `approve_team_member` is the only route in and it refuses anybody who is
-- not already a global admin.
--
-- So the worst case for a leaked link is a stranger appearing in the
-- applications queue with "applied for the team" on their row. That is a
-- nuisance, not a breach - and `revoked_at` turns the link off in one click.
--
-- PROVEN, not asserted (29 Sep 2026). Against production: an anonymous caller
-- can check a token and can read nothing else; a signed-in NON-admin calling
-- `approve_team_member` is refused with "Only a platform admin can approve
-- somebody onto the team" and the target row is unchanged; a creator claiming a
-- valid token gets `team_application = true` and `is_admin` STAYS FALSE; an
-- admin approving them sets `is_admin` and the title they chose rather than the
-- one on the invite. Every one of those was run and then undone.
--
-- THE ROLE TITLE IS A SUGGESTION UNTIL IT IS APPROVED. The invite can carry one
-- ("Market manager, Spain") so the person following the link does not have to
-- guess what they are applying for, and the approver can change it - which is
-- why the granted title is an argument to `approve_team_member` rather than
-- being copied blindly off the invite.

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  role_title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  uses integer not null default 0,
  revoked_at timestamptz
);

alter table public.team_invites enable row level security;

-- Only a global admin ever reads or writes these rows. The people FOLLOWING a
-- link never touch the table directly; they go through `team_invite_check`,
-- which is SECURITY DEFINER and returns one boolean and two strings.
drop policy if exists "global admins manage team invites" on public.team_invites;
create policy "global admins manage team invites" on public.team_invites
  for all using (public.is_global_admin()) with check (public.is_global_admin());

alter table public.profiles
  add column if not exists team_application boolean not null default false,
  add column if not exists requested_role_title text;

comment on column public.profiles.team_application is
  'Signed up through a team invite link. Marks them in the applications queue; grants nothing.';

-- WHAT A STRANGER MAY ASK ABOUT A TOKEN: whether it works, and what it is for.
-- Not who made it, not how many times it has been used, not the other invites.
create or replace function public.team_invite_check(p_token text)
returns table (valid boolean, role_title text, label text)
language sql stable security definer set search_path to 'public'
as $function$
  select
    coalesce((
      select i.revoked_at is null
         and (i.expires_at is null or i.expires_at > now())
         and (i.max_uses is null or i.uses < i.max_uses)
      from public.team_invites i where i.token = p_token
    ), false),
    (select i.role_title from public.team_invites i where i.token = p_token
      and i.revoked_at is null and (i.expires_at is null or i.expires_at > now())),
    (select i.label from public.team_invites i where i.token = p_token
      and i.revoked_at is null and (i.expires_at is null or i.expires_at > now()));
$function$;

-- MARK THE CALLER AS HAVING APPLIED. Runs as the person who just signed up, so
-- it can only ever touch their own row - `auth.uid()` is the whole of the
-- authorisation, and there is no profile id argument to get wrong.
create or replace function public.claim_team_invite(p_token text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_ok boolean; v_title text;
begin
  if auth.uid() is null then return false; end if;
  select valid, role_title into v_ok, v_title from public.team_invite_check(p_token);
  if not coalesce(v_ok, false) then return false; end if;

  update public.profiles
     set team_application = true,
         requested_role_title = coalesce(requested_role_title, v_title)
   where id = auth.uid();

  update public.team_invites set uses = uses + 1 where token = p_token;
  return true;
end;
$function$;

-- THE ONLY DOOR IN, and it is an admin standing in it.
create or replace function public.approve_team_member(p_profile uuid, p_role_title text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_global_admin() then
    raise exception 'Only a platform admin can approve somebody onto the team.';
  end if;
  update public.profiles
     set is_admin = true,
         status = 'active',
         role_title = coalesce(nullif(trim(coalesce(p_role_title, '')), ''), role_title, requested_role_title),
         team_application = false
   where id = p_profile;
end;
$function$;

revoke all on function public.team_invite_check(text) from public;
revoke all on function public.claim_team_invite(text) from public, anon;
revoke all on function public.approve_team_member(uuid, text) from public, anon;
grant execute on function public.team_invite_check(text) to anon, authenticated;
grant execute on function public.claim_team_invite(text) to authenticated;
grant execute on function public.approve_team_member(uuid, text) to authenticated;

-- Without this the grant above is revoked again by `no_new_function_is_public`
-- at the end of this very migration. See 279 for why that control exists.
insert into public.public_rpc_allowlist (proname, reason)
values (
  'team_invite_check',
  'Team invite links. Answers only "does this token work" and "what role does it name" - no ids, no counts, no other invites. The token grants nothing on its own.'
)
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
