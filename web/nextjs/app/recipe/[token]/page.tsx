import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'

export const revalidate = 60

async function getRecipe(token: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  const { data } = await getSupabase()
    .from('recipes')
    .select('*')
    .eq('token', token)
    .single()
  return data ?? null
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const recipe = await getRecipe(token)
  if (!recipe) notFound()

  const ingredients: { item: string; quantity: string }[] = recipe.ingredients ?? []
  const steps: string[] = recipe.steps ?? []

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm mb-6"
        style={{ color: '#A78BFA' }}
      >
        ← All recipes
      </Link>

      {/* Hero image */}
      <div
        className="w-full rounded-2xl overflow-hidden mb-6 flex items-center justify-center"
        style={{ background: '#1E1B4B', aspectRatio: '16/9' }}
      >
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.dish_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-7xl">🍽️</span>
        )}
      </div>

      {/* Title + meta */}
      <h1 className="text-3xl font-bold mb-1" style={{ color: '#E2E8F0' }}>
        {recipe.dish_name ?? 'Untitled recipe'}
      </h1>
      <p className="text-sm mb-6" style={{ color: '#64748B' }}>
        Narrated by {recipe.narrator ?? 'Grandma'} ·{' '}
        {new Date(recipe.recorded_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      {/* Cook notes (grandma's voice — displayed prominently) */}
      {recipe.cook_notes && (
        <div
          className="rounded-2xl p-4 mb-6 italic text-sm leading-relaxed"
          style={{ background: '#1E1B4B', color: '#A78BFA', borderLeft: '3px solid #A78BFA' }}
        >
          <p className="font-semibold not-italic mb-1 text-xs uppercase tracking-wider" style={{ color: '#64748B' }}>
            Grandma&apos;s notes
          </p>
          {recipe.cook_notes}
        </div>
      )}

      {/* Ingredients */}
      {ingredients.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Ingredients
          </h2>
          <ul className="flex flex-col gap-2">
            {ingredients.map((ing, i) => (
              <li
                key={i}
                className="flex justify-between items-center rounded-xl px-4 py-2.5 text-sm"
                style={{ background: '#0F0F23', border: '1px solid #1E1B4B' }}
              >
                <span style={{ color: '#E2E8F0' }}>{ing.item}</span>
                <span style={{ color: '#64748B' }}>{ing.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Method
          </h2>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                  style={{ background: '#A78BFA', color: 'white' }}
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: '#E2E8F0' }}>
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Audio player */}
      {recipe.audio_url && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Original recording
          </h2>
          <div
            className="rounded-2xl p-4"
            style={{ background: '#0F0F23', border: '1px solid #1E1B4B' }}
          >
            <audio controls className="w-full" src={recipe.audio_url}>
              Your browser does not support audio playback.
            </audio>
          </div>
        </section>
      )}

      {/* Original transcript */}
      {recipe.transcript_english && (
        <details className="mb-8">
          <summary
            className="cursor-pointer text-sm font-medium mb-2"
            style={{ color: '#64748B' }}
          >
            Full transcript (English)
          </summary>
          <p
            className="text-sm leading-relaxed mt-3 rounded-xl p-4"
            style={{ background: '#0F0F23', color: '#94A3B8', border: '1px solid #1E1B4B' }}
          >
            {recipe.transcript_english}
          </p>
        </details>
      )}

      {/* Share button */}
      <div className="flex justify-center pb-8">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`🫙 ${recipe.dish_name ?? 'A recipe'} — narrated by ${recipe.narrator ?? 'Grandma'}\n\n${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2.5 rounded-full text-sm font-semibold inline-flex items-center gap-2"
          style={{ background: '#25D366', color: 'white' }}
        >
          📤 Share on WhatsApp
        </a>
      </div>
    </div>
  )
}
