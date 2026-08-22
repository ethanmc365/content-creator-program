import { useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { LabPage, Panel, Code, InfoList, Choice, KeyVal } from './kit'
import { CREATORS } from './fixtures'

// WHO CAN SEE WHAT, AND WHERE THAT IS ENFORCED.
//
// The question a chief executive asks about a platform holding forty five
// people's phone numbers and bank details, and the answer is only worth
// anything if it is a mechanism rather than a policy. "We are careful with it"
// is a policy. "The database refuses the query" is a mechanism.
//
// This is the one place in the Testing Centre with no moving parts to press,
// because the interesting claim is that there is nothing to press: a browser
// with a valid session and a determined person at the keyboard still cannot get
// somebody else's direct messages, because the refusal is not in the browser.

const ROLES = [
  { value: 'anon', label: 'A stranger' },
  { value: 'pending', label: 'A pending applicant' },
  { value: 'creator', label: 'An approved creator' },
  { value: 'admin', label: 'An admin' },
  { value: 'owner', label: 'The owner' },
]

// yes | own | no. `own` is the interesting one, and it is why an admin panel is
// not the same thing as an admin who can read everything.
const MATRIX = [
  { thing: 'The landing page numbers', anon: 'yes', pending: 'yes', creator: 'yes', admin: 'yes', owner: 'yes', how: 'Four anonymous read-only functions that return counts and coordinates, never a row.' },
  { thing: 'Room messages', anon: 'no', pending: 'no', creator: 'yes', admin: 'yes', owner: 'yes', how: 'Reads gated on active membership, checked inside a security definer function.' },
  { thing: 'Their own direct messages', anon: 'no', pending: 'no', creator: 'own', admin: 'own', owner: 'own', how: 'The two people in the conversation, and nobody else. There is no admin override and there is no way to add one from the app.' },
  { thing: "Somebody else's direct messages", anon: 'no', pending: 'no', creator: 'no', admin: 'no', owner: 'no', how: 'Refused by the row level security policy. Not hidden in the interface: refused by the database.' },
  { thing: 'Phone numbers', anon: 'no', pending: 'own', creator: 'own', admin: 'yes', owner: 'yes', how: 'A separate table, creator_private, that no creator policy can read across.' },
  { thing: 'Bank details', anon: 'no', pending: 'own', creator: 'own', admin: 'yes', owner: 'yes', how: 'Same table. Admins need them to pay people; creators never see another creator\'s.' },
  { thing: 'Date of birth', anon: 'no', pending: 'own', creator: 'no', admin: 'yes', owner: 'yes', how: 'The public profile shows an AGE. The date itself is never exposed.' },
  { thing: 'Email addresses', anon: 'no', pending: 'own', creator: 'no', admin: 'yes', owner: 'yes', how: 'Held by the auth system, surfaced to admins through a definer function that checks is_admin() first.' },
  { thing: 'The creator map', anon: 'yes', pending: 'no', creator: 'yes', admin: 'yes', owner: 'yes', how: 'Town-level only, and only for creators who have not opted out. A creator can take themselves off it in Settings.' },
  { thing: 'Invoices', anon: 'no', pending: 'no', creator: 'own', admin: 'yes', owner: 'yes', how: 'A creator sees their own. Approving one needs a second admin.' },
  { thing: 'Approving their own invoice', anon: 'no', pending: 'no', creator: 'no', admin: 'no', owner: 'yes', how: 'The owner is the single exception, so one person on their own is never completely blocked.' },
  { thing: 'Deleting an account permanently', anon: 'no', pending: 'own', creator: 'own', admin: 'no', owner: 'no', how: 'Only the person whose account it is, and then only after a thirty day grace period they can cancel.' },
]

export default function SecurityLab() {
  const [role, setRole] = useState('creator')

  const can = (row) => row[role]
  const yes = MATRIX.filter((r) => can(r) === 'yes').length
  const own = MATRIX.filter((r) => can(r) === 'own').length
  const no = MATRIX.filter((r) => can(r) === 'no').length

  return (
    <LabPage
      title="Who can see what"
      icon="shield"
      subtitle="Twelve things worth asking about, and who can reach each one. Every no on this page is enforced by the database rather than by the interface, which is the only kind of no that survives somebody opening the developer tools."
      aside={
        <div className="flex gap-2 text-center">
          {[['Can', yes, 'green'], ['Own only', own, 'amber'], ['Refused', no, 'grey']].map(([l, n, tone]) => (
            <div key={l} className="rounded-card border border-gray-200 bg-white px-3 py-2">
              <p className="text-lg font-bold tabular-nums">{n}</p>
              <Badge tone={tone} className="!px-2 !py-0 !text-[10px]">{l}</Badge>
            </div>
          ))}
        </div>
      }
    >
      <Panel i={0} title="Pick somebody" hint="The table below is the same twelve questions asked of a different account.">
        <Choice options={ROLES} value={role} onChange={setRole} />
      </Panel>

      <Panel i={1} title="What they can reach" tone="quiet">
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white">
          {MATRIX.map((r, i) => {
            const v = can(r)
            return (
              <div
                key={r.thing}
                className={
                  'flex flex-wrap items-start gap-4 px-4 py-3.5 transition-colors duration-300 ' +
                  (i > 0 ? 'border-t border-gray-50 ' : '') +
                  (v === 'no' ? 'bg-cloud/40' : '')
                }
              >
                <span className="mt-0.5 shrink-0">
                  {v === 'yes' && <Icon name="check" className="h-5 w-5 text-green-600" />}
                  {v === 'own' && <Icon name="key" className="h-5 w-5 text-amber-600" />}
                  {v === 'no' && <Icon name="ban" className="h-5 w-5 text-gray-300" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block text-sm font-semibold ' + (v === 'no' ? 'text-smoke' : '')}>{r.thing}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-smoke">{r.how}</span>
                </span>
                <Badge tone={v === 'yes' ? 'green' : v === 'own' ? 'amber' : 'grey'}>
                  {v === 'yes' ? 'Can see it' : v === 'own' ? 'Only their own' : 'Refused'}
                </Badge>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel i={2} title="Where the refusal actually happens" hint="Four layers, and only two of them matter.">
        <InfoList
          items={[
            { icon: 'eye', t: 'The interface hides it', d: 'Useful, and worth nothing on its own. A hidden button is a button somebody can still press with a keyboard and a network tab.' },
            { icon: 'shield', t: 'The route guard refuses the page', d: 'Better. It fails closed: a status it does not recognise is refused rather than allowed. Still only in the browser.' },
            { icon: 'key', t: 'The edge function re-checks', d: 'It verifies the token itself and re-reads the role from the database. Sending an invoice re-reads the stage; sending a welcome email resolves the recipient from the queued row and never from what the browser sent.' },
            { icon: 'chartPie', t: 'Row level security refuses the query', d: 'This is the one that counts. The policy runs inside Postgres, on every read and every write, for every client. There is no path around it, including ours.' },
          ]}
        />
        <Code className="mt-5">{`-- what a creator asking for everybody's messages actually gets
select * from direct_messages;
-->  0 rows

-- not an error, and that is deliberate. A refusal that says
-- "denied" confirms the rows exist. An empty result says nothing.`}</Code>
      </Panel>

      <Panel i={3} title="The things that are private on purpose" hint="Where a field lives is the decision. Once a column is on the public profile table, every read policy that can see the row can see the column.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-smoke">On the public profile</p>
            <div className="flex flex-wrap gap-1.5">
              {['name', 'photo', 'age', 'town', 'country', 'bio', 'about', 'quote', 'socials', 'languages', 'countries visited', 'bucket list'].map((f) => (
                <span key={f} className="rounded-full bg-cloud px-2.5 py-1 text-[11px] font-medium text-smoke">{f}</span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-smoke">
              Everything a creator would put on a public page anyway, and an AGE rather than a birthday.
            </p>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-smoke">In creator_private</p>
            <div className="flex flex-wrap gap-1.5">
              {['phone', 'dialling code', 'bank account holder', 'sort code', 'account number', 'IBAN', 'BIC', 'billing address'].map((f) => (
                <span key={f} className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-medium text-brand">{f}</span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-smoke">
              A different table with its own policies. Reachable by the creator and by an admin, and by
              no other creator under any circumstances.
            </p>
          </div>
        </div>
        <Code className="mt-6">{`-- RLS cannot hide one COLUMN of a row you are allowed to read.
-- That is why this is a separate TABLE and not a set of columns
-- on profiles with a clever policy. There is no clever policy.
--
-- The same reasoning gave entry feedback its own table, and moved
-- the public count of collaboration interests into a function
-- rather than exposing the rows it counts.`}</Code>
      </Panel>

      <Panel i={3} title="What a creator can do about their own data" hint="All of it self-service. None of it needs an email to anybody.">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Take themselves off the map', 'One switch in Settings. The map function filters on it.'],
            ['Download everything held about them', 'A single export, produced on demand.'],
            ['Change or remove any profile field', 'Including the photo and the phone number.'],
            ['Delete the account', 'Thirty day grace period they can cancel themselves, then the account and its files go together.'],
          ].map(([t, d]) => (
            <div key={t} className="flex items-start gap-3 rounded-card bg-cloud/60 px-4 py-3.5">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand/70" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-smoke">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <KeyVal
          className="mt-6"
          rows={[
            ['Controller', 'Tryp.com LDA, Lisbon'],
            ['Deletion grace period', '30 days, cancellable by the creator'],
            ['Test accounts on the platform', `Hidden from the community, the rosters and every list. ${CREATORS.length} people in this sandbox are not among them, because they do not exist at all`],
            ['Storage behind deleted content', 'Removed by a trigger, not by somebody remembering'],
          ]}
        />
      </Panel>
    </LabPage>
  )
}
