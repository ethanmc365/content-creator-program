-- 406: "update your own row" policies are not column-aware, and five of them let a person change more than the
-- one field the app writes. Proven with rolled-back rehearsals as qa-creator (14 Oct 2026):
--   * direct_messages "recipient marks read": the recipient could rewrite the text (or sender) of messages sent TO
--     them. 5 of qa-creator's received messages were rewritten in the rehearsal.
--   * conversation_members "mark read": a member could move their own row to ANOTHER group's id and read that
--     group's whole history (2 visible messages became 6) and post in it.
--   * conversation_invites "answer": the same, through an invite (retarget it, then join with has_pending_invite).
--   * certificate_awards "mark seen": a creator could edit the facts and serial of their own certificate, which
--     verify_certificate shows publicly.
--   * connections "respond": the person asked could rewrite who asked.
--
-- One guard: when the API roles update one of these tables, only the listed columns may change. Definer functions
-- (edit_direct_message, leave_conversation...) run as the owner and are not affected. The first trigger argument
-- says whether a Tryp admin is exempt (only where an admin policy exists for edits).
create or replace function public.api_update_only()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_admin_ok boolean := tg_argv[0] = 'admin_ok';
  v_allowed text[] := tg_argv[1:];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if v_admin_ok and public.is_admin() then return new; end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Only % can be changed here.', array_to_string(v_allowed, ', ') using errcode = '42501';
  end if;
  return new;
end $function$;

drop trigger if exists trg_zz_api_update_only on public.direct_messages;
create trigger trg_zz_api_update_only before update on public.direct_messages
  for each row execute function public.api_update_only('strict', 'read');

drop trigger if exists trg_zz_api_update_only on public.conversation_members;
create trigger trg_zz_api_update_only before update on public.conversation_members
  for each row execute function public.api_update_only('strict', 'last_read_at');

drop trigger if exists trg_zz_api_update_only on public.conversation_invites;
create trigger trg_zz_api_update_only before update on public.conversation_invites
  for each row execute function public.api_update_only('strict', 'status');

drop trigger if exists trg_zz_api_update_only on public.certificate_awards;
create trigger trg_zz_api_update_only before update on public.certificate_awards
  for each row execute function public.api_update_only('admin_ok', 'seen_at');

drop trigger if exists trg_zz_api_update_only on public.connections;
create trigger trg_zz_api_update_only before update on public.connections
  for each row execute function public.api_update_only('strict', 'status', 'accepted_at');
