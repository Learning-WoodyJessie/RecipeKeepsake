'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

type Ingredient = { item: string; quantity: string }
type Draft = {
  title: string
  narrator: string
  ingredients: Ingredient[]
  steps: string[]
  cook_notes: string
  review_flags: string[]
  transcript_raw: string
  transcript_english: string
  audio_url: string
  image_url: string
  category?: string
}

// Matches pipeline/transform.py's VALID_CATEGORIES exactly
const CATEGORIES = ['Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Other'] as const

const ACTION_BAR: React.CSSProperties = {
  flexShrink: 0,
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  padding: '0.75rem 1rem',
  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' as string,
  display: 'flex',
  gap: '0.75rem',
  boxShadow: '0 -4px 16px rgba(45,27,14,0.08)',
}

export default function ReviewWizard({ draft, audioFile, narrator: narratorProp, onCancel }: { draft: Draft; audioFile: File; narrator?: string; onCancel: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(draft.title ?? '')
  // Required before save so a recipe never silently lands on the backend's
  // "Grandma" fallback (File(default="Grandma")) just because no narrator
  // chip was tapped before recording started.
  const [narrator, setNarrator] = useState(narratorProp || draft.narrator || '')
  const [ingredients, setIngredients] = useState<Ingredient[]>(draft.ingredients ?? [])
  const [steps, setSteps] = useState<string[]>(draft.steps ?? [])
  // Pre-filled with the AI's guess, but always shown for confirmation - the
  // model picks this from limited context and has no obligation to be right.
  const [category, setCategory] = useState(draft.category ?? 'Other')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [transcriptOpen, setTranscriptOpen] = useState(true)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(draft.image_url ?? null)

  async function save() {
    setSaving(true)
    try {
      const recipe = { ...draft, title: title, ingredients, steps, category }
      const form = new FormData()
      form.append('audio', audioFile, audioFile.name)
      form.append('recipe', JSON.stringify(recipe))
      form.append('narrator', narrator)
      const saved = await api.capture.save(form)
      if (photoFile) {
        try {
          await api.memories.uploadPhoto(saved.token, photoFile)
        } catch {
          setError('Memory saved, but photo upload failed. You can try again from the memory page.')
          setSaving(false)
          router.push(`/memory?token=${saved.token}&justSaved=1`)
          return
        }
      }
      router.push(`/memory?token=${saved.token}&justSaved=1`)
    } catch (e: unknown) { setError((e as Error).message); setSaving(false) }
  }

  // ── Step 1: Title ──────────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.35rem' }}>
            What's this recipe called?
          </h2>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
            {title
              ? 'Our best guess from the recording. Edit if it\'s not right.'
              : 'We couldn\'t detect a name from the recording. Please enter one below.'}
          </p>
          {!title && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#FFF8F0', border: '1px solid #F4C89A', borderRadius: 10, padding: '0.6rem 0.85rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#8B5E3C' }}>
              <span>💡</span>
              <span>This sometimes happens with very short recordings or background noise.</span>
            </div>
          )}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Gongura Pachadi"
            style={{ width: '100%', border: `1.5px solid ${title ? 'var(--border)' : 'var(--accent)'}`, borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '1.05rem', fontFamily: 'var(--serif)', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', marginBottom: '1.25rem' }}
          />

          <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.35rem', fontSize: '1.1rem' }}>
            Who narrated this?
          </h2>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
            Required. Every memory should be attributed to a real person, not a default.
          </p>
          <input
            value={narrator}
            onChange={e => setNarrator(e.target.value)}
            placeholder="Ammamma"
            style={{ width: '100%', border: `1.5px solid ${narrator.trim() ? 'var(--border)' : 'var(--accent)'}`, borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '1rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box' }}
          />
          {/* What we heard — collapsible transcript */}
          {draft.transcript_raw && (
            <div style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setTranscriptOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '0.75rem 1rem', cursor: 'pointer',
                  background: transcriptOpen ? 'var(--accent-light)' : 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: transcriptOpen ? '10px 10px 0 0' : 10,
                  color: 'var(--text)', fontSize: '0.85rem', fontWeight: 600,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  What we heard
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: transcriptOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {transcriptOpen && (
                <div style={{ background: 'var(--cream2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.85, maxHeight: 220, overflowY: 'auto' }}>
                  {draft.transcript_raw.split(/(?<=[.!?])\s+/).map((s, i) => (
                    <p key={i} style={{ margin: '0 0 0.35rem' }}>{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action bar — pinned at bottom, never fixed */}
      <div style={ACTION_BAR}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontWeight: 500, fontSize: '0.88rem' }}>
          Cancel
        </button>
        <button
          onClick={() => { if (!title.trim() || !narrator.trim()) { return } setStep(2) }}
          disabled={!title.trim() || !narrator.trim()}
          style={{ flex: 2, padding: '0.75rem', borderRadius: 10, background: (title.trim() && narrator.trim()) ? 'var(--accent)' : 'var(--muted)', color: 'white', border: 'none', fontWeight: 700, cursor: (title.trim() && narrator.trim()) ? 'pointer' : 'default', fontSize: '0.95rem' }}
        >
          Review &amp; Continue →
        </button>
      </div>
    </div>
  )

  // ── Step 2: Ingredients, Steps + Save ─────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1.5rem' }}>

          {/* Error banner — shown at top so it's immediately visible */}
          {error && (error.includes('memory_cap_reached') ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: '1.25rem', textAlign: 'center', background: 'var(--surface)' }}>
              <p style={{ fontSize: '1.3rem', marginBottom: '0.35rem' }}>🔒</p>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.3rem' }}>You've reached your memory limit</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.9rem', lineHeight: 1.5 }}>
                Unlimited storage is coming soon. Drop us an email and we'll notify you the moment it's ready.
              </p>
              <a
                href="mailto:support@theechoesofhome.com?subject=Unlimited memories — please notify me"
                style={{ display: 'inline-block', padding: '0.5rem 1.25rem', background: 'var(--accent)', color: 'white', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}
              >
                Contact support
              </a>
            </div>
          ) : (
            <div style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem', padding: '0.6rem 0.85rem', background: 'var(--accent-light)', borderRadius: 8 }}>
              {error}
            </div>
          ))}

          <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.35rem' }}>
            {title || 'Review recipe'}
          </h2>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Edit anything we missed. Vague quantities like "a little" are kept as-is.
          </p>

          {/* Category — confirm the AI's guess before saving */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Category
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: '0.35rem 0.85rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                    border: `1.5px solid ${category === cat ? 'var(--accent)' : 'var(--border)'}`,
                    background: category === cat ? 'var(--accent-light)' : 'transparent',
                    color: category === cat ? 'var(--accent)' : 'var(--text2)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Ingredients
            </div>
            {ingredients.length === 0 && (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                No ingredients detected. Add them below.
              </p>
            )}
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input
                  value={ing.item}
                  onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], item: e.target.value }; setIngredients(n) }}
                  placeholder="Ingredient"
                  style={{ flex: 2, border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.85rem', background: 'var(--surface)', fontFamily: 'var(--sans)' }}
                />
                <input
                  value={ing.quantity}
                  onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], quantity: e.target.value }; setIngredients(n) }}
                  placeholder="Qty"
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.85rem', background: 'var(--surface)', fontFamily: 'var(--sans)' }}
                />
                <button onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setIngredients([...ingredients, { item: '', quantity: '' }])} style={{ fontSize: '0.8rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem', fontWeight: 600 }}>
              + Add ingredient
            </button>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Method
            </div>
            {steps.length === 0 && (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                No steps detected. Add them below.
              </p>
            )}
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', paddingTop: '0.5rem', minWidth: 20 }}>{i + 1}.</span>
                <textarea
                  value={s}
                  rows={2}
                  onChange={e => { const n = [...steps]; n[i] = e.target.value; setSteps(n) }}
                  placeholder={`Step ${i + 1}`}
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.85rem', background: 'var(--surface)', resize: 'vertical', fontFamily: 'var(--sans)' }}
                />
                <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', paddingTop: '0.35rem', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setSteps([...steps, ''])} style={{ fontSize: '0.8rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem', fontWeight: 600 }}>
              + Add step
            </button>
          </div>

          {/* Photo — optional */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Photo <span style={{ fontWeight: 400, opacity: 0.6 }}>optional</span>
            </div>
            <input
              id="rw-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                setPhotoFile(f)
                setPhotoPreview(URL.createObjectURL(f))
              }}
            />
            {photoPreview ? (
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', height: 140, background: 'var(--cream2)' }}>
                <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => (document.getElementById('rw-photo-input') as HTMLInputElement)?.click()}
                  style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (document.getElementById('rw-photo-input') as HTMLInputElement)?.click()}
                style={{ width: '100%', padding: '1.25rem', border: '1.5px dashed var(--border2)', borderRadius: 10, background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <span>Add a photo</span>
                <span style={{ fontSize: '0.7rem' }}>JPEG, PNG or WebP · up to 5 MB</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Action bar — pinned at bottom, never fixed */}
      <div style={ACTION_BAR}>
        <button onClick={() => setStep(1)} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontWeight: 500, fontSize: '0.88rem' }}>
          ← Back
        </button>
        <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.75rem', borderRadius: 10, background: saving ? 'var(--muted)' : 'var(--accent)', color: 'white', border: 'none', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontSize: '0.95rem' }}>
          {saving ? 'Saving…' : '♡ Save this memory'}
        </button>
      </div>
    </div>
  )
}
