-- 259: THE AUDIT LOG SAYS WHAT HAPPENED, IN A SENTENCE (24 Sep 2026)
--
-- Ethan: "some of the weird copy says 'create market membership' or stuff like
-- that, so just fix it and ensure there's even more monitoring here."
--
-- audit_change() wrote "<Created|Deleted|Changed> <noun>" for every table, and
-- for the busiest one - community_members, 311 rows - it had no name to put
-- after it, because a membership row has no name. So the log's most common line
-- was "Rita Albino created market membership", which does not say which market,
-- and "Ethan deleted entry", which does not say whose.
--
-- Now the tables whose rows only make sense as a relationship build their own
-- sentence from the people and places they point at:
--
--   community_members  "Added Rita Albino to Portugal" / "Joined Portugal"
--                      "Made Ana a manager of Spain" / "Removed ... as manager"
--   submissions        "Deleted Ana Lopez's entry in Global Challenge"
--   profiles           "Approved Rita Albino" / "Gave admin rights to ..."
--   messages           "Removed a message"
--   rewards            "Created a reward for Ana Lopez (Global Challenge)"
--   submission_disqualifications  "Disqualified ... / Reinstated ..."
--
-- The sentence is stored whole in `action` (target_name stays null for those,
-- so the page does not print the name twice). Every other table keeps the old
-- shape. Historical rows are rewritten by the page at read time where it can.
--
-- MORE MONITORING: point rules (a bonus's points and dates), app settings,
-- KPI targets, disqualifications and challenge templates are now logged too.

create or replace function public.audit_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cat     text := TG_ARGV[0];
  v_noun    text := TG_ARGV[1];
  v_namecol text := nullif(TG_ARGV[2], '');
  v_name    text;
  v_actor   text;
  v_changed jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_col text;
  i int;
  v_community uuid;
  v_action text;
  v_person text;
  v_place text;
  v_self boolean;
  v_entity uuid;
begin
  v_old := case when TG_OP = 'INSERT' then null else to_jsonb(old) end;
  v_new := case when TG_OP = 'DELETE' then null else to_jsonb(new) end;
  v_row := coalesce(v_new, v_old);

  if v_namecol is not null then
    v_name := coalesce(v_new ->> v_namecol, v_old ->> v_namecol);
  end if;

  v_community := nullif(v_row ->> 'community_id', '')::uuid;

  if TG_OP = 'UPDATE' then
    i := 3;
    while i < TG_NARGS loop
      v_col := TG_ARGV[i];
      if (v_old ->> v_col) is distinct from (v_new ->> v_col) then
        v_changed := v_changed || jsonb_build_object(
          v_col, jsonb_build_object('from', v_old -> v_col, 'to', v_new -> v_col));
      end if;
      i := i + 1;
    end loop;
    if v_changed = '{}'::jsonb then return null; end if;
  end if;

  select name into v_actor from public.profiles where id = auth.uid();

  begin
    v_entity := nullif(v_row ->> 'id', '')::uuid;
  exception when others then
    v_entity := null;
  end;

  -- ---- the sentences ----------------------------------------------------
  if TG_TABLE_NAME = 'community_members' then
    select name into v_person from public.profiles where id = (v_row ->> 'profile_id')::uuid;
    select name into v_place from public.communities where id = v_community;
    v_person := coalesce(v_person, 'a creator');
    v_place := coalesce(v_place, 'a market');
    v_self := auth.uid() is not null and auth.uid()::text = v_row ->> 'profile_id';
    v_entity := (v_row ->> 'profile_id')::uuid;
    if TG_OP = 'INSERT' then
      v_action := case when v_self then 'Joined ' || v_place else 'Added ' || v_person || ' to ' || v_place end;
    elsif TG_OP = 'DELETE' then
      v_action := case when v_self then 'Left ' || v_place else 'Removed ' || v_person || ' from ' || v_place end;
    elsif v_changed ? 'role' then
      v_action := case when v_new ->> 'role' = 'manager'
        then 'Made ' || v_person || ' a manager of ' || v_place
        else 'Removed ' || v_person || ' as manager of ' || v_place end;
    else
      v_action := 'Changed ' || v_person || '''s membership of ' || v_place;
    end if;
    v_name := null;

  elsif TG_TABLE_NAME = 'submissions' then
    select name into v_person from public.profiles where id = (v_row ->> 'creator_id')::uuid;
    select title, community_id into v_place, v_community from public.challenges where id = (v_row ->> 'challenge_id')::uuid;
    v_action := case TG_OP when 'DELETE' then 'Deleted ' else 'Changed ' end
      || coalesce(v_person || '''s', 'an') || ' entry in ' || coalesce(v_place, 'a challenge');
    v_name := null;

  elsif TG_TABLE_NAME = 'submission_disqualifications' then
    select name into v_person from public.profiles where id = (v_row ->> 'creator_id')::uuid;
    select title, community_id into v_place, v_community from public.challenges where id = (v_row ->> 'challenge_id')::uuid;
    v_action := case TG_OP when 'INSERT' then 'Disqualified ' else 'Reinstated ' end
      || coalesce(v_person || '''s', 'an') || ' entry in ' || coalesce(v_place, 'a challenge');
    v_name := null;

  elsif TG_TABLE_NAME = 'rewards' then
    select name into v_person from public.profiles where id = (v_row ->> 'creator_id')::uuid;
    select title into v_place from public.challenges where id = nullif(v_row ->> 'challenge_id', '')::uuid;
    v_action := case TG_OP when 'INSERT' then 'Created a reward for ' when 'DELETE' then 'Deleted a reward for ' else 'Changed a reward for ' end
      || coalesce(v_person, 'a creator') || coalesce(' (' || v_place || ')', '');
    v_name := null;

  elsif TG_TABLE_NAME = 'profiles' and TG_OP = 'UPDATE' then
    if v_changed ? 'status' and v_old ->> 'status' = 'pending' and v_new ->> 'status' = 'active' then
      -- admin_approve_application logs "Approved creator" itself; this would
      -- be the same event twice.
      if v_changed - 'status' = '{}'::jsonb then return null; end if;
      v_action := 'Approved';
    elsif v_changed ? 'status' and v_new ->> 'status' = 'declined' then
      v_action := 'Declined';
    elsif v_changed ? 'is_admin' then
      v_action := case when (v_new ->> 'is_admin')::boolean then 'Gave admin rights to' else 'Removed admin rights from' end;
    elsif v_changed ? 'deletion_requested_at' then
      v_action := case when v_new ->> 'deletion_requested_at' is not null then 'Asked to delete the account of' else 'Cancelled the deletion of' end;
    elsif v_changed ? 'role_title' then
      v_action := 'Changed the title of';
    end if;

  elsif TG_TABLE_NAME = 'messages' then
    v_action := case when (v_new ->> 'deleted')::boolean then 'Removed a message' else 'Restored a message' end;
    v_name := null;

  elsif TG_TABLE_NAME = 'app_settings' then
    v_action := case TG_OP when 'INSERT' then 'Added the setting' when 'DELETE' then 'Removed the setting' else 'Changed the setting' end;
  end if;

  insert into public.admin_audit_log
    (actor_id, actor_name, action, category, entity, entity_id,
     target_name, detail, community_id, meta)
  values (
    auth.uid(),
    coalesce(v_actor, 'System'),
    coalesce(v_action, case TG_OP
      when 'INSERT' then 'Created ' || v_noun
      when 'DELETE' then 'Deleted ' || v_noun
      else 'Changed ' || v_noun
    end),
    v_cat,
    TG_TABLE_NAME,
    v_entity,
    v_name,
    case when TG_OP = 'UPDATE'
      then (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_changed) as k)
      else null end,
    v_community,
    nullif(v_changed, '{}'::jsonb)
  );
  return null;
end;
$function$;

-- ---- more monitoring -------------------------------------------------------

drop trigger if exists trg_audit_point_rules on public.point_rules;
create trigger trg_audit_point_rules after insert or delete on public.point_rules
  for each row execute function public.audit_change('challenges', 'point rule', 'label');
drop trigger if exists trg_audit_point_rules_upd on public.point_rules;
create trigger trg_audit_point_rules_upd after update on public.point_rules
  for each row execute function public.audit_change('challenges', 'point rule', 'label',
    'label', 'points', 'threshold', 'max_points', 'min_views', 'prompt', 'starts_at', 'ends_at', 'is_active');

drop trigger if exists trg_audit_disqualifications on public.submission_disqualifications;
create trigger trg_audit_disqualifications after insert or delete on public.submission_disqualifications
  for each row execute function public.audit_change('challenges', 'disqualification', '');

drop trigger if exists trg_audit_app_settings on public.app_settings;
create trigger trg_audit_app_settings after insert or delete on public.app_settings
  for each row execute function public.audit_change('settings', 'setting', 'key');
drop trigger if exists trg_audit_app_settings_upd on public.app_settings;
create trigger trg_audit_app_settings_upd after update on public.app_settings
  for each row execute function public.audit_change('settings', 'setting', 'key', 'value');

drop trigger if exists trg_audit_kpi_targets on public.kpi_targets;
create trigger trg_audit_kpi_targets after insert or delete on public.kpi_targets
  for each row execute function public.audit_change('markets', 'KPI target', 'label');
drop trigger if exists trg_audit_kpi_targets_upd on public.kpi_targets;
create trigger trg_audit_kpi_targets_upd after update on public.kpi_targets
  for each row execute function public.audit_change('markets', 'KPI target', 'label', 'target_value', 'current_value');

drop trigger if exists trg_audit_challenge_templates on public.challenge_templates;
create trigger trg_audit_challenge_templates after insert or delete on public.challenge_templates
  for each row execute function public.audit_change('challenges', 'challenge template', 'name');

-- The rows the RPCs write directly (approvals, promotions) arrive with no
-- category; give the existing ones theirs so the filters find them.
update public.admin_audit_log set category = 'people'
 where category is null and (action ilike 'approved%' or action ilike 'promoted%' or action ilike '%admin rights%'
   or action ilike 'changed role title%' or action ilike 'deleted creator%');
update public.admin_audit_log set category = 'challenges'
 where category is null and action ilike '%challenge%';
update public.admin_audit_log set category = 'markets'
 where category is null and action ilike '%market%';
