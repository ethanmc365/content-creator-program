-- 359: the summary is a template too ("how you are paid by views in {{market}}"), so it is filled in like the body.
create or replace function public.my_pending_agreements()
returns setof public.agreements
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare me record; a public.agreements;
begin
  select p.id, p.status, exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active') as vip
    into me from public.profiles p where p.id = auth.uid();
  if me.id is null or me.status not in ('active', 'muted', 'pending') then return; end if;
  for a in
    select (public.agreement_for(x, me.id)).* from unnest(case when me.vip then array['creator', 'vip'] else array['creator'] end) x
  loop
    if a.id is not null and not exists (select 1 from public.agreement_acceptances x where x.agreement_id = a.id and x.profile_id = me.id) then
      a.body := public.agreement_render(a.body, me.id);
      a.summary := public.agreement_render(a.summary, me.id);
      return next a;
    end if;
  end loop;
end $$;

create or replace function public.agreement_for_me(p_agreement uuid)
returns setof public.agreements
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_agreement and (published_at is not null or public.is_admin());
  if a.id is null then return; end if;
  a.body := public.agreement_render(a.body, auth.uid());
  a.summary := public.agreement_render(a.summary, auth.uid());
  return next a;
end $$;
