import { supabase } from './supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    ...(options.headers ?? {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
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
