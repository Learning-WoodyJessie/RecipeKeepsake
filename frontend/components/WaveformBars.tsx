'use client'

function waveHeight(token: string, i: number): number {
  const code = token.charCodeAt(i % token.length) || 0
  return 20 + ((code * 7 + i * 13) % 30)
}

export default function WaveformBars({ token, barCount = 28 }: { token: string; barCount?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36 }}>
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 99,
          height: waveHeight(token, i),
          background: 'var(--accent)',
          opacity: 0.5 + (i % 3) * 0.15,
        }} />
      ))}
    </div>
  )
}
