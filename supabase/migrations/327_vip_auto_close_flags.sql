-- 327 (4 Oct 2026): WHAT STOPS A MONTH ADDING ITSELF TO BALANCES. Migration 322 held back every statement with ANY flag, which included "no
-- payment details" and "missed the stay-in requirement" - things that do not change what a creator earned. Now only a disqualified video, an
-- unreadable view count or an inactive creator wait for a person; an empty month is marked done quietly (no "your statement is ready").
-- Body is the LIVE vip_close_due with that one block replaced.
CREATE OR REPLACE FUNCTION public.vip_close_due()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int; v_missed int; v_auto int; v_sid uuid;
begin
  for p in select id from public.vip_programmes where active loop
    perform public.vip_ensure_month(p.id);
  end loop;

  for m in select * from public.vip_months where status = 'open' and final_sync_at is null and now() >= ends_at - interval '25 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
    update public.vip_months set final_sync_at = now(), status = 'closing' where id = m.id;
    v_synced := v_synced + 1;
  end loop;

  for m in select * from public.vip_months where status = 'closing' and now() < ends_at + interval '20 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
  end loop;

  for m in select * from public.vip_months
            where status = 'closing' and now() >= ends_at + interval '30 minutes'
              and now() >= final_sync_at + interval '30 minutes' loop
    v_n := public.vip_compute_statements(m.id);
    v_missed := public.vip_record_requirements(m.id);
    v_auto := 0;
    if coalesce((select auto_approve from public.vip_programmes where id = m.programme_id), true) then
      -- Nothing here needs a person unless a video was taken out, a view count could not be read, or the creator is not active.
      -- A missing bank account or a missed stay-in month does not stop money landing in a balance (cash needs the account when it is
      -- asked for; the stay-in check has its own list). A month with nothing in it is simply marked done, without a notification.
      for v_sid in select id from public.vip_statements s where s.month_id = m.id and s.status = 'draft'
                     and not (coalesce(s.flags, '[]'::jsonb) ?| array['video_disqualified', 'unreadable_video', 'not_active']) loop
        begin
          if (select total = 0 and jsonb_array_length(coalesce(bonuses, '[]'::jsonb)) = 0 from public.vip_statements where id = v_sid) then
            update public.vip_statements set status = 'approved', approved_at = now(), updated_at = now() where id = v_sid;
          else
            perform public.vip_approve_statement(v_sid);
          end if;
          v_auto := v_auto + 1;
        exception when others then null;  -- it stays a draft for a person; one bad statement must not stop the month
        end;
      end loop;
    end if;
    if v_missed > 0 then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', v_missed || ' VIP' || case when v_missed = 1 then '' else 's' end || ' missed the monthly requirement',
             to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': keep, warn, pause or remove them.',
             '/vip?mode=tools&tab=requirements'
        from public.vip_manager_ids(m.programme_id) mgr;
    end if;
    update public.vip_months set status = 'closed', closed_at = now() where id = m.id;
    perform public.vip_ensure_month(m.programme_id, m.ends_at + interval '1 hour');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', case when v_auto > 0 then 'A VIP month closed' else 'A VIP month is ready to review' end,
           to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': ' || v_auto || ' added to balances automatically' ||
           case when v_n - v_auto > 0 then ', ' || (v_n - v_auto) || ' waiting for a look.' else '.' end,
           '/vip?mode=tools&tab=close'
      from public.vip_manager_ids(m.programme_id) mgr;
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('synced', v_synced, 'closed', v_closed);
end $function$;
