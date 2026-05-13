import { supabase } from './supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/** Narrator profile returned by `/people` endpoints. */
export type Person = {
  id: string
  name: string
  relationship: string
  emoji?: string
  photo_url?: string
  bio?: string
  notes?: string
}

async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    ...(options.headers ?? {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (!res.ok) {
    const requestId = res.headers.get('x-request-id')
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    const suffix = requestId ? ` [req:${requestId}]` : ''
    throw new Error(`${err.detail ?? 'Request failed'}${suffix}`)
  }
  return res.json()
}

export const api = {
  recipes: {
    async list() {
      const data: unknown = await authFetch('/recipes')
      if (Array.isArray(data)) return data
      if (data && typeof data === 'object' && 'recipes' in data) {
        const rows = (data as { recipes: unknown }).recipes
        return Array.isArray(rows) ? rows : []
      }
      return []
    },
    get: (token: string) => authFetch(`/recipe/${token}`),
    translate: (token: string, lang: string) => authFetch(`/recipe/${token}/translate?lang=${lang}`),
    patch: (token: string, body: object) => authFetch(`/recipe/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (token: string) => authFetch(`/recipe/${token}`, { method: 'DELETE' }),
  },
  people: {
    async list(): Promise<Person[]> {
      const data: unknown = await authFetch('/people')
      if (Array.isArray(data)) return data as Person[]
      if (data && typeof data === 'object' && 'people' in data) {
        const rows = (data as { people: unknown }).people
        return Array.isArray(rows) ? (rows as Person[]) : []
      }
      return []
    },
    async create(body: object): Promise<Person> {
      const data: unknown = await authFetch('/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (data && typeof data === 'object' && 'person' in data) return (data as { person: Person }).person
      return data as Person
    },
    async update(id: string, body: object): Promise<Person> {
      const data: unknown = await authFetch(`/people/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (data && typeof data === 'object' && 'person' in data) return (data as { person: Person }).person
      return data as Person
    },
    delete: (id: string) => authFetch(`/people/${id}`, { method: 'DELETE' }),
  },
  capture: {
    process: (formData: FormData) => authFetch('/capture/process', { method: 'POST', body: formData }),
    save: (body: object) => authFetch('/capture/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  },
  audio: {
    save: (formData: FormData) => authFetch('/save-audio', { method: 'POST', body: formData }),
  },
  account: {
    delete: () => authFetch('/account', { method: 'DELETE' }),
  },
}
