-- 351: Video Ideas, the FAQ, and signed agreements (7 Oct 2026).

-- ===================================================================== VIDEO IDEAS ==
-- Ethan: "create a space ... that shows the top videos that the general community members have access to and that
-- the VIP creators have access to, so they can view the top videos and get ideas from them ... only show videos that
-- have got 50k or more." The source is the video tracker the team already curates (tracked_videos, >= 10k there);
-- this hands any member the 50k+ ones, with nothing the admin page keeps for itself (notes, sync state).
create or replace function public.video_ideas(p_min bigint default 50000)
returns table(id uuid, platform text, video_url text, thumbnail_url text, posted_at timestamptz, views bigint,
              hook text, caption text, tags text[], creator_id uuid, creator_name text, creator_handle text,
              creator_photo text, market_name text, market_slug text, challenge_title text, pinned boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.platform, t.video_url, t.thumbnail_url, t.posted_at, t.views,
         t.hook, left(t.caption, 400), t.tags, t.creator_id, coalesce(t.creator_name, p.name), t.creator_handle,
         p.photo_url, m.name, m.slug, coalesce(c.title, h.title), t.pinned
    from public.tracked_videos t
    left join public.profiles p on p.id = t.creator_id
    left join public.communities m on m.id = t.community_id
    left join public.challenges c on c.id = t.challenge_id
    left join public.challenge_history h on h.id = t.history_id
   where public.is_member()
     and t.qualifies
     and coalesce(t.views, 0) >= greatest(coalesce(p_min, 50000), 50000)
   order by t.views desc nulls last
   limit 200
$$;

-- ============================================================================= FAQ ==
-- Ethan: "build a frequently asked questions page ... as an admin you'll be able to click the edit button at the top
-- and edit those frequently asked questions. Also anyone can ask a new question and we can reply to it ... delete
-- that or edit the question to structure it better ... headings, bold, and maybe the ability to add an image."
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'General',
  question text not null check (length(btrim(question)) between 3 and 300),
  answer text not null default '',
  position integer not null default 0,
  published boolean not null default true,
  from_question uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faqs enable row level security;
create policy "faqs: members read published" on public.faqs for select to authenticated
  using ((published and public.is_member()) or public.is_admin());
create policy "faqs: admins write" on public.faqs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.faq_questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  question text not null check (length(btrim(question)) between 5 and 600),
  details text,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer text,
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  is_public boolean not null default false,
  faq_id uuid references public.faqs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faq_questions enable row level security;
-- Your own questions, the answered ones the team made public, and everything for the team.
create policy "faq_questions: read" on public.faq_questions for select to authenticated
  using (asker_id = (select auth.uid()) or (is_public and status = 'answered' and public.is_member()) or public.is_admin());
create policy "faq_questions: ask" on public.faq_questions for insert to authenticated
  with check (asker_id = (select auth.uid()) and public.can_post() and status = 'open' and answer is null and not is_public);
-- The asker can reword or withdraw a question the team has not answered yet; the team can do anything.
create policy "faq_questions: asker edits open" on public.faq_questions for update to authenticated
  using (asker_id = (select auth.uid()) and status = 'open')
  with check (asker_id = (select auth.uid()) and status = 'open' and answer is null and not is_public);
create policy "faq_questions: asker withdraws open" on public.faq_questions for delete to authenticated
  using (asker_id = (select auth.uid()) and status = 'open');
create policy "faq_questions: admins" on public.faq_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create index if not exists faq_questions_status_idx on public.faq_questions (status, created_at desc);

-- The team hears about a new question; the asker hears about the answer.
create or replace function public.faq_question_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(name, ''), 'A creator') into v_name from public.profiles where id = new.asker_id;
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'feedback', v_name || ' asked a question', left(new.question, 140), '/help/faq?tab=questions'
      from public.profiles p where p.is_admin and p.id <> new.asker_id and not coalesce(p.is_test, false);
  elsif tg_op = 'UPDATE' and new.status = 'answered' and old.status is distinct from 'answered' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.asker_id, 'announcement', 'Your question has an answer', left(new.question, 140), '/help/faq?tab=mine');
  end if;
  return null;
exception when others then
  -- A notice must never stop a question being asked or answered.
  raise warning 'faq_question_notify: %', sqlerrm;
  return null;
end $$;
drop trigger if exists trg_faq_question_notify on public.faq_questions;
create trigger trg_faq_question_notify after insert or update of status on public.faq_questions
  for each row execute function public.faq_question_notify();

-- ====================================================================== AGREEMENTS ==
-- Ethan: "create better terms for the VIP community ... and similar terms for the general community ... it should
-- show up to every creator when they log in ... Whenever we update the terms they'll be notified and have to
-- reaccept them ... for the VIPs, could you build in the function where they actually sign it ... so it's actually
-- signed and we have a record."
--
-- One row per published VERSION of a document. A new version is a new row; old ones are kept for ever because an
-- acceptance points at the exact text that was accepted. `audience` decides who is asked: 'creator' is every member,
-- 'vip' is every active VIP. `requires_signature` makes the screen ask for a typed or drawn signature rather than a
-- tick. `body_sha256` is a fingerprint of the exact text, stored again on every acceptance.
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('creator', 'vip')),
  version integer not null,
  title text not null,
  summary text not null default '',
  body text not null,
  body_sha256 text generated always as (encode(extensions.digest(body, 'sha256'), 'hex')) stored,
  requires_signature boolean not null default false,
  effective_at timestamptz,
  published_at timestamptz,
  change_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audience, version)
);
alter table public.agreements enable row level security;
-- Published terms are public (the sign-up page links to them); drafts are the team's.
create policy "agreements: read published" on public.agreements for select to anon, authenticated
  using (published_at is not null or public.is_admin());
create policy "agreements: admins write drafts" on public.agreements for all to authenticated
  using (public.is_admin() and published_at is null)
  with check (public.is_admin() and published_at is null);

create table if not exists public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  method text not null check (method in ('click', 'typed', 'drawn')),
  signed_name text,
  signature_svg text,
  body_sha256 text not null,
  account_email text,
  ip text,
  user_agent text,
  locale text,
  unique (agreement_id, profile_id)
);
alter table public.agreement_acceptances enable row level security;
create policy "agreement_acceptances: own or team" on public.agreement_acceptances for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());
-- Written only by accept_agreement(), which takes the time, the fingerprint, the address and the IP itself.

-- The documents somebody still has to accept: the newest published version of each document their account is in
-- the audience for, unless they have accepted that version.
create or replace function public.my_pending_agreements()
returns setof public.agreements
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select p.id, p.status, coalesce(p.is_test, false) as is_test,
           exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active') as vip
      from public.profiles p where p.id = auth.uid()
  ), latest as (
    select distinct on (a.audience) a.*
      from public.agreements a
     where a.published_at is not null and a.published_at <= now()
     order by a.audience, a.version desc
  )
  select l.* from latest l, me
   where me.status in ('active', 'muted', 'pending')
     and (l.audience = 'creator' or (l.audience = 'vip' and me.vip))
     and not exists (select 1 from public.agreement_acceptances x where x.agreement_id = l.id and x.profile_id = me.id)
   order by case l.audience when 'creator' then 0 else 1 end
$$;

create or replace function public.accept_agreement(p_agreement uuid, p_method text, p_signed_name text default null,
                                                   p_signature_svg text default null, p_locale text default null)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare a public.agreements; v_headers json; v_ip text; v_ua text; v_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into a from public.agreements where id = p_agreement and published_at is not null;
  if a.id is null then raise exception 'That document is not published.'; end if;
  if p_method not in ('click', 'typed', 'drawn') then raise exception 'Unknown way of accepting.'; end if;
  if a.requires_signature then
    if p_method = 'click' then raise exception 'This agreement needs your signature.'; end if;
    if length(btrim(coalesce(p_signed_name, ''))) < 3 then raise exception 'Type your full name to sign.'; end if;
    if p_method = 'drawn' and length(coalesce(p_signature_svg, '')) < 40 then raise exception 'Draw your signature to sign.'; end if;
  end if;
  if length(coalesce(p_signature_svg, '')) > 200000 then raise exception 'That signature is too large.'; end if;
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', ''), ',', 1);
    v_ua := left(v_headers->>'user-agent', 400);
  exception when others then v_ip := null; v_ua := null;
  end;
  insert into public.agreement_acceptances (agreement_id, profile_id, method, signed_name, signature_svg, body_sha256,
                                            account_email, ip, user_agent, locale)
  values (a.id, auth.uid(), p_method, nullif(btrim(coalesce(p_signed_name, '')), ''), p_signature_svg, a.body_sha256,
          (select email from auth.users where id = auth.uid()), nullif(btrim(v_ip), ''), v_ua, p_locale)
  on conflict (agreement_id, profile_id) do nothing
  returning accepted_at into v_at;
  -- The VIP agreement is also the VIP programme's terms: keep the older per-programme flag in step so the VIP page's
  -- own terms gate does not ask a second time.
  if a.audience = 'vip' then
    update public.vip_members m set terms_accepted_at = now(), terms_version = p.terms_version
      from public.vip_programmes p
     where m.profile_id = auth.uid() and m.status = 'active' and p.id = m.programme_id;
  end if;
  return coalesce(v_at, now());
end $$;

-- Everything one person has accepted, newest first, with the text they accepted (Settings > Agreements).
create or replace function public.my_agreements()
returns table(acceptance_id uuid, agreement_id uuid, audience text, version integer, title text, accepted_at timestamptz,
              method text, signed_name text, signature_svg text, body_sha256 text, is_current boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select x.id, a.id, a.audience, a.version, a.title, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.body_sha256,
         a.version = (select max(b.version) from public.agreements b where b.audience = a.audience and b.published_at is not null)
    from public.agreement_acceptances x join public.agreements a on a.id = x.agreement_id
   where x.profile_id = auth.uid()
   order by x.accepted_at desc
$$;

-- Publishing a version makes it the one everybody in its audience is asked to accept, and tells them.
create or replace function public.publish_agreement(p_agreement uuid, p_notify boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare a public.agreements; v_first boolean;
begin
  if not public.is_global_admin() then raise exception 'Only the Tryp.com team can publish terms.'; end if;
  select * into a from public.agreements where id = p_agreement;
  if a.id is null then raise exception 'No such document.'; end if;
  if a.published_at is not null then return; end if;
  v_first := not exists (select 1 from public.agreements where audience = a.audience and published_at is not null);
  update public.agreements set published_at = now(), effective_at = coalesce(effective_at, now()), updated_at = now() where id = a.id;
  if p_notify and not v_first then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'announcement',
           case a.audience when 'vip' then 'We updated the VIP agreement' else 'We updated the community terms' end,
           coalesce(nullif(a.change_note, ''), 'Please read what changed and accept the new version.'), '/agreements'
      from public.profiles p
     where p.status in ('active', 'muted') and not coalesce(p.is_test, false)
       and (a.audience = 'creator' or exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active'));
  end if;
end $$;

-- The team's register: who has accepted the current version of each document, and how.
create or replace function public.agreement_register(p_agreement uuid)
returns table(profile_id uuid, name text, photo_url text, status text, is_vip boolean, accepted_at timestamptz,
              method text, signed_name text, signature_svg text, ip text, user_agent text, account_email text, body_sha256 text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.name, p.photo_url, p.status, p.is_vip, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.ip,
         x.user_agent, x.account_email, x.body_sha256
    from public.agreements a
    join public.profiles p on (a.audience = 'creator' and p.status in ('active', 'muted'))
                           or (a.audience = 'vip' and exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active'))
    left join public.agreement_acceptances x on x.agreement_id = a.id and x.profile_id = p.id
   where a.id = p_agreement and public.is_admin() and not coalesce(p.is_test, false)
   order by x.accepted_at desc nulls last, p.name
$$;

-- Grants, each its own statement (the no_new_function_is_public event trigger; default privileges re-grant).
revoke execute on function public.faq_question_notify() from public, anon, authenticated;
revoke execute on function public.video_ideas(bigint) from anon;
revoke execute on function public.my_pending_agreements() from anon;
revoke execute on function public.accept_agreement(uuid, text, text, text, text) from anon;
revoke execute on function public.my_agreements() from anon;
revoke execute on function public.publish_agreement(uuid, boolean) from anon;
revoke execute on function public.agreement_register(uuid) from anon;
grant select on public.agreements to anon;
