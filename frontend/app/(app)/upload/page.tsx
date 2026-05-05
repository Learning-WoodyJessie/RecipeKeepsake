'use client'
import { useState } from 'react'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

export default function UploadPage() {
  const [narrator, setNarrator] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setProcessing(true)
    setError('')
    const form = new FormData()
    form.append('audio', file)
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result)
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setProcessing(false) }
  }

  if (draft) return <ReviewWizard draft={draft} onCancel={() => setDraft(null)} />

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Upload a Recording</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Already have an audio file? Upload it here.</p>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Who is narrating?</div>
        <NarratorChip selected={narrator} onSelect={setNarrator} />
      </div>

      <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: 14, padding: '2.5rem', textAlign: 'center', cursor: processing ? 'default' : 'pointer', background: 'var(--surface)' }}>
        <input type="file" accept="audio/*" style={{ display: 'none' }} disabled={processing} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {processing
          ? <p style={{ color: 'var(--muted)' }}>⏳ Processing…</p>
          : <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>📂 Click to choose an audio file</p>
        }
      </label>

      {error && <p style={{ color: 'var(--accent)', marginTop: '0.75rem', fontSize: '0.82rem' }}>{error}</p>}
    </div>
  )
}
