'use client'
import Link from 'next/link'
import WaveformBars from './WaveformBars'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
}

export default function MemoryCard({
  memory,
  variant = 'default',
}: {
  memory: Memory
  /** `poster`: image + title + narrator only (cherished-recipe tiles). */
  variant?: 'default' | 'poster'
}) {
  const poster = variant === 'poster'
  return (
    <Link href={`/memory?token=${memory.token}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.15s', cursor: 'pointer' }}>
        <div style={{ aspectRatio: poster ? '3/4' : '4/3', background: 'var(--cream2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '2.5rem' }}>🍽️</span>
          }
        </div>
        <div style={{ padding: poster ? '0.75rem 0.85rem' : '0.85rem' }}>
          <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: poster ? '0.88rem' : '0.95rem', marginBottom: poster ? '0.25rem' : '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {memory.dish_name ?? 'Untitled'}
          </p>
          {!poster && (
            <>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                {memory.narrator ?? 'Narrator'} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <WaveformBars token={memory.token} barCount={20} />
            </>
          )}
          {poster && (
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {memory.narrator ?? 'Narrator'}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
