-- THE WALKTHROUGH HAS NEVER AUTO-STARTED FOR ANYBODY, AND THIS IS WHY.
--
-- Ethan (4 Sep 2026): "whenever you first sign up and log in, it doesn't show
-- the interactive tutorial, which should be the first thing that shows up
-- whenever you enter. On desktop it should always show up as soon as you open
-- the site for the first time, until you've actually completed it. But it's not
-- showing up at all."
--
-- `app_settings` had exactly ONE policy:
--
--     "app_settings: admin all"  FOR ALL  USING (is_admin())
--
-- and RLS denies anything no policy allows. So `readFlag('tour_enabled')`
-- returned a row for an admin and NOTHING for every creator on the platform.
-- lib/appFlags fails closed by design - a read that errors or returns no row
-- means the flag is off - which is the right rule and, here, produced exactly
-- the wrong answer: the switch was flipped to true on 4 Sep and remained
-- invisible to every single account it governs. `shouldAutoStart` then
-- additionally excludes admins, who are the only people who COULD read it.
-- The result is a feature that cannot start for anyone, by construction, with
-- no error anywhere: the flag simply reads false forever.
--
-- The same is true of `install_gate_enabled`, which is off today but would have
-- failed the same way the moment it was turned on.
--
-- WHAT THIS DOES NOT DO. It does not open `app_settings` up. The table also
-- holds `invoice_bill_to` (the company's billing address), `fx_rates` and the
-- view-sync run state, and none of those is a creator's business. The read is
-- limited to a fixed allow-list of PUBLIC FLAG KEYS, so adding a setting to
-- this table stays private by default and becomes readable only by being named
-- here on purpose. Writes are untouched: still admin-only, still one policy.

create policy "app_settings: read public flags"
  on public.app_settings
  for select
  to authenticated
  using (key in ('tour_enabled', 'install_gate_enabled'));

comment on table public.app_settings is
  'Platform switches and stored settings. Admins read and write everything; an '
  'authenticated creator may read only the keys named in the "read public '
  'flags" policy, which are the feature switches the client has to consult '
  'before it can decide whether to show something. Anything added here is '
  'private until it is added to that list.';
