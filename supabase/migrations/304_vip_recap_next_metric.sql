-- 304: THE RECAP SAYS WHAT KIND OF THING IS NEXT (30 Sep 2026). "1 more views to unlock Six videos in a month" was wrong
-- for a perk that counts videos or months: `vip_my_recap.next` now carries the perk's metric so the card can say views,
-- videos or months.
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.vip_my_recap(int, int)'::regprocedure);
  d2 := replace(d, 'select pk.title, pk.kind, pk.threshold, public.vip_metric', 'select pk.title, pk.kind, pk.metric, pk.threshold, public.vip_metric');
  d2 := replace(d2, 'jsonb_build_object(''title'', q.title, ''kind'', q.kind, ''value''', 'jsonb_build_object(''title'', q.title, ''kind'', q.kind, ''metric'', q.metric, ''value''');
  if d2 = d then raise exception 'vip_my_recap did not match the expected text'; end if;
  execute d2;
end $$;
