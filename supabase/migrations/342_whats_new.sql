-- 342 (6 Oct 2026): WHAT'S NEW. Ethan: "a page to share all the updates ... all the new features, improvements, every time they do this ...
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
  ($u$What's new$u$, $u$Every update to the platform, in one place.$u$, $u$### A home for every update
Whenever we ship something new, it is written up here with the date, so you never have to guess what changed.

- **Newest first**, grouped by month
- Tagged **New**, **Improved** or **Fixed**
- Open it any time from your profile menu, just above **Get help**$u$, 'new', 'sparkles', date '2026-10-06'),
  ($u$Translate what other creators write$u$, $u$Bios, About sections, quotes and captions can now be translated in one press.$u$, $u$### Read anyone's profile in your language
Every profile now has a **Translate** button under the words a creator wrote.

- Works **both ways**: a Spanish bio into English, or an English one into Spanish, Portuguese, German or Romanian
- Covers the **one-line bio**, **About**, the **favourite quote** and the **captions** on entries
- **Show original** puts their own words back
- The button only appears when the text is not already in your language$u$, 'improved', 'language', date '2026-10-06'),
  ($u$VIP stats that update the moment a video is read$u$, $u$Views gained each day now counts every view, and the cost per 1,000 is worked out live.$u$, $u$### VIP numbers you can trust
- **Views gained each day** now includes the views a video already had when it was first read. Before, a brand new video showed almost nothing until its second reading
- **This month** is worked out live from the videos, so the current month is never empty while you wait for it to close
- **Analytics for any dates**: last 3 days, a week, a month or a custom range, for one VIP market or all of them
- A clearer **Month vs Month** comparison, and a tidier leaderboard$u$, 'improved', 'chart', date '2026-10-06'),
  ($u$Every country at sign-up$u$, $u$The country list now has every country, with a dial code for each.$u$, $u$### Nobody is left out
The sign-up and profile country pickers now list **every country in the world**, not just the ones in our travel games.

- Phone codes for **244 countries**
- Paste a number that starts with **+** and we split the code for you
- A photo you pick is never rejected for its size$u$, 'improved', 'globe', date '2026-10-05'),
  ($u$A cleaner leaderboard streak$u$, $u$The streak flame sits beside your number and greys out when the streak is off.$u$, $u$### The leaderboard, simplified
- The streak is the same **animated flame** as in the games, with the number beside it
- A flame that has gone out is shown **greyed out**
- No more box around it$u$, 'improved', 'fire', date '2026-10-05'),
  ($u$VIP Worldwide$u$, $u$A VIP market for creators everywhere, with prizes shared across every VIP market.$u$, $u$### One VIP programme, many communities
**VIP Worldwide** is the home for VIP creators who are not in a country market. VIPs in Spain, Romania and the other markets can also see what runs Worldwide.

- Challenges, prizes and perks can be set for **every VIP creator** or only the **Worldwide creators**
- A VIP in another market earns Worldwide prizes **on top of** their own market's
- New VIPs get a notice when they join, so they know where they landed$u$, 'new', 'star', date '2026-10-04'),
  ($u$Boosts and collab posts$u$, $u$Double-points windows on challenges, and credit for posts you make together.$u$, $u$### More ways to score
- **Boosts**: for a limited time a challenge can multiply the points you earn. The boost shows in the bonus slot
- **Collab posts**: when two creators post one Instagram collab video, it counts for **both** of you
- A **daily streak** on the leaderboard, shown as the animated flame$u$, 'new', 'trendUp', date '2026-10-04'),
  ($u$One video, one entry$u$, $u$A video can only be entered once across all challenges.$u$, $u$### Fair for everyone
If a video is already in one challenge, we now catch it at the door when it is entered into another. The explanation is clear and nothing is deleted without a reason.$u$, 'improved', 'shield', date '2026-10-04'),
  ($u$Joining certificate and short surveys$u$, $u$Every creator gets a certificate for joining, and the team can ask quick questions.$u$, $u$### Certificates and surveys
- A **joining certificate** with your name and join date, in your language
- **Short surveys** that appear once and never nag
- Certificates for **every prize place** in a challenge, ready to share$u$, 'new', 'ticket', date '2026-10-03'),
  ($u$The VIP programme$u$, $u$Creators paid by the views they bring, with their own page inside the community.$u$, $u$### Paid by views
The **VIP programme** is for creators who bring serious views. Everything is on one page.

- **This month** live: what you have earned so far and a projection for the month
- **My videos**, **Stats**, **Payouts**, **Leaderboard**, **Perks and trips**, **Library** and a **Map** of every VIP
- A **balance** you can take as cash or a voucher
- Monthly challenges with prizes by place, and **announcements** from the team$u$, 'new', 'star', date '2026-09-30'),
  ($u$Spanish, Portuguese, German and Romanian$u$, $u$The platform speaks four more languages, and chat can translate on request.$u$, $u$### Use Tryp.com in your language
- Every screen is translated into **Spanish, Portuguese, German and Romanian**
- **Translate** any chat message, DM or hook in one press, and the original is always one tap away
- A **wall of fame** on the public page, with a privacy switch that does exactly what it says$u$, 'new', 'language', date '2026-09-29'),
  ($u$Certificates go live$u$, $u$Beautiful, verifiable certificates for challenge winners.$u$, $u$### A certificate worth sharing
- **Six designs**, each in the platform's own look
- A **verify page** so anyone can check a certificate is real
- Save it as a picture for your **Story** or print it
- Certificates open in **your language**$u$, 'new', 'trophy', date '2026-09-28'),
  ($u$A calmer calendar$u$, $u$Busy days are orange, a day opens as a card, and one swipe turns one month.$u$, $u$### Events at a glance
- Days with events are **orange** with the event on them
- Tap a day and it opens as a **card**
- Subscribe to the calendar from your phone and get **reminders** for events you are going to$u$, 'improved', 'calendar', date '2026-09-28'),
  ($u$A clearer creator map$u$, $u$Pins group neatly as you zoom, and nothing overlaps.$u$, $u$### The creator network, smoother
- Pins **group and split** as you zoom, with no reshuffling
- A pin never crosses a border
- The **Travelling** label shows who is on the move right now
- Intro rooms have an always available **intro button** and five more questions on the card$u$, 'improved', 'pin', date '2026-09-26'),
  ($u$Hook me up$u$, $u$Over 1,500 proven video hooks, one press away on every challenge.$u$, $u$### Stuck on the first line?
Press **Hook me up** on any challenge and get a hook that has worked, best ones first.

- **1,516 hooks** from videos that performed
- Translate a hook into your language, or copy it straight into your caption
- The hook bank is also in the VIP library$u$, 'new', 'bulb', date '2026-09-24'),
  ($u$Challenge recaps$u$, $u$When a challenge ends, see your own story of it.$u$, $u$### Your challenge, as a story
After a challenge finishes you can open a **recap**: your entries, your rank, the views you brought in and the moments that mattered. Share it as a picture.$u$, 'new', 'chartPie', date '2026-09-24'),
  ($u$Reactions reach you, referrals are fair$u$, $u$A notification when someone reacts to your message, and clearer referral rewards.$u$, $u$### Small things that matter
- **Reactions** to your messages now notify you
- A **referral voucher** is earned for every **three** creators you bring in who join, get accepted and post
- An **old video check** keeps entries to videos posted after a challenge starts, with a clear message when one is not eligible$u$, 'improved', 'bell', date '2026-09-22'),
  ($u$The Global Challenge$u$, $u$One challenge for creators everywhere, scored in points.$u$, $u$### Everyone, together
The **Global Challenge** opened to every creator worldwide.

- **Points** for views milestones and bonus actions, not just one big video
- Reach **18 points** and earn a voucher just for taking part
- A **live leaderboard** in the rooms, updating as views come in
- Prizes for the top places, paid as soon as the winners are published$u$, 'new', 'globe', date '2026-09-21'),
  ($u$Your portfolio and media kit$u$, $u$A shareable page with your best work and numbers.$u$, $u$### Show brands what you do
- A **portfolio** page with your top videos, platforms and results
- A **media kit** you can email, small enough to send
- Graphics made for your **Story**$u$, 'new', 'briefcase', date '2026-09-16'),
  ($u$Continue with Google$u$, $u$Sign in with your Google account in one tap.$u$, $u$### Faster sign-in
Use your Google account to sign in. It uses the same account as your email, so nothing is duplicated.$u$, 'new', 'user', date '2026-09-07'),
  ($u$Profiles: one photo board$u$, $u$Arrange your photos freely and show your role under your name.$u$, $u$### A profile that says who you are
- **One photo board**: drag your photos wherever you want them
- Your **role** sits under your name
- Links show their **real platform logos**$u$, 'improved', 'image', date '2026-09-01'),
  ($u$More than one leaderboard per challenge$u$, $u$A challenge can have several boards, and bonuses you claim yourself.$u$, $u$### Split challenges
- Challenges can run **separate boards**, for example by country, each with its own prizes
- A **bonus** you claim yourself, for actions beyond posting
- Bonus windows with a start and an end$u$, 'new', 'trophy', date '2026-09-01'),
  ($u$Rooms you can actually talk in$u$, $u$Rooms give the screen back to the conversation.$u$, $u$### Chat, rebuilt
- Press a message to **act on it**: reply, react, copy, edit or report
- A cleaner **rooms list** that reads like a chat list
- **Search** inside any room or DM
- The **live brief** leads the room during a challenge$u$, 'improved', 'chat', date '2026-08-31'),
  ($u$Automatic view counts$u$, $u$Paste your link and we read the views for you.$u$, $u$### No more typing views
We read views from **TikTok**, **Instagram**, **Facebook** and **YouTube** for you.

- Views keep updating after you post
- A video's **cover picture** is read from the link too
- If a platform hides the number, you can still type it in$u$, 'new', 'eye', date '2026-08-24'),
  ($u$Prizes that pay themselves$u$, $u$When winners are published, prizes are awarded and invoices are drafted.$u$, $u$### From podium to payment
- Publishing the winners **awards the prizes** straight away
- A prize raises an **invoice** you can check and pay
- Everything is visible under **Rewards**$u$, 'new', 'money', date '2026-08-24'),
  ($u$A guided walkthrough$u$, $u$A short tour of the platform for new creators.$u$, $u$### Find your way around
New creators are guided through the platform with small, friendly objectives instead of a Next button. Onboarding was rebuilt too, so you finish with your market, your first challenge and your place in the community.$u$, 'new', 'handRaised', date '2026-08-22'),
  ($u$Flight log and the aircraft collection$u$, $u$Log your flights and collect every aircraft you fly on.$u$, $u$### Travel, kept
- A **flight log** with routes, airports and distances
- A **boarding pass** for each trip
- Collect **aircraft** with real photographs, and see the community's map of where everyone has been
- An upcoming flight shows who else is on the same route$u$, 'new', 'plane', date '2026-08-14'),
  ($u$Formatting for everyone$u$, $u$Bold, headings and lists work in every chat.$u$, $u$### Write it your way
- **Bold**, *italic* and headings in rooms and DMs
- Photos and videos in any chat
- Reactions at the foot of a message
- A five minute window to edit a message$u$, 'improved', 'chat', date '2026-08-09'),
  ($u$Markets and the points engine$u$, $u$Open a market near you, with its own challenges and rooms.$u$, $u$### The community, by market
- **Markets** have their own challenges, rooms and leads
- **Points challenges** reward many small wins, not just the biggest video
- Ask to **join another market** whenever you want$u$, 'new', 'users', date '2026-08-07')
) as v(title, summary, body, kind, icon, published_on)
where not exists (select 1 from public.app_updates);
