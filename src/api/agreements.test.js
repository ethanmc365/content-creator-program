import { describe, it, expect } from 'vitest'
import { makeAgreementsApi } from './agreements'
import { recordingClient } from './recorder.test-helper'

describe('agreements api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeAgreementsApi(client)
    await api.agreementTranslations()
    await api.agreements()
    await api.guardianConsents()
    await api.acceptAgreement({ x: 1 })
    await api.agreementForMe({ x: 1 })
    await api.agreementPreview({ x: 1 })
    await api.agreementRegister({ x: 1 })
    await api.agreementSignedCopy({ x: 1 })
    await api.guardianConsentConfirm({ x: 1 })
    await api.guardianConsentView({ x: 1 })
    await api.myAgreementContext({ x: 1 })
    await api.myAgreements({ x: 1 })
    await api.myGuardianLinks({ x: 1 })
    await api.myPendingAgreements({ x: 1 })
    await api.publishAgreement({ x: 1 })
    expect(calls).toEqual([
      ['from', 'agreement_translations'],
      ['from', 'agreements'],
      ['from', 'guardian_consents'],
      ['rpc', 'accept_agreement', { x: 1 }],
      ['rpc', 'agreement_for_me', { x: 1 }],
      ['rpc', 'agreement_preview', { x: 1 }],
      ['rpc', 'agreement_register', { x: 1 }],
      ['rpc', 'agreement_signed_copy', { x: 1 }],
      ['rpc', 'guardian_consent_confirm', { x: 1 }],
      ['rpc', 'guardian_consent_view', { x: 1 }],
      ['rpc', 'my_agreement_context', { x: 1 }],
      ['rpc', 'my_agreements', { x: 1 }],
      ['rpc', 'my_guardian_links', { x: 1 }],
      ['rpc', 'my_pending_agreements', { x: 1 }],
      ['rpc', 'publish_agreement', { x: 1 }],
    ])
  })
})
