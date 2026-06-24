'use client'

function waveHeight(token: string, i: number): number {
  const code = token.charCodeAt(i % token.length) || 0
  return 20 + ((code * 7 + i * 13) % 30)
}

export default function WaveformBars({ token, barCount = 28 }: { token: string; barCount?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36 }}>
      {/* Deterministic decoration, not real audio peaks — kept in a neutral
          tone (not --accent) so it doesn't read as a scrubbable control the
          way a brightly-colored waveform would. The actual play affordance
          is the circular play button next to it. */}
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 99,
          height: waveHeight(token, i),
          background: 'var(--border2)',
          opacity: 0.6 + (i % 3) * 0.13,
        }} />
      ))}
    </div>
  )
}
