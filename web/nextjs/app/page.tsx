import Image from 'next/image'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'

export const revalidate = 30

type RecipeSummary = {
  id: string
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
}

async function getRecipes() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  const { data } = await getSupabase()
    .from('recipes')
    .select('id, token, dish_name, narrator, recorded_at, image_url')
    .order('recorded_at', { ascending: false })
  return (data ?? []) as RecipeSummary[]
}

export default async function Home() {
  const recipes = await getRecipes()
  const recentRecipes = recipes.slice(0, 3)

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#f7eee6] text-[#3a1f14]">
      <section className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(280px,0.82fr)_minmax(420px,1fr)] lg:px-10 lg:py-10">
        <div className="order-2 flex flex-col justify-center lg:order-1">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b66e5e]">
            Grandma&apos;s Keepsake
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight text-[#563018] sm:text-5xl lg:text-6xl">
            Her recipes. Her voice. Our legacy.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#7f5141] sm:text-lg">
            Capture family recipes as audio, preserve the original story, and keep every lovingly vague instruction right where it belongs.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/record"
              className="inline-flex items-center justify-center rounded-full bg-[#c97865] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c97865]/25 transition hover:bg-[#b86856]"
            >
              Record Grandma
            </Link>
            <a
              href="#keepsakes"
              className="inline-flex items-center justify-center rounded-full border border-[#d8b7a8] bg-white/65 px-6 py-3 text-sm font-semibold text-[#68402d] transition hover:bg-white"
            >
              View Keepsakes
            </a>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-3 text-sm text-[#68402d] sm:grid-cols-3">
            {[
              ['Record', 'Capture voice, recipes, and stories.'],
              ['Preserve', 'Store audio beside every recipe.'],
              ['Cherish', 'Replay memories whenever you cook.'],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-lg border border-[#ead8cf] bg-white/70 p-4 shadow-sm">
                <p className="font-semibold text-[#563018]">{title}</p>
                <p className="mt-1 leading-5">{copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[2rem] border border-[#ead8cf] bg-[#fbf6f0] shadow-2xl shadow-[#7c5133]/20">
            <Image
              src="/chatgpt.png"
              alt="Grandma's Keepsake responsive app concept"
              width={1024}
              height={1536}
              priority
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </section>

      <section id="keepsakes" className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-2 border-t border-[#e4cbbf] pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#b66e5e]">
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} captured
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[#563018]">Recent Keepsakes</h2>
          </div>
          <Link href="/record" className="text-sm font-semibold text-[#b86856]">
            Add a recipe
          </Link>
        </div>

        {recipes.length === 0 ? (
          <div className="mt-5 rounded-lg border border-[#ead8cf] bg-white/70 p-6 text-[#7f5141] shadow-sm">
            <p className="font-semibold text-[#563018]">No recipes yet</p>
            <p className="mt-1 text-sm">Sit down with grandma and record the first one.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentRecipes.map((r) => (
              <Link
                key={r.token}
                href={`/recipe/${r.token}`}
                className="group overflow-hidden rounded-lg border border-[#ead8cf] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#ead8cf] text-4xl">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.dish_name ?? 'Recipe image'} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    '🍽️'
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate font-semibold text-[#563018]">
                    {r.dish_name ?? 'Untitled recipe'}
                  </p>
                  <p className="mt-1 text-sm text-[#7f5141]">
                    {r.narrator ?? 'Grandma'} ·{' '}
                    {new Date(r.recorded_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
