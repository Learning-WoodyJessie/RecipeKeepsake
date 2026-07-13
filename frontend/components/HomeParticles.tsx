'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  x: number; y: number
  r: number
  vx: number; vy: number
  opacity: number
  phase: number
  amber: boolean
}

function makePts(n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.7 + Math.random() * 1.4,
    vx: (Math.random() - 0.5) * 0.00025,
    vy: -(0.00045 + Math.random() * 0.0009),
    opacity: 0.1 + Math.random() * 0.38,
    phase: Math.random() * Math.PI * 2,
    amber: Math.random() > 0.42,
  }))
}

export default function HomeParticles({ count = 750 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let pts = makePts(count)
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
      ctx!.scale(dpr, dpr)
    }

    function draw(ts: number) {
      ctx!.clearRect(0, 0, W, H)
      const t = ts * 0.001

      for (const p of pts) {
        p.x += p.vx + Math.sin(t * 0.28 + p.phase) * 0.00012
        p.y += p.vy
        if (p.y < -0.02) p.y = 1.02
        if (p.x < -0.02) p.x = 1.02
        if (p.x >  1.02) p.x = -0.02

        const alpha = p.opacity * (0.65 + 0.35 * Math.sin(t * 0.7 + p.phase))
        ctx!.beginPath()
        ctx!.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = p.amber
          ? `rgba(201,148,31,${alpha})`
          : `rgba(24,107,94,${alpha})`
        ctx!.fill()
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
