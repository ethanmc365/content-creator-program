-- THE WALL OF FAME HAS TO BE ON THE ALLOWLIST, or it is not public at all.
--
-- `no_new_function_is_public` is a DDL event trigger that calls
-- `lock_down_definer_functions()` after every schema change, and that revokes
-- anon/authenticated EXECUTE from every SECURITY DEFINER function not named in
-- `public_rpc_allowlist`. So the grant in 278 was stripped the moment the next
-- statement ran, and the landing page got "permission denied for function
-- public_wall_of_fame".
--
-- This is the control working exactly as intended: a function that reads other
-- people's rows with the definer's rights does not become reachable by a
-- stranger because somebody wrote a GRANT. It becomes reachable when somebody
-- writes down WHY, here, where the next security pass reads it.
--
-- WHY THIS ONE IS SAFE TO EXPOSE: a name, a photo, a place, a challenge title
-- and a market - every one of which is already on the public page for the same
-- creators - for FINAL results only, and only for creators who have not
-- switched themselves off the public pages. No ids, no contact details, no
-- coordinates, no scores.

insert into public.public_rpc_allowlist (proname, reason)
values (
  'public_wall_of_fame',
  'Landing page wall of fame. Name, photo, place, challenge and market for FINAL results only, and only for creators with show_on_map on. No ids, no contact details, no coordinates.'
)
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
