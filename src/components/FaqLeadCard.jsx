import { Link } from 'react-router-dom'
import Icon from './Icon'
import { useT } from '../lib/i18n'

/** The card that leads Get help into these answers. */
export default function FaqLeadCard() {
  const tr = useT()
  return (
    <Link to="/help/faq" className="faq-hero group relative flex items-center gap-4 overflow-hidden rounded-card p-5 text-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
      <span aria-hidden className="faq-bubble faq-bubble-a !text-5xl">?</span>
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center text-3xl font-black">?</span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-lg font-extrabold leading-tight">{tr('Questions and answers')}</span>
        <span className="mt-0.5 block text-[13px] text-white/85">{tr('Most questions are answered here. Or ask your own.')}</span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  )
}
