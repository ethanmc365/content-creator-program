-- SOMETHING TO SHOW FOR IT: THE GRAPHICS LIBRARY AND THE CERTIFICATES.
--
-- Two features that look unrelated and are the same idea. Ethan:
--
--   "I created some graphics that say 'I'm officially a Tryp.com Content
--    Creator'... creators will post these on their instagram stories and
--    LinkedIn, to share with their network that they are a travel creator for
--    Tryp.com. This also doubles as recruitment."
--
--   "Certificates for winning challenges and also for reaching milestones could
--    be super beneficial."
--
-- Both are the programme handing a creator something they can POST. That is the
-- entire economics of it: a £10 voucher is a line in a rewards table, which is a
-- receipt and nobody posts a receipt. The same fact with their name on it, in a
-- picture, is a thing they put on a story - and the programme pays nothing for
-- the reach. `components/Certificate.jsx` has said so since August; this is that
-- idea given a builder and a rule for when it fires.
--
-- =========================================================================
-- WHAT MAKES A CERTIFICATE WORTH HAVING, because a generic one is worth
-- nothing and generating worthless ones costs trust. Four things, and the
-- schema below exists to support each:
--
--   SPECIFIC   "Winner, September Hidden Gems, UK & Ireland" beats "Certificate
--              of Achievement". Hence `facts` - the real challenge, the real
--              rank, the real view count.
--   FROZEN     A certificate is a RECORD, not a live query. If the challenge is
--              later renamed, or the creator changes their display name, or the
--              leaderboard is rebuilt, the certificate they posted in September
--              must still say what it said in September. `facts` is written
--              once and never recomputed. This is the same reason an invoice
--              snapshots the bank details rather than joining to them.
--   SCARCE     If everybody gets the same one for turning up, winning one means
--              nothing. `tier` exists so the ladder is visible: an achievement
--              is not a participation is not a milestone.
--   VERIFIABLE A credential nobody can check is a JPEG. `serial` is a short
--              human-readable id printed on the certificate, so a brand can be
--              told what to ask for. The public check page can be added later
--              without touching this table, which is why the serial is stored
--              rather than derived.
-- =========================================================================

-- ------------------------------------------------------------------ kit ---
-- The graphics an admin uploads for creators to repost. Deliberately NOT the
-- `resources` table: a resource is something you read (a guide, a template
-- document) and lives behind a description and a download count. These are
-- images whose whole content is visible in the thumbnail, they are ordered for
-- display, and they belong on the portfolio page next to the creator's own
-- material rather than in a library.
create table if not exists public.creator_kit_assets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 1 and 80),
  blurb      text,
  -- What it is FOR, which decides where it is shown and at what shape.
  kind       text not null default 'story'
             check (kind in ('story', 'post', 'linkedin', 'banner', 'other')),
  path       text not null,           -- storage path in the `creator-kit` bucket
  width      integer,
  height     integer,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists creator_kit_assets_order
  on public.creator_kit_assets (is_active, sort_order, created_at);

alter table public.creator_kit_assets enable row level security;

-- EVERY ACTIVE CREATOR SEES THEM. That is the point - they are for reposting.
drop policy if exists "creators read active kit" on public.creator_kit_assets;
create policy "creators read active kit" on public.creator_kit_assets
  for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy if exists "admins manage kit" on public.creator_kit_assets;
create policy "admins manage kit" on public.creator_kit_assets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------- the designs ---
-- What a certificate LOOKS LIKE and WHEN IT IS GIVEN, in one row.
--
-- THOSE TWO THINGS ARE IN ONE TABLE ON PURPOSE, and it is worth saying why
-- because splitting them is the obvious "cleaner" move. A design and its
-- trigger are not independently reusable: "the certificate for winning a market
-- challenge" is one idea, and a design with no rule is a picture nobody
-- receives while a rule with no design is a rule that cannot fire. Two tables
-- would mean a join, a foreign key, and a state where one exists without the
-- other - for a pairing that is always one to one.
create table if not exists public.certificate_designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),

  -- The ladder. An admin can make as many designs as they like; `tier` is what
  -- says which of them is the rare one, and it drives the default accent and
  -- the sort order on a creator's wall.
  tier        text not null default 'achievement'
              check (tier in ('achievement', 'participation', 'milestone', 'honour')),

  -- The words. `{name}`, `{challenge}`, `{market}`, `{place}`, `{views}`,
  -- `{date}`, `{prize}` are filled from `facts` at RENDER time, from the row
  -- frozen at AWARD time. A placeholder with no fact renders as nothing rather
  -- than as the placeholder, so a design written for challenges does not print
  -- "{challenge}" on a milestone certificate.
  title       text not null default 'Certificate of Achievement',
  subtitle    text not null default 'Tryp.com Creator Community',
  body        text not null default 'awarded to {name} for {challenge}',
  footnote    text,

  -- The look. Constrained rather than free: an admin picking any hex would be
  -- able to make a certificate that is not a Tryp.com certificate, and the
  -- brand rule on this platform is orange accents on white. `accent` is
  -- validated as a hex here and the picker only offers the brand-safe set.
  accent      text not null default '#d94407' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  emblem      text not null default 'trophy',
  pattern     text not null default 'wash' check (pattern in ('wash', 'plain', 'rays')),
  signature   text,
  signature_role text,

  -- WHEN IT FIRES.
  --   manual            an admin awards it by hand
  --   challenge_rank    finishing in `ranks` in a challenge
  --   challenge_entry   entering a challenge at all
  --   milestone         reaching `milestone_id`
  award_on    text not null default 'manual'
              check (award_on in ('manual', 'challenge_rank', 'challenge_entry', 'milestone')),
  -- Which places win it. `{1,2,3}` is a podium; `{1}` is winner only.
  ranks       integer[] not null default '{}',
  -- WHICH MARKETS. Empty means EVERY market, which is the common case and the
  -- one an admin should not have to spell out. Ethan: "we should be able to
  -- customise for each market or choose for them all."
  community_ids uuid[] not null default '{}',
  milestone_id uuid references public.milestones(id) on delete cascade,

  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.certificate_designs enable row level security;

-- A CREATOR CAN READ THE DESIGN, because the certificate they were awarded is
-- rendered from it in their browser. They cannot read an INACTIVE one - that is
-- a draft an admin is still working on.
drop policy if exists "creators read live designs" on public.certificate_designs;
create policy "creators read live designs" on public.certificate_designs
  for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy if exists "admins manage designs" on public.certificate_designs;
create policy "admins manage designs" on public.certificate_designs
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ----------------------------------------------------------- the awards ---
create table if not exists public.certificate_awards (
  id          uuid primary key default gen_random_uuid(),
  design_id   uuid not null references public.certificate_designs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete set null,
  milestone_id uuid references public.milestones(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,

  -- FROZEN AT AWARD TIME. See the note at the top: this is what makes it a
  -- record. Every `{placeholder}` in the design is filled from here, so a
  -- challenge renamed next year does not rewrite a certificate posted this one.
  facts       jsonb not null default '{}'::jsonb,

  -- The credential id printed on the face of it. Short enough to read out.
  serial      text not null unique,

  awarded_at  timestamptz not null default now(),
  awarded_by  uuid references public.profiles(id) on delete set null,
  -- Whether the creator has seen it. Drives the "new" dot on their rewards page.
  seen_at     timestamptz
);

-- ONE CERTIFICATE PER PERSON PER THING. The auto-award runs again every time
-- winners are re-published, and a creator finding four copies of the same
-- certificate would be worse than finding none. `coalesce` to a fixed uuid
-- because a null never equals a null in a unique index, so two manual awards of
-- the same design to the same person would both be allowed without it.
create unique index if not exists certificate_awards_once
  on public.certificate_awards (
    design_id, profile_id,
    coalesce(challenge_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists certificate_awards_for_creator
  on public.certificate_awards (profile_id, awarded_at desc);

alter table public.certificate_awards enable row level security;

-- YOUR OWN, ALWAYS. An admin sees everybody's - the same rule that lets an
-- admin open a creator's rewards page.
drop policy if exists "creators read their certificates" on public.certificate_awards;
create policy "creators read their certificates" on public.certificate_awards
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

-- MARKING ONE AS SEEN IS THE ONLY THING A CREATOR MAY WRITE, and the `with
-- check` keeps them from rewriting the facts on their own certificate. Without
-- it, "update your own row" would let somebody edit the rank printed on it.
drop policy if exists "creators mark their certificates seen" on public.certificate_awards;
create policy "creators mark their certificates seen" on public.certificate_awards
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "admins manage awards" on public.certificate_awards;
create policy "admins manage awards" on public.certificate_awards
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.creator_kit_assets, public.certificate_designs, public.certificate_awards from anon, public;
grant select, insert, update, delete on public.creator_kit_assets  to authenticated;
grant select, insert, update, delete on public.certificate_designs to authenticated;
grant select, insert, update, delete on public.certificate_awards  to authenticated;

comment on table public.certificate_designs is
  'What a certificate looks like and when it is awarded. One row is one idea; splitting look from rule would allow a design nobody receives.';
comment on table public.certificate_awards is
  'Awarded certificates. `facts` is frozen at award time so a renamed challenge never rewrites a certificate somebody has already posted.';
