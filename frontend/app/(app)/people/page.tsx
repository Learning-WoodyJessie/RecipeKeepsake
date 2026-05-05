// This file defines the People page in the application.
// Purpose: Allows users to manage profiles of narrators associated with memories.
// Why: Provides a way to organize and edit information about family members who narrate memories.
// How: Uses React hooks for state management and API calls for CRUD operations on narrator profiles.

'use client'
import { useEffect, useState } from 'react'
import { api, type Person } from '@/lib/api'

type FormData = Omit<Person, 'id'>

const EMPTY: FormData = { name: '', relationship: '', emoji: '\ud83d\udc64', photo_url: '', bio: '', notes: '' }

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [modal, setModal] = useState<{ open: boolean; editing: Person | null }>({ open: false, editing: null })
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.people.list().then(setPeople).catch((e: Error) => setError(e.message)) }, [])

  function openAdd() { setForm(EMPTY); setModal({ open: true, editing: null }) }
  function openEdit(p: Person) {
    setForm({ name: p.name, relationship: p.relationship, emoji: p.emoji ?? '👤', photo_url: p.photo_url ?? '', bio: p.bio ?? '', notes: p.notes ?? '' })
    setModal({ open: true, editing: p })
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (modal.editing) {
        const updated = await api.people.update(modal.editing.id, form)
        setPeople(prev => prev.map(p => p.id === modal.editing!.id ? updated : p))
      } else {
        const created = await api.people.create(form)
        setPeople(prev => [...prev, created])
      }
      setModal({ open: false, editing: null })
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await api.people.delete(id).catch((e: Error) => setError(e.message))
    setPeople(prev => prev.filter(p => p.id !== id))
  }

  const fields: (keyof FormData)[] = ['name', 'relationship', 'emoji', 'bio', 'notes']

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)' }}>Narrators</h1>
        <button onClick={openAdd} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.55rem 1.25rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>+ Add narrator</button>
      </div>

      {error && <p style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</p>}

      {people.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          No narrators yet. Add the first family member.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {people.map(p => (
            <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{p.emoji ?? '👤'}</div>
              <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.2rem' }}>{p.name}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>{p.relationship}</p>
              {p.bio && <p style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '0.75rem' }}>{p.bio}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => openEdit(p)} style={{ flex: 1, padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text2)' }}>Edit</button>
                <button onClick={() => remove(p.id, p.name)} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--accent)' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1.25rem' }}>{modal.editing ? 'Edit narrator' : 'Add narrator'}</h2>
            {fields.map(field => (
              <div key={field} style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--muted)', marginBottom: '0.3rem' }}>{field}</label>
                <input
                  value={form[field] ?? ''}
                  onChange={e => setForm({ ...form, [field]: e.target.value })}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', background: 'var(--cream)', color: 'var(--text)' }}
                />
              </div>
            ))}
            {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => { setModal({ open: false, editing: null }); setError('') }} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
