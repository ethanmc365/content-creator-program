-- APPROVING SOMEBODY AND PLACING THEM ARE ONE DECISION, SO THEY ARE ONE CALL.
--
-- Ethan: "the languages you speak is an important section, and I want this to
-- also matter whenever admins are viewing the applications, because the
-- language could also depend what market they end up going into. So yes, it
-- gives a suggested market, but also an admin can then change this whenever
-- they're reviewing the application."
--
-- Until now the market was DERIVED and nobody could override it. Onboarding
-- resolves it from the country and calls `join_market` for the applicant
-- themselves, and that is right for the common case - the country codes do not
-- overlap, so a country IS a market. It is wrong for the case Ethan is
-- describing, which is real and which the country cannot answer: a Portuguese
-- speaker living in the UK is more use to Portugal than to UK & Ireland, and
-- somebody in France (no market) who speaks Spanish belongs in Spain rather
-- than in the worldwide pool by default. That is a judgement, and a judgement
-- needs a person.
--
-- `join_market` cannot be that person's tool. It is deliberately SELF-ONLY
-- (`auth.uid()`), and it enforces the country policy - which is exactly the
-- rule an admin is overriding. Weakening it would remove the guard for
-- everybody in order to serve the one caller allowed past it.
--
-- So: a separate, admin-only function that does the whole approval as one unit.
-- Both halves land or neither does, which matters because "approved but in no
-- market" is a creator with no briefs and no rooms, and that is precisely the
-- state a two-step client-side approval leaves behind when the second step
-- fails.
--
-- p_market_slug null means WORLDWIDE ONLY, and that is a deliberate answer
-- rather than a missing one: a creator in a country no market covers is in the
-- worldwide community with everybody else. The trigger on `profiles` has
-- already put them there.

create or replace function public.admin_approve_application(
  target uuid,
  p_market_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile public.profiles%rowtype;
  v_market  public.communities%rowtype;
  v_had_home boolean;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into v_profile from public.profiles where id = target;
  if v_profile.id is null then
    raise exception 'Creator not found';
  end if;

  -- THE MARKET IS RESOLVED AND CHECKED BEFORE ANYTHING IS WRITTEN, so a typo
  -- in a slug cannot leave somebody approved and unplaced.
  if p_market_slug is not null then
    select * into v_market from public.communities where slug = p_market_slug;
    if v_market.id is null then
      raise exception 'No market called "%"', p_market_slug;
    end if;
    if v_market.kind <> 'chapter' then
      raise exception '% is not a market', v_market.name;
    end if;
  end if;

  update public.profiles set status = 'active' where id = target;

  if v_market.id is not null then
    -- IS THIS THEIR HOME? Only if they have not got one already. A creator can
    -- be in several markets and exactly one of them is home; an admin adding a
    -- second must not silently move the first.
    v_had_home := exists (
      select 1
      from public.community_members m
      join public.communities c on c.id = m.community_id
      where m.profile_id = target and m.is_home and c.kind = 'chapter'
    );

    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_market.id, target, 'creator', not v_had_home, 'active')
    on conflict (community_id, profile_id)
      do update set status = 'active';
  end if;

  return jsonb_build_object(
    'creator', v_profile.name,
    'market', coalesce(v_market.name, 'Worldwide only'),
    'market_slug', v_market.slug
  );
end;
$function$;

revoke all on function public.admin_approve_application(uuid, text) from public, anon;
grant execute on function public.admin_approve_application(uuid, text) to authenticated;
