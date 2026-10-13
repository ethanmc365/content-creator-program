// Help (FAQ, questions), feedback, jobs, surveys, updates, hooks, video ideas and translations: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeContentApi = (db = supabase) => ({
  appUpdates: () => db.from('app_updates'),
  boardAnswers: () => db.from('board_answers'),
  boardQuestions: () => db.from('board_questions'),
  contentTranslations: () => db.from('content_translations'),
  faqQuestions: () => db.from('faq_questions'),
  faqs: () => db.from('faqs'),
  feedback: () => db.from('feedback'),
  hooks: () => db.from('hooks'),
  jobApplications: () => db.from('job_applications'),
  jobs: () => db.from('jobs'),
  resources: () => db.from('resources'),
  scheduledAnnouncements: () => db.from('scheduled_announcements'),
  surveyResponses: () => db.from('survey_responses'),
  surveys: () => db.from('surveys'),
  trackedVideos: () => db.from('tracked_videos'),
  translations: () => db.from('translations'),
  adminTrackedVideos: (args, opts) => db.rpc('admin_tracked_videos', args, opts),
  boardFeed: (args, opts) => db.rpc('board_feed', args, opts),
  boardRemoveAnswer: (args, opts) => db.rpc('board_remove_answer', args, opts),
  boardRemoveQuestion: (args, opts) => db.rpc('board_remove_question', args, opts),
  cacheContentTranslation: (args, opts) => db.rpc('cache_content_translation', args, opts),
  setVideoHook: (args, opts) => db.rpc('set_video_hook', args, opts),
  surveyAudienceSize: (args, opts) => db.rpc('survey_audience_size', args, opts),
  surveyIsFor: (args, opts) => db.rpc('survey_is_for', args, opts),
  syncTrackedVideos: (args, opts) => db.rpc('sync_tracked_videos', args, opts),
  videoIdeas: (args, opts) => db.rpc('video_ideas', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const contentApi = makeContentApi()
