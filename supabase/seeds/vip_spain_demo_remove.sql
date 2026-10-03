-- Removes the VIP Spain demo data (supabase/seeds/vip_spain_demo.sql). Then run `node scripts/seed-vip-demo.mjs --remove`
-- to delete the eight demo logins; their profiles, memberships, videos, readings and ledger go with them by cascade.
do $$
declare v_ids uuid[] := array(select id from auth.users where email like 'demo-vip-%@trypcreators.test');
begin
  delete from public.invoices where reward_id in (select id from public.rewards where creator_id = any(v_ids));
  delete from public.rewards where creator_id = any(v_ids);
  delete from public.vip_ledger where profile_id = any(v_ids);
  delete from public.vip_statements where profile_id = any(v_ids);
  delete from public.vip_sheet_history where profile_id = any(v_ids);
  delete from public.vip_events where profile_id = any(v_ids);
  delete from public.vip_videos where profile_id = any(v_ids);
  delete from public.vip_members where profile_id = any(v_ids);
  delete from public.vip_bonus_rules where programme_id = 'a6a88268-eda9-4e50-b830-a105f54e294d' and note = 'demo';
  delete from public.notifications where recipient_id = any(v_ids) or title ilike '%Demo%';
end $$;
