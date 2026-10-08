-- 367 (8 Oct 2026): A PARENT OR GUARDIAN CONFIRMS, RATHER THAN BEING NAMED.
--
-- Ethan: "the parent or guardian ... they don't actually get an email or anything. We just have it in the record,
-- right? Does this comply with all the legal things?" It did not, really. Tryp.com ApS contracts under Danish law,
-- where somebody under 18 cannot alone enter a binding agreement such as a content licence; their guardian has to
-- agree. A name and an address the minor typed proves nothing about the guardian (GDPR art. 8(2) asks for
-- "reasonable efforts" to verify, and a typed name is none). So every acceptance by an under-18 now opens a
-- guardian confirmation with a secret link. The minor sends it to their parent (email from the platform cannot reach
-- outside addresses until mail.tryp.com is verified, so the link is shared by hand); the parent opens it with no
-- account, reads exactly the text their child accepted, and confirms in their own name. Kept: when, from which IP and
-- device. The register shows who is still waiting.

create table if not exists public.guardian_consents (
  acceptance_id  uuid primary key references public.agreement_acceptances(id) on delete cascade,
  token          text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  confirmed_name text,
  ip             text,
  user_agent     text
);
alter table public.guardian_consents enable row level security;
revoke all on public.guardian_consents from anon, authenticated;
grant select on public.guardian_consents to authenticated;
create policy "guardian consents: admins read" on public.guardian_consents for select using ((select public.is_admin()));

create or replace function public.trg_open_guardian_consent()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.guardian_name is not null then
    insert into public.guardian_consents (acceptance_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $function$;
revoke all on function public.trg_open_guardian_consent() from public, anon, authenticated;
drop trigger if exists trg_open_guardian_consent on public.agreement_acceptances;
create trigger trg_open_guardian_consent after insert on public.agreement_acceptances
  for each row execute function public.trg_open_guardian_consent();

-- The minor's own links (to share, and to see whether their parent has confirmed).
create or replace function public.my_guardian_links()
returns table (acceptance_id uuid, title text, guardian_name text, token text, confirmed_at timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select g.acceptance_id, a.title, x.guardian_name, g.token, g.confirmed_at
    from public.guardian_consents g
    join public.agreement_acceptances x on x.id = g.acceptance_id
    join public.agreements a on a.id = x.agreement_id
   where x.profile_id = auth.uid()
   order by x.accepted_at desc
$function$;
revoke all on function public.my_guardian_links() from public, anon;
grant execute on function public.my_guardian_links() to authenticated;

-- What the guardian sees: only with the secret token, only this one acceptance.
create or replace function public.guardian_consent_view(p_token text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
           'creator', split_part(coalesce(nullif(btrim(p.name), ''), 'Your child'), ' ', 1),
           'guardian_name', x.guardian_name,
           'title', a.title, 'summary', public.agreement_render(a.summary, x.profile_id, a.programme_id), 'body', x.rendered_body,
           'accepted_at', x.accepted_at, 'confirmed_at', g.confirmed_at, 'confirmed_name', g.confirmed_name)
    from public.guardian_consents g
    join public.agreement_acceptances x on x.id = g.acceptance_id
    join public.agreements a on a.id = x.agreement_id
    join public.profiles p on p.id = x.profile_id
   where length(coalesce(p_token, '')) = 48 and g.token = p_token
$function$;
revoke all on function public.guardian_consent_view(text) from public;
grant execute on function public.guardian_consent_view(text) to anon;
grant execute on function public.guardian_consent_view(text) to authenticated;

create or replace function public.guardian_consent_confirm(p_token text, p_name text)
returns timestamptz language plpgsql security definer set search_path to 'public' as $function$
declare g public.guardian_consents; v_headers json; v_ip text; v_ua text; v_minor uuid; v_title text;
begin
  if length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'Type your full name to confirm.'; end if;
  select * into g from public.guardian_consents where length(coalesce(p_token, '')) = 48 and token = p_token for update;
  if g.acceptance_id is null then raise exception 'This link is not valid. Ask for a new one.'; end if;
  if g.confirmed_at is not null then return g.confirmed_at; end if;
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', ''), ',', 1);
    v_ua := left(v_headers->>'user-agent', 400);
  exception when others then v_ip := null; v_ua := null;
  end;
  update public.guardian_consents
     set confirmed_at = now(), confirmed_name = left(btrim(p_name), 200), ip = nullif(btrim(v_ip), ''), user_agent = v_ua
   where acceptance_id = g.acceptance_id;
  select x.profile_id, a.title into v_minor, v_title
    from public.agreement_acceptances x join public.agreements a on a.id = x.agreement_id where x.id = g.acceptance_id;
  begin
    perform public.notify_user(v_minor, 'community', 'Your parent or guardian confirmed',
      left(btrim(p_name), 80) || ' confirmed the ' || v_title || ' for you. You are all set.', '/agreements');
  exception when others then null;
  end;
  return now();
end $function$;
revoke all on function public.guardian_consent_confirm(text, text) from public;
grant execute on function public.guardian_consent_confirm(text, text) to anon;
grant execute on function public.guardian_consent_confirm(text, text) to authenticated;

-- LAST, AND ON ITS OWN: the `no_new_function_is_public` event trigger strips anon from functions created earlier in
-- the same run, so the guardian page's two public grants are re-stated after every CREATE above.
grant execute on function public.guardian_consent_view(text) to anon;
grant execute on function public.guardian_consent_confirm(text, text) to anon;
