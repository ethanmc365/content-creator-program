-- Add a thank-you audience to the same admin-only outreach RPCs.
-- Preserve the deployed bodies, role checks, market scope and sandbox exclusion.
do $migration$
declare
  name text;
  signature text;
  body text;
  old_filter text := 'and not exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge)';
  new_filter text := 'and (case when p_segment = ''posted'' then exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge) else not exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge) end)';
begin
  foreach name in array array['challenge_nudge', 'challenge_reach_emails'] loop
    signature := case when name = 'challenge_nudge' then 'public.challenge_nudge(uuid,text,text,text,text)' else 'public.challenge_reach_emails(uuid,text,text)' end;
    body := pg_get_functiondef(signature::regprocedure);
    if position(old_filter in body) = 0 then raise exception 'Review %: audience predicate changed', name; end if;
    body := replace(body, old_filter, new_filter);
    if name = 'challenge_nudge' then
      if position('(''seen'', ''dormant'', ''never'', ''all'')' in body) = 0 then raise exception 'Review %: segment validation changed', name; end if;
      body := replace(body, '(''seen'', ''dormant'', ''never'', ''all'')', '(''seen'', ''dormant'', ''never'', ''all'', ''posted'')');
    end if;
    execute body;
  end loop;
end $migration$;

-- The UI only offers thank-you sends once the server supports the posted audience.
do $migration$
declare body text;
begin
  body := pg_get_functiondef('public.challenge_reach(uuid)'::regprocedure);
  if position('''started'', v_start,' in body) = 0 then raise exception 'Review challenge_reach: response shape changed'; end if;
  body := replace(body, '''started'', v_start,', '''can_thank_posted'', true, ''started'', v_start,');
  execute body;
end $migration$;
