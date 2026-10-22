import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/** A number that counts up to its value (points, stats). Shows the final number at once with reduced motion. */
export default function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  const still = reducedMotion() || !Number.isFinite(value)
  useEffect(() => {
    if (still) return
    const start = performance.now()
    const begin = from.current
    let frame = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - start) / duration)
      setShown(Math.round(begin + (value - begin) * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(step)
      else from.current = value
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration, still])
  return <>{still ? value : shown}</>
}
