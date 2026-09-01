-- A BONUS THE CREATOR CLAIMS WHEN THEY SUBMIT, SO NOBODY HAS TO CHECK.
--
-- Ethan: "when an admin sets up bonus points they should enter what the bonus
-- points are for, and creators will obviously see this... when submitting a
-- video and asked for the link and description there should be a check box
-- asking them if they posted a video on the certain thing to get the bonus
-- point. Let's say the admin decided that posting a video featuring Christmas
-- markets gets you a bonus point - the admin should also write the message that
-- shows up when a creator submits, like 'Is this video featuring a Christmas
-- market?', and ticking the box would then automatically update the points.
-- This would mean the points system is fully automated again, no manual
-- checking. Although it should show +1 point on the entry card, because then
-- the admin can easily check and ensure no one is cheating."
--
-- WHAT MAKES A BONUS CLAIMABLE IS HAVING A QUESTION TO ASK.
--
-- `point_rules.prompt` is the whole switch. A bonus rule WITH a prompt is asked
-- at submission time and awarded automatically from the answer; a bonus rule
-- WITHOUT one is what bonuses have always been - something an admin hands out
-- by hand from the results page. That keeps every bonus already in the database
-- working exactly as it does, and means "make this one automatic" is a sentence
-- an admin types rather than a mode they have to find.
--
-- THE CLAIM IS A ROW, NOT A COLUMN ON THE SUBMISSION. A challenge can offer
-- several bonuses at once, they can be added while it is running, and an admin
-- has to be able to see which entry claimed which one. A join table says all of
-- that; a boolean cannot say any of it.
--
-- THE AWARD IS DERIVED, NEVER STORED TWICE. The claim is the fact; the points
-- are recalculated from it by `recalc_challenge_points` along with every other
-- automatic rule. So a bonus added mid-challenge, a rule whose points an admin
-- edits afterwards, and a claim taken back all land on the leaderboard through
-- the one path that was already keeping it honest - which is the whole of
-- "admins can do this at the beginning or in the middle of a challenge, it
-- should always update correctly".
--
-- WHY THE CREATOR CAN BE TRUSTED WITH THE TICK BOX. They cannot, entirely, and
-- that is why the entry card shows the claim: the video and the claim sit side
-- by side on a page an admin already reads, so checking is looking rather than
-- auditing, and withdrawing is one press. Automating the arithmetic is not the
-- same as automating the judgement.

alter table public.point_rules
  add column if not exists prompt text;

comment on column public.point_rules.prompt is
  'Bonus rules only. The yes/no question a creator is asked when they submit an entry, e.g. "Is this video featuring a Christmas market?". A bonus with a prompt is claimed by the creator and awarded automatically; a bonus without one is awarded by an admin by hand.';

create table if not exists public.submission_bonus_claims (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  rule_id       uuid not null references public.point_rules(id) on delete cascade,
  creator_id    uuid not null references public.profiles(id) on delete cascade,
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- Ticking twice is a slip, not a decision to claim it twice.
  unique (submission_id, rule_id)
);

create index if not exists submission_bonus_claims_challenge_idx
  on public.submission_bonus_claims (challenge_id);
create index if not exists submission_bonus_claims_rule_idx
  on public.submission_bonus_claims (rule_id);

alter table public.submission_bonus_claims enable row level security;

-- Readable by anyone who can read the entry it belongs to, which is what puts
-- the "+1 point" chip on the card for the admin AND for the creator.
drop policy if exists submission_bonus_claims_read on public.submission_bonus_claims;
create policy submission_bonus_claims_read on public.submission_bonus_claims
  for select to authenticated using (true);

-- A creator claims and un-claims their OWN entries. `creator_id` is checked
-- against the submission rather than trusted from the client, so a claim cannot
-- be written on somebody else's video.
drop policy if exists submission_bonus_claims_own on public.submission_bonus_claims;
create policy submission_bonus_claims_own on public.submission_bonus_claims
  for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.creator_id = (select auth.uid())
        and s.challenge_id = challenge_id
    )
  );

drop policy if exists submission_bonus_claims_own_delete on public.submission_bonus_claims;
create policy submission_bonus_claims_own_delete on public.submission_bonus_claims
  for delete to authenticated
  using (creator_id = (select auth.uid()) or public.is_admin());

-- An admin can correct anything, which is the other half of "the admin can
-- easily check and ensure no one is cheating".
drop policy if exists submission_bonus_claims_admin on public.submission_bonus_claims;
create policy submission_bonus_claims_admin on public.submission_bonus_claims
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------ the claims become points
--
-- APPENDED TO `recalc_challenge_points_internal`, NOT TO THE WRAPPER.
--
-- `recalc_challenge_points` is the admin-facing entry point and it refuses
-- anything outside `my_managed_scopes()`. The trigger calls the INTERNAL one,
-- which is the function that actually holds the rules - and it has to, because
-- the row that starts this recalculation is written by a CREATOR ticking a box.
-- Putting the new rule in the wrapper would have meant it fired for an admin
-- pressing rescore and never for the person it is about.
--
-- The body below is the deployed function verbatim with one insert added on the
-- end, in the same shape as the others: automatic, wiped and rebuilt every
-- time, explained by its own rule.
create or replace function public.recalc_challenge_points_internal(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_community uuid;
  v_mode      text;
begin
  select community_id, threshold_mode into v_community, v_mode
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  -- Only the automatic awards are rebuilt. A bonus a human gave survives a
  -- rescore, which is the whole reason `is_auto` exists.
  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- A point per video, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- A milestone on ONE video's views.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, submission_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, s.creator_id,
             r.id as rule_id, s.id as submission_id, r.points, r.label,
             row_number() over (partition by s.id order by r.threshold desc) as rn
      from public.submissions s
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
       and coalesce(s.logged_views, 0) >= r.threshold
      where s.challenge_id = p_challenge
    ) ranked
    where rn = 1;
  end if;

  -- A milestone on the creator's COMBINED views.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge
      group by s.creator_id
    ) t
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
     and t.views >= r.threshold;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, t.creator_id,
             r.id as rule_id, r.points, r.label,
             row_number() over (partition by t.creator_id order by r.threshold desc) as rn
      from (
        select s.creator_id, coalesce(sum(s.logged_views), 0) as views
        from public.submissions s where s.challenge_id = p_challenge
        group by s.creator_id
      ) t
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
       and t.views >= r.threshold
    ) ranked
    where rn = 1;
  end if;

  -- Points for each distinct platform posted on, capped like per_post.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge
  where r.challenge_id = p_challenge and r.kind = 'platform_spread' and r.is_active
    and coalesce(s.platform, '') <> ''
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)) > 0;

  -- THE CLAIMED BONUSES. Only rules that actually ask a question: a bonus with
  -- no prompt is an admin's own award, lives on as a MANUAL row, and this
  -- function never touches it.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, c.creator_id, r.id, c.submission_id, r.points, r.label, true
  from public.submission_bonus_claims c
  join public.point_rules r on r.id = c.rule_id
  where c.challenge_id = p_challenge
    and r.challenge_id = p_challenge
    and r.kind = 'bonus'
    and r.is_active
    and r.prompt is not null;
end $$;

-- A claim moves the leaderboard the moment it is made, exactly as a submission
-- does. `trg_recalc_points` already reads `challenge_id` off the row and only
-- spends the work on a challenge that scores on points.
drop trigger if exists trg_points_on_bonus_claim on public.submission_bonus_claims;
create trigger trg_points_on_bonus_claim
  after insert or delete on public.submission_bonus_claims
  for each row execute function public.trg_recalc_points();

notify pgrst, 'reload schema';
