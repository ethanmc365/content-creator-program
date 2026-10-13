-- 399: the last three functions with a role-mutable search_path (security advisor
-- function_search_path_mutable). Behaviour is unchanged: each one already ran
-- with `public` first, and vip_room_key_allowed (398) uses only built-ins.

alter function public.trg_app_updates_touch() set search_path = public;
alter function public.trg_challenge_join_bonus_from() set search_path = public;
alter function public.vip_room_key_allowed(text, boolean, text, boolean) set search_path = '';
