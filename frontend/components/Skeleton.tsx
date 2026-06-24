'use client'

/** Shimmering placeholder shaped like a memory list row (home page). */
export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div className="rk-skeleton" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rk-skeleton" style={{ width: '55%', height: 14, marginBottom: 6 }} />
        <div className="rk-skeleton" style={{ width: '35%', height: 10, marginBottom: 8 }} />
        <div className="rk-skeleton" style={{ width: '90%', height: 8 }} />
      </div>
    </div>
  )
}

/** Shimmering placeholder shaped like a memory grid card (memories/tales pages). */
export function SkeletonCard() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div className="rk-skeleton" style={{ aspectRatio: '4/3', borderRadius: 0 }} />
      <div style={{ padding: '0.85rem' }}>
        <div className="rk-skeleton" style={{ width: '70%', height: 14, marginBottom: 8 }} />
        <div className="rk-skeleton" style={{ width: '45%', height: 10 }} />
      </div>
    </div>
  )
}
