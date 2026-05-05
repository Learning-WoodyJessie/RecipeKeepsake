# Phase 1.7 — Frontend Migration Plan

```
Goal:         Migrate web/app.html to frontend/ (Next.js static export), deploy Vercel, wire Capacitor Android + iOS
Layer:        Frontend (Next.js 14, React 19, TypeScript, Tailwind) + Capacitor config
Architecture: Static export — all pages are 'use client', data fetched from Railway API using
              Supabase session token, Supabase client used for auth only. Dynamic content
              pages use query params (/memory?token=abc) not file-based dynamic routes, to
              avoid generateStaticParams complexity with static export. One Vercel build serves
              web, Android (Capacitor), and iOS (Capacitor) identically.
Design doc:   docs/plans/2026-05-05-frontend-migration-design.md
```

---

## Critical architecture rules (read before every chunk)

1. **No server components that fetch data.** All pages are `'use client'`. Data comes from Railway API via `lib/api.ts`, never from Supabase directly.
2. **Supabase client = auth only.** `lib/supabase.ts` is used only for `signInWithOAuth`, `signOut`, `getSession`, `onAuthStateChange`. Never for `.from('recipes')` queries.
3. **Dynamic content = query params.** `/memory?token=abc` not `/memory/abc`. Avoids `generateStaticParams` with static export.
4. **Build gate.** Every chunk ends with `cd frontend && npm run build` passing with 0 errors before commit.
5. **Design tokens.** Match `web/app.html` exactly: `--cream #FDF8F3`, `--accent #C4522A`, `--text #2D1B0E`, `--serif 'Playfair Display'`. The existing scaffold uses the old dark theme (`#0A0A18`) — replace entirely.

---

## Chunk 1.1 — Repo reorganisation + static export config

**Files:**
- Move: `web/nextjs/` → `frontend/`
- Modify: `frontend/next.config.ts`
- Modify: `capacitor.config.json`
- Copy: `web/assets/echoes-logo.png`, `web/assets/icon.png`, `web/assets/splash.png` → `frontend/public/`
- Modify: `frontend/app/layout.tsx` (title + branding stub)
- Modify: `frontend/app/globals.css` (design tokens)

**Step 1: Move files**
```bash
# From repo root
mv web/nextjs frontend
```

**Step 2: Add static export to next.config.ts**
```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },  // required for static export
};

export default nextConfig;
```

**Step 3: Update capacitor.config.json**
```json
{
  "appId": "com.echoesofhome.app",
  "appName": "Echoes of Home",
  "webDir": "frontend/out",
  "server": {
    "url": "https://vibrant-spontaneity-production-9f92.up.railway.app",
    "cleartext": false,
    "androidScheme": "https"
  }
}
```
Note: `server.url` stays as Railway URL until Vercel is live (Chunk 7). `webDir` updated for local builds.

**Step 4: Copy brand assets**
```bash
cp web/assets/echoes-logo.png frontend/public/
cp web/assets/icon.png frontend/public/
cp web/assets/splash.png frontend/public/
cp web/assets/landing-hero-photo.png frontend/public/
cp web/assets/landing-memory-photo.png frontend/public/
```

**Step 5: Replace globals.css with design tokens**
```css
/* frontend/app/globals.css */
@import "tailwindcss";

:root {
  --cream: #FDF8F3;
  --cream2: #F5EDE2;
  --cream3: #EBE0D3;
  --surface: #FFFFFF;
  --accent: #C4522A;
  --accent2: #BE4D25;
  --accent-light: #FDEEE8;
  --text: #2D1B0E;
  --text2: #5C3D28;
  --muted: #9B7E6A;
  --border: #E8DDD0;
  --border2: #D6C5B0;
  --amber: #F5A623;
  --green: #2E7D52;
  --serif: 'Playfair Display', Georgia, serif;
  --sans: 'Inter', -apple-system, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--cream); color: var(--text); font-family: var(--sans); }
```

**Step 6: Stub layout.tsx (branding only — auth added in Chunk 2)**
```typescript
// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echoes of Home",
  description: "Every family carries a world. Don't let it fade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**Step 7: Verify build**
```bash
cd frontend
npm install
npm run build
# Must exit 0 with no TypeScript errors
# Output: frontend/out/ directory created
```

**Step 8: Commit**
```bash
git add frontend/ capacitor.config.json
git add -f web/assets/  # keep legacy assets tracked
git commit -m "[Add] [frontend]: repo reorganisation — web/nextjs → frontend/, static export, design tokens"
```

---

## Chunk 1.2 — Supabase auth client + API wrapper

**Files:**
- Rewrite: `frontend/lib/supabase.ts`
- Create: `frontend/lib/api.ts`

**Step 1: Supabase auth client (auth only — no data queries)**
```typescript
// frontend/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Singleton — auth only. Never use for data queries.
export const supabase = createClient(url, key)

export async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
```

**Step 2: Railway API wrapper**
```typescript
// frontend/lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await import('./supabase').then(m => m.supabase.auth.getSession())
  const token = (await import('./supabase')).supabase.auth.getSession
  // Use supabase singleton directly
  const { supabase } = await import('./supabase')
  const { data: { session: s } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    ...(options.headers ?? {}),
    ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
  }
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  recipes: {
    list: () => authFetch('/recipes'),
    get: (token: string) => authFetch(`/recipe/${token}`),
    translate: (token: string, lang: string) => authFetch(`/recipe/${token}/translate?lang=${lang}`),
    patch: (token: string, body: object) => authFetch(`/recipe/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (token: string) => authFetch(`/recipe/${token}`, { method: 'DELETE' }),
  },
  people: {
    list: () => authFetch('/people'),
    create: (body: object) => authFetch('/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    update: (id: string, body: object) => authFetch(`/people/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (id: string) => authFetch(`/people/${id}`, { method: 'DELETE' }),
  },
  capture: {
    process: (formData: FormData) => authFetch('/capture/process', { method: 'POST', body: formData }),
    save: (body: object) => authFetch('/capture/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  },
  account: {
    delete: () => authFetch('/account', { method: 'DELETE' }),
  },
}
```

**Step 3: Verify build**
```bash
cd frontend && npm run build
```

**Step 4: Commit**
```bash
git add frontend/lib/
git commit -m "[Add] [frontend]: Supabase auth client + Railway API wrapper"
```

---

## Chunk 1.3 — Auth guard + shell (layout, sidebar, landing, auth callback)

**Files:**
- Create: `frontend/components/AuthGuard.tsx`
- Create: `frontend/components/Sidebar.tsx`
- Rewrite: `frontend/app/layout.tsx`
- Rewrite: `frontend/app/page.tsx` (landing — pre-auth)
- Create: `frontend/app/auth/callback/page.tsx`

**Step 1: AuthGuard — wraps all protected pages**
```typescript
// frontend/components/AuthGuard.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/')
      else setChecked(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.replace('/')
    })
    return () => subscription.unsubscribe()
  }, [router])

  if (!checked) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</div>
    </div>
  )
  return <>{children}</>
}
```

**Step 2: Sidebar navigation**
```typescript
// frontend/components/Sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

const NAV = [
  { group: 'Memories', items: [
    { label: 'Home', icon: '🏠', href: '/home' },
    { label: 'All Memories', icon: '📚', href: '/memories' },
  ]},
  { group: 'Capture', items: [
    { label: 'Record', icon: '🎙️', href: '/capture' },
    { label: 'Upload', icon: '📤', href: '/upload' },
  ]},
  { group: 'People', items: [
    { label: 'Narrators', icon: '👤', href: '/people' },
  ]},
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{ width: 220, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
        <Image src="/echoes-logo.png" alt="Echoes of Home" width={120} height={40} style={{ height: 'auto' }} />
      </div>
      <nav style={{ padding: '0.6rem', flex: 1 }}>
        {NAV.map(group => (
          <div key={group.group}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0.45rem 0.5rem 0.25rem', marginTop: '0.4rem' }}>
              {group.group}
            </div>
            {group.items.map(item => (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '0.55rem',
                padding: '0.5rem 0.7rem', borderRadius: 9, fontSize: '0.82rem', fontWeight: 500,
                color: path === item.href ? 'var(--accent)' : 'var(--text2)',
                background: path === item.href ? 'var(--accent-light)' : 'transparent',
                textDecoration: 'none', marginBottom: 2,
              }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '0.8rem 1rem', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

**Step 3: Root layout with app shell**
```typescript
// frontend/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Echoes of Home",
  description: "Every family carries a world. Don't let it fade.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

**Step 4: Landing page (pre-auth)**
```typescript
// frontend/app/page.tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/home')
    })
  }, [router])

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <Image src="/echoes-logo.png" alt="Echoes of Home" width={160} height={54} style={{ height: 'auto', marginBottom: '1.5rem' }} />
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '2rem', color: 'var(--text)', textAlign: 'center', maxWidth: 480, lineHeight: 1.25 }}>
        Every family carries a world.
      </h1>
      <p style={{ color: 'var(--text2)', marginTop: '0.75rem', marginBottom: '2rem', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
        Preserve their voices, recipes, and stories — before they fade.
      </p>
      <button onClick={signIn} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '0.85rem 2rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
        Continue with Google
      </button>
    </main>
  )
}
```

**Step 5: Auth callback handler**
```typescript
// frontend/app/auth/callback/page.tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/home')
      }
    })
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
    </div>
  )
}
```

**Step 6: Verify build + manual test**
```bash
cd frontend && npm run build
# Then: npm run dev → open http://localhost:3000
# Check: landing page shows, Google sign-in button present
# Check: signing in redirects to /home (404 for now — that's expected)
```

**Step 7: Commit**
```bash
git add frontend/components/AuthGuard.tsx frontend/components/Sidebar.tsx
git add frontend/app/layout.tsx frontend/app/page.tsx frontend/app/auth/
git commit -m "[Add] [frontend]: auth shell — AuthGuard, Sidebar, landing page, OAuth callback"
```

---

## Chunk 1.4 — Home screen + All Memories list

**Files:**
- Create: `frontend/components/MemoryCard.tsx`
- Create: `frontend/components/WaveformBars.tsx`
- Create: `frontend/app/home/page.tsx`
- Create: `frontend/app/memories/page.tsx`
- Create: `frontend/app/home/layout.tsx` (shell with Sidebar)

**Step 1: Shared app layout (Sidebar + content area)**
```typescript
// frontend/app/home/layout.tsx  (also used by memories, capture, etc.)
// Actually: create frontend/app/(app)/layout.tsx — route group, no URL segment
```

Use a **route group** `(app)` to share the sidebar layout across all authenticated pages:

```
frontend/app/
  (app)/
    layout.tsx       ← AuthGuard + Sidebar + main area
    home/page.tsx
    memories/page.tsx
    memory/page.tsx  ← reads ?token= from query
    capture/page.tsx
    upload/page.tsx
    people/page.tsx
    account/page.tsx
  page.tsx           ← landing (no sidebar)
  auth/callback/page.tsx
```

```typescript
// frontend/app/(app)/layout.tsx
'use client'
import AuthGuard from '@/components/AuthGuard'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--cream)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
```

**Step 2: WaveformBars — deterministic visualizer (same as app.html)**
```typescript
// frontend/components/WaveformBars.tsx
'use client'

function waveHeight(token: string, i: number): number {
  // Deterministic from token chars — matches app.html algorithm
  const code = token.charCodeAt(i % token.length) || 0
  return 20 + ((code * 7 + i * 13) % 30)
}

export default function WaveformBars({ token, barCount = 28 }: { token: string; barCount?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36 }}>
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 99,
          height: waveHeight(token, i),
          background: 'var(--accent)',
          opacity: 0.5 + (i % 3) * 0.15,
        }} />
      ))}
    </div>
  )
}
```

**Step 3: MemoryCard**
```typescript
// frontend/components/MemoryCard.tsx
'use client'
import Link from 'next/link'
import WaveformBars from './WaveformBars'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
}

export default function MemoryCard({ memory }: { memory: Memory }) {
  return (
    <Link href={`/memory?token=${memory.token}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.15s' }}>
        <div style={{ aspectRatio: '4/3', background: 'var(--cream2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '2.5rem' }}>🍽️</span>
          }
        </div>
        <div style={{ padding: '0.85rem' }}>
          <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {memory.dish_name ?? 'Untitled'}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            {memory.narrator ?? 'Narrator'} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <WaveformBars token={memory.token} barCount={20} />
        </div>
      </div>
    </Link>
  )
}
```

**Step 4: Home page**
```typescript
// frontend/app/(app)/home/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import MemoryCard from '@/components/MemoryCard'
import Link from 'next/link'

export default function HomePage() {
  const [memories, setMemories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.recipes.list()
      .then(setMemories)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const favorites = memories.filter(m => {
    try { return JSON.parse(localStorage.getItem('rk_favorites') ?? '[]').includes(m.token) } catch { return false }
  })
  const recent = memories.slice(0, 6)

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        Your Family Archive
      </h1>

      {favorites.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.75rem' }}>Favourites</h2>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {favorites.map(m => <div key={m.token} style={{ minWidth: 200 }}><MemoryCard memory={m} /></div>)}
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Recent Memories</h2>
          <Link href="/memories" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>View all</Link>
        </div>
        {memories.length === 0
          ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>No memories yet — <Link href="/capture" style={{ color: 'var(--accent)' }}>record the first one</Link></div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {recent.map(m => <MemoryCard key={m.token} memory={m} />)}
            </div>
        }
      </section>
    </div>
  )
}
```

**Step 5: All Memories page**
```typescript
// frontend/app/(app)/memories/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import MemoryCard from '@/components/MemoryCard'

export default function MemoriesPage() {
  const [memories, setMemories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.recipes.list().then(setMemories).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        All Memories <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '1rem' }}>({memories.length})</span>
      </h1>
      {memories.length === 0
        ? <p style={{ color: 'var(--muted)' }}>No memories yet.</p>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {memories.map(m => <MemoryCard key={m.token} memory={m} />)}
          </div>
      }
    </div>
  )
}
```

**Step 6: Verify build**
```bash
cd frontend && npm run build
# npm run dev → check /home loads, memories grid renders
```

**Step 7: Commit**
```bash
git add frontend/app/\(app\)/ frontend/components/MemoryCard.tsx frontend/components/WaveformBars.tsx
git commit -m "[Add] [frontend]: home screen, all memories list, WaveformBars, MemoryCard"
```

---

## Chunk 1.5 — Memory detail page

**Files:**
- Create: `frontend/components/AudioPlayer.tsx`
- Create: `frontend/components/LanguageSwitcher.tsx`
- Create: `frontend/app/(app)/memory/page.tsx` (reads `?token=` query param)

**Step 1: AudioPlayer**
```typescript
// frontend/components/AudioPlayer.tsx
'use client'
import { useRef, useState } from 'react'

export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} style={{ width: '100%' }} controls />
    </div>
  )
}
```

**Step 2: LanguageSwitcher**
```typescript
// frontend/components/LanguageSwitcher.tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'kn', label: 'Kannada' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
]

type Props = {
  token: string
  onTranslated: (fields: any) => void
}

export default function LanguageSwitcher({ token, onTranslated }: Props) {
  const [lang, setLang] = useState('en')
  const [loading, setLoading] = useState(false)

  async function handleChange(code: string) {
    setLang(code)
    if (code === 'en') { onTranslated(null); return }
    setLoading(true)
    try {
      const result = await api.recipes.translate(token, code)
      onTranslated(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>View in:</span>
      <select value={lang} onChange={e => handleChange(e.target.value)} style={{ fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.6rem', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
        {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      {loading && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Translating…</span>}
    </div>
  )
}
```

**Step 3: Memory detail page (query param — not dynamic route)**
```typescript
// frontend/app/(app)/memory/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import AudioPlayer from '@/components/AudioPlayer'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { supabase } from '@/lib/supabase'

export default function MemoryPage() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const [memory, setMemory] = useState<any>(null)
  const [translated, setTranslated] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!token) { router.replace('/memories'); return }
    api.recipes.get(token).then(m => {
      setMemory(m)
      setNotes(m.user_notes ?? '')
      try {
        const favs = JSON.parse(localStorage.getItem('rk_favorites') ?? '[]')
        setFavorite(favs.includes(token))
      } catch {}
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [token, router])

  function toggleFavorite() {
    try {
      const favs: string[] = JSON.parse(localStorage.getItem('rk_favorites') ?? '[]')
      const next = favorite ? favs.filter(t => t !== token) : [...favs, token]
      localStorage.setItem('rk_favorites', JSON.stringify(next))
      setFavorite(!favorite)
    } catch {}
  }

  async function saveNotes() {
    setSaving(true)
    try { await api.recipes.patch(token, { user_notes: notes }) } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function deleteMemory() {
    if (!confirm(`Delete "${memory?.dish_name}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.recipes.delete(token); router.replace('/memories') }
    catch (e: any) { setError(e.message); setDeleting(false) }
  }

  const display = translated ?? memory
  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
  if (!memory) return null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)' }}>{display.dish_name ?? 'Untitled'}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
            {memory.narrator} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={toggleFavorite} title={favorite ? 'Remove from favourites' : 'Add to favourites'} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '1rem' }}>
            {favorite ? '★' : '☆'}
          </button>
          <button onClick={deleteMemory} disabled={deleting} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--accent)' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>

      {/* Language switcher */}
      <div style={{ marginBottom: '1.25rem' }}>
        <LanguageSwitcher token={token} onTranslated={setTranslated} />
      </div>

      {/* Image */}
      {memory.image_url && (
        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: '1.25rem', aspectRatio: '16/9', background: 'var(--cream2)' }}>
          <img src={memory.image_url} alt={display.dish_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      {/* Cook notes */}
      {display.cook_notes && (
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--border2)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontStyle: 'italic', color: 'var(--text2)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          {display.cook_notes}
        </div>
      )}

      {/* Ingredients */}
      {display.ingredients?.length > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Ingredients</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {display.ingredients.map((ing: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text)' }}>{ing.item}</span>
                <span style={{ color: 'var(--muted)' }}>{ing.quantity}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Steps */}
      {display.steps?.length > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Method</h2>
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {display.steps.map((step: string, i: number) => (
              <li key={i} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.6 }}>
                <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Audio */}
      {memory.audio_url && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Original Recording</h2>
          <AudioPlayer src={memory.audio_url} />
        </section>
      )}

      {/* Transcript */}
      {memory.transcript_english && (
        <details style={{ marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Full transcript</summary>
          <p style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7, marginTop: '0.5rem' }}>
            {memory.transcript_english}
          </p>
        </details>
      )}

      {/* Personal notes */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Your Notes</h2>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add your personal notes…" rows={3} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)', resize: 'vertical' }} />
        <button onClick={saveNotes} disabled={saving} style={{ marginTop: '0.5rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 9, padding: '0.5rem 1.25rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </section>
    </div>
  )
}
```

**Step 4: Verify build + manual test**
```bash
cd frontend && npm run build
# npm run dev → navigate to /memory?token=<real-token>
# Check: image, ingredients, steps, audio player, language switcher, notes, favourite, delete
```

**Step 5: Commit**
```bash
git add frontend/app/\(app\)/memory/ frontend/components/AudioPlayer.tsx frontend/components/LanguageSwitcher.tsx
git commit -m "[Add] [frontend]: memory detail — audio player, language switcher, favorites, delete, notes"
```

---

## Chunk 1.6 — Capture flow (record + upload + review wizard)

**Files:**
- Create: `frontend/components/NarratorChip.tsx`
- Create: `frontend/components/ReviewWizard.tsx`
- Create: `frontend/app/(app)/capture/page.tsx`
- Create: `frontend/app/(app)/upload/page.tsx`

**Step 1: NarratorChip — selector from People list**
```typescript
// frontend/components/NarratorChip.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Person = { id: string; name: string; relationship: string; emoji?: string }

export default function NarratorChip({ selected, onSelect }: { selected: string; onSelect: (name: string) => void }) {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => { api.people.list().then(setPeople).catch(() => {}) }, [])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {people.map(p => (
        <button key={p.id} onClick={() => onSelect(p.name)} style={{
          padding: '0.35rem 0.85rem', borderRadius: 99, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', border: '1px solid',
          borderColor: selected === p.name ? 'var(--accent)' : 'var(--border)',
          background: selected === p.name ? 'var(--accent-light)' : 'var(--surface)',
          color: selected === p.name ? 'var(--accent)' : 'var(--text2)',
        }}>
          {p.emoji ?? '👤'} {p.name}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: ReviewWizard — 3-step review flow**
The wizard handles both capture and upload. Steps: (1) confirm title, (2) edit ingredients/steps, (3) save. Full implementation mirrors the app.html review wizard.

```typescript
// frontend/components/ReviewWizard.tsx
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

export default function ReviewWizard({ draft, onCancel }: { draft: Draft; onCancel: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(draft.dish_name)
  const [ingredients, setIngredients] = useState<Ingredient[]>(draft.ingredients ?? [])
  const [steps, setSteps] = useState<string[]>(draft.steps ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    try {
      const saved = await api.capture.save({ ...draft, dish_name: title, ingredients, steps })
      router.push(`/memory?token=${saved.token}`)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  if (step === 1) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1rem' }}>Step 1 — Confirm title</h2>
      {draft.review_flags?.length > 0 && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text2)' }}>
          {draft.review_flags.map((f, i) => <div key={i}>⚠️ {f}</div>)}
        </div>
      )}
      <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '1rem', fontFamily: 'var(--serif)', color: 'var(--text)' }} />
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>Cancel</button>
        <button onClick={() => setStep(2)} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Next →</button>
      </div>
    </div>
  )

  if (step === 2) return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1rem' }}>Step 2 — Review ingredients & steps</h2>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Ingredients</div>
        {ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <input value={ing.item} onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], item: e.target.value }; setIngredients(n) }} placeholder="Ingredient" style={{ flex: 2, border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }} />
            <input value={ing.quantity} onChange={e => { const n = [...ingredients]; n[i] = { ...n[i], quantity: e.target.value }; setIngredients(n) }} placeholder="Qty" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem' }} />
            <button onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setIngredients([...ingredients, { item: '', quantity: '' }])} style={{ fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem' }}>+ Add ingredient</button>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button onClick={() => setStep(1)} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>← Back</button>
        <button onClick={() => setStep(3)} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Next →</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.5rem' }}>Step 3 — Save memory</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>"{title}" will be saved with {ingredients.length} ingredients.</p>
      {error && <div style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button onClick={() => setStep(2)} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>← Back</button>
        <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save forever ✓'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Capture page**
```typescript
// frontend/app/(app)/capture/page.tsx
'use client'
import { useState, useRef } from 'react'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

type Stage = 'idle' | 'recording' | 'processing' | 'review' | 'error'

export default function CapturePage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [narrator, setNarrator] = useState('')
  const [duration, setDuration] = useState(0)
  const [draft, setDraft] = useState<any>(null)
  const [error, setError] = useState('')
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { setError('Microphone access denied'); setStage('error'); return null })
    if (!stream) return
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mrRef.current = mr; chunksRef.current = []
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); processAudio(new Blob(chunksRef.current, { type: 'audio/webm' })) }
    mr.start(); setStage('recording'); setDuration(0)
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mrRef.current?.stop(); setStage('processing')
  }

  async function processAudio(blob: Blob) {
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result); setStage('review')
    } catch (e: any) { setError(e.message); setStage('error') }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Record a Memory</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Sit with your narrator. Press record. Let them speak naturally.</p>

      {stage !== 'review' && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Who is narrating?</div>
          <NarratorChip selected={narrator} onSelect={setNarrator} />
        </div>
      )}

      {stage === 'idle' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <button onClick={startRecording} style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', boxShadow: '0 0 0 12px var(--accent-light)' }}>🎙️</button>
          <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.82rem' }}>Tap to start recording</p>
        </div>
      )}

      {stage === 'recording' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <button onClick={stopRecording} style={{ width: 96, height: 96, borderRadius: '50%', background: '#DC2626', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer' }}>⏹</button>
          <p style={{ marginTop: '1rem', fontSize: '1.5rem', fontFamily: 'monospace', color: 'var(--text)' }}>{fmt(duration)}</p>
        </div>
      )}

      {stage === 'processing' && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>⏳ Processing…</p>
          <p style={{ fontSize: '0.82rem' }}>Transcribing, translating and structuring — about 30–60 seconds</p>
        </div>
      )}

      {stage === 'error' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{error}</p>
          <button onClick={() => { setStage('idle'); setError('') }} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.5rem', cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      {stage === 'review' && draft && <ReviewWizard draft={draft} onCancel={() => { setStage('idle'); setDraft(null) }} />}
    </div>
  )
}
```

**Step 4: Upload page (same wizard, file input)**
```typescript
// frontend/app/(app)/upload/page.tsx
'use client'
import { useState, useRef } from 'react'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

export default function UploadPage() {
  const [narrator, setNarrator] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setProcessing(true)
    const form = new FormData()
    form.append('audio', file)
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result)
    } catch (e: any) { setError(e.message) } finally { setProcessing(false) }
  }

  if (draft) return <ReviewWizard draft={draft} onCancel={() => setDraft(null)} />

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Upload a Recording</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Already have an audio recording? Upload it here.</p>
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Who is narrating?</div>
        <NarratorChip selected={narrator} onSelect={setNarrator} />
      </div>
      <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: 14, padding: '2.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--surface)' }}>
        <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {processing ? <p style={{ color: 'var(--muted)' }}>⏳ Processing…</p> : <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>📂 Click to choose an audio file</p>}
      </label>
      {error && <p style={{ color: 'var(--accent)', marginTop: '0.75rem', fontSize: '0.82rem' }}>{error}</p>}
    </div>
  )
}
```

**Step 5: Verify build + manual test**
```bash
cd frontend && npm run build
# npm run dev → test full capture flow end-to-end
# Check: record → processing → review wizard → save → redirect to /memory?token=...
```

**Step 6: Commit**
```bash
git add frontend/app/\(app\)/capture/ frontend/app/\(app\)/upload/ frontend/components/NarratorChip.tsx frontend/components/ReviewWizard.tsx
git commit -m "[Add] [frontend]: capture flow — record, upload, 3-step review wizard"
```

---

## Chunk 1.7 — People, Account, Privacy

**Files:**
- Create: `frontend/app/(app)/people/page.tsx`
- Create: `frontend/app/(app)/account/page.tsx`
- Create: `frontend/app/(app)/privacy/page.tsx`

**Step 1: People page (narrator management)**

Full CRUD — grid of narrator cards, add/edit/delete modal. Mirrors app.html People screen.

```typescript
// frontend/app/(app)/people/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Person = { id: string; name: string; relationship: string; emoji?: string; photo_url?: string; bio?: string; notes?: string }

const EMPTY: Omit<Person, 'id'> = { name: '', relationship: '', emoji: '👤', photo_url: '', bio: '', notes: '' }

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [modal, setModal] = useState<{ open: boolean; editing: Person | null }>({ open: false, editing: null })
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.people.list().then(setPeople).catch(e => setError(e.message)) }, [])

  function openAdd() { setForm(EMPTY); setModal({ open: true, editing: null }) }
  function openEdit(p: Person) { setForm({ name: p.name, relationship: p.relationship, emoji: p.emoji ?? '👤', photo_url: p.photo_url ?? '', bio: p.bio ?? '', notes: p.notes ?? '' }); setModal({ open: true, editing: p }) }

  async function save() {
    setSaving(true)
    try {
      if (modal.editing) {
        const updated = await api.people.update(modal.editing.id, form)
        setPeople(prev => prev.map(p => p.id === modal.editing!.id ? updated : p))
      } else {
        const created = await api.people.create(form)
        setPeople(prev => [...prev, created])
      }
      setModal({ open: false, editing: null })
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this narrator?')) return
    await api.people.delete(id).catch(e => setError(e.message))
    setPeople(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)' }}>Narrators</h1>
        <button onClick={openAdd} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.55rem 1.25rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>+ Add narrator</button>
      </div>
      {error && <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        {people.map(p => (
          <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem', position: 'relative' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{p.emoji ?? '👤'}</div>
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.2rem' }}>{p.name}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>{p.relationship}</p>
            {p.bio && <p style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.5 }}>{p.bio}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
              <button onClick={() => openEdit(p)} style={{ flex: 1, padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text2)' }}>Edit</button>
              <button onClick={() => remove(p.id)} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--accent)' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '1.25rem' }}>{modal.editing ? 'Edit narrator' : 'Add narrator'}</h2>
            {(['name', 'relationship', 'emoji', 'bio', 'notes'] as const).map(field => (
              <div key={field} style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--muted)', marginBottom: '0.3rem' }}>{field}</label>
                <input value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setModal({ open: false, editing: null })} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Account page**
```typescript
// frontend/app/(app)/account/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

export default function AccountPage() {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function deleteAccount() {
    if (!confirm('Permanently delete your account and all family memories? This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? All audio, memories, and narrators will be erased.')) return
    setDeleting(true)
    try {
      await api.account.delete()
      await supabase.auth.signOut()
      router.replace('/')
    } catch (e: any) { setError(e.message); setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '2rem' }}>Account</h1>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
        <h2 style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.5rem' }}>Delete account</h2>
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Permanently deletes all memories, audio recordings, narrator profiles, and your account. This cannot be undone.
        </p>
        {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
        <button onClick={deleteAccount} disabled={deleting} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.65rem 1.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Privacy page (static)**
```typescript
// frontend/app/(app)/privacy/page.tsx
export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)', marginBottom: '1.5rem' }}>Privacy Policy</h1>
      <p style={{ color: 'var(--text2)', lineHeight: 1.8, fontSize: '0.9rem' }}>
        Echoes of Home stores your voice recordings, transcripts, and structured memories securely in Supabase. Your data is private to your account and never shared with third parties. Audio is stored in a private storage bucket with signed URLs expiring after 1 hour. You may delete your account and all associated data at any time from the Account page.
      </p>
    </div>
  )
}
```

**Step 4: Add Account + Privacy links to Sidebar**

Update `frontend/components/Sidebar.tsx` NAV array to include:
```typescript
{ group: 'Settings', items: [
  { label: 'Account', icon: '⚙️', href: '/account' },
  { label: 'Privacy', icon: '🔒', href: '/privacy' },
]}
```

**Step 5: Verify build**
```bash
cd frontend && npm run build
# npm run dev → test people CRUD, account page, privacy page
```

**Step 6: Commit**
```bash
git add frontend/app/\(app\)/people/ frontend/app/\(app\)/account/ frontend/app/\(app\)/privacy/
git commit -m "[Add] [frontend]: people management, account deletion, privacy page"
```

---

## Chunk 1.8 — Capacitor: iOS scaffold + sync both platforms

**Files:**
- Modify: `capacitor.config.json` (finalize before sync)
- Run: `npx cap add ios`
- Run: `npx cap sync android`
- Run: `npx cap sync ios`
- Manual: Xcode — add URL scheme for deep link

**Step 1: Verify the static build output exists**
```bash
cd frontend && npm run build
ls frontend/out/  # must exist
```

**Step 2: Add iOS Capacitor project**
```bash
npx cap add ios
# Generates ios/ directory with Xcode project
```

**Step 3: Configure iOS URL scheme in Xcode**

Open `ios/App/App.xcworkspace` in Xcode:
1. Select the `App` target → **Info** tab → **URL Types**
2. Add URL scheme: `recipekeepsake`
3. This enables `recipekeepsake://auth/callback` deep links

Also add microphone usage description in `ios/App/App/Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Echoes of Home needs microphone access to record family memories.</string>
```

**Step 4: Sync both platforms**
```bash
npx cap sync android
npx cap sync ios
```

**Step 5: Add Vercel URL to Supabase Auth (manual)**

In Supabase dashboard → Authentication → URL Configuration → Redirect URLs, add:
```
https://<your-vercel-url>.vercel.app/auth/callback
recipekeepsake://auth/callback
```

**Step 6: Test on Android emulator**
```bash
npx cap open android
# Android Studio → Run on emulator
# Verify: app loads, auth works, memories show
```

**Step 7: Commit**
```bash
git add ios/ capacitor.config.json
git add android/  # sync may update android files
git commit -m "[Add] [capacitor]: iOS project scaffolded, deep link configured, both platforms synced"
```

---

## Chunk 1.9 — Vercel deploy + cutover

**Step 1: Deploy to Vercel**
```bash
# Connect web/nextjs → frontend/ in Vercel dashboard, or:
cd frontend
npx vercel --prod
# Note the deployment URL: https://echoes-of-home-xxx.vercel.app
```

Set Vercel environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` → Railway backend URL

**Step 2: Smoke test all screens on Vercel URL**
- [ ] Landing page loads
- [ ] Google OAuth completes, redirects to /home
- [ ] Memories list loads with real data
- [ ] Memory detail: audio plays, language switcher works, notes save
- [ ] Capture: record → wizard → save → redirects to detail
- [ ] People: add/edit/delete narrator
- [ ] Account page accessible

**Step 3: Update Capacitor server.url to Vercel**
```json
"server": {
  "url": "https://echoes-of-home-xxx.vercel.app",
  "cleartext": false,
  "androidScheme": "https"
}
```

```bash
npx cap sync android
npx cap sync ios
```

**Step 4: Remove app.html route from FastAPI**

In `scripts/serve.py`, remove the `@app.get("/")` route that serves `app.html`. Replace with a redirect to the Vercel URL:
```python
from fastapi.responses import RedirectResponse

@app.get("/")
async def index():
    return RedirectResponse("https://echoes-of-home-xxx.vercel.app", status_code=301)
```

**Step 5: Final test — native**
```bash
npx cap open android
# Verify: Vercel URL loads in the native shell, auth deep link works
```

**Step 6: Commit + push**
```bash
git add scripts/serve.py capacitor.config.json android/ ios/
git commit -m "[Fix] [cutover]: Vercel live — serve.py redirects to Vercel, Capacitor server.url updated"
git push
```

---

## Verification checklist (end of phase)

- [ ] `cd frontend && npm run build` exits 0
- [ ] All 9 screens functional on Vercel URL
- [ ] Google OAuth completes on web
- [ ] Google OAuth completes on Android emulator via deep link
- [ ] `npx cap sync android` and `npx cap sync ios` pass
- [ ] iOS project opens in Xcode without errors
- [ ] `python -m pytest tests/ -q` still 97 passed (no Python regressions)
- [ ] `capacitor.config.json`: appName = "Echoes of Home", appId = "com.echoesofhome.app"
- [ ] `web/app.html` route retired from FastAPI

---

Ready to build? Use `/build`.
