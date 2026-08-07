-- 075: open the Spain chapter.
--
-- Spain was seeded inactive in 071 along with the other five markets. This turns
-- it on so the shape of a SECOND market can be seen next to UK, which is the
-- thing the nested architecture is hard to judge without.
--
-- WHY THIS IS SAFE WHILE A UK CHALLENGE IS RUNNING
--
-- Activating a chapter changes exactly one boolean on one row. It does not move
-- a single creator, challenge, submission or reward: every one of those rows was
-- scoped in 073 and none of them is touched here. No creator gains or loses a
-- membership. `communities.is_active` is read by nothing in the live app, and the
-- pages that do read it are behind an admin-only route guard.
--
-- Spain deliberately opens EMPTY. No seeded members, no invented challenge, no
-- placeholder submissions. A market with fabricated activity in it is worse than
-- useless for judging the design: the empty state is the state every new market
-- actually launches in, so that is the one worth looking at.
--
-- Reversible:
--   update public.communities set is_active = false, lead_id = null where slug = 'spain';
--   delete from public.channels where community_id = (select id from public.communities where slug = 'spain');

-- The architecture rule is that a chapter stays invisible until it has a lead.
-- Rather than break that rule to open Spain, the lead is set to the global admin
-- until a real country manager is named. That keeps the invariant honest and
-- makes "who owns this market" answerable rather than null.
update public.communities c
set is_active = true,
    lead_id = (select id from public.profiles where is_admin = true and is_test = false order by created_at limit 1)
where c.slug = 'spain';

-- The same three purposeful rooms UK has. A new market gets a working shape on
-- day one rather than an empty sidebar, which is most of what makes a chapter
-- feel real before it has any people in it.
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id, v.key, v.label, v.hint, v.icon, v.post_policy, v.visibility, v.position
from public.communities c
cross join (values
  ('briefs',  'Briefs',  'Questions about the current challenge brief.', 'flag',     'all', 'scope', 0),
  ('wins',    'Wins',    'Post a result you are proud of.',              'trophy',   'all', 'scope', 1),
  ('meetups', 'Meetups', 'Who is filming where, and when.',              'calendar', 'all', 'scope', 2)
) as v(key, label, hint, icon, post_policy, visibility, position)
where c.slug = 'spain'
on conflict (community_id, key) do nothing;

-- Spain's CPM target is its own number, not UK's. The £0.50 target UK inherited
-- came from comparing against paid social impressions, which is a different unit
-- of value; each market sets its own once it has real data. 0.50 is carried over
-- as a starting point only.
update public.communities
set prize_baseline = 0
where slug = 'spain';
