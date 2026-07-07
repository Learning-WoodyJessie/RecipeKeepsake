'use client'
import { useRef, useState } from 'react'

export default function AudioPlayer({ src, onExpired }: { src: string; onExpired?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const retriedRef = useRef(false)

  function toggle() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  function handleError() {
    // Only attempt once — if the refresh itself produces a bad URL, stop.
    if (!retriedRef.current && onExpired) {
      retriedRef.current = true
      onExpired()
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} onError={handleError} style={{ width: '100%' }} controls />
    </div>
  )
}
