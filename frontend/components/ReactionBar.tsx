'use client'
import { useState, useRef } from 'react'
import { api } from '../lib/api'

const REACTIONS = [
  { emoji: '😊', label: 'Smiling' },
  { emoji: '🥹', label: 'Touched' },
  { emoji: '🏆', label: 'Proud' },
  { emoji: '🙏', label: 'Grateful' },
] as const

type ReactionData = {
  counts: Record<string, number>
  user_reactions: string[]
}

type Props = {
  token: string
  initialData: ReactionData
}

export default function ReactionBar({ token, initialData }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(initialData.counts)
  const [userReactions, setUserReactions] = useState<Set<string>>(
    new Set(initialData.user_reactions)
  )
  const [poppingEmoji, setPoppingEmoji] = useState<string | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function toggle(emoji: string) {
    const reacted = userReactions.has(emoji)
    const nextCounts = { ...counts, [emoji]: (counts[emoji] ?? 0) + (reacted ? -1 : 1) }
    const nextUser = new Set(userReactions)
    if (reacted) { nextUser.delete(emoji) } else { nextUser.add(emoji) }
    setCounts(nextCounts)
    setUserReactions(nextUser)

    if (!reacted) {
      if (popTimer.current) clearTimeout(popTimer.current)
      setPoppingEmoji(emoji)
      popTimer.current = setTimeout(() => setPoppingEmoji(null), 450)
    }

    try {
      const res = await api.reactions.toggle(token, emoji) as ReactionData
      setCounts(res.counts)
      setUserReactions(new Set(res.user_reactions))
    } catch {
      setCounts(counts)
      setUserReactions(userReactions)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      {REACTIONS.map(({ emoji, label }) => {
        const active = userReactions.has(emoji)
        const count = counts[emoji] ?? 0
        const isPopping = poppingEmoji === emoji
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.18rem',
              padding: '0.6rem 0.25rem 0.5rem',
              borderRadius: 12,
              cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-light)' : 'var(--cream)',
              transition: 'border-color 0.14s, background 0.14s, box-shadow 0.14s',
              boxShadow: active ? '0 3px 10px rgba(24,107,94,0.12)' : 'none',
            }}
          >
            <span
              className={isPopping ? 'rk-react-pop' : ''}
              style={{ fontSize: '1.35rem', lineHeight: 1, display: 'block' }}
            >
              {emoji}
            </span>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: active ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'var(--sans)',
              transition: 'color 0.14s',
            }}>
              {label}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: active ? 'var(--accent)' : 'transparent',
              minHeight: '13px',
              fontFamily: 'var(--sans)',
              transition: 'color 0.14s',
            }}>
              {count > 0 ? count : ' '}
            </span>
          </button>
        )
      })}
    </div>
  )
}
