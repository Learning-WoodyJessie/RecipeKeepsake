'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'

export type FamilyGroupResult = {
  group: { id: string; name: string; portal_token: string; invite_token: string }
  portal_url: string
  invite_url: string
}

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (result: FamilyGroupResult) => void
}

// Only ever opened by a user action (never on load): asking for a family name
// before someone has seen the app is a Sign in with Apple HIG anti-pattern
// ("delay sign-in as long as possible", "engage before asking for optional
// data") and left reviewers staring at an unexplained blocking overlay.
export default function FamilyGroupSheet({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setError('')
    const previouslyFocused = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !creating) {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, input, [href]'),
      ).filter(el => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, creating, onClose])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name for your family.'); return }
    setCreating(true)
    setError('')
    try {
      const result = await api.family.createGroup(trimmed) as FamilyGroupResult
      onCreated(result)
      onClose()
    } catch (err: unknown) {
      const message = (err as Error).message
      // Already in a group (e.g. created on another device): that's the outcome
      // they wanted, so pick up the existing group instead of showing an error.
      if (message.includes('Already in a family group')) {
        try {
          const existing = await api.family.getMyGroup() as FamilyGroupResult & { group: FamilyGroupResult['group'] | null }
          if (existing.group) { onCreated(existing); onClose(); return }
        } catch { /* fall through to the original message */ }
      }
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        padding: '0 0 env(safe-area-inset-bottom, 0px)',
      }}
      onClick={() => { if (!creating) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-sheet-title"
        aria-describedby="family-sheet-desc"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--surface)', borderRadius: '16px 16px 0 0',
          width: '100%', maxWidth: 520,
          padding: '1.5rem 1.5rem 2rem',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={creating}
          style={{
            position: 'absolute', top: 6, right: 6, width: 44, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 0.35rem' }}>
          Optional
        </p>
        <h2 id="family-sheet-title" style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--serif)' }}>
          Invite your family
        </h2>
        <p id="family-sheet-desc" style={{ margin: '0 0 1.1rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Name your family collection to get a private link you can share. Anyone you invite can listen to your memories and add their own. You can also do this later from Account.
        </p>

        <form onSubmit={create}>
          <label htmlFor="family-sheet-name" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', margin: '0 0 0.35rem' }}>
            Family name
          </label>
          <input
            id="family-sheet-name"
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Lakshmi Family"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'family-sheet-error' : undefined}
            style={{
              width: '100%', border: '2px solid var(--accent)', borderRadius: 10,
              padding: '0.65rem 0.9rem', fontSize: '1rem', fontFamily: 'var(--sans)',
              background: 'var(--cream)', color: 'var(--text)', boxSizing: 'border-box',
              outline: 'none', marginBottom: error ? '0.4rem' : '1rem',
            }}
          />
          {error && (
            <p id="family-sheet-error" role="alert" style={{ color: 'var(--accent)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            style={{
              width: '100%', minHeight: 48, background: 'var(--accent)', color: 'white', border: 'none',
              borderRadius: 10, padding: '0.72rem', fontWeight: 700,
              fontSize: '0.95rem', cursor: creating ? 'default' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Create family collection'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            style={{
              width: '100%', minHeight: 44, marginTop: '0.35rem', background: 'transparent', border: 'none',
              color: 'var(--muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
