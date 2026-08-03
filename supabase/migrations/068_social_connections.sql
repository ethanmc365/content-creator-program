-- 068: connected social accounts + automatic view syncing.
--
-- Creators link their TikTok account once (OAuth via Login Kit). A scheduled job
-- then reads the view count of each video they submitted straight from the
-- platform, so the challenge leaderboards keep themselves up to date instead of
-- an admin opening every entry and typing the number in by hand.
--
-- The table split matters: OAuth tokens are money. `public.social_connections`
-- holds only the harmless status a creator needs to see ("TikTok connected as
-- @name, last synced 10 minutes ago") and is RLS-gated to its owner.  The tokens
-- live in `private.social_tokens`, which has RLS on and NO policies at all, the
-- same deny-all-to-API-roles pattern as `private.config`: only the service role
-- (edge functions) can ever read them, never a browser.

-- ---------------------------------------------------------------- connections
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('tiktok', 'instagram')),
  provider_user_id text not null,          -- TikTok open_id
  username text,                           -- display handle, for the UI
  display_name text,
  avatar_url text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text,
  videos_matched int not null default 0,   -- submissions this account resolved
  unique (creator_id, provider)
);

comment on table public.social_connections is
  'A creator''s linked social account. Status only: OAuth tokens live in private.social_tokens.';

alter table public.social_connections enable row level security;

-- A creator sees and disconnects their own account; admins can see who has
-- connected (to know whose numbers are automatic) but cannot connect for them.
drop policy if exists "social_connections: read own" on public.social_connections;
create policy "social_connections: read own" on public.social_connections
  for select using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "social_connections: delete own" on public.social_connections;
create policy "social_connections: delete own" on public.social_connections
  for delete using (creator_id = auth.uid() or public.is_admin());

-- Inserts and updates are service-role only (the OAuth callback), deliberately
-- no policy: a browser must never be able to claim an account it didn't prove.

create index if not exists social_connections_creator_idx
  on public.social_connections (creator_id);

-- --------------------------------------------------------------------- tokens
create table if not exists private.social_tokens (
  connection_id uuid primary key references public.social_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS on with zero policies = deny all to anon/authenticated. Service role only.
alter table private.social_tokens enable row level security;
revoke all on private.social_tokens from anon, authenticated;

-- ---------------------------------------------------------------- oauth state
-- Single-use CSRF state for the OAuth round trip, so a callback can only ever
-- be attributed to the creator who actually started the flow.
create table if not exists private.oauth_states (
  state text primary key,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  redirect_to text,
  created_at timestamptz not null default now()
);

alter table private.oauth_states enable row level security;
revoke all on private.oauth_states from anon, authenticated;

-- ---------------------------------------------------- submissions: view source
-- platform_video_id: the numeric TikTok id for this entry. Most creators paste a
-- vm.tiktok.com short link, which carries no id, so the sync job resolves the
-- redirect ONCE and caches the id here.
--
-- views_source: 'manual' (an admin typed it) or 'tiktok' (synced). The sync only
-- overwrites rows it owns, so an admin correction always sticks: editing the
-- field in /admin/results sets the source back to 'manual' and the job leaves
-- that row alone from then on.
alter table public.submissions add column if not exists platform_video_id text;
alter table public.submissions add column if not exists views_source text not null default 'manual'
  check (views_source in ('manual', 'tiktok', 'instagram'));
alter table public.submissions add column if not exists views_synced_at timestamptz;

create index if not exists submissions_platform_video_idx
  on public.submissions (platform_video_id) where platform_video_id is not null;

-- ------------------------------------------------------------------- rpc: mine
-- The Settings page reads its own connection through this rather than selecting
-- the table directly, so the shape stays stable if the table grows secrets.
create or replace function public.my_social_connections()
returns table (
  provider text,
  username text,
  display_name text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  videos_matched int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.provider, c.username, c.display_name, c.connected_at,
         c.last_synced_at, c.last_sync_error, c.videos_matched
  from public.social_connections c
  where c.creator_id = auth.uid()
  order by c.provider;
$$;

revoke all on function public.my_social_connections() from public, anon;
grant execute on function public.my_social_connections() to authenticated;

-- ------------------------------------------------------------------ hourly job
-- Same pg_net + webhook-secret shape as dispatch_notification, so social-sync
-- can tell a scheduled run (sync everyone) from a browser (sync yourself).
create or replace function public.run_social_sync()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  connected int;
begin
  -- Nothing connected yet: don't wake the function at all.
  select count(*) into connected from public.social_connections;
  if connected = 0 then return; end if;

  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/social-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.run_social_sync() from public, anon, authenticated;

-- :17 past the hour, off the crowded top-of-hour slot.
select cron.schedule('social-view-sync', '17 * * * *', 'select public.run_social_sync()');

-- ------------------------------------------------------------------- realtime
-- The leaderboards subscribe to submissions so an automatic view sync moves the
-- board without a refresh. Realtime still honours RLS, so a client only ever
-- receives rows it could have selected anyway.
alter publication supabase_realtime add table public.submissions;
