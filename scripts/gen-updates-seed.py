#!/usr/bin/env python3
"""Writes supabase/migrations/342_whats_new.sql: the table, its fences and the last two months of updates, with the dates they went live.
Run it again after editing UPDATES; the seed is idempotent (it only inserts when the table is empty)."""
import pathlib

# (date, kind, icon, title, summary, body)  newest first. No em dashes.
U = [
("2026-10-06","new","sparkles","What's new",
 "Every update to the platform, in one place.",
 """### A home for every update
Whenever we ship something new, it is written up here with the date, so you never have to guess what changed.

- **Newest first**, grouped by month
- Tagged **New**, **Improved** or **Fixed**
- Open it any time from your profile menu, just above **Get help**"""),
("2026-10-06","improved","language","Translate what other creators write",
 "Bios, About sections, quotes and captions can now be translated in one press.",
 """### Read anyone's profile in your language
Every profile now has a **Translate** button under the words a creator wrote.

- Works **both ways**: a Spanish bio into English, or an English one into Spanish, Portuguese, German or Romanian
- Covers the **one-line bio**, **About**, the **favourite quote** and the **captions** on entries
- **Show original** puts their own words back
- The button only appears when the text is not already in your language"""),
("2026-10-06","improved","chart","VIP stats that update the moment a video is read",
 "Views gained each day now counts every view, and the cost per 1,000 is worked out live.",
 """### VIP numbers you can trust
- **Views gained each day** now includes the views a video already had when it was first read. Before, a brand new video showed almost nothing until its second reading
- **This month** is worked out live from the videos, so the current month is never empty while you wait for it to close
- **Analytics for any dates**: last 3 days, a week, a month or a custom range, for one VIP market or all of them
- A clearer **Month vs Month** comparison, and a tidier leaderboard"""),
("2026-10-05","improved","globe","Every country at sign-up",
 "The country list now has every country, with a dial code for each.",
 """### Nobody is left out
The sign-up and profile country pickers now list **every country in the world**, not just the ones in our travel games.

- Phone codes for **244 countries**
- Paste a number that starts with **+** and we split the code for you
- A photo you pick is never rejected for its size"""),
("2026-10-05","improved","fire","A cleaner leaderboard streak",
 "The streak flame sits beside your number and greys out when the streak is off.",
 """### The leaderboard, simplified
- The streak is the same **animated flame** as in the games, with the number beside it
- A flame that has gone out is shown **greyed out**
- No more box around it"""),
("2026-10-04","new","star","VIP Worldwide",
 "A VIP market for creators everywhere, with prizes shared across every VIP market.",
 """### One VIP programme, many communities
**VIP Worldwide** is the home for VIP creators who are not in a country market. VIPs in Spain, Romania and the other markets can also see what runs Worldwide.

- Challenges, prizes and perks can be set for **every VIP creator** or only the **Worldwide creators**
- A VIP in another market earns Worldwide prizes **on top of** their own market's
- New VIPs get a notice when they join, so they know where they landed"""),
("2026-10-04","new","trendUp","Boosts and collab posts",
 "Double-points windows on challenges, and credit for posts you make together.",
 """### More ways to score
- **Boosts**: for a limited time a challenge can multiply the points you earn. The boost shows in the bonus slot
- **Collab posts**: when two creators post one Instagram collab video, it counts for **both** of you
- A **daily streak** on the leaderboard, shown as the animated flame"""),
("2026-10-04","improved","shield","One video, one entry",
 "A video can only be entered once across all challenges.",
 """### Fair for everyone
If a video is already in one challenge, we now catch it at the door when it is entered into another. The explanation is clear and nothing is deleted without a reason."""),
("2026-10-03","new","ticket","Joining certificate and short surveys",
 "Every creator gets a certificate for joining, and the team can ask quick questions.",
 """### Certificates and surveys
- A **joining certificate** with your name and join date, in your language
- **Short surveys** that appear once and never nag
- Certificates for **every prize place** in a challenge, ready to share"""),
("2026-09-30","new","star","The VIP programme",
 "Creators paid by the views they bring, with their own page inside the community.",
 """### Paid by views
The **VIP programme** is for creators who bring serious views. Everything is on one page.

- **This month** live: what you have earned so far and a projection for the month
- **My videos**, **Stats**, **Payouts**, **Leaderboard**, **Perks and trips**, **Library** and a **Map** of every VIP
- A **balance** you can take as cash or a voucher
- Monthly challenges with prizes by place, and **announcements** from the team"""),
("2026-09-29","new","language","Spanish, Portuguese, German and Romanian",
 "The platform speaks four more languages, and chat can translate on request.",
 """### Use Tryp.com in your language
- Every screen is translated into **Spanish, Portuguese, German and Romanian**
- **Translate** any chat message, DM or hook in one press, and the original is always one tap away
- A **wall of fame** on the public page, with a privacy switch that does exactly what it says"""),
("2026-09-28","new","trophy","Certificates go live",
 "Beautiful, verifiable certificates for challenge winners.",
 """### A certificate worth sharing
- **Six designs**, each in the platform's own look
- A **verify page** so anyone can check a certificate is real
- Save it as a picture for your **Story** or print it
- Certificates open in **your language**"""),
("2026-09-28","improved","calendar","A calmer calendar",
 "Busy days are orange, a day opens as a card, and one swipe turns one month.",
 """### Events at a glance
- Days with events are **orange** with the event on them
- Tap a day and it opens as a **card**
- Subscribe to the calendar from your phone and get **reminders** for events you are going to"""),
("2026-09-26","improved","pin","A clearer creator map",
 "Pins group neatly as you zoom, and nothing overlaps.",
 """### The creator network, smoother
- Pins **group and split** as you zoom, with no reshuffling
- A pin never crosses a border
- The **Travelling** label shows who is on the move right now
- Intro rooms have an always available **intro button** and five more questions on the card"""),
("2026-09-24","new","bulb","Hook me up",
 "Over 1,500 proven video hooks, one press away on every challenge.",
 """### Stuck on the first line?
Press **Hook me up** on any challenge and get a hook that has worked, best ones first.

- **1,516 hooks** from videos that performed
- Translate a hook into your language, or copy it straight into your caption
- The hook bank is also in the VIP library"""),
("2026-09-24","new","chartPie","Challenge recaps",
 "When a challenge ends, see your own story of it.",
 """### Your challenge, as a story
After a challenge finishes you can open a **recap**: your entries, your rank, the views you brought in and the moments that mattered. Share it as a picture."""),
("2026-09-22","improved","bell","Reactions reach you, referrals are fair",
 "A notification when someone reacts to your message, and clearer referral rewards.",
 """### Small things that matter
- **Reactions** to your messages now notify you
- A **referral voucher** is earned for every **three** creators you bring in who join, get accepted and post
- An **old video check** keeps entries to videos posted after a challenge starts, with a clear message when one is not eligible"""),
("2026-09-21","new","globe","The Global Challenge",
 "One challenge for creators everywhere, scored in points.",
 """### Everyone, together
The **Global Challenge** opened to every creator worldwide.

- **Points** for views milestones and bonus actions, not just one big video
- Reach **18 points** and earn a voucher just for taking part
- A **live leaderboard** in the rooms, updating as views come in
- Prizes for the top places, paid as soon as the winners are published"""),
("2026-09-16","new","briefcase","Your portfolio and media kit",
 "A shareable page with your best work and numbers.",
 """### Show brands what you do
- A **portfolio** page with your top videos, platforms and results
- A **media kit** you can email, small enough to send
- Graphics made for your **Story**"""),
("2026-09-07","new","user","Continue with Google",
 "Sign in with your Google account in one tap.",
 """### Faster sign-in
Use your Google account to sign in. It uses the same account as your email, so nothing is duplicated."""),
("2026-09-01","improved","image","Profiles: one photo board",
 "Arrange your photos freely and show your role under your name.",
 """### A profile that says who you are
- **One photo board**: drag your photos wherever you want them
- Your **role** sits under your name
- Links show their **real platform logos**"""),
("2026-09-01","new","trophy","More than one leaderboard per challenge",
 "A challenge can have several boards, and bonuses you claim yourself.",
 """### Split challenges
- Challenges can run **separate boards**, for example by country, each with its own prizes
- A **bonus** you claim yourself, for actions beyond posting
- Bonus windows with a start and an end"""),
("2026-08-31","improved","chat","Rooms you can actually talk in",
 "Rooms give the screen back to the conversation.",
 """### Chat, rebuilt
- Press a message to **act on it**: reply, react, copy, edit or report
- A cleaner **rooms list** that reads like a chat list
- **Search** inside any room or DM
- The **live brief** leads the room during a challenge"""),
("2026-08-24","new","eye","Automatic view counts",
 "Paste your link and we read the views for you.",
 """### No more typing views
We read views from **TikTok**, **Instagram**, **Facebook** and **YouTube** for you.

- Views keep updating after you post
- A video's **cover picture** is read from the link too
- If a platform hides the number, you can still type it in"""),
("2026-08-24","new","money","Prizes that pay themselves",
 "When winners are published, prizes are awarded and invoices are drafted.",
 """### From podium to payment
- Publishing the winners **awards the prizes** straight away
- A prize raises an **invoice** you can check and pay
- Everything is visible under **Rewards**"""),
("2026-08-22","new","handRaised","A guided walkthrough",
 "A short tour of the platform for new creators.",
 """### Find your way around
New creators are guided through the platform with small, friendly objectives instead of a Next button. Onboarding was rebuilt too, so you finish with your market, your first challenge and your place in the community."""),
("2026-08-14","new","plane","Flight log and the aircraft collection",
 "Log your flights and collect every aircraft you fly on.",
 """### Travel, kept
- A **flight log** with routes, airports and distances
- A **boarding pass** for each trip
- Collect **aircraft** with real photographs, and see the community's map of where everyone has been
- An upcoming flight shows who else is on the same route"""),
("2026-08-09","improved","chat","Formatting for everyone",
 "Bold, headings and lists work in every chat.",
 """### Write it your way
- **Bold**, *italic* and headings in rooms and DMs
- Photos and videos in any chat
- Reactions at the foot of a message
- A five minute window to edit a message"""),
("2026-08-07","new","users","Markets and the points engine",
 "Open a market near you, with its own challenges and rooms.",
 """### The community, by market
- **Markets** have their own challenges, rooms and leads
- **Points challenges** reward many small wins, not just the biggest video
- Ask to **join another market** whenever you want"""),
]

def q(s):
    # dollar-quote: pick a tag that does not appear in the text
    tag = 'u'
    while f'${tag}$' in s: tag += 'x'
    return f'${tag}${s}${tag}$'

rows = []
for date, kind, icon, title, summary, body in U:
    assert '—' not in (title+summary+body), title
    rows.append(f"  ({q(title)}, {q(summary)}, {q(body)}, '{kind}', '{icon}', date '{date}')")

sql = f"""-- 342 (6 Oct 2026): WHAT'S NEW. Ethan: "a page to share all the updates ... all the new features, improvements, every time they do this ...
-- in the profile dropdown, right above the get help button ... I should be able to edit them and add new notes when there are new features."
-- Anyone signed in reads the published ones; the team writes, edits and unpublishes them (markdown: headings, bold, bullets).
create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  summary text check (summary is null or char_length(summary) <= 280),
  body text not null default '' check (char_length(body) <= 20000),
  kind text not null default 'new' check (kind in ('new', 'improved', 'fixed')),
  icon text not null default 'sparkles',
  published_on date not null default current_date,
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_updates_on on public.app_updates (published_on desc, created_at desc);
alter table public.app_updates enable row level security;
drop policy if exists "updates: read" on public.app_updates;
create policy "updates: read" on public.app_updates for select to authenticated using (published or public.is_admin());
drop policy if exists "updates: team writes" on public.app_updates;
create policy "updates: team writes" on public.app_updates for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.app_updates from anon;
grant select, insert, update, delete on public.app_updates to authenticated;

create or replace function public.trg_app_updates_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists app_updates_touch on public.app_updates;
create trigger app_updates_touch before update on public.app_updates for each row execute function public.trg_app_updates_touch();

-- The last two months, with the dates they went live (read off the history). Only when the table is empty, so a second run changes nothing.
insert into public.app_updates (title, summary, body, kind, icon, published_on)
select * from (values
{(","+chr(10)).join(rows)}
) as v(title, summary, body, kind, icon, published_on)
where not exists (select 1 from public.app_updates);
"""
out = pathlib.Path(__file__).resolve().parents[1] / 'supabase/migrations/342_whats_new.sql'
out.write_text(sql)
print('wrote', out, len(U), 'updates')
