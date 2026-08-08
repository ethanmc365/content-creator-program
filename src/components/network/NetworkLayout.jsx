import MarketSwitcher, { flagFromIso } from './MarketSwitcher'

// Frame for the network pages that are ABOUT choosing and comparing places:
// the Worldwide hub, a market's home, a market's settings.
//
// Pages that are about being somewhere rather than choosing somewhere (chat,
// most obviously) deliberately do NOT use this. A switcher above a conversation
// makes the conversation feel like a tab in a directory instead of a room you
// are in.
//
// `switcher={false}` exists for the pages that want the width but not the
// chrome.
export default function NetworkLayout({ children, switcher = true, width = 'default' }) {
  const max = width === 'wide' ? 'max-w-6xl' : 'max-w-4xl'
  return (
    <div className={`mx-auto w-full ${max} px-4 py-6 lg:py-8`}>
      {switcher && <MarketSwitcher />}
      {children}
    </div>
  )
}

export { flagFromIso }
