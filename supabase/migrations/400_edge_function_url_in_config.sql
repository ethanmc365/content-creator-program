-- 400: one place says where the edge functions live (13 Oct 2026)
--
-- Five database functions posted to edge functions at a URL with this
-- project's ref typed into them (notifications, media cleanup, three view-sync
-- callers). Copied to another server, they would have kept calling THIS
-- project. They now ask edge_function_url(), which reads private.config
-- 'edge_functions_base'. Moving the backend = update that one row:
--
--   update private.config set value = 'https://<new-host>/functions/v1' where key = 'edge_functions_base';
--
-- The bodies below are the live ones with only the URL literal replaced.

insert into private.config (key, value)
values ('edge_functions_base', 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1')
on conflict (key) do nothing;

create or replace function public.edge_function_url(p_name text)
returns text language sql stable security definer set search_path = ''
as $$
  select rtrim((select value from private.config where key = 'edge_functions_base'), '/') || '/' || p_name
$$;

insert into public.owner_only_rpcs (proname, why)
values ('edge_function_url', 'Internal: where database code posts to edge functions. Nothing in the app calls it.')
on conflict (proname) do nothing;

CREATE OR REPLACE FUNCTION public.read_new_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare secret text := (select value from private.config where key = 'webhook_secret');
begin
  begin
    if coalesce(new.video_url, '') <> '' then
      perform net.http_post(
        url := public.edge_function_url('view-sync'),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
        body := jsonb_build_object('submission_ids', jsonb_build_array(new.id))
      );
    end if;
  exception when others then null;  -- reading early is a nicety; an entry must never fail to save because of it
  end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dispatch_media_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  urls text[];
begin
  if tg_table_name = 'messages' then
    urls := array_remove(array[old.image_url, old.video_url, old.audio_url], null);
  elsif tg_table_name = 'direct_messages' then
    urls := array_remove(array[old.image_url], null);
  elsif tg_table_name = 'creator_photos' then
    urls := array_remove(array[old.photo_url], null);
  elsif tg_table_name = 'feedback' then
    urls := array_remove(array[old.screenshot_url], null);
  end if;
  if urls is null or coalesce(array_length(urls, 1), 0) = 0 then
    return coalesce(new, old);
  end if;
  perform net.http_post(
    url := public.edge_function_url('media-cleanup'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'apikey', 'sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object('urls', to_jsonb(urls))
  );
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_notifications_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  chunk jsonb;
begin
  for chunk in
    select jsonb_agg(j)
    from (select to_jsonb(n) j, (row_number() over () - 1) / 50 g from new_rows n) x
    group by g
  loop
    perform net.http_post(
      url := public.edge_function_url('notify-dispatch'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
        'apikey', 'sb_publishable_TEGIiE8fyDhEDHsBRlM0-g_JzO27uos',
        'x-webhook-secret', coalesce(secret, '')
      ),
      body := jsonb_build_object('records', chunk),
      timeout_milliseconds := 20000
    );
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vip_run_sync(p_force boolean DEFAULT false, p_programme uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  v_hours numeric := coalesce((select (value ->> 'interval_hours')::numeric from public.app_settings where key = 'vip_sync'), 12);
  v_due int;
begin
  select count(*) into v_due from public.vip_videos v
   where v.status = 'tracking' and (p_programme is null or v.programme_id = p_programme)
     and v.submitted_at >= public.vip_read_cutoff()
     and (p_force or v.views_synced_at is null or v.views_synced_at < now() - (v_hours * interval '1 hour'));
  if v_due = 0 then return jsonb_build_object('fired', false, 'reason', 'nothing_due'); end if;
  perform net.http_post(
    url := public.edge_function_url('view-sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object('vip_only', true, 'force', p_force, 'vip_interval_hours', v_hours)
  );
  return jsonb_build_object('fired', true, 'due', v_due);
end $function$;

CREATE OR REPLACE FUNCTION public.run_view_sync(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions'
AS $function$
declare
  cfg     jsonb := coalesce((select value from public.app_settings where key = 'view_sync'), '{}'::jsonb);
  enabled boolean := coalesce((cfg ->> 'enabled')::boolean, true);
  secret  text := (select value from private.config where key = 'webhook_secret');
  v_n     int;
begin
  if not p_force and not enabled then
    return jsonb_build_object('fired', false, 'reason', 'disabled');
  end if;
  if not p_force and public.view_sync_running() then
    return jsonb_build_object('fired', false, 'reason', 'already_running');
  end if;
  select count(*) into v_n from public.challenges
   where winners_published_at is null and end_date >= current_date and coalesce(status, '') <> 'draft';
  if v_n = 0 then
    return jsonb_build_object('fired', false, 'reason', 'no_running_challenge');
  end if;
  perform net.http_post(
    url := public.edge_function_url('view-sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := '{}'::jsonb
  );
  return jsonb_build_object('fired', true, 'challenges', v_n);
end;
$function$;

select public.lock_down_definer_functions();
