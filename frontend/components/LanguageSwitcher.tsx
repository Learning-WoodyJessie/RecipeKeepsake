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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      <select value={lang} onChange={e => handleChange(e.target.value)} style={{ fontSize: '0.8rem', border: '1px solid var(--border2)', borderRadius: 8, padding: '0.3rem 0.6rem', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
        {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      {loading && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Translating…</span>}
    </div>
  )
}
