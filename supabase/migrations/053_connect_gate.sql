-- Migration 053: "connect with 3 creators" gate for brand-new members.
-- After a creator is approved they're asked to connect with a few others before
-- the full community unlocks. `connect_gate_done` tracks completion.
--
-- New signups default to false (they see the gate once approved). Every EXISTING
-- profile is grandfathered to true so no current member is ever locked out.
alter table public.profiles
  add column if not exists connect_gate_done boolean not null default false;

update public.profiles set connect_gate_done = true;
