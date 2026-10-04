-- 331 (4 Oct 2026): VIP GUIDES - DRAG TO REORDER, AND CLEARER STARTER COPY.
--
-- Ethan: "Order: lowest first doesn't really make sense. I'd rather just have the function to drag them in the order I want them in ...
-- Improve the copy in all the guides."
--
-- 1. `vip_reorder_guides` takes the guides in the order they now sit and writes 10, 20, 30... into `sort`. It only touches guides the
--    caller may change (a market lead cannot move a guide that belongs to every market), and skips the rest without failing.
-- 2. The ten starter guides are rewritten - shorter, plainer and more specific. Only the ones the team has not touched are changed
--    (`created_by is null`: the starter rows were inserted by a migration, so a guide anybody edited or wrote has an author).

create or replace function public.vip_reorder_guides(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select o.id, o.n, g.programme_id from unnest(coalesce(p_ids, '{}')) with ordinality as o(id, n)
           join public.vip_guides g on g.id = o.id loop
    if public.vip_scope_ok(r.programme_id) then
      update public.vip_guides set sort = (r.n * 10)::int, updated_at = now() where id = r.id and sort is distinct from (r.n * 10)::int;
    end if;
  end loop;
end $$;
revoke all on function public.vip_reorder_guides(uuid[]) from public, anon;
grant execute on function public.vip_reorder_guides(uuid[]) to authenticated;


update public.vip_guides set title = 'Film your trip so people want to go', body = $g$A good trip video makes the viewer feel they are there with you. Film the journey, not just the place.

**Get these shots on every trip**
- The arrival: stepping off the plane, train or boat
- The big view: the one thing everybody comes for, filmed wide
- The small detail: food, signs, hands, textures
- You, reacting: a real face beats a perfect one
- The price: what it cost, on screen, at the moment you pay

**Habits that make editing easy**
- Film vertically, keep it steady, and use natural light when you can
- Hold every shot for five seconds, even if it feels long
- Say the name of the place out loud once, so you can find the clip later
- Film the walk to and from each spot. It is the best way to join two scenes$g$, updated_at = now() where title = 'How to record the best trip videos' and created_by is null;

update public.vip_guides set title = 'Five minutes of filming that saves an hour of editing', body = $g$Before you leave a spot, take five minutes to think about the edit.

- **One wide, one medium, one close.** Three angles of the same thing make a whole sequence.
- **Move on purpose.** Walk into the frame, turn with the camera, reveal something.
- **Record the sound.** Waves, markets and trams: ten seconds of the real place makes a video feel alive.
- **Film a clean ending.** A shot you can finish on rescues a weak last line.

If the place is crowded, get low or get high. Almost nobody films from the top of the stairs.$g$, updated_at = now() where title = 'Shoot for the edit: a five-minute routine' and created_by is null;

update public.vip_guides set title = 'Start with the first three seconds', body = $g$Most people decide within three seconds whether to keep watching, so write your opening before anything else.

A good opening does one of three things: it promises something, it asks a question, or it surprises.

- Put the opening on screen as text and say it out loud
- Start in the middle of the action, never with "hi guys"
- Make the payoff specific: a price, a place, a number

Stuck? Try the hook generator on this page, then change the words until they sound like you.$g$, updated_at = now() where title = 'Write the first three seconds first' and created_by is null;

update public.vip_guides set title = 'Five openings that keep working', body = $g$Each of these is a starting shape. Swap in your own city, price and story.

1. **The price:** "A weekend in [city] for under [price]. Here is exactly how."
2. **The warning:** "Do not book [thing] before you watch this."
3. **The hidden gem:** "Nobody talks about this part of [place]."
4. **The list:** "Three things I wish I knew before [trip]."
5. **The point of view:** "POV: you finally booked the trip you kept putting off."

The formula is only the frame. Your detail is what makes the video yours.$g$, updated_at = now() where title = 'Five hook formulas that keep working' and created_by is null;

update public.vip_guides set title = 'Cut it tight', body = $g$Short, fast and clear works on every platform.

- Cut every pause and every "um". If a clip adds nothing, it goes.
- Change the shot every two to four seconds
- Add captions. A lot of people watch with the sound off
- If you use music, cut on the beat
- End on a line that makes people watch again, or follow you for part two

Watch your video once without touching it. Wherever you want to look away, cut.$g$, updated_at = now() where title = 'Cut it tight' and created_by is null;

update public.vip_guides set title = 'Post often and keep to a rhythm', body = $g$Steady beats perfect. Three good videos a week teach you more than one perfect video a month.

- Post natively on each platform, not a screenshot of another one
- Add every video to your VIP page as soon as it is live, so its views count from the start
- Reply to comments in the first hour. It helps the video and it builds your audience
- Pick a rough schedule and keep it for a whole month before you change anything

Once a week, look at your stats and find your best video. Then make something like it.$g$, updated_at = now() where title = 'When to post, and how often' and created_by is null;

update public.vip_guides set title = 'Get five posts out of one good video', body = $g$When a video works, do not move on. Use it again.

- Make a part two that answers the most common question in the comments
- Cut a shorter, faster version for another platform
- Pull one moment out as its own clip
- Post a behind-the-scenes of how you filmed it
- Turn the key fact into a text-only post

One idea, five posts, a week of content.$g$, updated_at = now() where title = 'Turn one good video into five' and created_by is null;

update public.vip_guides set title = 'Plan your whole month in one hour', body = $g$Once a month, sit down with this month's VIP challenge and your calendar.

1. Read the challenge and its theme
2. List every trip, outing or place you will be at
3. Choose an opening for each one from the guides
4. Pick three posting days a week and put a video idea on each
5. Leave one slot empty for something unexpected

You will spend less time deciding what to film and more time filming.$g$, updated_at = now() where title = 'Plan a month in one hour' and created_by is null;

update public.vip_guides set title = 'Show the booking, not just the view', body = $g$People watching travel videos are already thinking about going. Help them take the next step.

- Show a real price or a real deal, on screen, at the moment
- Mention or tag Tryp.com the way you agreed with the team, in the video and the caption
- Say why your pick is good value. People trust a reason
- Be honest. If something was not worth it, say so, and your recommendations will be worth more

Check the terms on your VIP page for how a video has to mention Tryp.com to count.$g$, updated_at = now() where title = 'Show the booking, not just the view' and created_by is null;

update public.vip_guides set title = 'Keep your views real', body = $g$You are paid for real views, and the programme only works while they are real.

- Never buy views, followers or engagement
- Do not repost an old video as a new one
- Post on your own account, in public, so the views can be read

Views that look artificial can be taken out of your total and can end your place in the programme. A real audience lasts, and so does your payout.$g$, updated_at = now() where title = 'Keep your views honest' and created_by is null;
