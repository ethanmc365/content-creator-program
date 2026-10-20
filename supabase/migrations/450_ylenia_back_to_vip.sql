-- 450 (20 Oct 2026): Ylenia Pelaez goes back to being a VIP creator only, until she joins the Tryp.com team on
-- 1 Nov 2026 (Ethan). Undoes the team part of 445: off the team (no admin panel), and a creator again in Spain rather than
-- its manager. Her VIP membership (VIP Spain) was never touched, so every VIP fence and her /vip page apply again.
do $$
declare
  v_y uuid := '96a658c1-b5f0-45bb-845c-13ef6151f79c';
  v_es uuid := (select id from public.communities where kind = 'chapter' and name = 'Spain');
begin
  update public.profiles set is_admin = false, platform_role = 'none' where id = v_y and platform_role <> 'owner';
  update public.community_members set role = 'creator' where community_id = v_es and profile_id = v_y;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  values (null, 'Migration 450', 'Removed from Tryp.com team until 1 Nov (stays VIP)', v_y, 'Ylenia Peláez');
end $$;
