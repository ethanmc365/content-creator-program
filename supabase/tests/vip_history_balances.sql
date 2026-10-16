-- Run after migration 432, or prepend migration 432 twice for the initial reconciliation rehearsal.
-- Initial-state assertions: before any subsequent withdrawals or earnings. Always rolls back.
begin;
do $test$
declare v_count int; v_total numeric; v_data jsonb; v_before numeric;
begin
  select count(*),sum(amount) into v_count,v_total from public.vip_history_balances where ledger_id is not null;
  if v_count<>15 or v_total<>1324.18 then raise exception 'Wrong credits: %, %',v_count,v_total; end if;
  if (select amount from public.vip_history_balances where creator_name='Fátima')<>76.81 or exists(select 1 from public.vip_history_balances where creator_name='Fátima' and ledger_id is not null) then raise exception 'Former creator credit error'; end if;
  if exists(select 1 from public.vip_history_balances b join public.vip_ledger l on l.id=b.ledger_id where l.amount<>b.amount or l.profile_id<>b.credited_profile_id or public.vip_balance(l.profile_id)<>b.amount) then raise exception 'Ledger mismatch'; end if;
  if exists(select 1 from public.vip_history_balances where creator_name in ('Mary','Noeta','Ylenia') and ledger_id is not null) then raise exception 'Zero rows credited'; end if;
  -- Preview through the real staff permission path, using only a sandbox identity.
  perform set_config('request.jwt.claims','{"sub":"e1f0fe37-215c-429a-9752-166ae8433dc5","role":"authenticated"}',true);
  v_data:=public.vip_preview('c3aff68b-3a36-4322-ba39-a453d355080c','earnings');
  if (v_data->>'balance')::numeric<>7.97 or (v_data->>'history_credit')::numeric<>7.97 then raise exception 'Preview wrong: %',v_data; end if;
  if (select sum((r->>'pay')::numeric) from jsonb_array_elements(v_data->'rows') r where r->>'source'='sheet')<>7.97 then raise exception 'Earnings double counted'; end if;
  v_data:=public.vip_preview('7d78652a-7039-4290-948c-44200bd54658','wallet');
  if (v_data->>'balance')::numeric<>5.47 then raise exception 'Official creator credit missing'; end if;
  v_data:=public.vip_history_names_list('a6a88268-eda9-4e50-b830-a105f54e294d');
  if jsonb_array_length(v_data->'names')<>19 then raise exception 'History list changed'; end if;
  -- A later payout must reduce available money without erasing history or recrediting it.
  insert into public.vip_ledger(profile_id,programme_id,kind,amount,currency,note)
  values('c3aff68b-3a36-4322-ba39-a453d355080c','a6a88268-eda9-4e50-b830-a105f54e294d','adjust',-7.97,'EUR','ROLLBACK TEST ONLY');
  v_data:=public.vip_preview('c3aff68b-3a36-4322-ba39-a453d355080c','earnings');
  if (v_data->>'balance')::numeric<>0 or (v_data->>'history_credit')::numeric<>7.97 then raise exception 'Withdrawal display incorrect'; end if;
  if has_table_privilege('authenticated','public.vip_history_balances','select') then raise exception 'Private receipts exposed'; end if;
  raise notice 'PASS: 15 credits, EUR 1324.18, former/zero exclusions, preview, official member, lifetime unchanged, withdrawal reflected, receipt privacy';
end $test$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"def3434f-758c-4821-87b1-35039ea006b1","role":"authenticated"}',true);
do $access$
begin
  if (public.vip_my_earnings()->>'history_credit')::numeric<>0 then raise exception 'Other creator sees credits'; end if;
  begin
    perform public.vip_history_names_list('a6a88268-eda9-4e50-b830-a105f54e294d');
    raise exception 'ACCESS TEST FAILED';
  exception when others then
    if sqlerrm='ACCESS TEST FAILED' then raise; end if;
    if sqlerrm not like 'Only the team%' then raise; end if;
  end;
end $access$;
reset role;
do $$ begin raise exception 'REHEARSAL PASS: all assertions passed; everything rolled back'; end $$;
