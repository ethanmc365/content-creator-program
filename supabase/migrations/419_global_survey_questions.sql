-- 419: THE GLOBAL CHALLENGE SURVEY, SHARPER (14 Oct 2026).
-- Ethan: no question we can answer from the data ("How many videos did you post?" - long gone), and a few more that tell
-- the team something it cannot see: how clear the brief was, what kind of video did best, how easy submitting was, how
-- the length felt, and what they want next. No responses yet, so the whole set is replaced.
update surveys set questions = jsonb_build_array(
  jsonb_build_object('id', 'q1', 'type', 'rating', 'prompt', 'How much did you enjoy the Global Challenge?', 'required', true),
  jsonb_build_object('id', 'q7', 'type', 'choice', 'prompt', 'How clear was the brief?', 'required', true,
    'options', jsonb_build_array('Very clear', 'Mostly clear', 'A bit confusing', 'I did not read it')),
  jsonb_build_object('id', 'q3', 'type', 'multi', 'prompt', 'What made you post?', 'required', false,
    'options', jsonb_build_array('The prizes', 'The points and the leaderboard', 'The bonus rounds', 'Double points days',
      'The video ideas and hooks', 'The community')),
  jsonb_build_object('id', 'q8', 'type', 'choice', 'prompt', 'Which kind of video did best for you?', 'required', false,
    'options', jsonb_build_array('A deal or price reveal', 'A destination guide', 'A hotel or room tour', 'A day in my life',
      'Christmas markets or seasonal', 'Something else')),
  jsonb_build_object('id', 'q4', 'type', 'multi', 'prompt', 'What held you back from posting more?', 'required', false,
    'options', jsonb_build_array('Not enough time', 'Ran out of ideas', 'Unsure what would do well',
      'The prizes felt out of reach', 'Views were slow to update', 'Nothing, I posted as much as I wanted')),
  jsonb_build_object('id', 'q9', 'type', 'choice', 'prompt', 'How easy was it to submit your videos on the platform?', 'required', true,
    'options', jsonb_build_array('Very easy', 'Easy', 'Okay', 'Difficult')),
  jsonb_build_object('id', 'q10', 'type', 'choice', 'prompt', 'Four weeks felt...', 'required', false,
    'options', jsonb_build_array('Too short', 'About right', 'Too long')),
  jsonb_build_object('id', 'q11', 'type', 'multi', 'prompt', 'What would you like in the next challenge?', 'required', false,
    'options', jsonb_build_array('More hook and video ideas', 'A bigger first prize', 'More places paid', 'More bonus rounds',
      'Weekly winners', 'Collab challenges with other creators', 'Market against market')),
  jsonb_build_object('id', 'q5', 'type', 'scale', 'prompt', 'How likely are you to take part in the next challenge?',
    'help', '0 is not at all, 10 is definitely.', 'required', true),
  jsonb_build_object('id', 'q6', 'type', 'text', 'prompt', 'One thing that would make the next challenge better?', 'required', false)
)
where id = 'e4b1875f-252f-4282-bebd-1ce4adb4a664'
  and not exists (select 1 from survey_responses r where r.survey_id = 'e4b1875f-252f-4282-bebd-1ce4adb4a664' and not r.declined);
