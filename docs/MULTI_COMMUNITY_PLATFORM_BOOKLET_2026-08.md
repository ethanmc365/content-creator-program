# From one community to a platform

### An audit of the UK programme, and a plan to run every market on it

5 August 2026. Research and plan only. Nothing in here has been built.

Every number in Part 1 and Part 2 was measured against the production database on
5 August 2026, not estimated. Where I am guessing, I say so.

---

## Contents

1. [The one page](#the-one-page)
2. [Part 1: What you actually have](#part-1-what-you-actually-have)
3. [Part 2: Where single-tenant is baked in](#part-2-where-single-tenant-is-baked-in)
4. [Part 3: The architecture](#part-3-the-architecture)
5. [Part 4: Security, properly](#part-4-security-properly)
6. [Part 5: The migration](#part-5-the-migration)
7. [Part 6: Motivation redesign, points and tiers](#part-6-motivation-redesign-points-and-tiers)
8. [Part 7: Local and global at the same time](#part-7-local-and-global-at-the-same-time)
9. [Part 8: The country manager product](#part-8-the-country-manager-product)
10. [Part 9: The global dashboard](#part-9-the-global-dashboard)
11. [Part 10: Onboarding a market in ten minutes](#part-10-onboarding-a-market-in-ten-minutes)
12. [Part 11: Holding 300+ creators](#part-11-holding-300-creators)
13. [Part 12: Rebrand](#part-12-rebrand)
14. [Part 13: Tools and connectors](#part-13-tools-and-connectors)
15. [Part 14: Build plan and risks](#part-14-build-plan-and-risks)
16. [Appendix A: Schema sketch](#appendix-a-schema-sketch)
17. [Appendix B: RLS policy drafts](#appendix-b-rls-policy-drafts)
18. [Appendix C: Metric definitions](#appendix-c-metric-definitions)
19. [Sources](#sources)

---

## The one page

**The platform is in better shape for this than I expected.** 49 tables, 119 RLS
policies, 72 database functions, 27,417 lines across 151 files, 55 routes, 21
admin pages. The security model already funnels through three functions
(`is_member()`, `can_post()`, `is_admin()`), which means the multi-tenant rewrite
has a single choke point rather than 119 independent rewrites. Migration 069
already added `market`, `prize_amount`, `cpm_target` and `objective` to
`challenges`, so the economics layer is half built.

**Five things will cost more than the brief assumes.**

1. `messages.channel` is a **text key**, not a table. `#general` is global by
   name. Multi-community chat means channels become rows, and that touches the
   read-tracking, the localStorage keys, the hardcoded `CHANNELS` array and every
   notification trigger. This is the single largest refactor in the app.
2. `notify_all()` hardcodes "every active profile". Fifteen trigger functions
   call it. Each one needs a decision about whether it is community-scoped or
   deliberately global, and getting that wrong is how a Spanish creator gets
   pinged about a UK challenge on day one of the demo.
3. `profiles.country` is free text and it is a mess. 44 active creators have **20
   distinct spellings** of about 13 countries: `Uk`, `UK`, `United Kingdom`,
   `Uk ` (trailing space), `Scotland`, `Ireland`, `Ireland ` . You cannot
   auto-assign anyone to a community from this column. Normalising to ISO country
   codes is a prerequisite, not a nice-to-have.
4. Four anonymous RPCs feed the public landing page (`landing_stats`,
   `public_creator_map`, `featured_creators`, `public_live_challenge`) and all
   four are global. Per-market landing pages are a whole extra surface.
5. `next_invoice_number()` is one global sequence. Paying a German creator and a
   UK creator from a Portuguese entity are different invoicing problems.
   Multi-market payouts is a finance question wearing a code costume.

**The number that should change the plan.** Your live challenge has a £190 pot
and has produced 37,383 logged views across 27 posts. That is a **CPM of £5.08**
against a target of £0.50. You are 10x over target, and the dashboard you are
about to build will say so in front of everyone. Better that you know before it
does. The good news is that the fix is the same fix as the engagement fix, which
is Part 6.

**On the questions you asked.** Yes to points, yes to tiers, yes to a rebrand, and
**no** to accumulated views as an individual ranking. Accumulated views should be
a **collective community goal**, not a personal scoreboard. The reason is in Part
6 and it is the single most important design decision in this document.

**Demo order, unchanged from your brief and correct.** Switcher, dashboard,
working RLS. The onboarding flow is a nice-to-have that a global admin can do in
SQL for the first three markets.

---

## Part 1: What you actually have

### The UK community, measured

| Measure | Value |
| --- | ---: |
| Active creators (excl. test accounts) | 44 |
| Pending applications | 5 |
| Admins | 2 |
| Never opened the app | 22 (50%) |
| Opened in last 7 days | 16 (36%) |
| Opened in last 30 days | 24 (55%) |
| Push subscriptions | 6 |
| Challenges run on platform | 1 |
| Submissions | 27 |
| Unique creators who posted | 11 (25%) |
| Posted more than once | 9 |
| Total logged views | 37,383 |
| Median views per post | 759 |
| Best post | 12,700 |
| Chat messages, all time | 35 |
| Accepted connections | 50 |
| Trips on the collab board | 24 |
| Daily puzzle plays | 216 |
| Travel photos uploaded | 272 |

The engagement diagnosis from 3 August still holds and I will not repeat it. Two
things have moved: chat is up from 31 to 35 messages, and 30-day actives sit at
24. Nothing structural has changed.

### The economics, which nobody has written down yet

| Figure | Value | Note |
| --- | ---: | --- |
| Prize pot | £190 | 3 winners |
| Logged views | 37,383 | |
| **CPM** | **£5.08** | target £0.50 |
| Cost per post | £7.04 | 27 posts |
| Cost per participating creator | £17.27 | 11 creators |
| Cost per active creator on roster | £4.32 | 44 creators |
| Median creator's share of pot | £0 | 33 of 44 got nothing |

For context on whether £5.08 is bad: UGC creators charge roughly $150 to $300 per
video, and UGC CPMs run 70 to 90 percent below influencer CPMs, with view-bonus
ladders in the $3 to $5 CPM range. So £5.08 is **not a scandal, it is roughly
market rate for UGC**. What it is not is £0.50. Either the target is wrong or the
model is. My reading: the £0.50 target came from comparing against paid social
impressions, which are a different unit of value entirely, and the honest headline
is not CPM at all, it is **cost per piece of usable content**, which at £7.04 is
excellent and should be the number on the first slide.

Keep CPM on the dashboard because you asked for it and because a paid media team
will ask. But put **cost per accepted asset** next to it, because that is where you
win.

### What is genuinely working, and must survive the rewrite

Three things, and they are all the same shape: **low social risk, no audience
required.**

- **Connections: 50 accepted.** Private, one-to-one, nobody watching.
- **Daily puzzle: 216 plays.** Single player, cannot be embarrassed.
- **Travel photos: 272 uploaded.** Self-expression with no performance attached.

Meanwhile the public square is dead: 35 chat messages, 32 of them in `#general`,
1 in `#content-tips`, and roughly two thirds of them yours.

**Design implication for multi-community.** Do not scope the working things to
communities. Connections, DMs, the collab travel board, the creator map and the
daily puzzle should stay **global**, deliberately. If a Spanish creator's first
experience is a room with four people in it, you have taken your one working
mechanic and made it worse. Scope the things that need local context (challenges,
briefs, payouts, announcements, roster) and keep the social graph global. This is
the difference between seven small dead communities and one live network with
seven local programmes inside it.

### The country picture, which is the real argument for this project

Actual `profiles.country` values today, active creators only:

| Cluster | Creators | Ever opened |
| --- | ---: | ---: |
| UK spellings (`Uk`, `UK`, `United Kingdom`, `Uk `, `Scotland`) | 19 | 14 |
| Ireland (`Ireland`, `Ireland `) | 11 | 4 |
| Everywhere else (12 countries, 1 to 2 each) | 14 | 3 |

Read that last row again. **Fourteen creators are already in markets with no
country manager, and eleven of the fourteen have never opened the app.** Your
global English community is not a phase 3 feature for future markets, it is a fix
for a third of your existing roster who joined a UK programme and correctly
concluded that none of it was for them.

Also note Ireland at 11 creators. That is larger than most launch markets will be.
"UK" today is really UK plus Ireland, and the migration has to decide whether to
split them. My recommendation: **keep them together as `UKI` for now** (one CM, one
language, one currency in practice) and split later once Ireland has its own lead.
Splitting is a data move; merging back is an apology.

---

## Part 2: Where single-tenant is baked in

You asked me to flag anywhere the assumptions run deeper than expected. Sixteen
places, ordered by how much they will hurt.

### Tier 1: will eat a week each

**1. Chat channels are strings, not rows.**
`messages.channel text`, with a hardcoded array in `src/pages/Chat.jsx:90` and
per-channel read state in `channel_reads` plus a localStorage key
`tryp-chat-last-read-${channel}`. There is no channel entity to attach a
`community_id` to. Multi-community chat requires a `channels` table, a migration
of the three existing keys, a rewrite of unread tracking, and a decision about
whether `#announcements` is per-community (it should be) and whether there is a
global room (there should be). Roughly 19 `.from('messages')` call sites.

**2. `notify_all()` is unconditional broadcast.**

```sql
insert into notifications (recipient_id, ...)
select p.id from profiles p where p.status = 'active' and p.id <> p_except;
```

Fifteen trigger functions call it: `on_challenge_live`, `on_announcement`,
`on_new_member`, `on_event_created`, `on_job_opened`, `on_wall_published`,
`post_birthday_cards` and others. Every single one needs an explicit
community-scoped or global decision. Some are genuinely global (a birthday, a new
member of the whole network) and some are catastrophically not (a challenge going
live, a market announcement). There is no default that is safe, so this is
fifteen individual judgement calls, not one refactor.

**3. `is_admin` is a boolean.**
One column on `profiles`, referenced across 23 files, gating 21 admin pages, the
`/admin` route guard, `ProtectedRoute`, `AuthContext`, and the `is_admin()` SQL
function that appears in dozens of policies. It becomes three roles with different
scopes. The SQL side is contained; the React side is 23 files of "is this person
allowed to see this, and for which community".

**4. Ten `admin_*` RPCs return whole-platform data.**
`admin_list_emails`, `admin_list_last_seen`, `admin_creator_scorecard`,
`admin_challenge_metrics`, `admin_weekly_activity`, `admin_push_adoption`,
`admin_get_email`, `admin_remind_incomplete`, `admin_decline_application`,
`admin_delete_creator`. All gated on `is_admin()` and all unscoped.
`admin_list_emails` is the sharp one: a Spanish country manager calling it today
would get every UK creator's email address. Each needs a community filter plus a
"is this caller allowed in this community" check, enforced in the function, not
the caller.

### Tier 2: a day or two each

**5. `profiles.country` is unusable free text.** 20 spellings, 13 countries,
trailing whitespace, `Scotland` as a country. Needs a normalised
`country_code char(2)` backfilled by hand or by a mapping table, with the free-text
column kept for display. Do this **before** anything else, because community
assignment depends on it and because you will want to run the same normalisation
against future signups.

**6. Four anonymous landing-page RPCs are global.** `landing_stats()`,
`public_creator_map()`, `featured_creators()`, `public_live_challenge()`. A
per-market landing page (`tryp.com/creators/es`) needs community-aware variants,
and the "which community am I applying to" question has to be answered before
signup, not after.

**7. Two hardcoded prize baselines that must stay in sync.** `PRIZE_BASELINE=500`
(GBP) in `src/lib/utils` and a matching literal inside `landing_stats()`. It is
UK-specific historical spend. Per-community it becomes a column on `communities`,
and the duplication should die in the same move.

**8. The `impersonate` edge function targets one fixed QA creator.** A country
manager using "view as creator" needs a sandbox creator **in their own community**,
or they will be teleported into the UK. Needs a per-community sandbox account or a
different approach entirely.

**9. `app_settings` is a single-row global key-value table.** Anything in there
that varies per market (and things will) needs a community dimension.

**10. Invoice numbering is one global sequence.** `next_invoice_number()` produces
`Tryp.com 001`. The controller entity is Tryp.com LDA in Lisbon. Invoicing a
German creator, a Swedish creator and a UK creator from a Portuguese entity are
three different VAT and documentation situations. **This is a finance and legal
question, not an engineering one, and it should be asked now** because it can
block payouts in a new market on day one.

**11. Email templates are five rows, English only.** Multi-market means either
per-community template overrides or accepting English everywhere. See Part 7 on
language, where I argue for English-only content with localised transactional
email, which is the cheap middle.

**12. Referral codes live in one global namespace.** Invite links need to carry a
community, otherwise a Spanish creator invited by a Spanish CM lands in the UK.

### Tier 3: know about it, deal with it in passing

**13. Crons iterate every active profile.** `daily-birthday-cards`,
`inactive-creator-alerts`, `challenge-reminders`, `purge-deleted-creators`,
`publish-scheduled-challenges`, `post-scheduled-announcements`,
`archive-ended-challenges`. Mostly they stay global (birthdays) or become
naturally scoped once the underlying row has a `community_id` (challenge
reminders). Audit all seven, change three.

**14. Storage buckets are flat.** `avatars/gallery/chat-media/dm-media/resources`
with no community prefix. Nothing breaks, but per-community quota, per-community
cleanup and "delete this market" all become manual. Change the path convention now
(`gallery/{community_slug}/{creator_id}/...`) even though old objects stay put.

**15. Game scores are global with a `day_key`.** This is *correct* and should stay,
but the leaderboard needs a scoping toggle (my community / worldwide) rather than
one global board where a 300-person network makes the puzzle feel unwinnable.

**16. `challenges.market` already exists but is null.** Migration 069 added it and
nothing populates it. Do not use it as the tenant key. It is a reporting dimension
(a market string) and the tenant key should be a foreign key to `communities`.
Keep both, and derive `market` from the community on write.

### What is already fine

Worth saying, because it saves time: `connections`, `conversations`,
`direct_messages`, `dm_reactions`, `creator_private`, `notifications`,
`push_subscriptions`, `game_scores`, `creator_photos`, `resource_bookmarks` and
`job_applications` are all **owner-scoped**, not community-scoped, and their
existing policies stay valid untouched. That is 11 of 49 tables you do not have to
think about, and it includes the DM system, which is the fiddliest security
surface in the app.

---

## Part 3: The architecture

### The shape

```
communities ──┬── community_members ──── profiles
              │        (role per membership)
              │
              ├── challenges ──── submissions ──── results ──── rewards
              ├── channels ──── messages ──── reactions
              ├── events, resources, jobs, polls
              └── announcements, invites

GLOBAL, deliberately unscoped:
   connections · conversations · direct_messages · collab_posts
   creator_photos · game_scores · notifications · creator_private
```

### `communities`

```sql
create table public.communities (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,          -- 'uki', 'es', 'worldwide'
  name          text not null,                 -- 'UK & Ireland'
  kind          text not null default 'market' -- 'market' | 'global'
                check (kind in ('market','global')),
  market_code   text,                          -- 'UKI','ES','PT','DE','RO','SE'; null for global
  country_codes char(2)[] default '{}',        -- ['GB','IE'] drives auto-suggest on signup
  language      text not null default 'en',
  currency      text not null default 'GBP' check (currency in ('GBP','EUR','USD','SEK','RON')),
  timezone      text not null default 'Europe/London',
  lead_id       uuid references public.profiles(id) on delete set null,
  is_active     boolean not null default true,
  cpm_target    numeric(10,2) default 0.50,
  prize_baseline numeric(10,2) default 0,      -- kills the hardcoded 500
  brand         jsonb default '{}'::jsonb,     -- accent colour, hero image, invite copy
  created_at    timestamptz default now()
);
```

`kind` rather than "is this the global one" as a boolean, because you will
eventually want a third kind (a temporary campaign community, a brand-partner
community) and a boolean cannot grow.

`country_codes` is what makes onboarding fast: a signup from `IE` gets suggested
UKI automatically, a signup from `MY` gets Worldwide, and no code changes when
Sweden launches.

### `community_members`

Many-to-many, as your brief correctly requires, with the role living on the
**membership** rather than the person.

```sql
create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'creator'
                 check (role in ('creator','manager')),
  is_primary   boolean not null default false,
  status       text not null default 'active'
                 check (status in ('active','pending','left','removed')),
  joined_at    timestamptz default now(),
  primary key (community_id, profile_id)
);
create index on public.community_members (profile_id);
create unique index one_primary_per_profile
  on public.community_members (profile_id) where is_primary;
```

Three roles as your brief specifies, but note the split: `creator` and `manager`
are **membership** roles (scoped to a community), while `global_admin` is a
**platform** role and belongs on `profiles`, not here. A global admin is not a
member of every community; they are above the concept.

```sql
alter table public.profiles
  add column platform_role text not null default 'none'
    check (platform_role in ('none','global_admin'));
```

Migrate the two existing `is_admin = true` rows to `platform_role = 'global_admin'`
and keep `is_admin` as a generated column for one release so nothing breaks while
the 23 React files catch up:

```sql
-- transition shim, dropped in a later migration
alter table public.profiles
  add column is_admin_new boolean generated always as
    (platform_role = 'global_admin') stored;
```

**`is_primary`** matters more than it looks. Every creator has exactly one home
community (where their briefs, payouts and roster live) and may belong to others
(Worldwide, a campaign). Without a primary, "which community does this payout come
out of" has no answer.

### Where `community_id` goes

Add to: `challenges`, `submissions` (denormalised from challenge, for RLS speed),
`results`, `rewards`, `channels`, `messages` (denormalised from channel),
`events`, `resources`, `jobs`, `polls`, `scheduled_announcements`,
`email_campaigns`, `invoices`, `referrals`, `application_decisions`,
`creator_admin_notes`, `admin_notes`, `feedback`.

**Do not add to:** `connections`, `conversations`, `direct_messages`,
`dm_reactions`, `collab_posts`, `collab_interests`, `creator_photos`,
`game_scores`, `notifications`, `creator_private`, `push_subscriptions`,
`resource_bookmarks`, `channel_reads`, `job_applications`, `poll_votes`,
`reactions`, `event_rsvps` and the event_poll family. These are either owner-scoped
or child rows whose parent already carries the tenant.

**The denormalisation call.** `submissions.community_id` duplicates
`challenges.community_id`, and `messages.community_id` duplicates
`channels.community_id`. Normally that is a smell. Here it is correct, because the
alternative is an RLS policy with a join on every row read, and RLS predicates run
per row. Keep them honest with a trigger that copies from the parent on insert and
rejects a mismatch on update.

### The switcher, and how context actually flows

This is the demo, so it is worth being precise about the mechanism.

**Do not put the active community in React state alone.** Three requirements
conflict: it must survive a refresh, it must be shareable as a URL (a CM sending a
link to a global admin), and it must never let a stale value leak data.

Recommendation:

- **URL is the source of truth**: `/c/:communitySlug/challenges`, with legacy
  routes redirecting to the user's primary community. Shareable, back-button
  correct, and it makes the "switching swaps all data context" requirement
  automatic because every query already keys off a route param.
- **A `CommunityContext`** resolves the slug to an id, validates membership
  against `community_members` on every change, and exposes
  `{ community, memberships, canSwitch, switchTo }`.
- **React Query keys include the community id**, so switching invalidates cleanly
  and switching back is instant from cache. If you are not on a query library yet,
  this is the moment.
- **RLS is the backstop.** If the client ever asks for the wrong community, it
  gets zero rows, not an error and not data. That is the whole point of doing this
  at the database.

**Making it slick.** Use `cmdk` for a command-palette switcher on `⌘K`, with
recent communities, fuzzy search, flag or accent colour per community, and live
member counts. Animate the swap with a fast crossfade plus a subtle accent-colour
shift drawn from `communities.brand`, using Motion. The whole app tinting slightly
as you move from UK orange to a Spanish accent is the moment that sells this in a
demo, and it is about forty lines of CSS variables.

---

## Part 4: Security, properly

You said RLS is the boundary and the UI is convenience. Agreed, and here is the
part that matters most.

### Do not put community membership in the JWT

The standard advice is to embed `org_ids` in JWT claims to avoid a subquery per
row. **That advice is wrong for this app specifically**, and the reason is in your
own auth config: `jwt_exp = 604800` (one week) and refresh tokens never expire
(timebox 0), by deliberate design so creators stay logged in.

That means a JWT claim can be **up to a week stale**. Consequences:

- A creator removed from a community keeps reading it for a week.
- A country manager given a second market cannot see it until they log out.
- A creator who joins Worldwide sees nothing until their token rolls.

Also, custom claims sourced from `raw_user_meta_data` are user-writable, so any
claim not injected by a trusted auth hook is an escalation waiting to happen.

**Use table-driven membership with a STABLE `SECURITY DEFINER` helper.** At 300
creators, 49 tables and roughly 10 memberships per user, the performance argument
is theoretical. You are optimising a query that will never be slow, at the cost of
a real security property.

### The helper functions

```sql
-- Every community the caller can read. STABLE so Postgres evaluates it once
-- per statement rather than once per row.
create or replace function public.my_communities()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select cm.community_id
  from community_members cm
  where cm.profile_id = auth.uid() and cm.status = 'active'
  union all
  select c.id from communities c
  where exists (select 1 from profiles p
                where p.id = auth.uid() and p.platform_role = 'global_admin');
$$;

-- Communities the caller can WRITE to as staff.
create or replace function public.my_managed_communities()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select cm.community_id from community_members cm
  where cm.profile_id = auth.uid() and cm.role = 'manager' and cm.status = 'active'
  union all
  select c.id from communities c
  where exists (select 1 from profiles p
                where p.id = auth.uid() and p.platform_role = 'global_admin');
$$;

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role = 'global_admin' from profiles
                   where id = auth.uid()), false);
$$;
```

`SECURITY DEFINER` is required here, not optional: `community_members` is itself
RLS-protected, and a policy that queries it from an invoker-rights function gives
you the "infinite recursion detected in policy" error you have already hit once
with `dm_send_allowed`.

### The policy pattern

Every scoped table gets exactly this shape. Consistency is worth more than
cleverness across 119 policies.

```sql
create policy "challenges: read own communities" on public.challenges
  for select to authenticated
  using (community_id in (select public.my_communities()));

create policy "challenges: staff write" on public.challenges
  for all to authenticated
  using      (community_id in (select public.my_managed_communities()))
  with check (community_id in (select public.my_managed_communities()));
```

Three details that are easy to get wrong:

1. **`(select fn())` not `fn()`.** Wrapping in a subselect forces Postgres to
   evaluate it as an InitPlan once per query instead of once per row. On a 10,000
   row scan that is the difference between 8ms and 800ms.
2. **Always `with check`, not just `using`.** Without it a manager can insert rows
   into a community they do not manage. `using` gates what you can see; `with
   check` gates what you can write. This is the most common multi-tenant RLS hole.
3. **Index every `community_id`.** 126 indexes exist today; you are adding about
   18 more, and they are all cheap.

### The three roles, spelled out

| | creator | country_manager | global_admin |
| --- | --- | --- | --- |
| Read challenges | own communities | managed communities | all |
| Create challenges | no | managed communities | all |
| Read roster + emails | own communities, public fields only | managed communities, incl. email | all |
| Read submissions | own + own communities' | managed communities | all |
| Approve applications | no | managed communities | all |
| Issue rewards / invoices | no | managed communities | all |
| Switch community | no (unless multi-member) | between managed | any |
| Global dashboard | no | no | yes |
| Create a community | no | no | yes |
| DM / connect | anyone on the platform | anyone | anyone |

Note the last row. **Cross-community DMs and connections are allowed on purpose.**
A country manager cannot read them, which is correct, and a creator in Portugal
can message a creator in Sweden, which is the entire point of a global network.

### The verification step that makes this safe

Before dropping a single old policy, run a **shadow diff**. For each table,
execute the old predicate and the new predicate as the same user and compare row
counts:

```sql
-- run as each of: a UK creator, a UK manager, a global admin, a Worldwide creator
select 'challenges' as t,
       (select count(*) from challenges where /* old predicate */) as old_rows,
       (select count(*) from challenges where community_id in (select my_communities())) as new_rows;
```

Any table where `new_rows <> old_rows` for a UK creator is a regression in the
live experience. Any table where `new_rows > 0` for a creator in a community they
do not belong to is a leak. Automate this as a SQL script, run it against a
Supabase branch, and do not cut over until every row matches. This is a day of
work and it is the difference between a confident deploy and a Friday night.

---

## Part 5: The migration

Reversible, staged, and nothing destructive without asking. Seven migrations.

### 070 — country normalisation (prerequisite, no tenancy yet)

```sql
alter table profiles add column country_code char(2);
-- backfill from a mapping table, by hand for the 20 known spellings
-- 'Uk','UK','United Kingdom','Uk ','Scotland' -> 'GB'
-- 'Ireland','Ireland ' -> 'IE'  ... etc
```

Reversible: `drop column`. Ship this alone, first, and verify all 44 rows have a
code before continuing. **This is the migration most likely to reveal a surprise**
(a creator in a country you did not expect, a null), and you want it isolated.

### 071 — communities core

Creates `communities`, `community_members`, `profiles.platform_role`, the three
helper functions, and seeds two rows: `uki` (UK & Ireland, GBP, Europe/London) and
`worldwide` (global, EUR, UTC). Adds no columns to existing tables. Touches no
existing policy.

Reversible: drop two tables, one column, three functions. **Zero risk to the live
app** because nothing reads it yet.

### 072 — memberships backfill

Every active and pending profile gets a `community_members` row:
`country_code in ('GB','IE')` goes to `uki` as primary, everyone else goes to
`worldwide` as primary. The two `is_admin` profiles get
`platform_role = 'global_admin'` and a `manager` membership in `uki`.

Expected outcome from today's data: **30 in UKI, 14 in Worldwide.**

Reversible: `delete from community_members` plus reset `platform_role`. Snapshot
the pre-state into `migration_072_snapshot` first so the reversal is exact rather
than reconstructed.

### 073 — community_id columns, nullable

Adds `community_id uuid references communities(id)` plus an index to the 18 scoped
tables. All nullable, no defaults, no policy changes. The app does not read them.

Reversible: drop 18 columns.

### 074 — backfill content

Sets `community_id = uki` on every existing row in all 18 tables. Creates the
`channels` table and migrates `general`, `announcements`, `content_tips` into it
as UKI channels, plus one `worldwide` general channel, keeping
`messages.channel` as a text column populated alongside `channel_id` for one
release so nothing breaks.

Reversible: null the columns back out, drop `channels`.

**This is the last fully reversible migration.** Everything after this needs a
restore rather than a rollback, and this is the point at which I would ask you
before running.

### 075 — constraints and triggers

`not null` on the 18 columns, parent-child consistency triggers, `notify_all`
replaced by `notify_community(p_community, ...)` with the fifteen call sites
updated. The old `notify_all` stays as a thin wrapper that broadcasts globally, so
the three genuinely-global notifications keep working.

Not cleanly reversible. Take a `pg_dump` first. Note that the nightly backup
GitHub Action is currently blocked on a wrong `SUPABASE_DB_URL` secret; **fix that
before this migration**, because this is exactly the migration where you want a
known-good backup.

### 076 — RLS v2, additive

Adds the new policies **alongside** the old ones. Postgres ORs multiple permissive
policies, so during this window a UK creator satisfies both and sees exactly what
they saw before. Run the shadow diff here.

Reversible: drop the new policies.

### 077 — RLS v1 removal

Drops the old policies. This is the actual cutover, it takes effect instantly, and
it is the one to run on a quiet morning with the diff script green and a rollback
migration already written.

### The branch strategy

Work on `feat/multi-community`. Use a **Supabase branch** for the database so 070
to 077 can be applied, tested and reset without touching production. Vercel preview
deployments point at the branch database, so the whole thing can be demoed end to
end before a single migration lands on production. This is the single biggest risk
reducer available and it costs nothing but setup time.

---

## Part 6: Motivation redesign, points and tiers

You asked four questions. Here they are with answers, then the design.

> **Should we move to a points system, more gamified, away from just best views video?**

Yes. The current model has one winner-take-most axis and 33 of 44 creators are on
the losing side of it before they start.

> **Or perhaps accumulated views per challenge?**

**Not as an individual ranking.** Accumulated views ranks creators by the size of
the audience they already had, which is the one variable they cannot change this
month. It is the current problem with extra steps: your top creator has 12,700
views and your median is 759, so a cumulative board just makes the gap permanent
and visible. **Accumulated views is excellent as a community-level goal**, and that
is where it should live. See "the collective bar" below.

> **Should we rebrand the community a bit, have tiers, like Tryp.com ambassador?**

Yes to both. Part 12 for the naming; the tier design is here.

### The principle everything follows from

**Reward what a creator controls, recognise what they do not.**

- Posting is controllable. Reward it, generously, certainly, every time.
- Consistency is controllable. Reward it.
- Helping other creators is controllable. Reward it.
- Views are not controllable. Recognise them, celebrate them, but do not make them
  the ladder.

The research backs this from two directions. Duolingo's streak system works
because loss aversion attaches to something the user can always do (one lesson),
with forgiveness mechanisms so one bad day does not erase months. And gamified
tier systems see 2x to 3x higher participation than flat programmes, because tiers
are a ladder every participant can climb rather than a race most of them lose.
Target's Club Target does exactly this: weekly challenges, points, six tiers,
rewards escalating with tier, and commission only at the top. The gamification
layer is explicitly there to **reduce per-creator admin burden while raising
content volume**, which is precisely your problem at 300 creators.

### Miles: the points currency

Name it **Miles**. It is travel-native, instantly understood, and it survives
translation.

| Action | Miles | Why |
| --- | ---: | --- |
| Accepted post in a brief | **100** | The floor. Certain, known in advance. |
| First post ever | **+150** | Median time to first post is 13 days. Attack that. |
| Post in a brief you have not entered before | +25 | Breadth |
| Views on an accepted post | **+10 per 1,000**, capped at 300 per post | Recognises reach, caps the outlier |
| Consecutive brief streak | +25 x streak length, capped at 150 | Duolingo's mechanic, with a ceiling |
| Daily puzzle | 2, max 10 per week | 216 plays already; reward the habit that exists |
| Welcome a new creator (first reply to their first post) | 20 | Directly attacks the empty-room problem |
| Peer kudos received | 15 | Each creator gives 3 per week, no more |
| Referral that reaches their first post | **200** | Matches your existing "counted" definition |
| Trip posted to the collab board | 15 | The board already works, feed it |
| Profile complete + push enabled | 50, once | Buys you reachability, which is the top lever |

**Do the maths on the cap.** With the 300-per-post view cap, your 12,700-view
creator earns 100 + 127 capped to 100+300 = 400 for that post. A creator with 759
views earns 100 + 7 = 107. A four-to-one gap for a seventeen-to-one view gap. That
is the ratio that keeps the middle of the pack in the game, and it is the single
number I would tune first if it feels wrong.

**Miles never expire and never decrease.** They are a record of contribution.
Rankings reset (see seasons); the record does not.

### Tiers: identity, front-loaded, uncompeted

Everyone can reach every tier. Nobody is competing with anybody. This is the
structural fix for the expectancy collapse.

| Tier | Threshold | What it unlocks |
| --- | --- | --- |
| **Traveller** | Accepted into a community | Badge, community access, brief notifications |
| **Creator** | 1 accepted post | Profile featured in the directory, kudos ability |
| **Ambassador** | 5 accepted posts or 1,000 Miles | The badge that matters. Higher per-post rate, content eligible for repost to Tryp.com channels, name on the public site |
| **Featured Ambassador** | 15 accepted posts or 4,000 Miles, sustained over a quarter | Guaranteed reposts, first refusal on paid briefs, travel credit, an actual say in product |
| **Council** | Invitation, capped at 12 seats globally, one year | Quarterly call with the team, early access, budget input, chooses one brief a quarter |

Note what makes this work versus a typical ambassador programme that dies in a
fortnight: **each tier gives something that costs you little and is worth a lot to
a growing creator.** Reposting to Tryp.com's channels is free to you and worth more
than £63 to someone building an audience. That is the reciprocity flip: give first,
then ask.

**Tier is per-creator and global**, not per community. A creator who moves from
Worldwide to Spain keeps their tier. Miles are tracked both globally and per
community so a country manager can see contribution in their market.

### Seasons, and the leaderboard problem

Keep a leaderboard. Fix what it is a leaderboard **of**.

- **Seasons are quarterly.** Miles-earned-this-season resets; lifetime Miles do
  not. A creator who joins in month three of a season is never looking at an
  insurmountable board.
- **Divisions, not one board.** Duolingo's leagues are the right model: group
  creators into divisions of roughly 15 by last season's activity, promote the top
  3, relegate the bottom 3. A creator with 759-view videos competes against other
  creators with 759-view videos, and can genuinely win. This is the single change
  that makes a leaderboard motivating for the middle instead of demotivating.
- **The all-time views board still exists**, as a hall of fame, clearly separate,
  celebrated but not competed on.

### The collective bar: where accumulated views belongs

Each community gets a **season goal**, expressed in views, shown as a bar on the
community home page: *"UK & Ireland: 340,000 of 500,000 views this season."*

- Every creator's views count toward it, including small ones. A 400-view post
  moves the bar. That is the first time a small creator's contribution has ever
  been visibly non-zero.
- Hitting the goal unlocks something for **everyone** in the community: a bonus
  Miles drop, a community reward, a trip credit pool.
- This is co-operative, not competitive, and it converts the accumulated-views
  metric you were considering into a mechanic that helps the bottom two thirds
  instead of ranking them.

**Then, and only then, the cross-community layer.** Communities compete against
each other on a **per-capita normalised** score (views per active member, posts per
member, participation rate), so a 12-person Portuguese community can genuinely
beat a 60-person UK one. Call it the Nations board. It gives country managers
something to rally their market around, which is a real management tool, and it
gives you a global demo screen that is not a spreadsheet.

**Be careful with one thing:** per-capita boards create pressure on CMs to prune
inactive members to protect their average. Define "active member" as
"posted or opened the app in the last 30 days", published openly, so gaming it
means activating people rather than deleting them.

### What stays competitive, and what replaces the prize pot

Keep **one** competitive thing per community per month: a "best of" with a real
prize, sitting on top of a guaranteed base rate. Contests are excellent at
extracting peak effort from the people already at the top and terrible as the only
mechanism.

The base rate is the change that matters: **every accepted post earns a known
amount**, decided in advance. Your £190 pot across 3 winners could be 19
guaranteed £10 payments, which would have rewarded every post ever made on the
platform for the same money. Certainty beats a lottery because the mental maths
resolves.

**The A/B is one month of work and it settles the argument.** Run the next brief
in UKI as guaranteed-rate at the same total budget, and compare posts, unique
creators, cost per asset and CPM against the £190/3-winners challenge. You now have
the analytics to measure exactly that.

### One risk worth naming

Points systems can crowd out intrinsic motivation the same way prize money does,
if the points become the reason to create. The mitigation is that Miles are mostly
awarded for **participation and contribution** rather than performance, so they
read as recognition rather than payment. Watch for the failure mode: if creators
start asking "how many Miles is this worth" before "is this good", the schedule is
too heavy and the answer is to reduce the numbers, not add more categories.

---

## Part 7: Local and global at the same time

The hardest design question in this project is not technical. It is: **what is
local, what is global, and what is both.**

### The split

| Local (community-scoped) | Global (network-wide) | Both |
| --- | --- | --- |
| Briefs and challenges | Connections and DMs | Creator directory (filter by community, browse all) |
| Announcements | Collab travel board | Leaderboards (my community / worldwide toggle) |
| Payouts, invoices, rewards | Creator world map | Resource library (global core + local additions) |
| Roster and applications | Daily puzzle and games | Events (local meetups + global calls) |
| The main chat channel | The `#worldwide` channel | Profiles |
| Budget and CPM | Tier and lifetime Miles | Jobs |

### Why the travel board must stay global

A UK creator posting a trip to Barcelona should meet the Barcelona creators. That
is not a nice extra, it is the most defensible reason this network exists at all,
and it is a thing no single-market programme can offer. 24 trips are already on the
board. Scoping them to communities would delete the feature's entire point.

Same for the creator map, connections and DMs. Your 50 accepted connections are
your best-performing mechanic and they are person-to-person, not market-to-market.

### The passport mechanic

Since the travel board is global and the communities are geographic, there is an
obvious mechanic sitting there: **stamps**. Meet a creator from another community,
get their community's stamp. Post from another market, get a stamp. Collect stamps
into a passport on your profile. It is cheap to build, deeply on-brand, and it
gives creators a reason to interact across markets that has nothing to do with
prize money.

### Language

Your community is English-only by decision, and multi-market pressure-tests that.
My recommendation, which is the cheap middle:

- **Content stays English.** Briefs, chat, resources. It is what makes the network
  a network rather than seven silos, and creators in this space largely operate in
  English already.
- **Transactional email and the invite flow get localised** per
  `communities.language`. The first thing a Spanish creator reads should be in
  Spanish; what they read afterwards can be English.
- **`react-i18next` for the shell only** (navigation, buttons, empty states), not
  for user content. Roughly 200 strings, not 2,000.
- **Country managers write briefs in whatever language they want.** Give the brief
  a `language` field and let the market decide. This is the escape hatch that
  means you never have to have this argument again.

---

## Part 8: The country manager product

At 44 creators one person does everything by hand. At 300 across seven markets,
**the country manager tooling is the product** and everything else is scenery. If a
CM has to ask you for anything, the model does not scale.

### The CM home page: "your week"

Not a dashboard. A worklist, in priority order, that is empty when there is nothing
to do:

1. **3 applications waiting** (approve, decline, ask a question)
2. **6 creators have not posted in this brief, 2 days left** (nudge all, or pick)
3. **4 submissions to review** (watch inline, accept, reject with reason)
4. **2 payouts due** (generate invoice, mark paid)
5. **9 creators unreachable** (no push, no verified email) with a one-click fix flow
6. **1 creator has gone quiet** (30 days, was active) with a DM template

### The brief builder

- **Templates library, shared globally.** Every brief any CM has ever run,
  clonable. A new Spanish CM starts from "the UK's best-performing brief" rather
  than a blank box. This is how you get a market live in ten minutes.
- **Constraint fields, enforced.** The engagement diagnosis found that open briefs
  suppress output ("create any video featuring Tryp.com" is a decision, "film the
  view from your window and say where you would rather be" is a task). Make the
  form ask for the specific shot, the specific line, the duration. A brief that
  cannot be described in one sentence should not publish.
- **Budget and CPM live in the form.** Set the pot, the guaranteed rate and the
  expected posts, and the form shows the projected CPM against target before
  publish. A CM should never discover their CPM after the fact.

### Cross-market learning

- **A global content wall**: the best posts from every market, filterable, with
  their view counts and the brief that produced them. A Portuguese CM should be
  able to see what worked in Sweden.
- **A benchmark strip** on the CM dashboard: your market's participation rate,
  cost per asset and posts per creator against the network median. Not a ranking,
  a reference.

### What a CM must never be able to do

- See another market's creator emails, phone numbers or payment details.
- Read DMs.
- Change platform-wide settings.
- See another market's budget.

All four are enforced by RLS, not by hiding buttons.

---

## Part 9: The global dashboard

Your brief specifies the metrics. Here is what I would add and how the numbers
reconcile.

### The top row

| Metric | Definition |
| --- | --- |
| Communities | Active, excluding archived |
| Members | Active creators across all communities, deduplicated (a creator in UKI and Worldwide counts once) |
| Live briefs | Status `active`, any community |
| Posts this period | Submissions in range |
| Prize spend | Sum of `prize_amount` converted to the reporting currency |
| Total views | Sum of `logged_views` |
| **Blended CPM** | Total spend / (total views / 1000), **in one currency** |
| **Cost per accepted asset** | Total spend / accepted posts. Put this next to CPM. |

**The deduplication detail matters.** With many-to-many membership, summing
per-community member counts double-counts anyone in Worldwide plus a market. The
per-community table shows memberships; the top-row total shows distinct people.
Label both, or the first question in the meeting will be why the numbers do not add
up.

**The currency detail matters more.** Blended CPM across GBP, EUR, SEK and RON is
meaningless unless everything converts to one reporting currency first. You already
have `convert()` and `FALLBACK_RATES` in `src/lib/programme.js` and a live
frankfurter.dev feed used by the invoice tool. Reuse them, show the rate and its
timestamp in a footnote, and never let a stale FX rate be invisible.

### The per-community table, sortable

| Community | Members | Active 30d | Live briefs | Posts | Views | Spend | CPM | vs target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Flag rows above `communities.cpm_target` using the existing `cpmBand()` bands in
`src/lib/programme.js` (on target / watch / over / awaiting / no views). **Reuse
that function rather than writing a second definition of "over target"**, which is
exactly how the tracker and the dashboard would drift apart.

### Reconciling with the existing tracker

Your brief says mirror the metrics so numbers reconcile. Three things have to be
true or they will not:

1. **One definition, one place.** `src/lib/programme.js` is already the single
   source for CPM, cost per post and cost per creator, and it has tests. Every new
   figure goes there, not into a component.
2. **`admin_challenge_metrics()` gets a community filter, not a new function.** A
   global admin calling it unfiltered must produce exactly the sum of the
   per-community calls. Assert that in a test.
3. **The historical import.** Your spreadsheet has 40+ pre-platform challenges. Until
   those are imported, the platform's totals and the tracker's totals cannot match
   and every conversation about the dashboard becomes a conversation about why. A
   CSV import into `challenges` with `community_id = uki` and a
   `source = 'imported'` flag is a day of work and it is what makes the dashboard
   credible.

### What I would add that is not in your brief

- **Participation rate** (posted / active members) per community. It is the single
  best health metric and it is currently 25% in UKI.
- **Reachability** (push or verified email / members) per community. Currently 6
  push subscriptions across 44 creators. If this is low, nothing else on the
  dashboard is actionable.
- **Time to first post**, median, per community. Currently 13 days. A new market
  that beats it is onboarding well.
- **A cohort chart**: creators who joined in month N, and what fraction posted in
  months N, N+1, N+2. This is the chart that tells you whether the programme
  retains, and no other number on the page does.

---

## Part 10: Onboarding a market in ten minutes

Five steps, one screen each.

1. **Identity.** Name, slug, market code, country codes, language, currency,
   timezone, accent colour.
2. **Lead.** Assign an existing profile as country manager, or invite by email.
   Creates the `community_members` row with `role = 'manager'`.
3. **Content.** Pick starter briefs from the template library (default: the three
   best-performing across the network), pick which global resources to include,
   auto-create the community's channels.
4. **Invite.** Generate a link `tryp.com/join/{slug}/{token}` with a QR code, an
   expiry, an optional seat cap and pre-written invite copy in the community's
   language.
5. **Go live.** Preview as a creator, then activate. Until activated, the community
   is invisible to everyone but global admins.

### The invite link, which is the part that has to be right

```sql
create table public.community_invites (
  token        text primary key default encode(gen_random_bytes(16),'hex'),
  community_id uuid not null references communities(id) on delete cascade,
  created_by   uuid not null references profiles(id),
  role         text not null default 'creator',
  max_uses     int,
  used_count   int not null default 0,
  expires_at   timestamptz,
  revoked      boolean not null default false
);
```

Redemption goes through a `SECURITY DEFINER` function, never a direct insert, so
the seat cap and expiry are enforced server-side. The token is the only thing
standing between a public URL and your community, so: expiry mandatory, revocable,
rate-limited through the existing `auth-gate` edge function, and Turnstile on the
signup form which you already have.

**Whether joining is instant or reviewed should be a per-community setting.** UK
reviews applications today (47 rows in `application_decisions`). A new market with
an eager CM may want instant-join for their first 20. Make it a column, not a
policy debate.

### The honest bit about ten minutes

Ten minutes gets a community **created**. It does not get it **alive**. The
onboarding flow should end on a checklist, not a confetti screen: publish your
first brief, invite 10 creators, post a welcome message, schedule your first call.
The empty-room problem is worse in a new market than it was in UKI, because there
is no organiser sitting in the room. Every new community should launch with a
seeded `#general`: the CM's introduction, a pinned welcome, and the global
`#worldwide` channel visible from day one so the room is never actually empty.

---

## Part 11: Holding 300+ creators

### Where you break, precisely

| Resource | Now | At 300 creators | Free tier limit | Verdict |
| --- | --- | --- | --- | --- |
| Database | 22.3 MB | ~150 MB | 500 MB | Fine |
| **Storage** | ~133 MB | **~1.5 GB** | **1 GB** | **Breaks at roughly 130 to 150 creators** |
| Auth MAU | 51 | 300 | 50,000 | Fine |
| Realtime concurrent | low | 100 to 200 peak | 200 | Tight, and it is a hard cap |
| Notifications rows | 1,115 | ~90k/year | n/a | Needs a retention policy |
| Edge function invocations | low | moderate | 500k/month | Fine |

**Storage is the binding constraint and it is closer than it looks.** 272 photos
across 44 creators is 6.2 each at roughly 0.8 MB. At 300 creators that is about
1.5 GB of gallery alone, and the free tier caps at 1 GB. At the cap, uploads fail
with a 4xx while the site keeps serving, so it degrades rather than dies, but new
creators would hit it during onboarding, which is the worst possible moment.

Two fixes, do both:

1. **Downscale on upload.** 0.8 MB for a travel photo is 3 to 4x more than needed.
   Client-side resize to 1600px on the long edge at quality 0.8 lands around 200 to
   250 KB, which turns 1.5 GB into 450 MB and buys you to 1,000 creators. This is
   a day of work in the existing `upload` edge function path.
2. **Supabase Pro at $25/month** for 100 GB, 500 realtime connections, daily
   backups and PITR. At 300 creators across seven markets you want the backups
   regardless of the storage. Budget it as a certainty, not a contingency.

### Realtime is the one people forget

Chat presence, typing indicators and live message subscriptions all hold
connections. At 300 creators across seven communities with the switcher encouraging
people to move between them, 200 concurrent is genuinely reachable at peak, and
hitting it means new connections silently fail. Pro doubles it to 500. Also:
subscribe to **one channel per active community**, not one per community the user
belongs to, or a creator in three communities holds three connections for no
reason.

### Notifications need a retention policy

1,115 rows for 44 creators in roughly a month is 25 per creator per month. At 300
creators across more communities with more events firing, expect 10,000+ per month
and 100k+ per year. Nothing breaks, but the notifications page gets slow and the
table gets pointlessly large. Add a cron: delete read notifications older than 90
days, unread older than 180.

### The human scale problem, which is the real one

At 44 creators you can DM everyone personally, and your DMs are the best-performing
channel on the platform (93 of 138 DMs are yours). At 300 you cannot, and neither
can seven CMs. What has to become systematic:

- **Automated but human-feeling day-one DM**, from the CM, with one specific ask.
- **Submission review** as a queue with keyboard shortcuts, not a page you scroll.
- **Payout runs** as a batch, not one invoice at a time.
- **Moderation**: a report button, a CM-scoped moderation queue, and a written
  policy. You have none of these today and at 44 trusted creators that is fine. At
  300 across seven markets and multiple languages, the first incident will happen
  when you are asleep and the CM needs to be able to act without you.

### The blocker to fix before any of this

**Email.** Resend is still in sandbox because `mail.tryp.com` DNS is not verified.
At 44 creators with a WhatsApp fallback, that is survivable. At 300 across seven
markets with 6 push subscriptions, email is the only channel that reaches people,
and every part of this plan (invites, brief announcements, payout notifications,
the dormant-creator nudge) assumes it works. This is a DNS record and it is
currently the highest-leverage 30 minutes available.

---

## Part 12: Rebrand

### The naming

| Thing | Now | Proposed |
| --- | --- | --- |
| The programme | Content Creator Program | **Tryp Ambassadors** |
| A market community | (n/a) | **Chapter** (UK & Ireland Chapter, Spain Chapter) |
| The global community | (n/a) | **Worldwide** |
| A member | Creator | **Ambassador** (with tier prefix) |
| A challenge | Challenge | **Brief** for the recurring ones, **Challenge** kept for the monthly competitive one |
| Points | (n/a) | **Miles** |
| A season | (n/a) | **Season** (quarterly) |
| Cross-community board | (n/a) | **Nations** |

**Why "Chapter".** It carries exactly the right meaning: locally run, part of
something bigger, and it does not imply separation the way "community" does when
you have seven of them. It is also the vocabulary that global organisations with
local groups already use, so nobody needs it explained.

**Why keep "Challenge" for one thing.** You are keeping one competitive event per
month. Giving it a different word from the routine briefs makes the distinction
self-explanatory: briefs are the job, the challenge is the event.

**"Ambassador" is the tier, not the entry state.** Everyone who joins is a
Traveller. Ambassador is earned at 5 accepted posts. This is deliberate: a title
that everyone has on day one motivates nobody, and a title that takes five posts to
earn is the exact thing that gets someone from post 1 to post 5.

### What has to change, practically

The word "Program"/"Programme" appears throughout the app, the emails, the landing
page and the compliance docs. Do the rename in one pass **after** the multi-community
migration lands, not during, because a rename touching 27,000 lines during a
security migration is how you lose a week to a merge conflict. Put the community
name in `communities.name` from day one so the copy is data-driven and the next
rename is a database update.

---

## Part 13: Tools and connectors

You asked specifically about Remotion and other free things that would make this
better. Ordered by what I would actually reach for.

### Video and motion

**Remotion.** Write videos in React, render MP4s. The genuinely high-value uses
here:

- **Season recap per creator.** Their posts, their views, their Miles, their tier
  progression, as a 20-second vertical video they will post. Remotion is explicitly
  built for the "annual recap, per-user data, same visual structure" case, and a
  creator posting their own recap turns your retention mechanic into an acquisition
  channel, exactly as streak-sharing does for Duolingo.
- **Winner and tier-up announcements**, auto-rendered per community in that
  community's accent colour and language.
- **The monthly market report as a video** for the CM to send internally.

**Licence flag, important:** Remotion is free for individuals and companies under a
certain size, but requires a paid company licence above that threshold. Tryp.com is
almost certainly above it. Check `remotion.dev/license` before this appears in a
plan as "free". Rendering also needs either a machine or Remotion Lambda on AWS,
which is a real (small) running cost.

**Motion (formerly Framer Motion).** MIT, free, and the right tool for the
switcher transition, the tier-up celebration, the Miles counter and the layout
animations on the dashboard. This is the library that makes the demo feel
expensive.

**Rive** for the tier-up and badge-unlock animations. Small files, interactive
state machines, free tier is generous. Lottie is the alternative if you already
have After Effects assets.

**canvas-confetti**, MIT, 3 KB. For the tier-up moment. Do not overuse it.

**GSAP**, now free for everyone including the previously-paid plugins. Worth
knowing about for the Nations board and anything with complex timelines.

### Interface

**cmdk** for the community switcher as a command palette. This is the specific
answer to "the switcher needs to be genuinely slick".

**TanStack Table** for the sortable per-community breakdown. Handles sorting,
grouping and column pinning so you do not hand-roll it.

**Recharts** and **react-simple-maps** are already in the app. Reuse them rather
than adding a second charting library, and reuse the all-orange palette decision
already made in Analytics.

**react-i18next** for the shell strings, per Part 7.

**date-fns-tz** for per-community timezones. Deadlines are currently local midnight
after `end_date`; with seven timezones that logic needs the community's timezone,
not the browser's, or a Romanian creator loses two hours.

### Data and operations

**View tracking is the one that does not have a free answer, and it matters at 300
creators.** Manual `logged_views` entry works at 27 submissions and does not work at
2,700. The 2026 reality:

- Instagram's Basic Display API was shut down in December 2024 and there is no
  public replacement. The Graph API only returns data for accounts that have
  authorised your app.
- TikTok's Display API likewise only returns data for users who have authenticated
  through Login Kit, at roughly 100 requests per day on basic access. The Research
  API is restricted to approved academic and nonprofit researchers.
- There is no legitimate way to fetch metrics for an arbitrary public post.

**So the viable path is creator OAuth, and it is actually good.** Ask creators to
connect TikTok (Login Kit) and Instagram (creator/business account) during
onboarding. You then legitimately pull **their own** video stats on a schedule, no
scraping, no paid aggregator, no manual entry. It costs one onboarding screen and
it removes the biggest operational bottleneck in the whole model. Rate limits mean
a daily cron rather than real-time, which is fine.

Fallback for creators who will not connect: a screenshot upload with the view count
visible, reviewed by the CM. Slower but honest, and it keeps them in the programme.

Paid aggregators (Phyllo and similar) solve it in one call if the budget exists;
price them before committing to the OAuth build.

**Supabase branching** for the migration. Already covered, but it belongs on this
list as the most valuable tool in the plan.

**Sentry free tier** alongside the existing `src/lib/monitoring.js`. At seven
markets you will not personally notice a Romanian creator's error.

**frankfurter.dev** is already wired for invoice FX. Reuse it for the dashboard's
reporting currency rather than adding a second rates source.

---

## Part 14: Build plan and risks

### Phases

**Phase 0, before any code (2 to 3 days)**
Fix the `SUPABASE_DB_URL` backup secret. Verify `mail.tryp.com` DNS. Normalise
`profiles.country` to ISO codes. Decide UKI versus separate UK and IE. Decide the
invoicing entity question with finance. Create the branch and the Supabase branch.

**Phase 1, tenancy foundations (1 week)**
Migrations 070 to 074. Communities, memberships, backfill, `community_id` columns.
The app does not change and nothing is user-visible. Ship it and let it sit for a
few days.

**Phase 2, security (1 week)**
Migrations 075 to 077. Helper functions, RLS v2 additive, shadow diff, cutover.
Scoped `admin_*` RPCs. This is the phase that must not be rushed, and the shadow
diff is the gate.

**Phase 3, the switcher and scoped UI (1 to 2 weeks)**
Route restructure to `/c/:slug/*`, `CommunityContext`, query keys, the cmdk
switcher, roles through `AuthContext` and `ProtectedRoute`, the 21 admin pages
scoped. **The channels refactor lands here** and it is the biggest single piece.

**Phase 4, the global dashboard (1 week)**
Roll-up RPCs, the sortable table, CPM banding reusing `programme.js`, the
historical CSV import.

**Demo is ready at the end of phase 4.**

**Phase 5, onboarding flow (3 to 4 days)**
Community creation wizard, invites table, redemption function, the launch
checklist.

**Phase 6, Miles and tiers (2 weeks)**
Ledger table, award triggers, tier computation, seasons, divisions, the collective
bar. Launch as season 1 with everyone starting at zero and lifetime Miles
backfilled from existing submissions so nobody starts empty.

**Phase 7, cross-community layer (1 week)**
Nations board, passport stamps, `#worldwide`, the global content wall.

### Risks, ranked

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| An RLS gap leaks data across communities | Medium | Severe | Shadow diff before cutover, additive policies, test as four personas, `with check` on every write policy |
| The channels refactor breaks live chat | Medium | High | Keep `messages.channel` text alongside `channel_id` for a full release; migrate reads before writes |
| `notify_all` fires a market announcement to everyone | High if unaudited | High, and it is the demo-killer | Audit all 15 call sites explicitly, disable triggers while testing in production as you already do |
| Storage cap hit mid-scale | Medium | Medium | Downscale on upload plus Supabase Pro before 130 creators |
| A new market launches into an empty room | High | High | Seeded channels, `#worldwide` visible from day one, launch checklist rather than a confetti screen |
| Points system gets gamed | Medium | Low | Caps on every category, kudos budget of 3 per week, CM can void an award |
| The dashboard shows a CPM nobody wants to see | Certain | Medium | Put cost per accepted asset next to it, and get ahead of the £5.08 conversation now |
| Migration cannot be rolled back | Low | Severe | 070 to 074 fully reversible, `pg_dump` before 075, Supabase branch for everything |
| Rename collides with the migration | Medium | Medium | Do the rebrand after phase 4, never during |

### The five decisions I need from you before phase 1

1. **UK and Ireland together as UKI, or separate from day one?** (I recommend
   together.)
2. **Do the 14 creators in other countries move to Worldwide, or stay in UKI?**
   (I recommend Worldwide, and that means telling them, which is a good excuse for
   a re-engagement message to people who have mostly never logged in.)
3. **Invoicing entity per market:** does Tryp.com LDA invoice everyone, or do
   markets have their own entities? This blocks payouts in new markets.
4. **Guaranteed rate or prize pot** for the next UKI brief? One month of data
   settles the whole motivation argument.
5. **Budget for Supabase Pro** ($25/month) and possibly a Remotion company licence.

---

## Appendix A: Schema sketch

```sql
-- new tables
communities          (id, slug, name, kind, market_code, country_codes,
                      language, currency, timezone, lead_id, is_active,
                      cpm_target, prize_baseline, brand, created_at)
community_members    (community_id, profile_id, role, is_primary, status, joined_at)
community_invites    (token, community_id, created_by, role, max_uses,
                      used_count, expires_at, revoked)
channels             (id, community_id, key, label, hint, icon, post_policy, position)
miles_ledger         (id, profile_id, community_id, kind, amount, ref_type,
                      ref_id, season_id, created_at, voided_by)
seasons              (id, community_id, name, starts_at, ends_at, goal_views)
divisions            (id, season_id, community_id, tier_index)
division_members     (division_id, profile_id, miles)

-- altered
profiles             + platform_role, country_code
challenges           + community_id                 (market already exists, derive it)
submissions          + community_id                 (denormalised, trigger-enforced)
results              + community_id
rewards              + community_id
messages             + channel_id, community_id     (keep `channel` text for one release)
events               + community_id
resources            + community_id
jobs                 + community_id
polls                + community_id
scheduled_announcements + community_id
email_campaigns      + community_id
invoices             + community_id
referrals            + community_id
application_decisions + community_id
creator_admin_notes  + community_id
admin_notes          + community_id
feedback             + community_id

-- deliberately unchanged (owner-scoped or intentionally global)
connections · conversations · direct_messages · dm_reactions · collab_posts
collab_interests · creator_photos · game_scores · game_events · notifications
creator_private · push_subscriptions · resource_bookmarks · channel_reads
job_applications · poll_votes · poll_options · reactions · event_rsvps
event_polls · event_poll_slots · event_poll_votes · event_suggestions
event_ratings · admin_audit_log · app_settings · auth_attempts
email_send_log · email_templates · email_outbox · challenge_reminders_sent
```

## Appendix B: RLS policy drafts

```sql
-- ---------- helpers (SECURITY DEFINER, STABLE) ----------
-- my_communities(), my_managed_communities(), is_global_admin()
-- as defined in Part 4.

-- ---------- a scoped content table ----------
alter table public.challenges enable row level security;

create policy "challenges: members read" on public.challenges
  for select to authenticated
  using (community_id in (select public.my_communities()));

create policy "challenges: staff write" on public.challenges
  for all to authenticated
  using      (community_id in (select public.my_managed_communities()))
  with check (community_id in (select public.my_managed_communities()));

-- ---------- a child table, scoped via denormalised column ----------
create policy "submissions: members read" on public.submissions
  for select to authenticated
  using (community_id in (select public.my_communities()));

create policy "submissions: own insert" on public.submissions
  for insert to authenticated
  with check (
    creator_id = auth.uid()
    and community_id in (select public.my_communities())
  );

create policy "submissions: staff manage" on public.submissions
  for all to authenticated
  using      (community_id in (select public.my_managed_communities()))
  with check (community_id in (select public.my_managed_communities()));

-- ---------- profiles: visible across the network, private fields are not ----------
-- Public profile fields stay readable network-wide so DMs, connections and the
-- world map keep working. Email and phone live in creator_private and behind
-- admin RPCs, and those RPCs gain a community check.
create policy "profiles: network read" on public.profiles
  for select to authenticated
  using (public.is_member());          -- unchanged, deliberately

-- ---------- membership table protects itself ----------
create policy "members: read own communities" on public.community_members
  for select to authenticated
  using (
    profile_id = auth.uid()
    or community_id in (select public.my_communities())
  );

create policy "members: managers manage" on public.community_members
  for all to authenticated
  using      (community_id in (select public.my_managed_communities()))
  with check (community_id in (select public.my_managed_communities()));

-- ---------- communities ----------
create policy "communities: read own" on public.communities
  for select to authenticated
  using (id in (select public.my_communities()));

create policy "communities: global admin writes" on public.communities
  for all to authenticated
  using (public.is_global_admin()) with check (public.is_global_admin());

-- ---------- the consistency trigger that makes denormalisation safe ----------
create or replace function public.sync_submission_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.community_id := (select community_id from challenges where id = new.challenge_id);
  if new.community_id is null then
    raise exception 'challenge % has no community', new.challenge_id;
  end if;
  return new;
end $$;

create trigger trg_sync_submission_community
  before insert or update of challenge_id on public.submissions
  for each row execute function public.sync_submission_community();
```

**The four test personas.** Every policy change is verified by querying every
scoped table as: a UKI creator, a UKI manager, a Worldwide creator, and a global
admin. A UKI creator's row counts must be identical to today's. A Worldwide
creator must see zero UKI-scoped rows. A UKI manager must see zero Worldwide-scoped
rows. A global admin must see the sum.

## Appendix C: Metric definitions

Single source: `src/lib/programme.js`. Every figure below is computed there and
consumed by both the tracker view and the global dashboard.

| Metric | Formula | Notes |
| --- | --- | --- |
| Spend | `convert(prize_amount, prize_currency, reporting_currency)` | Never sum raw amounts across currencies |
| CPM | `spend / (views / 1000)` | Null, not zero, when views are zero |
| Cost per accepted asset | `spend / accepted_posts` | The headline number |
| Cost per participating creator | `spend / distinct_creators` | |
| Participation rate | `distinct_creators / active_members` | Active = opened or posted in 30 days |
| Posts per creator | `posts / distinct_creators` | |
| Views per post | `views / posts` | |
| Reachability | `(push_subscribed or email_verified) / members` | Gate on every other metric |
| Time to first post | median days from `accepted_at` to first submission | |
| Blended CPM | `sum(spend) / (sum(views)/1000)` | All converted first |
| Members (top row) | `count(distinct profile_id)` | Deduplicated across memberships |
| Members (per community) | `count(*)` in `community_members` | Memberships, not people, label it |
| CPM band | `cpmBand(cpm, {target, ended, hasViews})` | Existing function, do not redefine |

---

## Sources

Research drawn on for Parts 6, 11 and 13:

- [Challenges, Tiers, and Points: Inside Target's New Gamified Creator Program, The PMA](https://thepma.org/challenges-tiers-and-points-inside-targets-new-gamified-creator-program/)
- [Target Launches Club Target and LTK Creator Programs, Target Corporate](https://corporate.target.com/news-features/article/2026/05/club-target)
- [Why Target Is Shutting Down Its Creator Affiliate Program for a Gamified Creator Community, Lindsey Gamble](https://www.lindseygamble.com/blog/target-shuts-down-affiliate-program-for-club-target)
- [Gamification Benchmarks 2026, Xtremepush](https://www.xtremepush.com/blog/gamification-benchmarks-2026-whats-a-good-retention-rate-engagement-score-and-tier-progression)
- [Ambassador Tiers: How to Create VIP Levels That Drive Performance, NextBee](https://blog.nextbee.com/2025/12/22/ambassador-tiers-how-to-create-vip-levels-that-drive-performance-2025-high-performance-blueprint/)
- [10 Ways to Gamify Your Ambassador Program, Roster](https://www.getroster.com/blog/10-ways-to-gamify-your-ambassador-program-to-drive-monthly-engagement/)
- [The Psychology Behind Duolingo's Streak Feature, Just Another PM](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)
- [Duolingo gamification explained, StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [Duolingo's Habit-Forming Reminders: A UX Breakdown, Digia](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/)
- [Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps, Makerkit](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Supabase RLS Deep Dive, Multi-tenant Access Control, DEV](https://dev.to/kanta13jp1/supabase-rls-deep-dive-multi-tenant-access-control-11ig)
- [Supabase JWT Claims for RLS and Access Control, PromptXL](https://promptxl.com/supabase-jwt-claims/)
- [UGC Creator Pricing in 2026, PPC.io](https://ppc.io/blog/ugc-pricing)
- [CPM influencer pricing benchmarks for 2026, ClipReach](https://clipreach.io/blog/cpm-influencer-pricing-benchmarks)
- [Performance Creative Pricing Guide 2026, inBeat](https://inbeat.agency/blog/performance-creative-pricing-guide)
- [Instagram API in 2026: every option, free or paid, explained, Zernio](https://zernio.com/blog/instagram-api)
- [Instagram Basic Display API (Deprecated): What Replaced It in 2026, KeyAPI](https://www.keyapi.ai/blog/instagram-basic-display-api/)
- [TikTok API Data in 2026: What You Can Pull, KeyAPI](https://www.keyapi.ai/blog/tiktok-api-data-2026/)
- [Remotion: The React Framework for Programmatic Video](https://www.toolworthy.ai/tool/remotion)
- [Streamline Video Production with React and Remotion, Qubika](https://qubika.com/blog/dynamic-video-creation-react-remotion/)
- [Motion (prev Framer Motion)](https://motion.dev/)
- [14 Best Community Platforms Compared 2026, Circle](https://circle.so/blog/best-community-platforms)

Internal, measured 5 August 2026 against Supabase project `heuhqqoxyggawuckxocp`,
plus `docs/ENGAGEMENT_DIAGNOSIS_AND_REBRAND.md` and `docs/FIFTY_IDEAS_2026-08.md`.
