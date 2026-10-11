-- 387 (13 Oct 2026): a market request can be declined without writing anything.
-- Ethan: "I'm unable to press Decline. It shows the pop-up, and if I press Decline again, it should automatically decline
-- without me saying anything ... currently I have to write something to be able to decline." A reason is optional now;
-- without one the creator reads a short, kind standard line instead.
create or replace function public.decide_join_request(p_request uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r record; v_name text; v_slug text; v_reason text;
begin
  if not public.is_admin() then raise exception 'Only admins can decide a join request'; end if;
  select * into r from public.market_join_requests where id = p_request;
  if r is null then raise exception 'No such request'; end if;
  if r.status <> 'pending' then raise exception 'That request has already been decided'; end if;
  select name, slug into v_name, v_slug from public.communities where id = r.community_id;
  if p_accept then
    insert into public.community_members (community_id, profile_id, role, status)
    values (r.community_id, r.profile_id, 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active';
    update public.market_join_requests
       set status = 'accepted', decided_by = auth.uid(), decided_at = now(), decision_note = null
     where id = p_request;
    insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
    select auth.uid(), (select name from public.profiles where id = auth.uid()),
           'Accepted a request to join ' || coalesce(v_name, 'a market'), r.profile_id, (select name from public.profiles where id = r.profile_id);
    perform public.notify_user(
      r.profile_id, 'community',
      format('You are in: %s', coalesce(v_name, 'a new market')),
      'Your request was accepted. You keep your other markets too. Say hello in the introductions room.',
      case when v_slug is not null then '/c/' || v_slug else '/global' end);
  else
    v_reason := coalesce(nullif(btrim(coalesce(p_reason, '')), ''),
      format('Thanks for asking. We cannot add you to %s at the moment, but you keep creating with your own market.', coalesce(v_name, 'that market')));
    update public.market_join_requests
       set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_request;
    insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
    select auth.uid(), (select name from public.profiles where id = auth.uid()),
           'Declined a request to join ' || coalesce(v_name, 'a market'), r.profile_id, (select name from public.profiles where id = r.profile_id);
    perform public.notify_user(
      r.profile_id, 'community',
      format('About joining %s', coalesce(v_name, 'that market')),
      v_reason,
      '/global/markets');
  end if;
end $function$;
