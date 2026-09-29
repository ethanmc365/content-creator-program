-- 287: a certificate for chosen places only goes to places the challenge actually pays.
--
-- Ethan (2 Oct 2026): every prize place should show as an option, toggled off rather than picked,
-- and "it obviously depends on how many prize places are in the actual challenge". The places
-- picker now starts with 1st to 10th all on; switching one off stores an explicit `ranks` list.
-- Without this, a design with ranks 1-10 would hand a "7th place" certificate to the 7th entrant of
-- a three-place challenge. A challenge with no prize structure (places = 0) keeps the old
-- behaviour, so nothing already awarded or already configured changes meaning.
do $$
declare
  f text;
begin
  f := pg_get_functiondef('public.award_challenge_certificates_internal'::regproc);
  f := replace(f,
    '(r.rank = any(d.ranks) or (d.all_prize_places and r.rank between 1 and v_places))',
    '((r.rank = any(d.ranks) and (v_places = 0 or r.rank <= v_places)) or (d.all_prize_places and r.rank between 1 and v_places))');
  if position('v_places = 0 or r.rank <= v_places' in f) = 0 then raise exception 'award fn not patched'; end if;
  execute f;

  f := pg_get_functiondef('public.certificate_candidates'::regproc);
  f := replace(f,
    '(r.rank = any(d.ranks) or (d.all_prize_places and r.rank between 1 and coalesce(public.challenge_prize_places(c.id), 0)))',
    '((r.rank = any(d.ranks) and (coalesce(public.challenge_prize_places(c.id), 0) = 0 or r.rank <= public.challenge_prize_places(c.id))) or (d.all_prize_places and r.rank between 1 and coalesce(public.challenge_prize_places(c.id), 0)))');
  if position('= 0 or r.rank <= public.challenge_prize_places' in f) = 0 then raise exception 'candidates fn not patched'; end if;
  execute f;
end $$;
