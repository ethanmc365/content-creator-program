import { describe, it, expect } from 'vitest'
import { notificationsApi } from './notifications'
import { recordingClient } from './recorder.test-helper'

describe('notifications api', () => {
  it('lists the newest first', async () => {
    const { client, calls } = recordingClient()
    await notificationsApi(client).listMine(150)
    expect(calls).toEqual([['from', 'notifications'], ['select', '*'], ['order', 'created_at', { ascending: false }], ['limit', 150]])
  })
  it('marks one or all read, and clears', async () => {
    const { client, calls } = recordingClient()
    const api = notificationsApi(client)
    await api.markRead('n1')
    await api.markAllRead('u1')
    await api.removeRead('u1')
    expect(calls).toEqual([
      ['from', 'notifications'], ['update', { read: true }], ['eq', 'id', 'n1'],
      ['from', 'notifications'], ['update', { read: true }], ['eq', 'recipient_id', 'u1'], ['eq', 'read', false],
      ['from', 'notifications'], ['delete'], ['eq', 'recipient_id', 'u1'], ['eq', 'read', true],
    ])
  })
  it('sends a challenge push through the admin door, never notify_community/notify_all (owner-only)', async () => {
    const { client, calls } = recordingClient()
    await notificationsApi(client).sendChallengePush('c1', 'm1', 'Hi', 'Body')
    await notificationsApi(client).sendChallengePush('c1', null, 'Hi', 'Body')
    expect(calls).toEqual([
      ['rpc', 'admin_send_challenge_push', { p_challenge: 'c1', p_market: 'm1', p_title: 'Hi', p_body: 'Body' }],
      ['rpc', 'admin_send_challenge_push', { p_challenge: 'c1', p_market: null, p_title: 'Hi', p_body: 'Body' }],
    ])
  })
  it('stores a push subscription once per endpoint', async () => {
    const { client, calls } = recordingClient()
    await notificationsApi(client).savePushSubscription({ endpoint: 'e' })
    expect(calls).toEqual([['from', 'push_subscriptions'], ['upsert', { endpoint: 'e' }, { onConflict: 'endpoint' }]])
  })
})
