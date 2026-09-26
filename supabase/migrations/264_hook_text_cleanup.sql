-- THE HOOK BANK'S BRACKETS (26 Sep 2026).
--
-- Ethan: "'Flights in 2026 are cheaper than a night out on the town,' and then
-- ... it has these weird brackets around it. Just fix anything that's wrong
-- with the actual text." The bank came from a spreadsheet where translators
-- marked inserted words as [are], left a stray ']' at the start of a line and
-- pasted markdown links ([tryp.com](http://tryp.com)). Parenthesised notes such
-- as "(flights + hotel)" are real copy and stay; only an unclosed one is shut.
update public.hooks set text = btrim(regexp_replace(
         regexp_replace(
           regexp_replace(text, '\[([^\]]+)\]\((https?://[^)]+)\)', '\1', 'g'),
         '\[([^\]]*)\]', '\1', 'g'),
       '[\[\]]', '', 'g'))
 where text ~ '[\[\]]';

update public.hooks set text = text || ')'
 where length(text) - length(replace(text, '(', '')) > length(text) - length(replace(text, ')', ''));

-- Two lines glued together by the export.
update public.hooks set text = replace(text, 'RECAPthe', 'RECAP: the') where text like '%RECAPthe%';
update public.hooks set text = replace(text, '2500 DHFlights', '2500 DH. Flights') where text like '%2500 DHFlights%';
