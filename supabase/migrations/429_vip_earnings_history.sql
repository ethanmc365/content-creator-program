-- 429: VIP EARNINGS, ALL TIME (16 Oct 2026).
--
-- Ethan: "add the CPM and the total amount of money that the creators have made over time ... how much they've made
-- all time and in previous months." Before the platform ran the VIP months (October 2026) the team kept the numbers in
-- the "Content Creator Program Overview" sheet, tab "CPM VIP ES": views and pay per creator per month, December 2025 to
-- September 2026. Those 75 cells are copied here once (`vip_earnings_history`), and `admin_vip_earnings` hands the
-- analytics page that history joined to every platform month after it - closed months from their statements, the open
-- month live - so the page keeps itself up to date and nobody updates a sheet again.
--
-- Copied as the sheet states them, including two cells whose pay is not views x rate (Mel, August: 436,549 views
-- paid 83.30, not 87.31; Ariadna, July: 1.60, not 1.62) - the sheet is the record of what was paid. The sheet's own
-- Total row is NOT copied: several of its sums are wrong (Mary's reads 680.18, her months add to 1,069.01). Totals are
-- always summed from the months. "December 26'" in the sheet is December 2025 (it is the month before January 26').
--
-- Matched to profiles by the team's own short names: Mary = Mariam, Noeta = Noa Garcia, Mel = Melanie Dominguez,
-- Ariadna = Ariakna Valen, Sara = Sara Garcia Nicolau (rate 0.20, as in the sheet). Fatima and Ana are not on the
-- platform: they keep their name and their months, with no profile. Lucia's column is empty and has no rows.

create table if not exists public.vip_earnings_history (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  creator_name text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  year int not null check (year between 2024 and 2100),
  month int not null check (month between 1 and 12),
  views bigint not null default 0 check (views >= 0),
  earned numeric(12,2) not null default 0,
  rate numeric(6,4),
  currency text not null default 'EUR',
  source text not null default 'sheet',
  created_at timestamptz not null default now(),
  unique (programme_id, creator_name, year, month)
);
alter table public.vip_earnings_history enable row level security;
revoke all on public.vip_earnings_history from anon, authenticated;

insert into public.vip_earnings_history (programme_id, creator_name, profile_id, year, month, views, earned, rate)
select (select p.id from public.vip_programmes p join public.communities c on c.id = p.community_id
         where c.kind = 'chapter' and c.name = 'Spain' and p.kind = 'vip' limit 1),
       v.n, v.p, v.y, v.m, v.views, v.earned, v.rate
  from (values
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2025, 12, 112846, 28.21, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 1, 4276, 1.07, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 2, 13906, 3.47, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 3, 57104, 14.27, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 4, 10315, 2.58, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 5, 14436, 3.60, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 6, 53812, 13.45, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 7, 113905, 28.47, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 8, 481437, 120.36, 0.25),
  ('Nadia', '01e29a38-6b52-4054-b4ef-de79ce0d7a3e'::uuid, 2026, 9, 22193, 5.55, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2025, 12, 803000, 200.75, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 1, 1917737, 479.43, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 2, 392900, 98.22, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 3, 151600, 37.90, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 4, 279500, 69.87, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 5, 31778, 7.94, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 6, 49000, 12.25, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 8, 45200, 11.30, 0.25),
  ('Mary', '7fe4d915-e29f-4331-aea5-7ceaebeba941'::uuid, 2026, 9, 605400, 151.35, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 1, 8385, 2.09, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 2, 57621, 14.40, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 3, 10640, 2.66, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 4, 32761, 8.19, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 5, 13471, 3.36, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 6, 180372, 45.09, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 7, 21806, 5.45, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 8, 47436, 11.85, 0.25),
  ('Eva', 'f0e6fc02-ca2c-4b8a-af38-9671cb3d12a0'::uuid, 2026, 9, 5718, 1.43, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 2, 35371, 8.84, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 3, 91783, 22.94, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 4, 16089, 4.02, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 5, 6536, 1.63, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 6, 6614, 1.65, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 7, 50454, 12.60, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 8, 461318, 115.33, 0.25),
  ('Noeta', 'e3443f51-9684-4e5f-9163-7c90154ff24b'::uuid, 2026, 9, 42106, 10.52, 0.25),
  ('Fátima', null, 2026, 4, 159392, 31.89, 0.20),
  ('Fátima', null, 2026, 5, 224600, 44.92, 0.20),
  ('Julia', '7d78652a-7039-4290-948c-44200bd54658'::uuid, 2026, 5, 16421, 3.28, 0.20),
  ('Julia', '7d78652a-7039-4290-948c-44200bd54658'::uuid, 2026, 6, 10954, 2.19, 0.20),
  ('Miriam', '56f43b80-4a76-4fec-b2fc-30aaaf19da92'::uuid, 2026, 5, 7541, 1.51, 0.20),
  ('Miriam', '56f43b80-4a76-4fec-b2fc-30aaaf19da92'::uuid, 2026, 6, 107088, 21.42, 0.20),
  ('Miriam', '56f43b80-4a76-4fec-b2fc-30aaaf19da92'::uuid, 2026, 7, 13102, 2.62, 0.20),
  ('Miriam', '56f43b80-4a76-4fec-b2fc-30aaaf19da92'::uuid, 2026, 8, 11932, 2.38, 0.20),
  ('Miriam', '56f43b80-4a76-4fec-b2fc-30aaaf19da92'::uuid, 2026, 9, 8467, 1.69, 0.20),
  ('Irene', 'a7defb84-c8ae-43ef-8ecb-2fa6f7525e25'::uuid, 2026, 5, 28582, 5.71, 0.20),
  ('Irene', 'a7defb84-c8ae-43ef-8ecb-2fa6f7525e25'::uuid, 2026, 6, 43300, 8.66, 0.20),
  ('Irene', 'a7defb84-c8ae-43ef-8ecb-2fa6f7525e25'::uuid, 2026, 9, 19202, 3.84, 0.20),
  ('Mel', '99c56f38-6e7b-49cc-afcd-4982d419ef02'::uuid, 2026, 6, 190817, 38.16, 0.20),
  ('Mel', '99c56f38-6e7b-49cc-afcd-4982d419ef02'::uuid, 2026, 7, 1580584, 316.11, 0.20),
  ('Mel', '99c56f38-6e7b-49cc-afcd-4982d419ef02'::uuid, 2026, 8, 436549, 83.30, 0.20),
  ('Mel', '99c56f38-6e7b-49cc-afcd-4982d419ef02'::uuid, 2026, 9, 1590173, 318.03, 0.20),
  ('Leyre', '128fc2d6-8c4b-49da-96d2-0b1f9e075b27'::uuid, 2026, 6, 116889, 23.38, 0.20),
  ('Leyre', '128fc2d6-8c4b-49da-96d2-0b1f9e075b27'::uuid, 2026, 7, 292936, 58.59, 0.20),
  ('Leyre', '128fc2d6-8c4b-49da-96d2-0b1f9e075b27'::uuid, 2026, 8, 174024, 34.80, 0.20),
  ('Leyre', '128fc2d6-8c4b-49da-96d2-0b1f9e075b27'::uuid, 2026, 9, 185396, 37.08, 0.20),
  ('Nadine', '50f77bfb-371b-4f98-b667-011e8ecf1392'::uuid, 2026, 7, 3266, 0.65, 0.20),
  ('Nadine', '50f77bfb-371b-4f98-b667-011e8ecf1392'::uuid, 2026, 8, 6883, 1.37, 0.20),
  ('Nadine', '50f77bfb-371b-4f98-b667-011e8ecf1392'::uuid, 2026, 9, 1012479, 202.50, 0.20),
  ('Ariadna', '0226b2d0-7dbe-4e11-ade3-b69f1842073e'::uuid, 2026, 7, 8077, 1.60, 0.20),
  ('Ariadna', '0226b2d0-7dbe-4e11-ade3-b69f1842073e'::uuid, 2026, 8, 30432, 6.08, 0.20),
  ('Ariadna', '0226b2d0-7dbe-4e11-ade3-b69f1842073e'::uuid, 2026, 9, 22344, 4.47, 0.20),
  ('Sara', '40c1a90b-fb30-4592-b7de-9b40d894a9bd'::uuid, 2026, 7, 46058, 9.20, 0.20),
  ('Sara', '40c1a90b-fb30-4592-b7de-9b40d894a9bd'::uuid, 2026, 8, 49264, 9.85, 0.20),
  ('Sara', '40c1a90b-fb30-4592-b7de-9b40d894a9bd'::uuid, 2026, 9, 10743, 2.15, 0.20),
  ('Ylenia', '96a658c1-b5f0-45bb-845c-13ef6151f79c'::uuid, 2026, 8, 1214663, 242.93, 0.20),
  ('Ylenia', '96a658c1-b5f0-45bb-845c-13ef6151f79c'::uuid, 2026, 9, 1523669, 304.73, 0.20),
  ('Nerea', 'd2a9c4ec-ed11-46f6-8c4c-3d16fb00069d'::uuid, 2026, 8, 5563, 1.11, 0.20),
  ('Nerea', 'd2a9c4ec-ed11-46f6-8c4c-3d16fb00069d'::uuid, 2026, 9, 17242, 3.45, 0.20),
  ('Betty', 'd37b6794-5d0d-481e-9489-8b3d29340e73'::uuid, 2026, 8, 7784, 1.55, 0.20),
  ('Betty', 'd37b6794-5d0d-481e-9489-8b3d29340e73'::uuid, 2026, 9, 11487, 2.30, 0.20),
  ('Ana', null, 2026, 8, 14343, 2.87, 0.20),
  ('Ana', null, 2026, 9, 25447, 5.10, 0.20),
  ('Laura', '5f617a3c-eb9d-4d19-9798-a98ffbb6faaa'::uuid, 2026, 9, 25889, 5.18, 0.20),
  ('Alejandro', '2da66610-df88-4bdb-9eaf-062970a282ef'::uuid, 2026, 9, 9657, 1.93, 0.20)
  ) as v(n, p, y, m, views, earned, rate)
on conflict (programme_id, creator_name, year, month) do nothing;

-- Every month of every creator in these markets (every active programme when p_market is null): the sheet's months,
-- then the platform's for any month after the last one the sheet holds for that market. `pay` is views pay, `extra` is
-- the monthly fee and bonuses (platform months only; the sheet held views pay alone).
create or replace function public.admin_vip_earnings(p_market uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_out jsonb;
begin
  if not public.is_admin() or not public.vip_has_access() then
    raise exception 'Admins with VIP access only';
  end if;
  select array_agg(p.id) into v_ids
    from public.vip_programmes p
   where p.active and (p_market is null or p.community_id = p_market);
  if v_ids is null then return jsonb_build_object('rows', '[]'::jsonb, 'currency', 'EUR'); end if;

  with progs as (
    select p.id, p.community_id, p.kind, p.cpm, c.name market,
           (select max(h.year * 12 + h.month) from public.vip_earnings_history h
              join public.vip_programmes hp on hp.id = h.programme_id
             where hp.community_id = p.community_id) cut
      from public.vip_programmes p join public.communities c on c.id = p.community_id
     where p.id = any (v_ids)
  ), hist as (
    select h.profile_id, h.creator_name, pr.kind, pr.market, h.year, h.month, h.views, h.earned pay, 0::numeric extra,
           h.rate, 'sheet'::text src, false live
      from public.vip_earnings_history h join progs pr on pr.id = h.programme_id
  ), plat as (
    select r.profile_id, null::text creator_name, pr.kind, pr.market, r.year, r.month, r.views, coalesce(r.base, 0) pay,
           coalesce(r.bonus, 0) extra,
           case when r.views > 0 then round(coalesce(r.base, 0) / r.views * 1000, 4) end rate, 'platform'::text src,
           (r.month_status = 'open') live
      from progs pr
      cross join lateral public.vip_month_rows(array[pr.id]) r
     where r.year * 12 + r.month > coalesce(pr.cut, 0)
  ), allrows as (select * from hist union all select * from plat)
  select jsonb_build_object(
           'currency', 'EUR',
           'rows', coalesce(jsonb_agg(jsonb_build_object(
             'key', coalesce(a.profile_id::text, 'name:' || a.creator_name),
             'profile_id', a.profile_id,
             'name', coalesce(nullif(trim(p.name), ''), a.creator_name),
             'short', a.creator_name,
             'photo_url', p.photo_url,
             'kind', coalesce(p.vip_kind, a.kind),
             'market', a.market,
             'year', a.year, 'month', a.month,
             'views', a.views, 'pay', a.pay, 'extra', a.extra, 'rate', a.rate,
             'source', a.src, 'live', a.live
           ) order by a.year, a.month), '[]'::jsonb))
    into v_out
    from allrows a left join public.profiles p on p.id = a.profile_id;
  return v_out;
end;
$$;

revoke all on function public.admin_vip_earnings(uuid) from public, anon;
grant execute on function public.admin_vip_earnings(uuid) to authenticated;
