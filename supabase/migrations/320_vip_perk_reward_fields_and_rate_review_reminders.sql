-- 320 (3 Oct 2026): a VIP sees what each perk pays (migration 318 rewards), and the "look at this rate again on" date
-- actually reminds the market's managers on the day (it only marked the Members list before).
do $$
declare v_def text; v_old text := $q$'earned_at', a.earned_at, 'delivered_at', a.delivered_at, 'note', a.note)$q$;
begin
  v_def := pg_get_functiondef('public.vip_my_perks()'::regprocedure);
  assert position(v_old in v_def) > 0, 'vip_my_perks shape not found';
  v_def := replace(v_def, v_old, $q$'earned_at', a.earned_at, 'delivered_at', a.delivered_at, 'note', a.note, 'reward_kind', q.reward_kind, 'reward_amount', q.reward_amount)$q$);
  execute v_def;
end $$;

create or replace function public.vip_rate_review_reminders()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0;
begin
  for r in select m.profile_id, m.programme_id, pf.name, pg.name as pname
             from public.vip_members m join public.profiles pf on pf.id = m.profile_id join public.vip_programmes pg on pg.id = m.programme_id
            where m.status = 'active' and m.rate_review_on = (now() at time zone 'Europe/Madrid')::date loop
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', 'Time to look at ' || coalesce(r.name, 'a VIP') || '''s rate',
           r.pname || ': you set today to review their deal. Open Members to change it or set a new date.',
           '/vip?mode=tools&tab=members'
      from public.vip_manager_ids(r.programme_id) mgr;
    n := n + 1;
  end loop;
  return n;
end $function$;

-- 320b: cron-only, so not callable from the app; every morning at 08:15 UTC.
revoke execute on function public.vip_rate_review_reminders() from authenticated;
select cron.schedule('vip-rate-reviews', '15 8 * * *', $$select public.vip_rate_review_reminders()$$);
