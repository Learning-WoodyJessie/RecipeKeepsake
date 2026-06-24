'use client'
import { useState } from 'react'

/**
 * Shared favorite-toggle heart, used across home/memories/memory-detail
 * instead of each screen duplicating its own button + color logic. Gold on
 * favorite, neutral otherwise — pops briefly on toggle via .rk-heart-pop
 * (defined in globals.css, itself a no-op under prefers-reduced-motion).
 */
export default function FavoriteHeart({
  favorite,
  onToggle,
  size = '1.1rem',
  style,
}: {
  favorite: boolean
  onToggle: () => void
  size?: string
  style?: React.CSSProperties
}) {
  const [popping, setPopping] = useState(false)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggle()
    setPopping(true)
    setTimeout(() => setPopping(false), 350)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      className={popping ? 'rk-heart-pop' : undefined}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: size,
        lineHeight: 1,
        /* --border2 here measured ~1.5:1 against white/light card
           backgrounds — invisible, not just subtle. --muted (~5:1) is the
           floor for "visible but neutral." */
        color: favorite ? 'var(--amber)' : 'var(--muted)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        ...style,
      }}
    >
      {favorite ? '♥' : '♡'}
    </button>
  )
}
