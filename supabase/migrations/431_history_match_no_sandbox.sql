-- 431: the demo (sandbox) account can open Past earnings but not decide who a sheet name is (16 Oct 2026).
-- Every other money tool refuses sandbox writes; this one is a decision about real people's history.
CREATE OR REPLACE FUNCTION public.vip_history_match(p_programme uuid, p_name text, p_profile uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_comm uuid; v_other text;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team running this market can match names.'; end if;
  if coalesce((select is_sandbox from public.profiles where id = auth.uid()), false) then
    raise exception 'SANDBOX: the demo account can look but not decide.';
  end if;
  if p_status not in ('confirmed', 'former', 'unmatched', 'suggested') then raise exception 'Unknown status.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;
  if not exists (select 1 from public.vip_history_names where community_id = v_comm and creator_name = p_name) then
    raise exception 'That name is not in this market''s history.';
  end if;
  if p_status in ('confirmed', 'suggested') then
    if p_profile is null then raise exception 'Pick who this is.'; end if;
    if not exists (select 1 from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
                    where m.profile_id = p_profile and p.community_id = v_comm) then
      raise exception 'That person is not a paid creator in this market.';
    end if;
    select creator_name into v_other from public.vip_history_names
     where community_id = v_comm and profile_id = p_profile and status = 'confirmed' and creator_name <> p_name limit 1;
    if v_other is not null and p_status = 'confirmed' then
      raise exception 'They are already matched to "%". Unmatch that name first.', v_other;
    end if;
  end if;

  update public.vip_history_names
     set profile_id = case when p_status in ('confirmed', 'suggested') then p_profile end,
         status = p_status, decided_by = auth.uid(), decided_at = now()
   where community_id = v_comm and creator_name = p_name;

  update public.vip_earnings_history h
     set profile_id = case when p_status = 'confirmed' then p_profile end
    from public.vip_programmes hp
   where hp.id = h.programme_id and hp.community_id = v_comm and h.creator_name = p_name;
end $function$;
