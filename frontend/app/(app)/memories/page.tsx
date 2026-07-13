import { redirect } from 'next/navigation'

// Legacy URL — redirect to the canonical /recipes route
export default function MemoriesRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, Array.isArray(v) ? v[0] : v)
  }
  const qs = params.toString()
  redirect(qs ? `/recipes?${qs}` : '/recipes')
}
