-- 255: VOUCHER CODES ON REWARDS, AND A "USED" TICK THE CREATOR OWNS (24 Sep 2026)
--
-- Ethan: "whenever I'm paying a voucher, all I do is mark as distributed. What I
-- want is the option to enter the voucher code, which would then appear on a
-- nice graphic like a ticket... on the creator's reward page, and whenever
-- they've used it they can mark it as used with a button, so they can keep track
-- themselves. Much simpler than distributing it and then having to send a DM
-- with the code."
--
--   voucher_code  written by an admin (the existing "rewards: admin manage"
--                 policy covers it). Readable by the creator through
--                 "rewards: read own", and by nobody else.
--   used_at       the creator's own bookkeeping. Creators have NO update
--                 policy on rewards and must not get one - a row policy cannot
--                 limit WHICH columns change, and this table is money. So the
--                 tick goes through set_reward_used(), which touches used_at on
--                 the caller's own distributed voucher and nothing else.

alter table public.rewards
  add column if not exists voucher_code text,
  add column if not exists used_at timestamptz;

comment on column public.rewards.voucher_code is
  'The voucher code the team issued for this reward, shown to the creator on /rewards.';
comment on column public.rewards.used_at is
  'When the creator ticked the voucher as used. Their own record; set via set_reward_used().';

create or replace function public.set_reward_used(p_reward uuid, p_used boolean)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_at timestamptz;
begin
  update public.rewards
     set used_at = case when p_used then coalesce(used_at, now()) else null end
   where id = p_reward
     and creator_id = auth.uid()
     and reward_type = 'voucher'
     and status = 'distributed'
  returning used_at into v_at;
  if not found then
    raise exception 'That voucher is not yours to mark, or it has not been issued yet.';
  end if;
  return v_at;
end $$;

revoke all on function public.set_reward_used(uuid, boolean) from public, anon;
grant execute on function public.set_reward_used(uuid, boolean) to authenticated;

-- THE NOTIFICATION SAYS WHERE THE CODE IS. It said "marked as distributed",
-- which for a voucher meant "now wait for a DM". It also fires when a code is
-- ADDED to a voucher that was already distributed (the seven historical ones),
-- because that is the moment there is something new for the creator to see.
create or replace function public.on_reward_distributed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_became boolean := new.status = 'distributed'
    and (tg_op = 'INSERT' or old.status is distinct from new.status);
  v_code_added boolean := tg_op = 'UPDATE' and new.status = 'distributed'
    and old.status = 'distributed'
    and nullif(btrim(coalesce(new.voucher_code, '')), '') is not null
    and new.voucher_code is distinct from old.voucher_code;
begin
  if v_became then
    if new.reward_type = 'voucher' and nullif(btrim(coalesce(new.voucher_code, '')), '') is not null then
      perform public.notify_user(
        new.creator_id, 'reward', 'Your voucher is here! 🎉',
        'Your Tryp.com voucher code is waiting on your Rewards page.',
        '/rewards'
      );
    else
      perform public.notify_user(
        new.creator_id, 'reward', 'Reward on its way! 🎉',
        'Your ' || new.reward_type || ' reward has been marked as distributed.',
        '/rewards'
      );
    end if;
  elsif v_code_added then
    perform public.notify_user(
      new.creator_id, 'reward', 'Your voucher code is ready',
      'Your Tryp.com voucher code is waiting on your Rewards page.',
      '/rewards'
    );
  end if;
  return new;
end;
$function$;
