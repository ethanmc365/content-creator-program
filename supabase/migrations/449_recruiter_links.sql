-- 449 (20 Oct 2026): RECRUITER LINKS. Ethan: "create a custom link for a Tryp.com team member, so, for example, Paula
-- ... track exactly how many people are getting referred in from the links ... these will never expire ... a separate
-- link for the general community and for the VIP community."
--
--   recruit_links            one row per link: a short code (/r/<code>), who it belongs to, community or VIP, a label,
--                            and a click count. Team only (RLS). Never expires; it can be archived.
--   recruit_link_open(code)  public (allowlisted): counts a click and says where the link goes. A VIP link hands back
--                            the permanent VIP sign-up link's token, the same one already shared publicly.
--   admin_recruit_link_stats every link with its clicks, sign-ups, finished onboarding, approved and VIP joins.
--
-- Attribution: the app stores {source: 'recruiter', campaign: <code>} as the sign-up source the moment /r/<code> is
-- opened (overriding any earlier first touch on that device), and onboarding writes it onto the profile.
--
-- Also: Paula Enamorado (Tryp.com Official Spain) joins the Tryp.com team as Recruitment, with access to every VIP and
-- official programme (vip_managers), and her two links: /r/paula (community) and /r/paula-vip (VIP).

create table if not exists public.recruit_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  owner_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('community', 'vip')),
  label text check (char_length(label) <= 120),
  clicks integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
alter table public.recruit_links enable row level security;
revoke all on public.recruit_links from anon;
drop policy if exists recruit_links_team on public.recruit_links;
create policy recruit_links_team on public.recruit_links for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop trigger if exists trg_sandbox_read_only on public.recruit_links;
create trigger trg_sandbox_read_only before insert or update or delete on public.recruit_links
  for each row execute function public.sandbox_is_read_only();

create or replace function public.recruit_link_open(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_token text;
begin
  update public.recruit_links set clicks = clicks + 1
   where code = lower(btrim(coalesce(p_code, ''))) and archived_at is null
  returning kind into v;
  if not found then return jsonb_build_object('ok', false); end if;
  if v.kind = 'vip' then
    select token into v_token from public.vip_invites
     where is_global and revoked_at is null and (expires_at is null or expires_at > now())
     order by created_at desc limit 1;
  end if;
  return jsonb_build_object('ok', true, 'kind', v.kind, 'vip_token', v_token);
end $$;
insert into public.public_rpc_allowlist (proname, reason)
values ('recruit_link_open', 'a recruiter link is opened before anybody has an account; counts a click and returns where it goes')
on conflict do nothing;

create or replace function public.admin_recruit_link_stats()
returns table (link_id uuid, signups bigint, finished bigint, approved bigint, vips bigint, last_signup timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select l.id,
         count(p.id),
         count(p.id) filter (where p.onboarded),
         count(p.id) filter (where p.status = 'active'),
         count(p.id) filter (where p.is_vip),
         max(p.created_at)
    from public.recruit_links l
    left join public.profiles p
      on p.signup_source ->> 'source' = 'recruiter' and p.signup_source ->> 'campaign' = l.code
     and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
   where public.is_admin()
   group by l.id
$$;

select public.lock_down_definer_functions();

-- Paula: the Tryp.com team (Recruitment), every VIP and official programme, and her two links.
do $$
declare v_p uuid := '279d3fd1-e435-4333-875a-07fb02d1fd83';
begin
  update public.profiles set is_admin = true, platform_role = 'global_admin', role_title = 'Recruitment'
   where id = v_p and platform_role <> 'owner';
  insert into public.vip_managers (profile_id, programme_id)
  select v_p, vp.id from public.vip_programmes vp where vp.active
  on conflict do nothing;
  insert into public.recruit_links (code, owner_id, kind, label) values
    ('paula', v_p, 'community', 'Paula, community'),
    ('paula-vip', v_p, 'vip', 'Paula, VIP')
  on conflict (code) do nothing;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  values (null, 'Migration 449', 'Promoted to Tryp.com team (Recruitment, every VIP programme)', v_p, 'Paula Enamorado');
end $$;
