-- 333 (4 Oct 2026): THE COUNTRY LEADERBOARD KNOWS WHICH COUNTRY IS YOURS, AND WHICH OTHERS YOU BELONG TO.
--
-- Ethan: "it should highlight more which one is your home market, and then also highlight another one if you're in another market.
-- Rather than saying 'no home market', maybe call it 'rest of the world'." So each country row now says `mine` (your home market) and
-- `also` (a market you belong to that is not your home), and the creators with no home market are "Rest of the world".

create or replace function public.challenge_market_board(p_challenge uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_me uuid; v_out jsonb; v_none jsonb; v_all boolean := public.is_admin();
begin
  if auth.uid() is null or not (public.is_member() or v_all) then return null; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then return null; end if;

  create temporary table if not exists _cmb (creator uuid, market uuid, entries int, views bigint, points numeric, rnk int, name text, photo text) on commit drop;
  truncate _cmb;
  insert into _cmb
  select pc.creator_id, h.community_id, pc.entries, pc.views, coalesce(r.final_views, 0), r.rank, pr.name, pr.photo_url
    from (select s.creator_id, count(*)::int entries, coalesce(sum(s.logged_views), 0)::bigint views
            from public.submissions s where s.challenge_id = p_challenge group by s.creator_id) pc
    join public.profiles pr on pr.id = pc.creator_id
    left join public.community_members h on h.profile_id = pc.creator_id and h.is_home and h.status = 'active'
    left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.creator_id
   where pr.status = 'active' and not pr.is_admin and (v_all or not pr.is_test);

  select h.community_id into v_me from public.community_members h where h.profile_id = auth.uid() and h.is_home and h.status = 'active' limit 1;

  select coalesce(jsonb_agg(m order by (m ->> 'points')::numeric desc, (m ->> 'views')::bigint desc, m ->> 'name'), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'codes', coalesce(c.country_codes, '{}'),
        'members', (select count(*) from public.community_members cm join public.profiles p2 on p2.id = cm.profile_id
                     where cm.community_id = c.id and cm.is_home and cm.status = 'active' and p2.status = 'active' and not p2.is_admin and (v_all or not p2.is_test)),
        'creators', (select count(*) from _cmb x where x.market = c.id),
        'entries', coalesce((select sum(x.entries) from _cmb x where x.market = c.id), 0),
        'views', coalesce((select sum(x.views) from _cmb x where x.market = c.id), 0),
        'points', coalesce((select sum(x.points) from _cmb x where x.market = c.id), 0),
        'mine', c.id = v_me,
        'also', c.id is distinct from v_me and exists (select 1 from public.community_members mm where mm.profile_id = auth.uid() and mm.community_id = c.id and mm.status = 'active'),
        'people', coalesce((select jsonb_agg(jsonb_build_object('id', x.creator, 'name', x.name, 'photo', x.photo, 'entries', x.entries, 'views', x.views, 'points', x.points, 'rank', x.rnk)
                                       order by x.points desc, x.views desc, x.name) from _cmb x where x.market = c.id), '[]'::jsonb)) as m
        from public.communities c
       where c.kind = 'chapter' and coalesce(c.is_active, true) and c.retired_at is null) q;

  select jsonb_build_object(
      'id', null, 'name', 'Rest of the world', 'slug', null, 'codes', '[]'::jsonb, 'members', null,
      'creators', count(*), 'entries', coalesce(sum(x.entries), 0), 'views', coalesce(sum(x.views), 0), 'points', coalesce(sum(x.points), 0),
      'mine', v_me is null,
      'people', coalesce(jsonb_agg(jsonb_build_object('id', x.creator, 'name', x.name, 'photo', x.photo, 'entries', x.entries, 'views', x.views, 'points', x.points, 'rank', x.rnk)
                                   order by x.points desc, x.views desc, x.name), '[]'::jsonb))
    into v_none from _cmb x where x.market is null;

  return jsonb_build_object('scoring', ch.scoring, 'markets', v_out, 'none', case when (v_none ->> 'creators')::int > 0 then v_none end);
end $function$;
revoke execute on function public.challenge_market_board(uuid) from public, anon;
grant execute on function public.challenge_market_board(uuid) to authenticated;
