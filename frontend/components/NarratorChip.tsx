'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Person = { id: string; name: string; relationship: string; emoji?: string }

export default function NarratorChip({ selected, onSelect }: { selected: string; onSelect: (name: string) => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.people.list().then(setPeople).catch(() => {}) }, [])

  async function addPerson() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const created = await api.people.create({ name })
      setPeople(prev => [...prev, created])
      onSelect(created.name)
      setAdding(false)
      setNewName('')
    } catch {
      // Leave the inline form open with whatever was typed so it isn't lost
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addPerson() }}
          placeholder="Their name…"
          style={{ border: '1.5px solid var(--accent)', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', width: 140 }}
        />
        <button
          type="button"
          onClick={addPerson}
          disabled={saving || !newName.trim()}
          style={{ padding: '0.35rem 0.75rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600, border: 'none', background: 'var(--accent)', color: 'white', cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => { setAdding(false); setNewName('') }}
          style={{ padding: '0.35rem 0.6rem', borderRadius: 99, fontSize: '0.8rem', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    )
  }

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
      {/* Always available, not just when the list is empty - someone new to
          record for shouldn't require leaving this page to go add them in
          People first, then coming back and re-finding this chip row. */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{
          padding: '0.35rem 0.85rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
          border: '1.5px dashed var(--border2)', background: 'transparent', color: 'var(--muted)',
        }}
      >
        + New person
      </button>
    </div>
  )
}
