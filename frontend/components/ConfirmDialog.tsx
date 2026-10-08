'use client'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

// In-page replacement for window.confirm(): WebViews and embedded browsers can
// suppress native JS dialogs, in which case confirm() returns false without
// showing anything and a destructive button silently does nothing. Focus starts
// on Cancel so Enter/Space can't trigger the destructive action by accident.
export default function ConfirmDialog({ open, title, message, confirmLabel, busy = false, error, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button')).filter(el => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
      onClick={() => { if (!busy) onCancel() }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 420,
          padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h2 id="confirm-dialog-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--serif)' }}>
          {title}
        </h2>
        <p id="confirm-dialog-message" style={{ margin: '0 0 1.1rem', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.6 }}>
          {message}
        </p>
        {error && (
          <p role="alert" style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: '#B3261E', lineHeight: 1.5 }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              minHeight: 44, padding: '0.55rem 1.1rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
              background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              minHeight: 44, padding: '0.55rem 1.25rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
              background: '#B3261E', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.9rem',
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
