import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'

export const revalidate = 30

async function getRecipes() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  const { data } = await getSupabase()
    .from('recipes')
    .select('id, token, dish_name, narrator, recorded_at, image_url')
    .order('recorded_at', { ascending: false })
  return data ?? []
}

export default async function Home() {
  const recipes = await getRecipes()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm" style={{ color: '#64748B' }}>
          {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} captured
        </p>
      </div>

      {recipes.length === 0 && (
        <div className="text-center py-16" style={{ color: '#64748B' }}>
          <p className="text-5xl mb-4">🫙</p>
          <p className="text-lg font-medium mb-2" style={{ color: '#E2E8F0' }}>
            No recipes yet
          </p>
          <p className="text-sm mb-6">
            Sit down with grandma and record the first one.
          </p>
          <Link
            href="/record"
            className="px-6 py-2.5 rounded-full text-sm font-semibold"
            style={{ background: '#A78BFA', color: 'white' }}
          >
            Record your first recipe
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {recipes.map((r: any) => (
          <Link
            key={r.token}
            href={`/recipe/${r.token}`}
            className="flex gap-4 items-center rounded-2xl p-3"
            style={{ background: '#0F0F23', border: '1px solid #1E1B4B' }}
          >
            <div
              className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-3xl"
              style={{ background: '#1E1B4B' }}
            >
              {r.image_url
                ? <img src={r.image_url} alt={r.dish_name} className="w-full h-full object-cover" />
                : '🍽️'
              }
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate" style={{ color: '#E2E8F0' }}>
                {r.dish_name ?? 'Untitled recipe'}
              </p>
              <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
                {r.narrator ?? 'Grandma'} ·{' '}
                {new Date(r.recorded_at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
