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

async function publicFetch(path: string) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    const detail = err.detail
    const message = typeof detail === 'string' ? detail : 'Request failed'
    throw new Error(message)
  }
  return res.json()
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
    const detail = err.detail
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(', ')
        : 'Request failed'
    throw new Error(`${message}${suffix}`)
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
    getBySlug: (slug: string) => authFetch(`/recipe/by-slug/${slug}`),
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
    save: (formData: FormData) => authFetch('/capture/save', { method: 'POST', body: formData }),
  },
  audio: {
    save: (formData: FormData) => authFetch('/save-audio', { method: 'POST', body: formData }),
  },
  text: {
    save: (body: { title: string; text: string; memory_type: string; narrator?: string }) =>
      authFetch('/save-text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  },
  memories: {
    async uploadPhoto(token: string, file: File): Promise<{ image_url: string }> {
      const form = new FormData()
      form.append('photo', file)
      return authFetch(`/memories/${token}/photo`, { method: 'POST', body: form })
    },
  },
  account: {
    delete: () => authFetch('/account', { method: 'DELETE' }),
  },
  family: {
    createGroup: (name: string) =>
      authFetch('/family/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    getMyGroup: () => authFetch('/family/groups/me'),
    join: (inviteToken: string) =>
      authFetch(`/family/groups/join/${inviteToken}`, { method: 'POST' }),
    members: () => authFetch('/family/members'),
    recipes: async () => {
      const data: unknown = await authFetch('/family/recipes')
      if (data && typeof data === 'object' && 'recipes' in data) {
        const rows = (data as { recipes: unknown }).recipes
        return Array.isArray(rows) ? rows : []
      }
      return []
    },
  },
  portal: {
    get: (portalToken: string) => publicFetch(`/portal/${portalToken}`),
  },
  viewers: {
    list: () => authFetch('/viewers'),
    add: (body: { email?: string; phone?: string }) =>
      authFetch('/viewers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    revoke: (id: string) => authFetch(`/viewers/${id}`, { method: 'DELETE' }),
    sharedWithMe: () => authFetch('/viewers/shared-with-me'),
  },
}
