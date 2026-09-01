-- 161: Romania settles in euros like every other market.
--
-- The programme pays in euros (see lib/utils formatMoney). Romania was the one
-- market row still carrying its local currency, and the challenge form takes
-- the market's currency as the prize currency - so picking Romania rewrote
-- every prize line as "lei 105 cash" and stamped RON on the challenge.
-- The UK row stays GBP on purpose: its nine historical payouts were made in
-- pounds and are never to be relabelled.
update communities set currency = 'EUR' where slug = 'romania' and currency <> 'EUR';
