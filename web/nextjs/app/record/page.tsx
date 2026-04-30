'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type Stage =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'transcribing'
  | 'translating'
  | 'structuring'
  | 'done'
  | 'error'

const STAGE_LABELS: Record<Stage, string> = {
  idle: '',
  recording: '🎙️ Recording...',
  processing: '⏳ Uploading...',
  transcribing: '✍️ Transcribing Telugu...',
  translating: '🌐 Translating to English...',
  structuring: '🧩 Structuring recipe...',
  done: '✅ Recipe saved!',
  error: '❌ Something went wrong',
}

type Ingredient = { item: string; quantity: string }

type Recipe = {
  token?: string
  dish_name?: string
  narrator?: string
  image_url?: string
  ingredients?: Ingredient[]
  steps?: string[]
  cook_notes?: string
  transcript_english?: string
}

export default function RecordPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

  // ── Recording ────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        submitAudio(blob)
      }

      mr.start()
      setStage('recording')
      setAudioDuration(0)
      timerRef.current = setInterval(() => setAudioDuration((d) => d + 1), 1000)
    } catch (err) {
      setErrorMsg('Microphone access denied. Please allow mic and try again.')
      setStage('error')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setStage('processing')
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────
  async function submitAudio(blob: Blob) {
    setStage('transcribing')

    const formData = new FormData()
    formData.append('audio', blob, 'recording.webm')

    try {
      const res = await fetch(`${API}/capture`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail ?? 'Pipeline failed')
      }

      // Fake stage progression while waiting (server is synchronous, so
      // we animate through stages client-side to give feedback)
      setStage('translating')
      await delay(800)
      setStage('structuring')

      const data: Recipe = await res.json()
      setRecipe(data)
      setStage('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Pipeline failed')
      setStage('error')
    }
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── WhatsApp share ────────────────────────────────────────────────────────
  function shareOnWhatsApp() {
    if (!recipe) return
    const recipeUrl = recipe.token
      ? `${window.location.origin}/recipe/${recipe.token}`
      : window.location.href
    const text = `🫙 ${recipe.dish_name ?? 'A family recipe'} — narrated by ${recipe.narrator ?? 'Grandma'}\n\n${recipeUrl}`
    // MUST be synchronous — no await before this (iOS Safari rule)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: '#A78BFA' }}>
        ← Back
      </Link>

      <h1 className="text-2xl font-bold mb-1" style={{ color: '#E2E8F0' }}>Record a recipe</h1>
      <p className="text-sm mb-8" style={{ color: '#64748B' }}>
        Sit with grandma. Press record. Let her narrate naturally.
      </p>

      {/* ── Recorder UI ── */}
      {(stage === 'idle' || stage === 'recording') && (
        <div className="flex flex-col items-center gap-6">
          {/* Big mic button */}
          <button
            onClick={stage === 'idle' ? startRecording : stopRecording}
            className="w-28 h-28 rounded-full flex items-center justify-center text-5xl transition-transform active:scale-95"
            style={{
              background: stage === 'recording' ? '#EF4444' : '#A78BFA',
              boxShadow: stage === 'recording'
                ? '0 0 0 12px rgba(239,68,68,0.2)'
                : '0 0 0 12px rgba(167,139,250,0.2)',
            }}
            aria-label={stage === 'idle' ? 'Start recording' : 'Stop recording'}
          >
            {stage === 'idle' ? '🎙️' : '⏹️'}
          </button>

          {stage === 'recording' && (
            <p className="text-2xl font-mono tabular-nums" style={{ color: '#E2E8F0' }}>
              {formatDuration(audioDuration)}
            </p>
          )}

          <p className="text-sm text-center" style={{ color: '#64748B' }}>
            {stage === 'idle'
              ? 'Tap the mic to start. Tap again to stop and process.'
              : 'Recording… tap the stop button when done.'}
          </p>
        </div>
      )}

      {/* ── Processing stages ── */}
      {(['processing', 'transcribing', 'translating', 'structuring'] as Stage[]).includes(stage) && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ background: '#1E1B4B', animation: 'pulse 1.5s ease-in-out infinite' }}
          >
            ⚙️
          </div>
          <p className="text-lg font-medium" style={{ color: '#E2E8F0' }}>
            {STAGE_LABELS[stage]}
          </p>
          <p className="text-sm" style={{ color: '#64748B' }}>
            This takes about 30–60 seconds…
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {stage === 'error' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-5xl">😔</p>
          <p className="text-base font-medium" style={{ color: '#E2E8F0' }}>Something went wrong</p>
          <p className="text-sm text-center" style={{ color: '#64748B' }}>{errorMsg}</p>
          <button
            onClick={() => { setStage('idle'); setErrorMsg('') }}
            className="px-6 py-2 rounded-full text-sm font-semibold"
            style={{ background: '#A78BFA', color: 'white' }}
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Done: recipe card preview ── */}
      {stage === 'done' && recipe && (
        <div className="flex flex-col gap-4">
          {/* Image */}
          <div
            className="w-full rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: '#1E1B4B', aspectRatio: '16/9' }}
          >
            {recipe.image_url ? (
              <img src={recipe.image_url} alt={recipe.dish_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-7xl">🍽️</span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold" style={{ color: '#E2E8F0' }}>
            {recipe.dish_name ?? 'Untitled recipe'}
          </h2>

          {/* Cook notes */}
          {recipe.cook_notes && (
            <div
              className="rounded-xl p-3 italic text-sm"
              style={{ background: '#1E1B4B', color: '#A78BFA', borderLeft: '3px solid #A78BFA' }}
            >
              {recipe.cook_notes}
            </div>
          )}

          {/* Ingredients */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#64748B' }}>INGREDIENTS</p>
              <ul className="flex flex-col gap-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <li
                    key={i}
                    className="flex justify-between text-sm rounded-lg px-3 py-2"
                    style={{ background: '#0F0F23', border: '1px solid #1E1B4B' }}
                  >
                    <span style={{ color: '#E2E8F0' }}>{ing.item}</span>
                    <span style={{ color: '#64748B' }}>{ing.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          {recipe.steps && recipe.steps.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: '#64748B' }}>METHOD</p>
              <ol className="flex flex-col gap-2">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 items-start text-sm">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                      style={{ background: '#A78BFA', color: 'white' }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ color: '#E2E8F0' }}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={shareOnWhatsApp}
              className="flex-1 py-2.5 rounded-full text-sm font-semibold"
              style={{ background: '#25D366', color: 'white' }}
            >
              📤 Share on WhatsApp
            </button>
            {recipe.token && (
              <Link
                href={`/recipe/${recipe.token}`}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold text-center"
                style={{ background: '#1E1B4B', color: '#A78BFA', border: '1px solid #A78BFA' }}
              >
                View full recipe →
              </Link>
            )}
          </div>

          {/* Record another */}
          <button
            onClick={() => { setStage('idle'); setRecipe(null); setAudioBlob(null) }}
            className="text-sm text-center mt-1"
            style={{ color: '#64748B' }}
          >
            Record another recipe
          </button>
        </div>
      )}
    </div>
  )
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
