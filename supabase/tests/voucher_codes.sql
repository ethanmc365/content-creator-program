-- Rehearses migration 255 against prod data, then rolls everything back.
-- The report comes back in the exception message.
do $$
declare
  r record; other uuid; report text := ''; v timestamptz; n_before int; n_after int; ok boolean;
begin
  select id, creator_id into r from public.rewards
   where reward_type = 'voucher' and status = 'distributed' limit 1;
  select id into other from public.profiles where id <> r.creator_id and not coalesce(is_sandbox,false) limit 1;

  -- 1. An admin adds a code to an already-distributed voucher -> one notification.
  select count(*) into n_before from public.notifications where recipient_id = r.creator_id and type = 'reward';
  update public.rewards set voucher_code = 'TEST-CODE-123' where id = r.id;
  select count(*) into n_after from public.notifications where recipient_id = r.creator_id and type = 'reward';
  report := report || format(E'code added notifies: %s\n', n_after = n_before + 1);

  -- 2. The creator ticks it as used, through RLS as themselves.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', r.creator_id, 'role', 'authenticated')::text, true);
  v := public.set_reward_used(r.id, true);
  report := report || format(E'owner can tick: %s\n', v is not null);
  select voucher_code = 'TEST-CODE-123' into ok from public.rewards where id = r.id;
  report := report || format(E'owner can read code: %s\n', coalesce(ok, false));
  v := public.set_reward_used(r.id, false);
  report := report || format(E'owner can untick: %s\n', v is null);

  -- 3. The creator cannot write the row directly (no update policy).
  update public.rewards set amount = 9999 where id = r.id;
  get diagnostics n_after = row_count;
  report := report || format(E'direct update blocked: %s\n', n_after = 0);

  -- 4. Somebody else cannot tick it, or read it.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin
    perform public.set_reward_used(r.id, true);
    report := report || E'stranger refused: false\n';
  exception when others then
    report := report || E'stranger refused: true\n';
  end;
  select count(*) into n_after from public.rewards where id = r.id;
  report := report || format(E'stranger cannot read: %s\n', n_after = 0);

  raise exception E'\n%', report;
end $$;
