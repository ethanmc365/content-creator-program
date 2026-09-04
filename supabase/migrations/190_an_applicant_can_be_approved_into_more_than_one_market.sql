-- ONE APPLICANT, SEVERAL MARKETS.
--
-- Ethan: "I seem to be unable to choose multiple ones, which I want to be able
-- to do - like UK & Ireland and Spain, for example."
--
-- Migration 188 took a single slug, on the reasoning that a country resolves to
-- exactly one market. That is true of the COUNTRY and it was never true of the
-- person: `community_members` has always been many-to-many, the network shell
-- has always had a market switcher, and Ethan himself is a member of all six.
-- A creator who lives in London and films in Spain is useful to both, and the
-- thing standing in the way of saying so was this function's signature.
--
-- WHAT "HOME" MEANS WHEN THERE ARE SEVERAL. Exactly one chapter membership
-- carries `is_home` - it is what the hub opens on and what a market's roster
-- counts - so the FIRST slug in the array is the home one and the rest are
-- ordinary memberships. The client sends the suggested market first when it is
-- selected, so the default answer is unchanged from 188.
--
-- The old single-slug signature is DROPPED rather than left beside this one.
-- Two overloads of an admin action is how one of them quietly keeps being
-- called for a year after it stopped being right, and PostgREST resolves
-- overloads by argument names, so the wrong one is one typo away.

drop function if exists public.admin_approve_application(uuid, text);

create or replace function public.admin_approve_application(
  target uuid,
  p_market_slugs text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile public.profiles%rowtype;
  v_slugs   text[] := coalesce(p_market_slugs, '{}');
  v_slug    text;
  v_market  public.communities%rowtype;
  v_names   text[] := '{}';
  v_had_home boolean;
  v_first   boolean := true;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into v_profile from public.profiles where id = target;
  if v_profile.id is null then
    raise exception 'Creator not found';
  end if;

  -- EVERY SLUG IS RESOLVED AND CHECKED BEFORE ANYTHING IS WRITTEN, so a typo in
  -- the third one cannot leave somebody approved and half-placed.
  foreach v_slug in array v_slugs loop
    select * into v_market from public.communities where slug = v_slug;
    if v_market.id is null then
      raise exception 'No market called "%"', v_slug;
    end if;
    if v_market.kind <> 'chapter' then
      raise exception '% is not a market', v_market.name;
    end if;
  end loop;

  update public.profiles set status = 'active' where id = target;

  -- Does this creator already have a home chapter? An admin adding markets to
  -- somebody must not silently move a home they already have.
  v_had_home := exists (
    select 1
    from public.community_members m
    join public.communities c on c.id = m.community_id
    where m.profile_id = target and m.is_home and c.kind = 'chapter'
  );

  foreach v_slug in array v_slugs loop
    select * into v_market from public.communities where slug = v_slug;

    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_market.id, target, 'creator', v_first and not v_had_home, 'active')
    on conflict (community_id, profile_id)
      do update set status = 'active';

    v_names := v_names || v_market.name;
    v_first := false;
  end loop;

  return jsonb_build_object(
    'creator', v_profile.name,
    'markets', to_jsonb(v_names),
    -- A sentence the client can print without reassembling it, so the toast and
    -- the confirmation dialog cannot drift apart from what actually happened.
    'summary', case
      when array_length(v_names, 1) is null then 'the worldwide community only'
      when array_length(v_names, 1) = 1 then v_names[1]
      else array_to_string(v_names[1:array_length(v_names,1)-1], ', ')
           || ' and ' || v_names[array_length(v_names,1)]
    end
  );
end;
$function$;

revoke all on function public.admin_approve_application(uuid, text[]) from public, anon;
grant execute on function public.admin_approve_application(uuid, text[]) to authenticated;
