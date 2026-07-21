'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

const DONE_KEY = 'familyGroupCreated'

export default function FamilySetupPrompt() {
  const [visible, setVisible] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DONE_KEY) === '1') return
    const t = setTimeout(() => {
      api.family.getMyGroup()
        .then((d: { group: unknown }) => {
          if (d.group) {
            // Already has a group — mark done silently, never show
            if (typeof window !== 'undefined') localStorage.setItem(DONE_KEY, '1')
          } else {
            setVisible(true)
          }
        })
        .catch(() => {
          // API unreachable — show the prompt anyway so users aren't stuck
          setVisible(true)
        })
    }, 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 50)
  }, [visible])

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name for your family.'); return }
    setCreating(true)
    setError('')
    try {
      await api.family.createGroup(trimmed)
      localStorage.setItem(DONE_KEY, '1')
      setVisible(false)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        padding: '0 0 env(safe-area-inset-bottom, 0px)',
      }}
      onClick={() => setVisible(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '16px 16px 0 0',
          width: '100%', maxWidth: 520,
          padding: '1.5rem 1.5rem 2rem',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.25rem' }} />

        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 0.35rem' }}>
          One quick step
        </p>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--serif)' }}>
          Name your family collection
        </h2>
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Give your family a name so you can share memories with them using a private invite link.
        </p>

        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') create() }}
          placeholder="e.g. Lakshmi Family"
          style={{
            width: '100%', border: '2px solid var(--accent)', borderRadius: 10,
            padding: '0.65rem 0.9rem', fontSize: '1rem', fontFamily: 'var(--sans)',
            background: 'var(--cream)', color: 'var(--text)', boxSizing: 'border-box',
            outline: 'none', marginBottom: error ? '0.4rem' : '1rem',
          }}
        />
        {error && <p style={{ color: 'var(--accent)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>{error}</p>}

        <button
          type="button"
          onClick={create}
          disabled={creating}
          style={{
            width: '100%', background: 'var(--accent)', color: 'white', border: 'none',
            borderRadius: 10, padding: '0.72rem', fontWeight: 700,
            fontSize: '0.95rem', cursor: creating ? 'default' : 'pointer',
          }}
        >
          {creating ? 'Creating…' : 'Create family →'}
        </button>
      </div>
    </div>
  )
}
