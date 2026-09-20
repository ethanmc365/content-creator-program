-- A CERTIFICATE IS NOW A LAYOUT, NOT ONE LAYOUT WITH A TINT ON IT.
--
-- `pattern` used to hold 'wash' | 'plain' | 'rays': three washes behind one
-- fixed composition. Ethan, looking at the result: "it's really like AI style,
-- really bad... I want it completely, completely, utterly redesigned", and
-- separately "it's quite weird the way the bars are at the bottom and not on
-- the sides" and "I still don't like the background color, is that like weirdly
-- goldeny, orangey glow".
--
-- A wash cannot answer any of that, because the thing that made it look
-- generated was the COMPOSITION - one centred stack with a gradient behind it -
-- and no tint fixes a composition. So a design now carries a LAYOUT (six of
-- them, genuinely different objects) and a PAPER (what the ground is made of,
-- which is where the glow lived).
--
-- `pattern` is kept and left alone rather than dropped or repurposed: existing
-- rows have a value in it, `certificate_awards` rows are frozen records that
-- may reference it, and a column whose meaning silently changed under the same
-- name is the worst of the three options. `src/lib/certificates.js` reads it as
-- a fallback for any row written before this migration.
--
-- APPLIED TO PRODUCTION 20 Sep 2026.
alter table public.certificate_designs
  add column if not exists layout text not null default 'rail',
  add column if not exists paper  text not null default 'paper';

-- The four starters that already existed were built against the old single
-- layout. Spread them across the new ones so the list demonstrates what the
-- studio can now make instead of showing four copies of one idea.
update public.certificate_designs set layout = 'crest'    where tier = 'achievement'   and layout = 'rail';
update public.certificate_designs set layout = 'columns'  where tier = 'honour'        and layout = 'rail';
update public.certificate_designs set layout = 'ticket'   where tier = 'milestone'     and layout = 'rail';
update public.certificate_designs set layout = 'plaque'   where tier = 'participation' and layout = 'rail';
