-- 428: PHOTO POSTS DO NOT COUNT (16 Oct 2026).
--
-- A Facebook photo post has no view count, so an entry made of one scored nothing and sat "could not read" until the
-- team typed a number in by hand (Evelin's eighteen photos, a /share/p/ link). The submit forms now refuse one with a
-- pop-up (src/lib/photoPost.js); this is the database's copy of the same rule, so the door is shut in the RPC too.
--
-- Only what the LINK proves: Facebook's share sheet names the kind in the path (/share/r/ reel, /share/v/ video,
-- /share/p/ post), and /photo/, photo.php and /media/set are pictures by name. An Instagram /p/ link can be a reel, so
-- it is checked by view-sync from the form and never refused here. TikTok is untouched (its photo posts state views).
-- INSERT only: entries already in (this month's Global Challenge) stay exactly as they are.

create or replace function public.refuse_photo_post()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.platform, '') = 'Facebook'
     and coalesce(new.video_url, '') ~* '/share/p/|/photos?(/|\.php|$|\?)|/media/set' then
    raise exception 'PHOTO_POST: only Facebook Reels and videos count; photo and text posts have no view count'
      using errcode = 'P0001', hint = 'photo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aa_refuse_photo_post on public.submissions;
create trigger trg_aa_refuse_photo_post
  before insert on public.submissions
  for each row execute function public.refuse_photo_post();

drop trigger if exists trg_aa_refuse_photo_post on public.vip_videos;
create trigger trg_aa_refuse_photo_post
  before insert on public.vip_videos
  for each row execute function public.refuse_photo_post();
