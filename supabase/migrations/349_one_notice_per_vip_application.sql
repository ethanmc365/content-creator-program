-- 349: one notice per VIP application, not three.
--
-- Betty signed up on the VIP link on 7 Oct 2026 and Ethan got, in the same
-- second: "New creator awaiting review" (on_creator_ready), "Betty sent in a
-- VIP application" (vip_send_join_notices) and "Betty joined VIP Spain ...
-- approved into your market" (vip_notify_joined, when her home market was
-- settled) - although nobody had approved anything.
--
-- Now:
--  * on_creator_ready writes the ONE staff notice. For a VIP applicant it says
--    so ("... sent in a VIP application") and goes to the admins plus the
--    VIP managers of that programme, once each.
--  * vip_send_join_notices only welcomes the creator; it no longer tells staff.
--  * "joined VIP <market>" is only sent for somebody already approved (status
--    'active'); a pending applicant's settling is covered by the notice above.

create or replace function public.on_creator_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_prog uuid; v_prog_name text; v_name text;
begin
  if new.status = 'pending' and new.onboarded and (old.onboarded is distinct from new.onboarded) then
    v_name := coalesce(nullif(new.name, ''), 'A new creator');
    select m.programme_id, p.name into v_prog, v_prog_name
      from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
     where m.profile_id = new.id and m.status = 'active';
    if v_prog is not null then
      insert into public.notifications (recipient_id, type, title, body, link)
      select r, 'application', v_name || ' sent in a VIP application',
             'They signed up with the VIP link (' || coalesce(v_prog_name, 'VIP') || ') and are waiting in the applications list.',
             '/admin/applications'
        from (select p.id as r from public.profiles p where p.is_admin
              union
              select mgr from public.vip_manager_ids(v_prog) mgr) x
       where r <> new.id;
    else
      insert into public.notifications (recipient_id, type, title, body, link)
      select p.id, 'application', 'New creator awaiting review',
             v_name || ' has submitted their application.',
             '/admin/applications'
        from public.profiles p
       where p.is_admin;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.vip_send_join_notices(p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare m public.vip_members; v_prog text;
begin
  select * into m from public.vip_members where profile_id = p_profile and status = 'active';
  if m.profile_id is null then return; end if;
  select name into v_prog from public.vip_programmes where id = m.programme_id;
  if m.auto_home then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to the Tryp.com VIP creators',
            'Your application is with the team. Once you are approved you are placed in your VIP market.', '/vip');
  else
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
            coalesce(nullif((select welcome_message from public.vip_programmes where id = m.programme_id), ''),
                     'You are paid by the views your videos bring. Add your first video to start your month.'), '/vip');
  end if;
  update public.vip_members set join_notice_pending = false where profile_id = p_profile;
end $function$;

create or replace function public.vip_notify_joined()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_prog text; v_name text; v_sent boolean; v_status text;
begin
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name, coalesce(onboarded, false), status into v_name, v_sent, v_status from public.profiles where id = new.profile_id;

  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    if not coalesce(v_sent, false) then
      update public.vip_members set join_notice_pending = true where profile_id = new.profile_id;
      return null;
    end if;
    if tg_op = 'UPDATE' and old.auto_home and not new.auto_home and new.programme_id is distinct from old.programme_id then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (new.profile_id, 'vip', 'You are in ' || coalesce(v_prog, 'your VIP programme'),
              'Your VIP place now sits with your own market, so your rooms, board and payouts are theirs.', '/vip');
      -- Only for somebody approved: a pending applicant was already announced once, by on_creator_ready.
      if v_status = 'active' then
        insert into public.notifications (recipient_id, type, title, body, link)
        select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'),
               'They were approved into your market.', '/admin/vip?tab=members'
          from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
      end if;
      return null;
    end if;
    perform public.vip_send_join_notices(new.profile_id);
  elsif tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are back with the community creators',
            'Your VIP place has ended. The challenges, points and leaderboard are yours again, and past payouts are still paid.', '/challenges');
  elsif tg_op = 'UPDATE' and new.status = 'paused' and old.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your VIP place is paused', 'New views are not being counted while it is paused. Ask your market lead if that is a surprise.', '/vip');
  end if;
  return null;
end $function$;
