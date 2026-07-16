'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

// Required by output: export — no paths pre-rendered; SPA fallback serves index.html
// and Next.js handles the route client-side at runtime.
export function generateStaticParams() {
  return []
}

// Resolves short share URLs like /memory/smitha-recipe-42329f17
// Extracts the 8-char token prefix (last segment after final '-'), looks up
// the full token, then redirects to /memory?token=<fulltoken>
export default function MemoryShortcodeRedirect() {
  const { shortcode } = useParams<{ shortcode: string }>()
  const router = useRouter()

  useEffect(() => {
    const prefix = shortcode.split('-').pop() ?? ''
    if (!prefix || prefix.length !== 8) {
      router.replace('/recipes')
      return
    }
    api.recipes.getByShortToken(prefix)
      .then((data: { token: string }) => {
        router.replace(`/memory?token=${data.token}`)
      })
      .catch(() => {
        router.replace('/recipes')
      })
  }, [shortcode, router])

  return (
    <div style={{ padding: '2rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
      Loading memory…
    </div>
  )
}
