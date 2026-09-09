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
3. The RLS policies and the edge functions are shared, because both sites use
   the same Supabase project - but the origin allow-lists are NOT. See the next
   section: a new hostname needs adding to Cloudflare Turnstile, and to
   Supabase's redirect URLs if Google sign-in is to work there.

## A NEW ORIGIN IS THREE ALLOW-LISTS, AND THIS IS WHERE THE FIRST ATTEMPT DIED

Ethan, first time he opened the staging link: *"I'm unable to test them from
that link because Cloudflare doesn't work."*

A browser treats a different hostname as a different site, and so do the three
services this app depends on. Every one of them keys on the origin, and none of
them fails loudly - the page renders and the login button simply never enables.

1. **Cloudflare Turnstile** is domain-scoped. The widget only serves a challenge
   on hostnames listed against it, and on any other hostname it renders nothing,
   fires no callback, and leaves the submit button disabled at "Verifying…"
   forever. That is the same failure the platform saw for three days in August
   when the widget broke on Cloudflare's side, and it looks identical from the
   outside. **Fix:** Cloudflare dashboard → Turnstile → the widget → Settings →
   Domains → add `content-creator-program-git-staging-contentcreatorprogram.vercel.app`.
   To confirm this is what happened, open the console on the login page: a
   Turnstile error code in the `1102xx` range means "domain not allowed".
2. **Supabase Auth redirect URLs**, for Google sign-in and password reset only.
   Authentication → URL Configuration → Redirect URLs → add the staging origin.
   Email and password need nothing.
3. **Vercel Authentication**, which is the one that is *supposed* to stop you:
   sign in with the Vercel account once per device and the link behaves like the
   app.

There is also a fourth thing that is not an allow-list: a browser keeps a
Tryp.com session **per origin**, so the first staging visit is a fresh login even
though you are signed in on the real site.

**If setting those up is not worth it**, use localhost instead - see below. It is
the same code with none of the allow-lists, because `localhost` is already on all
of them.

## The other ways to look at a change

| | Where | What it costs | What it is good for |
| --- | --- | --- | --- |
| **localhost** | `./dev.sh` → `http://localhost:5173` | Nothing, and no allow-lists to set up | Everything, on a laptop. Real production data, your real account. |
| **staging** | the branch alias above | Two allow-list entries, once | Reviewing on your **phone**, which localhost cannot do |
| **Supabase branch** | a separate database | Pro plan, already paid for | Rehearsing a **migration**. Empty of data, so useless for "does this look right" |
| **`?demo=1`** | production | Nothing | Seeing the landing page as a stranger while signed in |

The reason staging exists at all rather than just localhost: half the things
worth reviewing on this platform are phone-shaped - the install prompt, the
walkthrough, the chat overlay, the mobile landing page - and a laptop cannot
show you those honestly.
