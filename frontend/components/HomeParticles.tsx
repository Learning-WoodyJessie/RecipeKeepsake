'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  x: number; y: number
  size: number
  vx: number; vy: number
  opacity: number
  phase: number
  kind: 'amber' | 'green' | 'terracotta'
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, () => {
    const r = Math.random()
    return {
      x: Math.random(),
      y: Math.random(),
      size: 7 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 0.00022,
      vy: -(0.0003 + Math.random() * 0.0007),
      opacity: 0.22 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      kind: r < 0.38 ? 'amber' : r < 0.72 ? 'green' : 'terracotta',
    }
  })
}

export default function HomeParticles({ count = 120 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pts = makeParticles(count)
    let rafId = 0
    let W = 0, H = 0

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      const dpr = Math.min(devicePixelRatio, 2)
      canvas!.width  = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width  = W + 'px'
      canvas!.style.height = H + 'px'
      // setTransform instead of scale to avoid cumulative scaling on resize
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw(ts: number) {
      ctx!.clearRect(0, 0, W, H)
      const t = ts * 0.001

      for (const p of pts) {
        p.x += p.vx + Math.sin(t * 0.25 + p.phase) * 0.0001
        p.y += p.vy
        if (p.y < -0.04) p.y = 1.04
        if (p.x < -0.04) p.x = 1.04
        if (p.x >  1.04) p.x = -0.04

        const alpha = p.opacity * (0.6 + 0.4 * Math.sin(t * 0.6 + p.phase))
        ctx!.font = `${p.size}px serif`
        if (p.kind === 'terracotta') {
          ctx!.fillStyle = `rgba(193,100,70,${alpha})`
          ctx!.fillText('♡', p.x * W, p.y * H)
        } else {
          ctx!.fillStyle = p.kind === 'amber'
            ? `rgba(201,148,31,${alpha})`
            : `rgba(24,107,94,${alpha})`
          ctx!.fillText('♥', p.x * W, p.y * H)
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [count])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
