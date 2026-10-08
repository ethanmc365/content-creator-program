-- 374 (9 Oct 2026): six more Get Help answers, each ending in a quick link to the screen it is about. A link written
-- [Label](/path) in an answer draws as a small button that opens that screen inside the app (lib/noteMarkdown), so an answer
-- about Settings can take the creator straight to the right Settings section. The team can edit or reorder these on /help.
-- Idempotent: a question that already exists is left alone.

insert into public.faqs (category, question, answer, position)
select v.category, v.question, v.answer, v.position
from (values
  ('Payments and rewards', 'How do I add my payment details?',
   E'Add them once and every prize is paid to them. Open **Settings > Payment details**, choose your currency and fill in the bank details for your country. We prepare the invoice for you.\n\n[Open Payment details](/settings?section=payment)', 12),
  ('Account and app', 'How do I turn notifications on or off?',
   E'In **Settings > Notifications** you choose which alerts you get (replies, mentions, challenge reminders, rewards) and whether they arrive as push alerts on your phone.\n\nOn an iPhone, push alerts only work once the app is added to your Home Screen.\n\n[Open Notifications](/settings?section=notifications)', 13),
  ('Account and app', 'How do I change the language of the app?',
   E'Pick your language in **Settings > Language**. It follows your account, so it is the same on every device you sign in on.\n\n[Open Language](/settings?section=language)', 14),
  ('Account and app', 'How do I change my photo, bio or social links?',
   E'Open **Edit profile**. The tabs along the top hold your photo, name and bio (**You**), your social links (**Links**), the places you have been (**Travel**) and your travel photos (**Photos**). Press **Save profile** when you are done.\n\n[Edit my profile](/profile/edit)', 15),
  ('Account and app', 'How do I change my password, download my data or delete my account?',
   E'All three are in **Settings > Account**: your password and privacy choices, a copy of everything we hold about you, and deleting your account. A deleted account is hidden at once and removed for good after 30 days, and signing back in within that time restores it.\n\n[Open Account settings](/settings?section=account)', 16),
  ('Getting started', 'Where can I find ideas and hooks for my videos?',
   E'**Video Ideas** shows the community videos that passed 100,000 views, with the words on screen that opened each one (the hook). Press a video to watch it, then copy the hook or translate it into your language.\n\nWant a hook written for you? Press **Hook me up** on any challenge.\n\n[Open Video Ideas](/ideas)', 17)
) as v(category, question, answer, position)
where not exists (select 1 from public.faqs f where f.question = v.question);
