'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const TYPE_LABELS: Record<string, string> = {
  song:   '🎵 Song',
  story:  '📖 Story',
  fable:  '✨ Fable',
  wisdom: '🙏 Wisdom',
  poem:   '🖊️ Poem',
}

type Props = {
  token: string
  initialTitle: string
  transcriptRaw: string
  transcriptEnglish: string
  memoryType: string
  onReRecord: () => void
}

export default function SingleScreenReview({
  token, initialTitle, transcriptRaw, transcriptEnglish, memoryType, onReRecord,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      if (title.trim() && title.trim() !== initialTitle) {
        await api.recipes.patch(token, { title: title.trim() })
      }
      router.push(`/memory?token=${token}&justSaved=1&from=moments`)
    } catch {
      // Patch failure is non-fatal — navigate anyway, title can be edited later
      router.push(`/memory?token=${token}&justSaved=1&from=moments`)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1.25rem 5rem' }}>
      {/* Re-record */}
      <button
        onClick={onReRecord}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          color: 'var(--text2)', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          marginBottom: '1.5rem', fontFamily: 'var(--sans)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Re-record
      </button>

      {/* Type badge */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={{
          fontSize: 12, padding: '3px 10px', borderRadius: 10,
          border: '1px solid var(--border)', color: 'var(--muted)',
          background: 'var(--surface)',
        }}>
          {TYPE_LABELS[memoryType] ?? memoryType}
        </span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{
          display: 'block', fontSize: '0.7rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--muted)', marginBottom: '0.4rem',
        }}>
          Title <span style={{ color: 'var(--accent)' }}>*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.65rem 0.85rem', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '0.95rem',
          }}
        />
      </div>

      {/* Transcript */}
      {(transcriptRaw || transcriptEnglish) ? (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{
            fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.75rem',
          }}>
            Transcript
          </p>
          {transcriptRaw && (
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>Original</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {transcriptRaw}
              </div>
            </div>
          )}
          {transcriptEnglish && (
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>English</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {transcriptEnglish}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: '1.5rem', padding: '0.85rem', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.85rem' }}>
          No transcript generated.
        </div>
      )}

      {/* Sticky save bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', zIndex: 20,
      }}>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          style={{
            flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none',
            background: 'var(--accent)', color: 'white',
            fontWeight: 700, fontSize: '0.95rem',
            cursor: (saving || !title.trim()) ? 'default' : 'pointer',
            fontFamily: 'var(--sans)', opacity: (saving || !title.trim()) ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Memory'}
        </button>
      </div>
    </div>
  )
}
