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
  it('sends to a market or everyone through the RPCs', async () => {
    const { client, calls } = recordingClient()
    await notificationsApi(client).notifyMarket('m1', { p_title: 'Hi' })
    await notificationsApi(client).notifyEveryone({ p_title: 'Hi' })
    expect(calls).toEqual([['rpc', 'notify_community', { p_community: 'm1', p_title: 'Hi' }], ['rpc', 'notify_all', { p_title: 'Hi' }]])
  })
  it('stores a push subscription once per endpoint', async () => {
    const { client, calls } = recordingClient()
    await notificationsApi(client).savePushSubscription({ endpoint: 'e' })
    expect(calls).toEqual([['from', 'push_subscriptions'], ['upsert', { endpoint: 'e' }, { onConflict: 'endpoint' }]])
  })
})
