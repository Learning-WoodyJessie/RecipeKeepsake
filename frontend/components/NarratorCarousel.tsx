'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

type Person = { id: string; name: string; relationship: string; emoji?: string; photo_url?: string }

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function NarratorCarousel({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (name: string) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { api.people.list().then(setPeople).catch(() => {}) }, [])

  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])

  const visible = search
    ? people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : people

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
      setSearchOpen(false)
    } catch {
      // keep form open
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        overflowX: 'auto',
        paddingBottom: '0.4rem',
        scrollbarWidth: 'none',
      }}>
        <style>{`.rk-carousel::-webkit-scrollbar{display:none}`}</style>
        {visible.map(p => {
          const sel = selected === p.name
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(sel ? '' : p.name)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0.2rem',
              }}
            >
              <div style={{
                width: 46, height: 46, borderRadius: '50%',
                border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                background: sel ? 'var(--accent-light)' : 'var(--cream2, #F3EDE4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', transition: 'border-color 0.15s',
              }}>
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: sel ? 'var(--accent)' : 'var(--text2)', fontFamily: 'var(--sans)' }}>
                    {initials(p.name)}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '0.7rem', fontFamily: 'var(--sans)',
                color: sel ? 'var(--accent)' : 'var(--text2)',
                fontWeight: sel ? 600 : 400,
                maxWidth: 50, textAlign: 'center', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.name}
              </span>
            </button>
          )
        })}

        {/* Search toggle */}
        <button
          type="button"
          onClick={() => { setSearchOpen(s => !s); setSearch('') }}
          title="Search people"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
            background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0.2rem',
          }}
        >
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '1.5px dashed var(--border2, #C8B89A)',
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--sans)', whiteSpace: 'nowrap' }}>
            Search
          </span>
        </button>
      </div>

      {searchOpen && (
        <div style={{ marginTop: '0.6rem' }}>
          <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
            <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type a name…"
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.5rem 0.8rem 0.5rem 2rem', fontSize: '0.85rem',
                fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {adding ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addPerson() }}
                placeholder="Their name…"
                style={{ border: '1.5px solid var(--accent)', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', width: 140 }}
              />
              <button type="button" onClick={addPerson} disabled={saving || !newName.trim()}
                style={{ padding: '0.35rem 0.75rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600, border: 'none', background: 'var(--accent)', color: 'white', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? '…' : 'Add'}
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewName('') }}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 99, fontSize: '0.8rem', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              style={{ padding: '0.35rem 0.85rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', border: '1.5px dashed var(--border2, #C8B89A)', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--sans)' }}>
              + New person
            </button>
          )}
        </div>
      )}
    </div>
  )
}
