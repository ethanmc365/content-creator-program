import { useState, useEffect, useCallback, useRef } from 'react'
import { _setConfirmHandler } from '../lib/confirm'

// Branded, non-suppressible replacement for window.confirm(). Mounted once in
// App.jsx; it registers the handler that lib/confirm.js's confirm() drives.
export default function ConfirmHost() {
  const [state, setState] = useState(null) // { message, options }
  const resolveRef = useRef(null)

  useEffect(() => {
    _setConfirmHandler(
      (message, options = {}) =>
        new Promise((resolve) => {
          resolveRef.current = resolve
          setState({ message, options })
        })
    )
    return () => _setConfirmHandler(null)
  }, [])

  const close = useCallback((result) => {
    setState(null)
    const r = resolveRef.current
    resolveRef.current = null
    if (r) r(result)
  }, [])

  useEffect(() => {
    if (!state) return
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      else if (e.key === 'Enter') { e.preventDefault(); close(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [state, close])

  if (!state) return null

  const { message, options } = state
  const danger =
    options.danger ??
    /\b(delete|remove|permanently|erase|suspend|decline)\b/i.test(message)
  const title = options.title ?? (danger ? 'Are you sure?' : 'Please confirm')
  const confirmLabel = options.confirmLabel ?? (danger ? 'Delete' : 'Confirm')
  const cancelLabel = options.cancelLabel ?? 'Cancel'

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cancel" className="absolute inset-0 bg-ink/40" onClick={() => close(false)} />
      <div className="relative w-full rounded-t-card bg-white p-6 shadow-lift animate-fade-up sm:max-w-md sm:rounded-card sm:p-7">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-smoke">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => close(false)} className="btn-secondary !py-2.5 text-sm">{cancelLabel}</button>
          <button onClick={() => close(true)} autoFocus className={`${danger ? 'btn-danger' : 'btn-primary'} !py-2.5 text-sm`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
