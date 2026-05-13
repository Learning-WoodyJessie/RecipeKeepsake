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
  transcript_english: string
  audio_url: string
  image_url: string
}

export default function ReviewWizard({ draft, audioFile, onCancel }: { draft: Draft; audioFile: File; onCancel: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(draft.dish_name ?? '')
  const [ingredients, setIngredients] = useState<Ingredient[]>(draft.ingredients ?? [])
  const [steps, setSteps] = useState<string[]>(draft.steps ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    try {
      const recipe = { ...draft, dish_name: title, ingredients, steps }
      const form = new FormData()
      form.append('audio', audioFile, audioFile.name)
      form.append('recipe', JSON.stringify(recipe))
      form.append('narrator', draft.narrator ?? '')
      const saved = await api.capture.save(form)
      router.push(`/memory?token=${saved.token}`)
    } catch (e: unknown) { setError((e as Error).message); setSaving(false) }
  }

  if (step === 1) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1rem' }}>Step 1 — Confirm title</h2>
      <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '1rem', fontFamily: 'var(--serif)', color: 'var(--text)', background: 'var(--surface)' }} />
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>Cancel</button>
        <button onClick={() => setStep(2)} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Next →</button>
      </div>
    </div>
  )

  if (step === 2) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1rem' }}>Step 2 — Review ingredients &amp; steps</h2>

      {/* Ingredients */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Ingredients</div>
        {ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <input value={ing.item} onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], item: e.target.value }; setIngredients(n) }} placeholder="Ingredient" style={{ flex: 2, border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem', background: 'var(--surface)' }} />
            <input value={ing.quantity} onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], quantity: e.target.value }; setIngredients(n) }} placeholder="Qty" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem', background: 'var(--surface)' }} />
            <button onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setIngredients([...ingredients, { item: '', quantity: '' }])} style={{ fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem' }}>+ Add ingredient</button>
      </div>

      {/* Steps */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Steps</div>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', paddingTop: '0.45rem', minWidth: 18 }}>{i + 1}.</span>
            <textarea
              value={s}
              rows={2}
              onChange={e => { const n = [...steps]; n[i] = e.target.value; setSteps(n) }}
              placeholder={`Step ${i + 1}`}
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem', background: 'var(--surface)', resize: 'vertical', fontFamily: 'var(--sans)' }}
            />
            <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', paddingTop: '0.3rem' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setSteps([...steps, ''])} style={{ fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem' }}>+ Add step</button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button onClick={() => setStep(1)} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>← Back</button>
        <button onClick={() => { setError(''); setStep(3) }} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Next →</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.35rem' }}>Ready to save</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.84rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        This memory will be preserved forever for your family.
      </p>

      {/* Summary card */}
      <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', marginBottom: '1.25rem' }}>

        {/* Title */}
        <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--text)', marginBottom: '0.65rem' }}>
          {title || 'Untitled recipe'}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {draft.narrator && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
              <span style={{ color: 'var(--muted)' }}>Narrated by </span><strong>{draft.narrator}</strong>
            </div>
          )}
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
            <strong>{ingredients.length}</strong> <span style={{ color: 'var(--muted)' }}>ingredient{ingredients.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
            <strong>{steps.length}</strong> <span style={{ color: 'var(--muted)' }}>step{steps.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Ingredient preview */}
        {ingredients.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', marginBottom: steps.length > 0 ? '0.85rem' : 0 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.45rem' }}>Ingredients</div>
            {ingredients.slice(0, 6).map((ing, i) => (
              <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.18rem' }}>
                {ing.quantity ? <><strong>{ing.quantity}</strong> {ing.item}</> : ing.item}
              </div>
            ))}
            {ingredients.length > 6 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem' }}>+ {ingredients.length - 6} more</div>
            )}
          </div>
        )}

        {/* Steps preview */}
        {steps.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.45rem' }}>Method</div>
            {steps.slice(0, 3).map((s, i) => (
              <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.3rem', display: 'flex', gap: '0.4rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ lineHeight: 1.4 }}>{s.length > 80 ? s.slice(0, 80) + '…' : s}</span>
              </div>
            ))}
            {steps.length > 3 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.2rem' }}>+ {steps.length - 3} more steps</div>
            )}
          </div>
        )}
      </div>

      {error && <div style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem', padding: '0.6rem 0.85rem', background: '#FFF5F5', borderRadius: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button onClick={() => { setError(''); setStep(2) }} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>← Edit</button>
        <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.7rem', borderRadius: 10, background: saving ? '#C4A882' : 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : '♡ Save this memory'}
        </button>
      </div>
    </div>
  )
}
