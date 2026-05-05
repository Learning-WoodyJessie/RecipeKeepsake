'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Person = { id: string; name: string; relationship: string; emoji?: string }

export default function NarratorChip({ selected, onSelect }: { selected: string; onSelect: (name: string) => void }) {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => { api.people.list().then(setPeople).catch(() => {}) }, [])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {people.map(p => (
        <button key={p.id} onClick={() => onSelect(p.name)} style={{
          padding: '0.35rem 0.85rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', border: '1px solid',
          borderColor: selected === p.name ? 'var(--accent)' : 'var(--border)',
          background: selected === p.name ? 'var(--accent-light)' : 'var(--surface)',
          color: selected === p.name ? 'var(--accent)' : 'var(--text2)',
        }}>
          {p.emoji ?? '👤'} {p.name}
        </button>
      ))}
      {people.length === 0 && (
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>No narrators yet — add one in People</span>
      )}
    </div>
  )
}
