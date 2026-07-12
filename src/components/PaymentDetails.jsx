import Icon from './Icon'
import { formatSortCode, cleanDigits } from '../lib/invoice'

// Bank details for prize payouts. Creators pick pounds or euros and the
// form asks for exactly what that payment rail needs:
//   GBP (UK Faster Payments)  -> sort code + account number
//   EUR (SEPA transfer)       -> IBAN (+ optional BIC / SWIFT)
// Reused by the admin invoice composer, so `compact` trims the helper copy.
export default function PaymentDetailsFields({ value, onChange, compact = false }) {
  const p = value
  const set = (patch) => onChange({ ...p, ...patch })
  const gbp = p.currency !== 'EUR'

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="flex items-start gap-3 rounded-xl bg-brand-tint px-4 py-3">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-xs leading-relaxed text-smoke">
            Private. Only you and the Tryp.com team can see these details.
            We use them to pay your cash prizes, so double-check every digit.
          </p>
        </div>
      )}

      <div>
        <p className="label">How would you like to be paid?</p>
        <div className="flex gap-2">
          {[
            { code: 'GBP', label: '£ Pounds', hint: 'UK bank account' },
            { code: 'EUR', label: '€ Euros', hint: 'SEPA / IBAN' },
          ].map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => set({ currency: c.code })}
              className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card ${
                p.currency === c.code ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'
              }`}
            >
              <span className={`block text-sm font-semibold ${p.currency === c.code ? 'text-brand' : ''}`}>{c.label}</span>
              <span className="block text-xs text-smoke">{c.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {p.currency && (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="pay-name" className="label">Account holder name</label>
              <input
                id="pay-name" type="text" className="input" autoComplete="off"
                placeholder="Full name on the account"
                value={p.name} onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="pay-bank" className="label">Bank name</label>
              <input
                id="pay-bank" type="text" className="input" autoComplete="off"
                placeholder={gbp ? 'e.g. Monzo' : 'e.g. N26'}
                value={p.bank} onChange={(e) => set({ bank: e.target.value })}
              />
            </div>
          </div>

          {gbp ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="pay-sort" className="label">Sort code</label>
                <input
                  id="pay-sort" type="text" inputMode="numeric" className="input" autoComplete="off"
                  placeholder="12-34-56" maxLength={8}
                  value={formatSortCode(p.sortCode)}
                  onChange={(e) => set({ sortCode: cleanDigits(e.target.value).slice(0, 6) })}
                />
              </div>
              <div>
                <label htmlFor="pay-acct" className="label">Account number</label>
                <input
                  id="pay-acct" type="text" inputMode="numeric" className="input" autoComplete="off"
                  placeholder="8 digits" maxLength={8}
                  value={p.accountNumber}
                  onChange={(e) => set({ accountNumber: cleanDigits(e.target.value).slice(0, 8) })}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="pay-iban" className="label">IBAN</label>
                <input
                  id="pay-iban" type="text" className="input uppercase" autoComplete="off"
                  placeholder="e.g. IE64 IRCE 9205 0112 3456 78"
                  value={p.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label htmlFor="pay-bic" className="label">BIC / SWIFT</label>
                <input
                  id="pay-bic" type="text" className="input uppercase" autoComplete="off"
                  placeholder="8 or 11 characters"
                  value={p.bic} onChange={(e) => set({ bic: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="pay-address" className="label">Billing address</label>
            <textarea
              id="pay-address" rows={2} className="input" autoComplete="off"
              placeholder="Street, city, postcode, country"
              value={p.address} onChange={(e) => set({ address: e.target.value })}
            />
            {!compact && <p className="mt-1 text-xs text-smoke">Shown on your invoice as the payee address.</p>}
          </div>
        </>
      )}
    </div>
  )
}
