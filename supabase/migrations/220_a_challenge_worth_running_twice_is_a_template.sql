-- A CHALLENGE WORTH RUNNING TWICE IS A TEMPLATE.
--
-- Ethan: "whenever an Admin creates a challenge, enters details for example the
-- points system, brief, rules, prizes etc. At the bottom I want a function to
-- save as template. This means in the future, rather than admins starting from
-- scratch every time, they can save the challenge as a template."
--
-- WHAT A TEMPLATE IS, AND WHAT IT DELIBERATELY IS NOT.
--
-- It is the SHAPE of a brief: the wording, the rules, the platforms, the prize
-- ladder, the points system, how it is judged. It is not a challenge - it has no
-- dates, no status, no entries and no leaderboard, and it never becomes one.
-- Using a template fills in a NEW form, which the admin then edits and saves
-- like any other. That separation is the whole reason this is a table of its own
-- rather than a flag on `challenges`: a draft challenge is a thing that can be
-- published by accident, can appear in a count, can be notified about, and has
-- to be excluded from every query that means "real challenges". A template can
-- do none of those things because it is not one.
--
-- THE PAYLOAD IS JSONB AND THAT IS ON PURPOSE. The challenge form has grown
-- three times this year - groups, point rules, the reporting fields that are now
-- derived - and a template table with a column per field would need a migration
-- every time it grows again, plus a decision about what an old template means
-- when a new column appears. A JSON blob of the form state has exactly one
-- failure mode instead: a key the form no longer reads is ignored, and a key it
-- now reads and the template lacks falls back to the form's own default. Both of
-- those are the behaviour you want, and neither needs a migration.
--
-- WHAT IS NOT IN THE PAYLOAD, enforced by the client rather than here because
-- it is a question about meaning and not about storage: dates, status, and the
-- id of anything. See `templateFromForm` in src/lib/challengeTemplates.js.

create table if not exists public.challenge_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  -- WHO MADE IT, AND WHY IT SURVIVES THEM LEAVING. `on delete set null` rather
  -- than cascade: a template is a shared asset that other admins are using, and
  -- deleting a person should not silently delete the briefs the rest of the team
  -- builds from. A template with no author can still be used by anyone and can
  -- still be deleted by a global admin, which is the correct end state.
  created_by  uuid references public.profiles(id) on delete set null,
  -- The market it was written in. Display only - it is what lets the card say
  -- "made for Spain" so an admin can tell two similar templates apart. It does
  -- NOT scope who can see it: Ethan asked for one shared library.
  community_id uuid references public.communities(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists challenge_templates_recent
  on public.challenge_templates (created_at desc);

alter table public.challenge_templates enable row level security;

-- EVERY ADMIN SEES EVERY TEMPLATE. That is the feature: "This will save the
-- template that any admin can see and use in the future." A market manager
-- writing their first brief should be able to start from the best one the
-- programme has ever run, whoever wrote it and whichever market it was for.
drop policy if exists "admins read templates" on public.challenge_templates;
create policy "admins read templates" on public.challenge_templates
  for select to authenticated
  using ((select public.is_admin()));

-- You may only create a template in your own name. Without the `created_by`
-- test an admin could file a template under somebody else's face, and the card
-- shows a face.
drop policy if exists "admins write their own templates" on public.challenge_templates;
create policy "admins write their own templates" on public.challenge_templates
  for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

drop policy if exists "admins edit their own templates" on public.challenge_templates;
create policy "admins edit their own templates" on public.challenge_templates
  for update to authenticated
  using (created_by = (select auth.uid()) or (select public.is_global_admin()))
  with check (created_by = (select auth.uid()) or (select public.is_global_admin()));

-- YOUR OWN, OR ANY OF THEM IF YOU RUN THE PLATFORM. Ethan: "Only admins should
-- be able to delete their own templates, but I should obviously be able to
-- delete any of them." `is_global_admin()` is the platform's existing name for
-- that tier (owner + global_admin) rather than a new one invented here.
--
-- An ORPHANED template - author deleted, `created_by` now null - is deletable
-- only by a global admin, which is the right answer: nobody else can claim it.
drop policy if exists "admins delete their own templates" on public.challenge_templates;
create policy "admins delete their own templates" on public.challenge_templates
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_global_admin()));

-- Never anon. See the security notes: a table's grants are not swept by the
-- `no_new_function_is_public` event trigger, which only covers functions.
revoke all on public.challenge_templates from anon, public;
grant select, insert, update, delete on public.challenge_templates to authenticated;

comment on table public.challenge_templates is
  'Reusable challenge briefs. Shared across every admin; the payload is challenge form state with no dates, status or ids in it.';
