-- 335 (4 Oct 2026): EXAMPLE VIP BONUSES AND TARGETS, LIVE, SO THE SCREENS HAVE SOMETHING IN THEM.
--
-- Ethan: "Just have them live. Currently there are no creators, so I can then check them and delete them if needed. Same for targets ... we
-- just set up those bonuses so there's actually stuff here." Six ordinary bonuses for every VIP market, this month's KPI goals for every
-- market, and a monthly target on the sandbox VIP so "hit your target" has someone to hit it. Every row says it is an example in its note;
-- delete or edit any of them in VIP tools. Idempotent: a market that already has a bonus with the same name is left alone.
do $$
declare
  p record; v_owner uuid; y int := extract(year from now())::int; m int := extract(month from now())::int;
begin
  select id into v_owner from public.profiles where platform_role = 'owner' and not coalesce(is_test, false) order by created_at limit 1;
  for p in select id from public.vip_programmes where active loop
    insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount, places, conditions, active, note, created_by)
    select p.id, x.label, x.kind, x.scope, x.reward, x.amount, x.places::jsonb, x.conditions::jsonb, true, 'Example bonus. Edit or delete it in VIP tools, Money, Bonuses.', v_owner
    from (values
      ('Most views of the month', 'top_n', 'market', 'cash', 0, '[{"place":1,"amount":100,"reward":"cash"},{"place":2,"amount":50,"reward":"cash"},{"place":3,"amount":25,"reward":"cash"}]', '{}'),
      ('Video of the month', 'best_video', 'market', 'cash', 50, '[]', '{}'),
      ('Monthly target hit', 'target', 'creator', 'cash', 25, '[]', '{"own":true}'),
      ('100,000 views in a month', 'target', 'creator', 'cash', 40, '[]', '{"own":false,"views":100000}'),
      ('A million-view video', 'milestone', 'creator', 'cash', 150, '[]', '{"metric":"best_video_views","threshold":1000000}'),
      ('Six months as a VIP', 'milestone', 'creator', 'voucher', 50, '[]', '{"metric":"months_active","threshold":6}')
    ) as x(label, kind, scope, reward, amount, places, conditions)
    where not exists (select 1 from public.vip_bonus_rules r where r.programme_id = p.id and r.label = x.label);

    insert into public.vip_kpi_targets (programme_id, year, month, metric, target_value, created_by)
    select p.id, y, m, k.metric, k.v, v_owner
    from (values ('views', 500000), ('videos', 40), ('active_creators', 10), ('new_vips', 5), ('spend', 1500), ('cpm', 0.30), ('stay_in', 8)) as k(metric, v)
    on conflict (programme_id, year, month, metric) do nothing;
  end loop;

  -- The sandbox VIP: twelve videos and 100,000 views this month, so a target bonus has a target to measure.
  update public.vip_members vm set target_videos = 12, target_views = 100000
   where vm.profile_id in (select id from public.profiles where is_sandbox) and vm.target_videos is null and vm.target_views is null;
end $$;
