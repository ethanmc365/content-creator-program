-- 409: a stored link must be a web address. Creators save video links straight through the API, and the app turns
-- them into hrefs (results pages, boards, profiles), so a `javascript:` link saved by hand would run in the app for
-- whoever clicked it. The app now passes every such href through lib/safeUrl; this is the same rule at the source.
-- Every existing row already passes (checked 14 Oct 2026), so the constraints are validated at once.
alter table public.submissions add constraint submissions_video_url_is_web
  check (video_url ~* '^https?://') not valid;
alter table public.submissions validate constraint submissions_video_url_is_web;

alter table public.vip_videos add constraint vip_videos_video_url_is_web
  check (video_url ~* '^https?://') not valid;
alter table public.vip_videos validate constraint vip_videos_video_url_is_web;

alter table public.jobs add constraint jobs_apply_url_is_web
  check (apply_url is null or apply_url = '' or apply_url ~* '^https?://') not valid;
alter table public.jobs validate constraint jobs_apply_url_is_web;

alter table public.events add constraint events_meeting_url_is_web
  check (meeting_url is null or meeting_url = '' or meeting_url ~* '^https?://') not valid;
alter table public.events validate constraint events_meeting_url_is_web;
