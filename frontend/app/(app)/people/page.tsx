// Our People page — aligned to Echoes of Home product mockup.
// Layout: 2-column (people list | why-it-matters panel).
// Hero with title, subtitle, decorative illustration, +Add button.
// Each person: horizontal card with circle photo, name, relationship pill, bio, stats, play sample.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, type Person } from '@/lib/api'
import PhotoPicker from '@/components/PhotoPicker'

// photo_data (base64) is request-only - the server uploads it and responds
// with a real photo_url, it's never part of the canonical Person shape.
type FormData = Omit<Person, 'id'> & { photo_data?: string }
const EMPTY: FormData = { name: '', relationship: '', emoji: '👤', photo_url: '', bio: '', notes: '' }

type MemoryBreakdown = {
  recipes: number; songs: number; stories: number
  fables: number; wisdom: number; poems: number
  languages: string[]
}
const EMPTY_BREAKDOWN: MemoryBreakdown = { recipes: 0, songs: 0, stories: 0, fables: 0, wisdom: 0, poems: 0, languages: [] }

const LANG_NAMES: Record<string, string> = { te: 'Telugu', hi: 'Hindi', en: 'English', kn: 'Kannada', ta: 'Tamil', es: 'Spanish', fr: 'French' }

function isAudioMemory(m: { tags?: string[] | null }): boolean {
  return (m.tags ?? []).some(t => t === 'tale' || t === 'audio')
}

function resolveBreakdown(counts: Record<string, MemoryBreakdown>, personName: string): MemoryBreakdown {
  const pKey = personName.toLowerCase().trim()
  // Exact match first
  if (counts[pKey]) return counts[pKey]
  // Fall back to partial match — mirrors the .includes() logic in the memories grid narrator filter
  const partial = Object.keys(counts).find(k => k.includes(pKey) || pKey.includes(k))
  return partial ? counts[partial] : EMPTY_BREAKDOWN
}

// ─── SVG Icons ────────────────────────────────────────────────────────────
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

// ─── Right panel ─────────────────────────────────────────────────────────
function FamilyCollectionCard({ groupData, groupChecked }: { groupData: { portal_url?: string; invite_url?: string } | null; groupChecked: boolean }) {
  const [copied, setCopied] = useState<'collection' | 'invite' | null>(null)
  function copy(url: string, type: 'collection' | 'invite') {
    navigator.clipboard.writeText(url).then(() => { setCopied(type); setTimeout(() => setCopied(null), 2000) })
  }
  function shareWhatsApp(url: string, label: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${label}\n${url}`)}`)
  }

  if (!groupChecked) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
        Family collection
      </h3>

      {groupData ? (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '0.85rem' }}>
            Share these links with family. Anyone can browse your collection, no account needed.
          </p>
          {/* Collection link */}
          <div style={{ marginBottom: '0.65rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: '0.3rem' }}>Collection link</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => shareWhatsApp(groupData.portal_url ?? '', 'Browse our family collection:')}
                style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '0.35rem 0.7rem', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.527 5.845L.057 24l6.345-1.462A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                Share
              </button>
              <button onClick={() => copy(groupData.portal_url ?? '', 'collection')}
                style={{ flex: 1, background: 'var(--cream2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.35rem 0.6rem', fontSize: '0.72rem', color: copied === 'collection' ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {copied === 'collection' ? '✓ Copied!' : (groupData.portal_url ?? '').replace('https://', '')}
              </button>
            </div>
          </div>
          {/* Invite link */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: '0.3rem' }}>Invite to add memories</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => shareWhatsApp(groupData.invite_url ?? '', 'Join our family collection on Echoes of Home:')}
                style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '0.35rem 0.7rem', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.527 5.845L.057 24l6.345-1.462A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                Invite
              </button>
              <button onClick={() => copy(groupData.invite_url ?? '', 'invite')}
                style={{ flex: 1, background: 'var(--cream2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.35rem 0.6rem', fontSize: '0.72rem', color: copied === 'invite' ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {copied === 'invite' ? '✓ Copied!' : (groupData.invite_url ?? '').replace('https://', '')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '0.85rem' }}>
            Choose which memories to share with family. They browse on their phone, no account needed.
          </p>
          <Link href="/account#family" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700 }}>
            Set up family collection
          </Link>
        </>
      )}
    </div>
  )
}

function WhyItMatters() {
  const items = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
        </svg>
      ),
      title: 'Every voice is unique',
      desc: 'Different stories, tips and memories make our collection richer.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      ),
      title: 'Preserve their legacy',
      desc: 'Keep their recipes and stories alive for future generations.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
      title: 'Stronger together',
      desc: 'When we share, we create a lasting bond that never fades.',
    },
  ]

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.35rem 1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          Why it matters
        </h3>
        {items.map((item) => (
          <div key={item.title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.1rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              {item.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: 3 }}>{item.title}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}

        {/* Quote */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.25rem' }}>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65, textAlign: 'center', marginBottom: '0.65rem' }}>
            &ldquo;The stories we collect today become the memories generations will treasure tomorrow.&rdquo;
          </p>
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '1rem' }}>♡</div>
        </div>
      </div>
    </aside>
  )
}

// ─── Person row card ──────────────────────────────────────────────────────
function PersonCard({ person, breakdown, onEdit, onNavigate }: { person: Person; breakdown: MemoryBreakdown; onEdit: () => void; onNavigate: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.25rem 1.35rem',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onClick={onNavigate}
    >
      {/* Photo */}
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--cream2)', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--border)' }}>
        {person.photo_url ? (
          <img src={person.photo_url} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            {person.emoji ?? '👤'}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
          <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.15rem', color: 'var(--text)' }}>{person.name}</p>
          {person.relationship && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'var(--accent-light)',
              border: '1px solid rgba(24,107,94,0.2)',
              borderRadius: 20,
              padding: '0.2rem 0.65rem',
              whiteSpace: 'nowrap',
            }}>
              {person.relationship}
            </span>
          )}
        </div>
        {person.bio && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '0.55rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {person.bio}
          </p>
        )}
        {(() => {
          const total = breakdown.recipes + breakdown.songs + breakdown.stories + breakdown.fables + breakdown.wisdom + breakdown.poems
          if (total === 0) return <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.35rem' }}>No memories yet</p>
          const chips: Array<{ count: number; label: string; bg: string; border: string; color: string }> = [
            { count: breakdown.recipes, label: 'recipe',  bg: 'var(--accent-light)', border: 'rgba(24,107,94,0.25)', color: 'var(--accent)' },
            { count: breakdown.songs,   label: 'song',    bg: '#EEEDFE', border: '#CECBF6', color: '#534AB7' },
            { count: breakdown.stories, label: 'story',   bg: '#FAEEDA', border: '#FAC775', color: '#854F0B' },
            { count: breakdown.fables,  label: 'fable',   bg: '#FBEAF0', border: '#F4C0D1', color: '#993556' },
            { count: breakdown.wisdom,  label: 'wisdom',  bg: '#E6F1FB', border: '#B5D4F4', color: '#185FA5' },
            { count: breakdown.poems,   label: 'poem',    bg: '#E1F5EE', border: '#9FE1CB', color: '#0F6E56' },
          ].filter(c => c.count > 0)
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.45rem' }}>
              {chips.map(c => (
                <span key={c.label} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`, color: c.color, whiteSpace: 'nowrap' }}>
                  {c.count} {c.count === 1 ? c.label : c.label + 's'}
                </span>
              ))}
              {breakdown.languages.length > 0 && (
                <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: 'var(--cream2, #F3EDE4)', border: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {breakdown.languages.map(l => LANG_NAMES[l] ?? l).join(' · ')}
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* Record + Edit + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
        <Link
          href={`/capture?narrator=${encodeURIComponent(person.name)}`}
          aria-label={`Record a memory for ${person.name}`}
          title={`Record a memory for ${person.name}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '1.5px solid var(--accent)',
            background: 'var(--accent-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--accent)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
          </svg>
        </Link>
        <button
          type="button"
          aria-label="Edit"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '1.5px solid var(--border)',
            background: 'var(--cream)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--muted)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <span style={{ color: 'var(--muted)', opacity: 0.5 }}><ChevronRight /></span>
      </div>
    </div>
  )
}

// ─── Hero illustration ────────────────────────────────────────────────────
function HeroIllustration() {
  return (
    <div style={{ flexShrink: 0, width: 'clamp(200px, 30vw, 340px)' }}>
      <img
        src="/hero-people.png"
        alt="Every voice. Every story. Every memory."
        style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
      />
    </div>
  )
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────
function PersonModal({
  editing,
  form,
  setForm,
  onSave,
  onDelete,
  onClose,
  saving,
  error,
}: {
  editing: Person | null
  form: FormData
  setForm: (f: FormData) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  saving: boolean
  error: string
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', color: 'var(--text)', marginBottom: '1.35rem' }}>
          {editing ? `Edit ${editing.name}` : 'Add someone special'}
        </h2>

        <div style={{ marginBottom: '0.85rem' }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '0.3rem' }}>Photo</label>
          {/* Preview shows the new photo_data if just picked, otherwise the
              existing photo_url - keeps the JSON payload from carrying the
              same base64 image twice under two different keys. */}
          <PhotoPicker
            value={form.photo_data || form.photo_url || ''}
            onChange={dataUri => {
              // Empty string = "Remove" was clicked - clear photo_url too,
              // not just stop sending new photo_data, otherwise the existing
              // server-side photo_url would silently survive the "removal".
              if (dataUri) setForm({ ...form, photo_data: dataUri })
              else setForm({ ...form, photo_data: undefined, photo_url: '' })
            }}
          />
        </div>

        {[
          { field: 'name' as keyof FormData, label: 'Name', placeholder: 'Lakshmi' },
          { field: 'relationship' as keyof FormData, label: 'Relationship', placeholder: 'Grandmother' },
          { field: 'bio' as keyof FormData, label: 'About them', placeholder: 'The heart of our kitchen, known for her biryani and her stories.' },
          { field: 'notes' as keyof FormData, label: 'Notes', placeholder: 'Speaks mostly Telugu, loves evenings on the porch.' },
        ].map(({ field, label, placeholder }) => (
          <div key={field} style={{ marginBottom: '0.85rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '0.3rem' }}>{label}</label>
            {field === 'bio' || field === 'notes' ? (
              <textarea
                rows={3}
                value={(form[field] as string) ?? ''}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                placeholder={placeholder}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', background: 'var(--cream)', color: 'var(--text)', resize: 'vertical' }}
              />
            ) : (
              <input
                value={(form[field] as string) ?? ''}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                placeholder={placeholder}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', background: 'var(--cream)', color: 'var(--text)' }}
              />
            )}
          </div>
        ))}

        {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.25rem' }}>
          {editing && (
            <button onClick={onDelete} style={{ padding: '0.65rem 0.85rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.82rem' }}>
              Delete
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '0.85rem' }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function PeoplePage() {
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [memoryCounts, setMemoryCounts] = useState<Record<string, MemoryBreakdown>>({})
  const [modal, setModal] = useState<{ open: boolean; editing: Person | null }>({ open: false, editing: null })
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [groupData, setGroupData] = useState<{ portal_url?: string; invite_url?: string } | null>(null)
  const [groupChecked, setGroupChecked] = useState(false)

  useEffect(() => {
    api.people.list().then(setPeople).catch((e: Error) => setError(e.message))
    api.recipes.list().then((memories: Array<{ narrator?: string; type?: string | null; tags?: string[] | null; language?: string | null }>) => {
      const counts: Record<string, MemoryBreakdown> = {}
      for (const m of memories) {
        const key = (m.narrator ?? '').toLowerCase().trim()
        if (!key) continue
        if (!counts[key]) counts[key] = { ...EMPTY_BREAKDOWN, languages: [] }
        const b = counts[key]
        if (isAudioMemory(m)) {
          const t = m.type ?? ''
          if (t === 'song' || t === '' || t === 'recipe') b.songs++
          else if (t === 'story') b.stories++
          else if (t === 'fable') b.fables++
          else if (t === 'wisdom') b.wisdom++
          else if (t === 'poem') b.poems++
          else b.songs++
        } else {
          b.recipes++
        }
        if (m.language && !b.languages.includes(m.language)) b.languages.push(m.language)
      }
      setMemoryCounts(counts)
    }).catch(() => {})
    api.family.getMyGroup().then((d: { portal_url?: string; invite_url?: string }) => {
      setGroupData(d)
    }).catch(() => {}).finally(() => setGroupChecked(true))
  }, [])

  function openAdd() { setForm(EMPTY); setModal({ open: true, editing: null }) }
  function openEdit(p: Person) {
    setForm({ name: p.name, relationship: p.relationship, emoji: p.emoji ?? '👤', photo_url: p.photo_url ?? '', bio: p.bio ?? '', notes: p.notes ?? '' })
    setModal({ open: true, editing: p })
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (modal.editing) {
        const updated = await api.people.update(modal.editing.id, form)
        setPeople(prev => prev.map(p => p.id === modal.editing!.id ? updated : p))
      } else {
        const created = await api.people.create(form)
        setPeople(prev => [...prev, created])
      }
      setModal({ open: false, editing: null })
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!modal.editing) return
    if (!confirm(`Delete ${modal.editing.name}? This cannot be undone.`)) return
    await api.people.delete(modal.editing.id).catch((e: Error) => setError(e.message))
    setPeople(prev => prev.filter(p => p.id !== modal.editing!.id))
    setModal({ open: false, editing: null })
  }

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-people-cols { display: grid; grid-template-columns: 1fr; gap: 1.25rem; max-width: 1200px; margin: 0 auto; }
        @media (min-width: 860px) { .rk-people-cols { grid-template-columns: 1fr 272px; align-items: start; } }
      `}</style>

      <div className="rk-people-cols">
        {/* ── Main ── */}
        <div>
          {/* Hero — sticky so "+ Add Person" stays visible as list grows */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cream, #FAF6F1)', paddingTop: '0.5rem', paddingBottom: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flex: 1 }}>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  Our People <span style={{ color: 'var(--muted)' }}>♡</span>
                </h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 400 }}>
                  Precious voices that echo through every recipe, every song, every story. Treasured here, forever.
                </p>
              </div>
              <HeroIllustration />
            </div>
            <button
              onClick={openAdd}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.1rem',
                borderRadius: 20,
                border: '1.5px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              + Add Person
            </button>
          </div>

          {error && <p style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</p>}

          {/* People list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {people.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                breakdown={resolveBreakdown(memoryCounts, p.name)}
                onEdit={() => openEdit(p)}
                onNavigate={() => router.push(`/memories?narrator=${encodeURIComponent(p.name)}`)}
              />
            ))}
          </div>

        </div>

        {/* ── Right panel ── */}
        <FamilyCollectionCard groupData={groupData} groupChecked={groupChecked} />
        <WhyItMatters />
      </div>

      {/* Modal */}
      {modal.open && (
        <PersonModal
          editing={modal.editing}
          form={form}
          setForm={setForm}
          onSave={save}
          onDelete={remove}
          onClose={() => { setModal({ open: false, editing: null }); setError('') }}
          saving={saving}
          error={error}
        />
      )}
    </div>
  )
}
