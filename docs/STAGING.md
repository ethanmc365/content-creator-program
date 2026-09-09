# A place to look at a change before the community does

Ethan, 9 Sep 2026: *"whenever you deploy a change, it goes to a certain link or
site that I can personally view it, test it out, review it. And then I can say
okay, open it to the whole community."*

This is that. Nothing here is new infrastructure that has to be bought or
maintained: Vercel has built every push a preview since the project was created,
and the only thing missing was a branch with a **stable name** so the link does
not change every time, plus a written rule about which branch means what.

---

## The two branches

| Branch    | What it is                        | Where it appears                                                     |
| --------- | --------------------------------- | -------------------------------------------------------------------- |
| `staging` | Everything finished but unreleased | `content-creator-program-git-staging-contentcreatorprogram.vercel.app` |
| `main`    | What the community is using        | `trypcreators.vercel.app`                                             |

**Vercel production deploys from `main` only.** That has always been true and it
is what makes this safe: work can sit on `staging` for a week and no creator can
reach it.

## The loop

1. Work lands on `staging` and is pushed. Vercel builds it in about a minute.
2. Ethan opens the staging link and reviews it on his own phone and laptop.
3. When he says go, `main` is fast-forwarded to `staging` and the community has
   it within a minute or two.
4. If something is wrong, it is fixed on `staging` and step 2 happens again.
   Production is never touched in between.

Fast-forward, not merge: `staging` and `main` stay identical histories, so
"what is on production" is always a commit that was reviewed on staging, and
there is never a merge commit whose contents nobody looked at.

## Who can see it

Vercel Authentication is **on** for this project
(`ssoProtection: all_except_custom_domains`). A preview URL therefore asks for a
Vercel login before it will render anything, and only members of the
`contentcreatorprogram` team have one. Creators cannot open the link even if
somebody forwards it to them.

`trypcreators.vercel.app` is attached to the project as a domain and is
deliberately **not** behind that check - it is the public app.

## The one thing to know about the data

**Staging talks to the production database.** That is on purpose, and it is the
difference between a review and a guess: Ethan is looking at the real
challenges, the real creators and his own account, which is the only way to
answer "does this look right". It also means:

- Anything he **does** on staging is real. Sending a message sends a message.
- A code change is safe to review this way. A **database migration** is not,
  because the migration has already been applied to the one database both sites
  read.

So the rule is:

> Review UI and behaviour on staging against production data.
> Rehearse migrations against a Supabase branch, never against production.

### Rehearsing a migration

The Supabase organisation is on the **Pro** plan, so database branching is
available. A branch is a separate Postgres instance built from the migrations in
`supabase/migrations`, with **no production data in it** - which makes it right
for "does this migration apply cleanly and do the policies still hold" and wrong
for "does this page look right".

For a data-shaped question against real rows, the existing technique is better
and is already how every money and cron path in this project was proved:

```sql
do $$
declare report text := '';
begin
  -- run the real thing here, build up `report`
  raise exception E'\n%', report;   -- everything rolls back
end $$;
```

Everything is executed for real against production rows and then thrown away,
and the findings come back in the error message. See §9 of the project notes.

## Setting the same thing up again from scratch

Nothing below needed doing this time; it is written down in case the project
moves.

1. `git switch -c staging && git push -u origin staging`. Vercel picks it up on
   its own - no dashboard step, no configuration.
2. Vercel → Project → Settings → Deployment Protection → Vercel Authentication
   → **Standard Protection**. This is already on.
3. Nothing to change in Supabase. Both sites use the same project, so the auth
   redirect URLs, the RLS policies and the edge functions are shared.

## What Ethan has to do

Once, on each device he wants to review from: open the staging link and sign in
to **Vercel** when it asks. After that the link behaves like the app.

He will be signed out of Tryp.com on the staging origin, because a browser keeps
a session per origin - so the first visit needs a Tryp.com login too. Google
sign-in works there only if the staging origin is added to Supabase →
Authentication → URL Configuration → Redirect URLs; email and password work with
no configuration at all.
