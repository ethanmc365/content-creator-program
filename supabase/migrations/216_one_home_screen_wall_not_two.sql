-- 216 - ONE HOME-SCREEN WALL, NOT TWO
--
-- Ethan, 10 Sep 2026: "you said 'ship the install gate, install_gate_enabled is
-- still off - you built the wall and nobody's behind it'. I'm not sure what you
-- mean, but if it's the pop-up they can't get out of that makes them add it to
-- the home screen, ensure it is shipped: every creator should be seeing that.
-- If not, explain what you mean."
--
-- THE ANSWER IS THAT THEY ALREADY ARE, AND MY OWN NOTE WAS THE THING THAT WAS
-- WRONG. There were two implementations of one idea:
--
--   * `AddToHomePrompt`, mounted in AppLayout, needing no flag at all. On a
--     phone that is not running the installed app it is a WALL - no close
--     button, no scrim press, no Escape, no per-session memory, admins
--     included - and it has been live since 9 September. Verified again today
--     on an Android user agent at 375px: the dialog is up, Escape and a scrim
--     press leave it up, and the only controls are the two sets of steps and
--     "I have already added it", which re-checks `display-mode: standalone`.
--   * `InstallGate`, behind THIS flag, which has never once run.
--
-- So the flag gated a dead copy, and a note about the dead copy read as a note
-- about the product. Deleting both is the fix: a feature with two
-- implementations, one of them switched off, is a feature nobody can answer a
-- question about.
--
-- The key also leaves the small allow-list that lets a NON-ADMIN read a flag
-- (migration 192). That list is deliberately short and every entry on it has to
-- earn its place; a key nothing reads does not.
delete from public.app_settings where key = 'install_gate_enabled';

drop policy if exists "app_settings: read public flags" on public.app_settings;
create policy "app_settings: read public flags"
  on public.app_settings for select to authenticated
  using (key = any (array['tour_enabled']));
