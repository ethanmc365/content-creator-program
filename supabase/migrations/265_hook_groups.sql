-- HOOK GROUPS WITH PLAIN NAMES (26 Sep 2026).
--
-- Ethan, of /admin/hooks: "Improve the name of the filters. 'Once a year' ...
-- I don't like these names and the design, like the slashes. Just work on
-- really grouping them much better." Eighteen families named like analyst
-- notes ("Wealth accusation reframe", "Price shock / \"have you seen\"") become
-- thirteen groups a creator manager would say out loud.
update public.hooks set family = case family
  when 'Deal listing / offer' then 'Deals and prices'
  when 'Price shock / "have you seen"' then 'Deals and prices'
  when 'Trip-cost breakdown' then 'Deals and prices'
  when 'Cheaper-than comparison' then 'Cheaper than...'
  when 'Split the cost' then 'Go with a friend'
  when 'Gift / tag-a-friend' then 'Go with a friend'
  when 'Stranger social proof' then 'What people say'
  when 'Once-a-year rebuttal' then 'Travel more often'
  when 'Wealth accusation reframe' then 'Not rich, just smart'
  when 'Girl math / mental accounting' then 'Not rich, just smart'
  when 'Seasonal / calendar peg' then 'Seasons and dates'
  when 'Objection / regret / discovery' then 'Things I wish I knew'
  when 'Gatekeeping / secret / hack' then 'Secrets and hacks'
  when 'POV / relatable skit' then 'POV and skits'
  when 'Booked-X-trips flex' then 'Travel flex'
  when 'Countries-in-X-years flex' then 'Travel flex'
  when 'Destination dupe / reveal' then 'Hidden destinations'
  else family end;
