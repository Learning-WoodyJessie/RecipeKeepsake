'use client'
import Link from 'next/link'
import WaveformBars from './WaveformBars'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  tags?: string[] | null
}

function isAudio(m: Memory) { return (m.tags ?? []).includes('audio') }

export default function MemoryCard({
  memory,
  variant = 'default',
}: {
  memory: Memory
  /** `poster`: image + title + narrator only (cherished-recipe tiles). */
  variant?: 'default' | 'poster'
}) {
  const poster = variant === 'poster'
  const audio = isAudio(memory)
  return (
    <Link href={`/memory?token=${memory.token}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.15s', cursor: 'pointer' }}>
        <div style={{ aspectRatio: poster ? '3/4' : '4/3', background: audio ? 'linear-gradient(135deg, #FAE8D4 0%, #F0C9A0 100%)' : 'var(--cream2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {audio
            ? <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            : memory.image_url
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
