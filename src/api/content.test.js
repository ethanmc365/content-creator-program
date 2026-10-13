import { describe, it, expect } from 'vitest'
import { makeContentApi } from './content'
import { recordingClient } from './recorder.test-helper'

describe('content api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeContentApi(client)
    await api.appUpdates()
    await api.boardAnswers()
    await api.boardQuestions()
    await api.contentTranslations()
    await api.faqQuestions()
    await api.faqs()
    await api.feedback()
    await api.hooks()
    await api.jobApplications()
    await api.jobs()
    await api.resources()
    await api.scheduledAnnouncements()
    await api.surveyResponses()
    await api.surveys()
    await api.trackedVideos()
    await api.translations()
    await api.adminTrackedVideos({ x: 1 })
    await api.boardFeed({ x: 1 })
    await api.boardRemoveAnswer({ x: 1 })
    await api.boardRemoveQuestion({ x: 1 })
    await api.cacheContentTranslation({ x: 1 })
    await api.setVideoHook({ x: 1 })
    await api.surveyAudienceSize({ x: 1 })
    await api.surveyIsFor({ x: 1 })
    await api.syncTrackedVideos({ x: 1 })
    await api.videoIdeas({ x: 1 })
    expect(calls).toEqual([
      ['from', 'app_updates'],
      ['from', 'board_answers'],
      ['from', 'board_questions'],
      ['from', 'content_translations'],
      ['from', 'faq_questions'],
      ['from', 'faqs'],
      ['from', 'feedback'],
      ['from', 'hooks'],
      ['from', 'job_applications'],
      ['from', 'jobs'],
      ['from', 'resources'],
      ['from', 'scheduled_announcements'],
      ['from', 'survey_responses'],
      ['from', 'surveys'],
      ['from', 'tracked_videos'],
      ['from', 'translations'],
      ['rpc', 'admin_tracked_videos', { x: 1 }],
      ['rpc', 'board_feed', { x: 1 }],
      ['rpc', 'board_remove_answer', { x: 1 }],
      ['rpc', 'board_remove_question', { x: 1 }],
      ['rpc', 'cache_content_translation', { x: 1 }],
      ['rpc', 'set_video_hook', { x: 1 }],
      ['rpc', 'survey_audience_size', { x: 1 }],
      ['rpc', 'survey_is_for', { x: 1 }],
      ['rpc', 'sync_tracked_videos', { x: 1 }],
      ['rpc', 'video_ideas', { x: 1 }],
    ])
  })
})
