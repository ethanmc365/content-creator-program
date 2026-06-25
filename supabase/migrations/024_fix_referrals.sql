-- ============================================================================
-- 024 - make referral links actually work
--   The original handle_new_user generated a referral_code and credited the
--   referrer from the ?ref= code, but a later rewrite (admin-approval flow)
--   dropped that. Result: most creators had no referral_code (their invite link
--   was empty) and referred_by was never set (so "joined via your link" and the
--   referral reward never counted). This restores it and backfills codes.
-- ============================================================================
set check_function_bodies = off;

-- Give everyone who's missing one a referral code (derived from their id → unique).
update public.profiles
set referral_code = upper(right(replace(id::text, '-', ''), 8))
where referral_code is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1));
  v_code     text := upper(right(replace(new.id::text, '-', ''), 8));
  v_ref_code text := nullif(new.raw_user_meta_data ->> 'ref', '');
  v_referrer uuid;
  v_admin    boolean := new.email in ('clarehamilton12@gmail.com', 'ethanmc365@gmail.com');
begin
  -- Credit the referrer if the signup came through an invite link.
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code);
  end if;

  insert into public.profiles (id, name, status, is_admin, referral_code, referred_by)
  values (new.id, v_name, case when v_admin then 'active' else 'pending' end, v_admin, v_code, v_referrer);

  -- Let admins know when someone joins through a referral link.
  if v_referrer is not null then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'referral', 'New referral signup',
           v_name || ' signed up via a referral link.', '/admin/referrals'
    from public.profiles p where p.is_admin;
  end if;

  return new;
end;
$$;
