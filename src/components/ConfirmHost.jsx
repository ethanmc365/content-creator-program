import { useState, useEffect, useCallback, useRef } from 'react'
import { _setConfirmHandler } from '../lib/confirm'

// Branded, non-suppressible replacement for window.confirm(). Mounted once in
// App.jsx; it registers the handler that lib/confirm.js's confirm() drives.
export default function ConfirmHost() {
  const [state, setState] = useState(null) // { message, options }
  const [value, setValue] = useState('')
  const resolveRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    _setConfirmHandler(
      (message, options = {}) =>
        new Promise((resolve) => {
          resolveRef.current = resolve
          setValue(options.prompt ? (options.defaultValue ?? '') : '')
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

  const isPrompt = state?.options?.prompt === true

  // Confirming a prompt returns the trimmed text (or null if empty); confirming a
  // plain dialog returns true.
  const submit = useCallback(() => {
    if (isPrompt) {
      const v = value.trim()
      close(v ? v : null)
    } else {
      close(true)
    }
  }, [isPrompt, value, close])

  useEffect(() => {
    if (!state) return
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(isPrompt ? null : false) }
      else if (e.key === 'Enter' && !isPrompt) { e.preventDefault(); close(true) }
    }
    document.addEventListener('keydown', onKey)
    // Focus the field when a prompt opens so the user can type straight away.
    if (isPrompt) setTimeout(() => inputRef.current?.focus(), 20)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [state, close, isPrompt])

  if (!state) return null

  const { message, options } = state
  const danger =
    options.danger ??
    (!isPrompt && /\b(delete|remove|permanently|erase|suspend|decline)\b/i.test(message))
  const title = options.title ?? (isPrompt ? 'Add a link' : danger ? 'Are you sure?' : 'Please confirm')
  const confirmLabel = options.confirmLabel ?? (isPrompt ? 'Add' : danger ? 'Delete' : 'Confirm')
  const cancelLabel = options.cancelLabel ?? 'Cancel'
  const noCancel = options.noCancel === true

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cancel" className="absolute inset-0 bg-ink/40" onClick={() => close(isPrompt ? null : false)} />
      <div className="relative w-full rounded-t-card bg-white p-6 shadow-lift animate-fade-up sm:max-w-md sm:rounded-card sm:p-7">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {message && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-smoke">{message}</p>}
        {isPrompt && (
          <input
            ref={inputRef}
            type={options.inputType ?? 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            placeholder={options.placeholder ?? 'https://…'}
            className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-gray-300 focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
          />
        )}
        <div className="mt-6 flex justify-end gap-2">
          {!noCancel && (
            <button onClick={() => close(isPrompt ? null : false)} className="btn-secondary !py-2.5 text-sm">{cancelLabel}</button>
          )}
          <button onClick={submit} autoFocus={!isPrompt} className={`${danger ? 'btn-danger' : 'btn-primary'} !py-2.5 text-sm`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
