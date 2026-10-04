// Trophy-lift celebration: gold & white confetti and streamers fired from a
// point on screen, drawn on a temporary canvas that removes itself afterwards.
const COLORS = ['#E8C95A', '#C9A227', '#F8E4A0', '#FFFFFF', '#1C1C1C', '#B8902A']

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; streamer: boolean; life: number }

export function prefersLessMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Fires a burst from (x, y) in screen pixels. Returns a function that stops it early. */
export function fireConfetti(x: number, y: number, { duration = 3200, count = 160 } = {}) {
  if (prefersLessMotion()) return () => undefined
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * ratio
  canvas.height = window.innerHeight * ratio
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) { canvas.remove(); return () => undefined }
  ctx.scale(ratio, ratio)

  const pieces: Piece[] = []
  const burst = (n: number, ox: number, oy: number, spread: number, power: number) => {
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread
      const speed = power * (0.55 + Math.random() * 0.6)
      const streamer = Math.random() < 0.18
      pieces.push({
        x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
        w: streamer ? 4 : 6 + Math.random() * 6, h: streamer ? 18 + Math.random() * 16 : 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)], streamer, life: 1,
      })
    }
  }
  burst(count, x, y, Math.PI * 0.9, 17)
  const side = window.setTimeout(() => {
    burst(count / 3, 0, window.innerHeight * 0.75, Math.PI * 0.5, 19)
    burst(count / 3, window.innerWidth, window.innerHeight * 0.75, Math.PI * 0.5, 19)
    pieces.slice(-Math.floor(count / 3) * 2).forEach((p, i) => { p.vx = Math.abs(p.vx) * (i < count / 3 ? 1 : -1) + (i < count / 3 ? 4 : -4) })
  }, 350)

  const start = performance.now()
  let frame = 0
  const tick = (now: number) => {
    const t = now - start
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (const p of pieces) {
      p.vy += 0.38
      p.vx *= 0.985
      p.vy *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      if (t > duration - 900) p.life = Math.max(0, p.life - 0.025)
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      const flip = p.streamer ? 1 : Math.abs(Math.cos(p.rot * 2))
      ctx.fillRect(-p.w / 2 * flip, -p.h / 2, p.w * flip, p.h)
      ctx.restore()
    }
    if (t < duration) frame = requestAnimationFrame(tick)
    else canvas.remove()
  }
  frame = requestAnimationFrame(tick)
  return () => { cancelAnimationFrame(frame); window.clearTimeout(side); canvas.remove() }
}
