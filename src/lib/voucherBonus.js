import { useEffect, useState } from 'react'
import { settingsApi } from '../api/settings'

// The bonus for taking a voucher instead of cash (migration 453, app_settings 'voucher_choice_bonus'). The creator side
// never reads this: the database works the value out. The team's screens read it to preview a conversion.
export const VOUCHER_BONUS_KEY = 'voucher_choice_bonus'
export const DEFAULT_BONUS = { enabled: true, tiers: [{ from: 0, bonus: 5 }, { from: 100, bonus: 10 }] }

/** The bonus a given cash amount gets under these settings (mirrors voucher_choice_bonus() in the database). */
export function bonusFor(settings, amount) {
  if (!settings?.enabled) return 0
  const tier = [...(settings.tiers || [])]
    .filter((t) => Number(t.from) <= Number(amount))
    .sort((a, b) => Number(b.from) - Number(a.from))[0]
  return tier ? Number(tier.bonus) : 0
}

export function useVoucherBonus() {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    let alive = true
    settingsApi.appSettings().select('value').eq('key', VOUCHER_BONUS_KEY).maybeSingle().then(({ data }) => {
      if (alive) setSettings(data?.value ?? DEFAULT_BONUS)
    })
    return () => { alive = false }
  }, [])
  return [settings, setSettings]
}
