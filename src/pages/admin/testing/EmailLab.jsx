import { useState } from 'react'
import { Badge } from '../../../components/ui'
import { LabPage, Panel, Note, Choice, KeyVal, Code, Runner } from './kit'
import { RealEmail, DemoBirthdayCard, DemoMessage, DemoNotification, DemoPush } from './artefacts'
import { APPLICANT, CREATORS, CHALLENGE } from './fixtures'
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


export default function EmailLab() {
  const [which, setWhich] = useState('welcome')
  const creator = CREATORS[0]

  const TEMPLATES = {
    welcome: {
      label: 'Welcome',
      status: 'live',
      to: `${APPLICANT.name} <${APPLICANT.email}>`,
      subject: `Welcome to the Tryp.com Content Creator Program, ${APPLICANT.name.split(' ')[0]}`,
      title: `Welcome aboard, ${APPLICANT.name.split(' ')[0]}`,
      cta: 'Open the community',
      footerNote: 'You are receiving this because your application to the Content Creator Program was approved.',
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
          <p>See you in there,<br />The Tryp.com Team</p>
        </>
      ),
    },
    reset: {
      label: 'Password reset',
      status: 'live',
      to: `${creator.name} <maya@example.com>`,
      subject: 'Reset your Tryp.com Creator Program password',
      title: 'Reset your password',
      cta: 'Choose a new password',
      footerNote: 'If you did not ask for this, you can safely ignore it. Nothing has changed.',
      when: 'Sent by Supabase Auth the moment somebody asks for it, over our own SMTP.',
      body: (
        <>
          <p>Hi {creator.name.split(' ')[0]},</p>
          <p>Somebody asked to reset the password on this account. If it was not you, nothing has changed and you can ignore this.</p>
          <p>This link expires in one hour and can only be used once.</p>
        </>
      ),
    },
    invoice: {
      label: 'Invoice',
      status: 'live',
      to: 'finance@tryp.com',
      subject: `${invoiceRef(47)} - ${creator.name} - ${invoiceMoney(250, 'GBP')}`,
      title: `${invoiceRef(47)}`,
      footerNote: 'Raised in the Content Creator Program and approved by a second admin before sending.',
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
      when: 'Shown on screen rather than emailed. A declined applicant meets it the moment they log in, and it is the only screen they can reach.',
      artefact: (
        <div className="rounded-card border border-gray-100 bg-white p-8 shadow-card">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-4xl" aria-hidden>✈️</p>
            <h3 className="text-xl font-bold">Application not approved</h3>
            <p className="text-sm leading-relaxed text-smoke">
              Thanks so much for your interest in the Tryp.com Content Creator Program. Unfortunately your
              application was not successful this time. We&apos;re sorry, and we truly appreciate you
              taking the time to apply.
            </p>
            <span className="btn-ghost pointer-events-none text-sm">Log out</span>
          </div>
        </div>
      ),
    },
    birthday: {
      label: 'Birthday card',
      status: 'in the app only',
      when: 'The daily-birthday-cards job at 07:00 posts this into the room as a message. It is not an email and never was: a birthday message from forty people is worth something, and the same message in an inbox is not.',
      // NOT an email frame. This is the actual card the job posts, in the
      // actual place it lands.
      artefact: (
        <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-smoke">#general</p>
          <DemoMessage author="Tryp.com" when="07:00">
            <DemoBirthdayCard creator={creator} />
          </DemoMessage>
        </div>
      ),
    },
    nudge: {
      label: 'We have not seen you',
      status: 'push only',
      when: 'The inactive-creator-alerts job at 08:00 writes a notification, and a push as well if they have a device registered. Deliberately not an email: a nudge nobody asked for, sent to an inbox, is the exact category of mail that gets a sender filtered.',
      artefact: (
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-smoke">On the lock screen</p>
            <DemoPush
              title="There is a live challenge you can still enter"
              body={`${CHALLENGE.title} closes in three days.`}
              when="08:00"
            />
          </div>
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-smoke">And in the bell</p>
            <div className="rounded-card border border-gray-100 bg-white p-2 shadow-card">
              <DemoNotification
                type="inactive"
                title="We have not seen you in a while"
                body={`${CHALLENGE.title} closes in three days.`}
                when="08:00"
              />
            </div>
          </div>
        </div>
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

      <Panel
        title={t.artefact ? 'What actually happens' : 'As it arrives'}
        tone="quiet"
      >
        {/* THE ARTEFACT, NOT A DESCRIPTION OF IT.
            Three of these six are not emails, and they used to be rendered as
            a paragraph explaining that, INSIDE an email frame - a note to the
            reader wearing the costume of the thing it was describing. Now the
            birthday card is the birthday card, the nudge is a push and a bell
            row, and the declined message is the screen it appears on. */}
        <div className="mx-auto max-w-2xl">
          {t.artefact ?? (
            <RealEmail
              to={t.to}
              subject={t.subject}
              title={t.title ?? t.subject}
              cta={t.cta}
              footerNote={t.footerNote}
              attachment={t.attachment}
            >
              {t.body}
            </RealEmail>
          )}
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


