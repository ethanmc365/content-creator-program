-- 288: a reader's browser may fill the shared translation cache.
--
-- Found 2 Oct 2026 in the function logs: of ~390 attempts in a day, ~300 server-side translations
-- failed - Google answers Supabase's shared egress with 429 and MyMemory's free daily quota then
-- answers 403. The same free Google endpoint works from a reader's own browser (their own address,
-- their own allowance), so the app now translates there first and stores the result here, where the
-- next reader and the Languages editor find it.
--
-- GUARDED: signed-in, non-sandbox users only; languages the platform speaks; sane lengths; the
-- hash is computed HERE from the text (never trusted from the caller); and it only ever INSERTS -
-- a row that exists (above all one a lead corrected) is never touched.
create or replace function public.cache_content_translation(p_locale text, p_source text, p_value text, p_src text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and coalesce(is_sandbox, false)) then return; end if;
  if p_locale not in ('es', 'pt', 'de', 'ro', 'en') then return; end if;
  if p_source is null or p_value is null or length(trim(p_source)) = 0 or length(trim(p_value)) = 0 then return; end if;
  if length(p_source) > 6000 or length(p_value) > greatest(400, length(p_source) * 3) then return; end if;
  v_hash := encode(extensions.digest(convert_to(p_locale || E'\n' || p_source, 'UTF8'), 'sha256'), 'hex');
  insert into public.content_translations (source_hash, locale, source, value, src_lang, same, auto)
  values (
    v_hash, p_locale, p_source,
    case when lower(coalesce(p_src, '')) = p_locale or trim(p_value) = trim(p_source) then p_source else p_value end,
    nullif(lower(left(coalesce(p_src, ''), 2)), ''),
    lower(coalesce(p_src, '')) = p_locale or trim(p_value) = trim(p_source),
    true
  )
  on conflict (source_hash, locale) do nothing;
end $$;

revoke all on function public.cache_content_translation(text, text, text, text) from public, anon;
grant execute on function public.cache_content_translation(text, text, text, text) to authenticated;
