'use client'
import { useState } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

/**
 * Photo picker for narrator profiles — replaces the old "paste a URL" field.
 * @capacitor/camera works on native (real camera/library picker) and on web
 * (falls back to a plain file input automatically), so this one component
 * covers both without platform-specific branching here.
 */
export default function PhotoPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (dataUri: string) => void
}) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function pick(source: CameraSource) {
    setError('')
    setLoading(true)
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source,
        quality: 80,
      })
      if (photo.dataUrl) onChange(photo.dataUrl)
    } catch (e: unknown) {
      // User cancelling the picker also rejects the promise — not a real error
      const message = (e as Error)?.message ?? ''
      if (!/cancel/i.test(message)) setError('Could not get photo. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>👤</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => pick(CameraSource.Prompt)}
            disabled={loading}
            style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', textAlign: 'left', padding: 0 }}
          >
            {loading ? 'Loading…' : value ? 'Change photo' : 'Add a photo'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>{error}</p>}
    </div>
  )
}
