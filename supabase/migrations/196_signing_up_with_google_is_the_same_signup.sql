-- SIGNING UP WITH GOOGLE IS THE SAME SIGNUP.
--
-- Ethan, 7 Sep 2026: "can we add Continue with Google on the signup/login page.
-- The only thing is, can we still keep everything as normal so we still register
-- their email as normal? They still complete the onboarding flow as normal. The
-- only thing is they don't have to type in an email and password... But
-- obviously they still enter their name and their profile picture and all the
-- other stuff. Ensure it works - nobody being asked for their email twice."
--
-- Almost none of that needs a schema change, and that is the point worth
-- writing down: an OAuth signup is an `auth.users` INSERT exactly like a
-- password signup, so `handle_new_user` fires, a `pending` profile is created,
-- and `ProtectedRoute` sends them to `/onboarding` because `onboarded` is
-- false. The whole existing flow runs. Two things did not survive the change of
-- door, and this migration is those two things.
--
-- ONE: THE NAME. `handle_new_user` reads `raw_user_meta_data ->> 'name'`, which
-- is what our own signup form writes. Google's OIDC claims put the same fact in
-- `full_name` (and `given_name`), so a Google signup fell through to
-- `split_part(email, '@', 1)` - a profile called "ethan.mcgeough92". That is
-- also the first thing the applicant sees on the review screen, so it reads as
-- the platform having got their name wrong before they have typed anything.
-- The fallback chain now covers both spellings and is ordered most specific
-- first. `avatar_url` is deliberately NOT imported: the production CSP is
-- `img-src 'self'` plus our own storage, so a googleusercontent URL would be
-- blocked and draw a broken image - and onboarding asks for a photo anyway,
-- which is what Ethan asked for.
--
-- TWO: THE REFERRAL. An invite link is `/signup?ref=CODE`, and the code reaches
-- `handle_new_user` because our form passes it in the signup metadata. An OAuth
-- signup cannot: the round trip goes to Google and comes back, and nothing we
-- put in the metadata survives it. So the code is stashed in the browser before
-- the redirect and attached afterwards, through this function.
--
-- IT IS DELIBERATELY NARROW, because "who referred me" is a money fact - a
-- counted referral mints a pending voucher (migration 109). It only ever fills
-- a BLANK, only on an account that has not finished onboarding, only within a
-- day of that account being created, and never with yourself. Anything else is
-- refused silently: this is called on a best-effort path and must never be able
-- to fail a signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- Google/OIDC send `full_name`; our own form sends `name`. Take whichever is
  -- there, and fall back to the local part of the address as before.
  v_name     text := coalesce(
                       nullif(new.raw_user_meta_data ->> 'name', ''),
                       nullif(new.raw_user_meta_data ->> 'full_name', ''),
                       nullif(trim(concat_ws(' ',
                         new.raw_user_meta_data ->> 'given_name',
                         new.raw_user_meta_data ->> 'family_name')), ''),
                       split_part(new.email, '@', 1));
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
$function$;


create or replace function public.attach_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me       uuid := auth.uid();
  v_referrer uuid;
  v_name     text;
begin
  if v_me is null or nullif(trim(p_code), '') is null then return false; end if;

  select id into v_referrer
  from public.profiles
  where referral_code = upper(trim(p_code));

  -- No such code, or somebody trying to refer themselves.
  if v_referrer is null or v_referrer = v_me then return false; end if;

  update public.profiles p
     set referred_by = v_referrer
   where p.id = v_me
     and p.referred_by is null
     and p.onboarded is not true
     and p.created_at > now() - interval '1 day'
  returning p.name into v_name;

  if v_name is null then return false; end if;

  insert into public.notifications (recipient_id, type, title, body, link)
  select a.id, 'referral', 'New referral signup',
         v_name || ' signed up via a referral link.', '/admin/referrals'
  from public.profiles a where a.is_admin;

  return true;
end;
$$;

grant execute on function public.attach_referral(text) to authenticated;
