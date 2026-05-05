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
