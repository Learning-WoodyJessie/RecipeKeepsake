'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

type Ingredient = { item: string; quantity: string }
type Draft = {
  dish_name: string
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

const STICKY_BAR: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  padding: '0.75rem 1rem',
  display: 'flex',
  gap: '0.75rem',
  zIndex: 20,
  boxShadow: '0 -4px 16px rgba(45,27,14,0.08)',
}

export default function ReviewWizard({ draft, audioFile, narrator: narratorProp, onCancel }: { draft: Draft; audioFile: File; narrator?: string; onCancel: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(draft.dish_name ?? '')
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
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const recipe = { ...draft, dish_name: title, ingredients, steps, category }
      const form = new FormData()
      form.append('audio', audioFile, audioFile.name)
      form.append('recipe', JSON.stringify(recipe))
      form.append('narrator', narrator)
      const saved = await api.capture.save(form)
      router.push(`/memory?token=${saved.token}&justSaved=1`)
    } catch (e: unknown) { setError((e as Error).message); setSaving(false) }
  }

  // ── Step 1: Title ──────────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
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
        placeholder="e.g. Gongura Pachadi, Pesarattu…"
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
        placeholder="e.g. Grandma, Dad, Lakshmi…"
        style={{ width: '100%', border: `1.5px solid ${narrator.trim() ? 'var(--border)' : 'var(--accent)'}`, borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '1rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box' }}
      />
      {/* What we heard — collapsible transcript */}
      {draft.transcript_raw && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            type="button"
            onClick={() => setTranscriptOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 600, padding: 0, width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: transcriptOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            What we heard
          </button>
          {transcriptOpen && (
            <div style={{ marginTop: '0.65rem', background: 'var(--cream2)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.65, maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {draft.transcript_raw}
            </div>
          )}
        </div>
      )}

      {/* Sticky action bar */}
      <div style={STICKY_BAR}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontWeight: 500, fontSize: '0.88rem' }}>
          Cancel
        </button>
        <button
          onClick={() => { if (!title.trim() || !narrator.trim()) { return } setStep(2) }}
          disabled={!title.trim() || !narrator.trim()}
          style={{ flex: 2, padding: '0.75rem', borderRadius: 10, background: (title.trim() && narrator.trim()) ? 'var(--accent)' : 'var(--muted)', color: 'white', border: 'none', fontWeight: 700, cursor: (title.trim() && narrator.trim()) ? 'pointer' : 'default', fontSize: '0.95rem' }}
        >
          Review &amp; save →
        </button>
      </div>
    </div>
  )

  // ── Step 2: Ingredients, Steps + Save ─────────────────────────────────────
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
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

      {error && (
        <div style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem', padding: '0.6rem 0.85rem', background: '#FFF5F5', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Sticky action bar */}
      <div style={STICKY_BAR}>
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
