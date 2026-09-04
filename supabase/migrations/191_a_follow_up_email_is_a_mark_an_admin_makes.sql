-- "WE SENT THEM A FOLLOW-UP" IS A FACT SOMEBODY RECORDS, NOT ONE WE INFER.
--
-- Ethan, on the half-finished signups: "the send email doesn't really make
-- sense - we don't have email automation, so don't have a send email button.
-- Just say follow-up email. Whenever you click it, that means that you've sent
-- the follow-up email. Clicking it again will mean you haven't - so it's just a
-- mark so we know which ones have got the follow-up email."
--
-- That is exactly right for where this platform actually is. All outbound mail
-- is paused until mail.tryp.com exists, so a "Send" button would either lie or
-- queue something nobody will ever receive. What a market manager needs is a
-- shared checklist: they write the mail from their own mailbox and tick it off
-- here, and the next manager can see it has been done.
--
-- A TIMESTAMP RATHER THAN A BOOLEAN, because "when" is free and answers the
-- question a boolean cannot: it has been three weeks, chase them again.
--
-- ADMINS ONLY. `profiles` has an "update own" policy, so without adding this to
-- `protect_admin_columns` a creator could quietly mark themselves as followed
-- up. It is a small thing to be able to lie about and there is no reason to
-- allow it.

alter table public.profiles
  add column if not exists followed_up_at timestamptz;

comment on column public.profiles.followed_up_at is
  'When an admin recorded sending a follow-up email to a half-finished signup. Set by hand from /admin/applications; there is no automation behind it.';

create or replace function public.protect_admin_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status
         or new.role_title is distinct from old.role_title
         or coalesce(new.is_test, false) is distinct from coalesce(old.is_test, false)
         or coalesce(new.is_sandbox, false) is distinct from coalesce(old.is_sandbox, false)
         or new.referred_by is distinct from old.referred_by
         or new.accepted_at is distinct from old.accepted_at
         -- Added 4 Sep 2026 with the column itself.
         or new.followed_up_at is distinct from old.followed_up_at then
        raise exception 'Only admins can change admin, status, title, test, sandbox, referral, acceptance or follow-up fields';
      end if;
    end if;

    if old.platform_role = 'owner' and auth.uid() <> old.id then
      if new.platform_role is distinct from old.platform_role
         or new.role_title is distinct from old.role_title
         or new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status then
        raise exception 'The programme lead cannot be changed by anyone else';
      end if;
    end if;

    if new.platform_role is distinct from old.platform_role
       and not public.is_owner() then
      raise exception 'Only the programme lead can change platform roles';
    end if;
  end if;
  return new;
end;
$function$;

-- THE WALKTHROUGH IS ON. It was built, rebuilt twice and never switched on, so
-- no creator has ever seen it - which is what Ethan was reporting when he said
-- "this new account didn't show up the tutorial at all". Migration 107
-- backfilled every existing creator as done, so only NEW creators meet it.
update public.app_settings set value = 'true'::jsonb where key = 'tour_enabled';
