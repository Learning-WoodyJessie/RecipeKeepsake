'use client'

import Link from 'next/link'
import WaveformBars from './WaveformBars'

export type MemoryRow = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
}

function initialFromName(name: string | null): string {
  const s = (name ?? '?').trim()
  return s ? s[0]!.toUpperCase() : '?'
}

function pseudoDuration(token: string): string {
  let n = 0
  for (let i = 0; i < token.length; i++) n += token.charCodeAt(i)
  const sec = 95 + (n % 220)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MemoryListRow({
  memory,
  favorite,
  onToggleFavorite,
}: {
  memory: MemoryRow
  favorite: boolean
  onToggleFavorite: () => void
}) {
  const duration = pseudoDuration(memory.token)
  const title = memory.title ?? 'Untitled memory'
  const sub = `${memory.narrator ?? 'Narrator'} · ${new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        width: '100%',
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          fontFamily: 'var(--serif)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initialFromName(memory.narrator ?? memory.title)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </p>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 8 }}>{sub}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <WaveformBars token={memory.token} barCount={18} />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{duration}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
          onClick={(e) => {
            e.preventDefault()
            onToggleFavorite()
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.1rem',
            lineHeight: 1,
            color: favorite ? 'var(--amber)' : 'var(--border2)',
          }}
        >
          {favorite ? '♥' : '♡'}
        </button>
        <Link
          href={`/memory?token=${memory.token}`}
          aria-label={`Play ${title}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            fontSize: '0.75rem',
          }}
        >
          ▶
        </Link>
      </div>
    </div>
  )
}
