'use client'
import { useState } from 'react'
import { api } from '../lib/api'

const EMOJIS = ['❤️', '🙏', '😢', '😄'] as const

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

  async function toggle(emoji: string) {
    const reacted = userReactions.has(emoji)
    // Optimistic update
    const nextCounts = { ...counts, [emoji]: (counts[emoji] ?? 0) + (reacted ? -1 : 1) }
    const nextUser = new Set(userReactions)
    if (reacted) nextUser.delete(emoji); else nextUser.add(emoji)
    setCounts(nextCounts)
    setUserReactions(nextUser)
    try {
      const res = await api.reactions.toggle(token, emoji) as ReactionData
      setCounts(res.counts)
      setUserReactions(new Set(res.user_reactions))
    } catch {
      // Revert on failure
      setCounts(counts)
      setUserReactions(userReactions)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
      {EMOJIS.map(emoji => {
        const active = userReactions.has(emoji)
        const count = counts[emoji] ?? 0
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.65rem',
              borderRadius: 20,
              cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-light, rgba(180,130,60,0.12))' : 'var(--surface)',
              fontSize: '1rem',
              fontFamily: 'var(--sans)',
              transition: 'border-color 0.12s, background 0.12s',
            }}
          >
            {emoji}
            {count > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: active ? 'var(--accent)' : 'var(--text2)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
