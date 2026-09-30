-- 289: many KPI periods in one round trip.
--
-- The Total view (30 Sep 2026) adds every market's goals together, and its year overview shows four
-- quarters or twelve months of that. Asked one `kpi_actuals` at a time that is up to 8 scopes x 12
-- periods of requests; this answers the lot in one call, through the SAME definition
-- (`kpi_compute`), so a number here can never disagree with the card it adds up.
--
-- p_items: [{ "k": "<caller's key>", "community_id": uuid, "basis": "all"|"global",
--             "year": int, "quarter": int, "month": int|null }, ...]  (at most 120)
create or replace function public.kpi_actuals_batch(p_items jsonb)
returns table(k text, metric text, value numeric)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_item jsonb;
  v_start timestamptz;
  v_year int;
  v_quarter int;
  v_month int;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 120 then
    raise exception 'Pass an array of at most 120 periods.';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_year := (v_item->>'year')::int;
    v_quarter := (v_item->>'quarter')::int;
    v_month := nullif(v_item->>'month', '')::int;
    if v_quarter < 1 or v_quarter > 4 or (v_month is not null and (v_month < 1 or v_month > 12)) then
      raise exception 'Bad period in item %.', v_item->>'k';
    end if;
    if v_month is not null then
      v_start := make_date(v_year, v_month, 1)::timestamptz;
    else
      v_start := make_date(v_year, (v_quarter - 1) * 3 + 1, 1)::timestamptz;
    end if;
    return query
      select v_item->>'k', c.metric, c.value
      from public.kpi_compute(
        (v_item->>'community_id')::uuid,
        coalesce(v_item->>'basis', 'all'),
        v_start,
        v_start + case when v_month is not null then interval '1 month' else interval '3 months' end
      ) c;
  end loop;
end;
$$;
revoke all on function public.kpi_actuals_batch(jsonb) from public, anon;
grant execute on function public.kpi_actuals_batch(jsonb) to authenticated;
