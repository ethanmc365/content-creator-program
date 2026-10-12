-- 390: the public /terms page reads the published translation signed out too. The 388 read policy asked is_admin(),
-- which anon may not execute ("permission denied for function is_admin"), so a signed-out visitor got an error
-- instead of the text. Anon gets its own policy with no function call.
drop policy if exists "agreement translations: read published" on public.agreement_translations;
create policy "agreement translations: read published" on public.agreement_translations for select to anon
  using (exists (select 1 from public.agreements a where a.id = agreement_id and a.published_at is not null));
drop policy if exists "agreement translations: signed-in read" on public.agreement_translations;
create policy "agreement translations: signed-in read" on public.agreement_translations for select to authenticated
  using (exists (select 1 from public.agreements a where a.id = agreement_id and a.published_at is not null) or (select public.is_admin()));

-- Same flaw on agreements itself (since 7 Oct): signed out, /terms silently fell back to the hand-written page.
drop policy if exists "agreements: read published" on public.agreements;
create policy "agreements: read published" on public.agreements for select to anon using (published_at is not null);
drop policy if exists "agreements: signed-in read" on public.agreements;
create policy "agreements: signed-in read" on public.agreements for select to authenticated
  using ((published_at is not null) or (select public.is_admin()));
