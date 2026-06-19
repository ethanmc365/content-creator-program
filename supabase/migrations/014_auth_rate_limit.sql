-- ============================================================================
-- 014 - rate-limit event log
-- Backs auth rate limiting (5 attempts / 15 min, identifier 'login:.. | signup:.. | recover:..')
-- and upload rate limiting ('upload:<uid>'). Written/read only by Edge Functions
-- via the service role.
-- ============================================================================
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,        -- e.g. 'login:email|ip' or 'signup:ip'
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_attempts_id_time on public.auth_attempts (identifier, created_at desc);

-- No policies: anon/authenticated get nothing; the Edge Function uses the
-- service role (which bypasses RLS) to count, insert and prune attempts.
alter table public.auth_attempts enable row level security;
