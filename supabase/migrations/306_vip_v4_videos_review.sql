-- 306: VIP fourth pass, part two (1 Oct 2026).
--  * The team's video list carries each video's stored frame, so it can be drawn like the video tracker.
--  * A VIP's own rate can be given a review date ("review CPM dates"): the Members tab flags it when it comes round.
create or replace function public.vip_admin_videos(p_programme uuid, p_limit integer default 200)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare mo public.vip_months;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  mo := public.vip_ensure_month(p_programme);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', v.id, 'profile_id', v.profile_id, 'name', pr.name, 'platform', v.platform, 'url', v.video_url,
        'thumb', v.thumbnail_url, 'caption', v.caption,
        'posted_at', v.posted_at, 'submitted_at', v.submitted_at, 'views_total', v.logged_views,
        'views_counted', public.vip_video_counted(v, mo), 'status', v.status, 'reason', v.disqualified_reason,
        'synced_at', v.views_synced_at, 'error', v.views_sync_error) order by v.submitted_at desc)
      from (select * from public.vip_videos where programme_id = p_programme order by submitted_at desc limit p_limit) v
      join public.profiles pr on pr.id = v.profile_id), '[]'::jsonb);
end $$;

alter table public.vip_members add column if not exists rate_review_on date;

create or replace function public.vip_set_review_date(p_profile uuid, p_date date)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_prog uuid;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_profile;
  if v_prog is null or not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can do that.'; end if;
  update public.vip_members set rate_review_on = p_date where profile_id = p_profile;
end $$;
revoke all on function public.vip_set_review_date(uuid, date) from public, anon;
grant execute on function public.vip_set_review_date(uuid, date) to authenticated;
