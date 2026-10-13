import { describe, it, expect } from 'vitest'
import { makeChatApi } from './chat'
import { recordingClient } from './recorder.test-helper'

describe('chat api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeChatApi(client)
    await api.channelReads()
    await api.channels()
    await api.conversationInvites()
    await api.conversationMembers()
    await api.conversations()
    await api.directMessages()
    await api.dmReactions()
    await api.messages()
    await api.pollOptions()
    await api.pollVotes()
    await api.polls()
    await api.reactions()
    await api.deleteMessage({ x: 1 })
    await api.leaveConversation({ x: 1 })
    await api.reportMessage({ x: 1 })
    await api.markChannelRead({ x: 1 })
    await api.myDmUnread({ x: 1 })
    await api.messageReports()
    await api.latestMessagePerRoom({ x: 1 })
    expect(calls).toEqual([
      ['from', 'channel_reads'],
      ['from', 'channels'],
      ['from', 'conversation_invites'],
      ['from', 'conversation_members'],
      ['from', 'conversations'],
      ['from', 'direct_messages'],
      ['from', 'dm_reactions'],
      ['from', 'messages'],
      ['from', 'poll_options'],
      ['from', 'poll_votes'],
      ['from', 'polls'],
      ['from', 'reactions'],
      ['rpc', 'delete_message', { x: 1 }],
      ['rpc', 'leave_conversation', { x: 1 }],
      ['rpc', 'report_message', { x: 1 }],
      ['rpc', 'mark_channel_read', { x: 1 }],
      ['rpc', 'my_dm_unread', { x: 1 }],
      ['from', 'message_reports'],
      ['rpc', 'latest_message_per_room', { x: 1 }],
    ])
  })
})
