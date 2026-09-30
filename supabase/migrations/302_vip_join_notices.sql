-- 302: WHAT A VIP IS TOLD WHEN THEY JOIN WITH THE ONE LINK (30 Sep 2026).
--
-- With one link for every market, a creator who signs up is first put in the DEFAULT programme (the database needs one)
-- until the team approves them into their own market. Telling a Romanian applicant "Welcome to VIP Spain", and telling
-- Spain's managers about every applicant from everywhere, would be wrong. So while a VIP is still waiting to be
-- placed (`auto_home`), they are welcomed to the Tryp.com VIP creators, and only the owner is told somebody signed up
-- (the market's own managers are told once the creator is placed with them, which `vip_rehome` already does).
create or replace function public.vip_notify_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog text; v_name text;
begin
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name into v_name from public.profiles where id = new.profile_id;
  if tg_op = 'UPDATE' and old.auto_home and not new.auto_home and new.programme_id is distinct from old.programme_id then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are in ' || coalesce(v_prog, 'your VIP programme'),
            'Your VIP place now sits with your own market, so your rooms, board and payouts are theirs.', '/vip');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with the VIP link and were approved into your market.', '/admin/vip?tab=members'
      from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
    return null;
  end if;
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    if new.auto_home then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (new.profile_id, 'vip', 'Welcome to the Tryp.com VIP creators',
              'Your application is with the team. Once you are approved you are placed with your own market''s VIP programme.', '/vip');
      insert into public.notifications (recipient_id, type, title, body, link)
      select pf.id, 'vip', coalesce(v_name, 'Someone') || ' signed up with the VIP link', 'They are waiting in the applications list, marked as a VIP.', '/admin/applications'
        from public.profiles pf where pf.platform_role = 'owner' and not pf.is_test and pf.id <> new.profile_id;
    else
      insert into public.notifications (recipient_id, type, title, body, link)
      values (new.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
              coalesce(nullif((select welcome_message from public.vip_programmes where id = new.programme_id), ''),
                       'You are paid by the views your videos bring. Add your first video to start your month.'), '/vip');
      if tg_op = 'INSERT' and new.source = 'invite' then
        insert into public.notifications (recipient_id, type, title, body, link)
        select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with a VIP link.', '/admin/vip?tab=members'
          from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are back with the community creators',
            'Your VIP place has ended. The challenges, points and leaderboard are yours again, and past payouts are still paid.', '/challenges');
  elsif tg_op = 'UPDATE' and new.status = 'paused' and old.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your VIP place is paused', 'New views are not being counted while it is paused. Ask your market lead if that is a surprise.', '/vip');
  end if;
  return null;
end $$;
