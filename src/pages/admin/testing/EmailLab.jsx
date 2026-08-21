import { useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { LabPage, Panel, Note, Choice, KeyVal, Code, Runner, useNow } from './kit'
import { APPLICANT, CREATORS, CHALLENGE, iso } from './fixtures'
import { invoiceRef, invoiceMoney } from '../../../lib/invoice'

// EMAIL, AND WHY THERE IS SO LITTLE OF IT.
//
// This platform used to send a lot of email and it was a mistake. Sending bulk
// mail from a personal Gmail account got the programme filtered as unsolicited
// mail within one broadcast, and the fixes people reach for first - a real
// plain-text part, an unsubscribe header, a gap between sends - are not the
// problem. The problem is the sending domain.
//
// So the whole broadcast system was torn out and email now does exactly two
// jobs, both of which the recipient is already expecting: a password reset they
// just asked for, and one welcome when they are accepted. A third, the invoice,
// is raised by an admin pressing send.
//
// This lab renders all of them. The templates are described here rather than
// imported because the real ones are Deno files that run on the edge, and
// pulling a server template into the browser bundle to look at it would be a
// worse trade than keeping the copy in step by eye.

const BRAND = '#d94407'

export default function EmailLab() {
  const now = useNow()
  const [which, setWhich] = useState('welcome')
  const creator = CREATORS[0]

  const TEMPLATES = {
    welcome: {
      label: 'Welcome',
      status: 'live',
      to: `${APPLICANT.name} <${APPLICANT.email}>`,
      subject: `Welcome to the Tryp.com Content Creator Program, ${APPLICANT.name.split(' ')[0]}`,
      when: 'Queued the moment an application is approved. Held for an admin to read before it goes.',
      body: (
        <>
          <p>Hi {APPLICANT.name.split(' ')[0]},</p>
          <p>
            You are in. Welcome to the Tryp.com Content Creator Program, a global community of travel
            creators who make great content, compete in challenges and earn real rewards.
          </p>
          <p>
            Your profile is live, there is a challenge running right now, and the rooms are open. The
            quickest way in is to say hello and to read the current brief.
          </p>
          <p><Cta>Open the community</Cta></p>
          <p>See you in there,<br />The Tryp.com Team</p>
        </>
      ),
    },
    reset: {
      label: 'Password reset',
      status: 'live',
      to: `${creator.name} <maya@example.com>`,
      subject: 'Reset your Tryp.com Creator Program password',
      when: 'Sent by Supabase Auth the moment somebody asks for it, over our own SMTP.',
      body: (
        <>
          <p>Hi {creator.name.split(' ')[0]},</p>
          <p>Somebody asked to reset the password on this account. If it was not you, nothing has changed and you can ignore this.</p>
          <p><Cta>Choose a new password</Cta></p>
          <p>This link expires in one hour and can only be used once.</p>
        </>
      ),
    },
    invoice: {
      label: 'Invoice',
      status: 'live',
      to: 'finance@tryp.com',
      subject: `${invoiceRef(47)} - ${creator.name} - ${invoiceMoney(250, 'GBP')}`,
      when: 'Sent by an admin from the rewards page, and only after a second admin has approved it.',
      attachment: `Tryp.com-047-${creator.name.replace(/\s+/g, '-')}.pdf`,
      body: (
        <>
          <p>Invoice attached for {creator.name}.</p>
          <p>
            {CHALLENGE.title}, first place prize. {invoiceMoney(250, 'GBP')}, payable within seven days
            of the issue date to the account on the invoice.
          </p>
          <p>Raised and approved in the Tryp.com Content Creator Program.</p>
        </>
      ),
    },
    declined: {
      label: 'Not accepted',
      status: 'in the app only',
      to: `${APPLICANT.name} <${APPLICANT.email}>`,
      subject: 'About your Tryp.com Creator Program application',
      when: 'Shown on screen rather than emailed. A declined applicant sees it the moment they log in.',
      body: (
        <>
          <p>Hi {APPLICANT.name.split(' ')[0]},</p>
          <p>
            Thanks so much for your interest in the Tryp.com Content Creator Program. Unfortunately your
            application was not successful this time. We are sorry, and we truly appreciate you taking
            the time to apply.
          </p>
        </>
      ),
    },
    birthday: {
      label: 'Birthday card',
      status: 'in the app only',
      to: `${creator.name}`,
      subject: `Happy birthday, ${creator.name.split(' ')[0]}`,
      when: 'A scheduled job at 07:00 posts a card into the room. It is not an email and it never was.',
      body: (
        <>
          <p>Posted into the room as a card the whole community can see, rather than sent privately.</p>
          <p>A birthday message from forty people is worth something. The same message in an inbox is not.</p>
        </>
      ),
    },
    nudge: {
      label: 'We have not seen you',
      status: 'push only',
      to: `${CREATORS[5].name}`,
      subject: 'There is a live challenge you can still enter',
      when: 'The inactive-creator job at 08:00. It writes a notification, and a push if they have a device registered.',
      body: (
        <>
          <p>Deliberately not an email.</p>
          <p>
            A nudge nobody asked for, sent to an inbox, is the exact category of mail that got the
            programme filtered in the first place. In the app it is a bell with a number on it.
          </p>
        </>
      ),
    },
  }

  const t = TEMPLATES[which]

  const pipeline = [
    { key: 'approve', actor: 'admin', title: 'An application is approved', detail: 'Status moves from pending to active. That single change is the trigger.' },
    {
      key: 'queue', actor: 'db', title: 'A trigger queues the welcome email',
      detail: 'It skips admins and test accounts, and it resolves the name AT QUEUE TIME so the reviewing admin reads real words rather than a placeholder.',
      tech: "trg_creator_welcome_email on profiles update\n  when: old.status = 'pending' and new.status = 'active'\n  ->  insert into email_outbox (recipient_id, recipient_name, subject, body)",
    },
    {
      key: 'hold', actor: 'guard', title: 'Nothing sends yet',
      detail: 'It sits on the email page waiting for a person. A batch of approvals must not turn into a batch of mistakes in somebody\'s inbox.',
    },
    { key: 'read', actor: 'admin', title: 'An admin reads it, edits it if needed, and presses send', detail: 'They can change the subject, the body and the button. They cannot change who it goes to.' },
    {
      key: 'send', actor: 'email', title: 'The edge function sends it',
      detail: 'It verifies the caller is an admin, then resolves the recipient FROM THE QUEUED ROW rather than from anything the browser sent. That is the part that matters.',
      tech: 'send-welcome:\n  verify JWT (JWKS)\n  re-check profiles.is_admin\n  recipient = outbox_row.recipient_id   // never from the client\n  mark sent, write email_send_log',
    },
    { key: 'log', actor: 'db', title: 'Logged', detail: 'Who, what kind, when. The log records the request, and it is the only truth: the interface always says the mail is on its way.' },
  ]

  return (
    <LabPage
      title="Email"
      icon="envelope"
      subtitle="Six things the platform could send and the two and a half it actually does. Every template rendered as it arrives, plus the review queue that stands between an approval and somebody's inbox."
    >
      <Panel title="Pick a message" hint="Three of these are real emails. Three are things people assume are emails and deliberately are not.">
        <Choice options={Object.entries(TEMPLATES).map(([k, v]) => ({ value: k, label: v.label }))} value={which} onChange={setWhich} />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Badge tone={t.status === 'live' ? 'green' : 'grey'}>{t.status}</Badge>
          <p className="text-xs text-smoke">{t.when}</p>
        </div>
      </Panel>

      <Panel title="As it arrives" tone="quiet">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-card border border-gray-200 bg-white shadow-card">
          <div className="space-y-1 border-b border-gray-100 bg-cloud/50 px-5 py-4 text-xs">
            <Head label="From" value="Tryp.com Content Creator Program" />
            <Head label="To" value={t.to} />
            <Head label="Subject" value={t.subject} bold />
            <Head label="Date" value={new Date(iso(0, now)).toUTCString()} />
            {t.attachment && (
              <p className="flex items-center gap-1.5 pt-1 text-smoke">
                <Icon name="copy" className="h-3.5 w-3.5" />
                {t.attachment}
              </p>
            )}
          </div>

          {/* The 600px table layout the real template uses, with a TEXT
              wordmark rather than an image, because mail clients block remote
              images by default and a logo that does not load is a broken box
              at the top of the first thing a new creator ever gets from us. */}
          <div className="bg-cloud/40 px-4 py-6">
            <div className="mx-auto max-w-[600px] overflow-hidden rounded-xl bg-white shadow-card">
              <div className="px-8 py-5" style={{ backgroundColor: BRAND }}>
                <p className="text-lg font-bold tracking-tight text-white">Tryp.com</p>
                <p className="text-[11px] tracking-[0.2em] text-white/80">CONTENT CREATOR PROGRAM</p>
              </div>
              <div className="space-y-4 px-8 py-7 text-sm leading-relaxed text-ink [&_p]:text-smoke [&_p:first-child]:text-ink [&_p:first-child]:font-semibold">
                {t.body}
              </div>
              <div className="border-t border-gray-100 px-8 py-5 text-[11px] leading-relaxed text-smoke">
                <p>Tryp.com Content Creator Program</p>
                <p className="mt-1">You are receiving this because you are a member of the programme.</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="The welcome email, from approval to inbox" hint="Six steps, and one of them is a person reading it.">
        <Runner steps={pipeline} autoMs={900} />
      </Panel>

      <Panel
        title="Why there is so little of it"
        hint="This is the honest version, and it is worth telling: the constraint is real and the response to it was to send less, not to send it louder."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Note tone="warn" icon="alert">
              <p className="font-semibold">One broadcast was enough.</p>
              <p>
                The first real mass send produced bounces reading "Gmail has detected this message as
                unsolicited mail". That is the outbound filter on a personal sending account, and it gets
                worse as the roster grows, not better.
              </p>
            </Note>
            <Note>
              <p className="font-semibold text-ink">What was tried and did not work.</p>
              <p>
                A genuine plain-text part, an unsubscribe header, a reply-to address, a gap between
                sends. All correct, none sufficient. The sending domain is the whole problem.
              </p>
            </Note>
            <Note tone="good" icon="check">
              <p className="font-semibold">What was done instead.</p>
              <p>
                The broadcast system was removed rather than left switched off, and the old mass sender
                was deployed over with a function that refuses. Email was cut to the messages a person is
                waiting for. Everything else became push and the in-app bell.
              </p>
            </Note>
          </div>
          <div className="space-y-4">
            <KeyVal
              rows={[
                ['Emails the platform sends', 'Three'],
                ['Automatically, with no person', 'Password resets only'],
                ['Reviewed by a person first', 'Welcome emails'],
                ['Raised by an admin', 'Invoices'],
                ['Broadcast email', 'Removed'],
                ['How everyone is reached now', 'The announcements room, then push and the bell'],
                ['The unblock', 'A sending domain of our own with DKIM, SPF and MX'],
              ]}
            />
            <Code>{`broadcast-email  ->  410 Gone

Deployed OVER the old mass sender rather than
deleted: removing the directory would have left
the previous version live and reachable by any
admin who still had the URL.`}</Code>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}

function Head({ label, value, bold }) {
  return (
    <p className="flex gap-3">
      <span className="w-14 shrink-0 text-smoke">{label}</span>
      <span className={bold ? 'font-semibold' : ''}>{value}</span>
    </p>
  )
}

function Cta({ children }) {
  return (
    <span
      className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
      style={{ backgroundColor: BRAND }}
    >
      {children}
    </span>
  )
}
