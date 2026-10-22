// Small, light celebrations (no libraries): a burst of gold confetti from a
// button, and an emoji that floats up from a reaction. Nothing runs when the
// phone asks for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const COLOURS = ['#C9A227', '#E9C95A', '#F8E7A4', '#1E8E3E', '#FFFFFF']

function centreOf(target: Element | null) {
  const box = target?.getBoundingClientRect()
  return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

function layer() {
  const el = document.createElement('div')
  el.className = 'celebrate-layer'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

/** Gold confetti from the middle of an element (a saved prediction, a vote). */
export function burst(target: Element | null, count = 18) {
  if (reduced() || typeof document === 'undefined') return
  const { x, y } = centreOf(target)
  const host = layer()
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('i')
    const size = 5 + Math.random() * 5
    piece.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() > .5 ? 1 : 2.2)}px;background:${COLOURS[i % COLOURS.length]};border-radius:${Math.random() > .6 ? '50%' : '2px'}`
    host.appendChild(piece)
    const angle = (Math.PI * 2 * i) / count + Math.random() * .5
    const distance = 50 + Math.random() * 60
    piece.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance + 40}px)) rotate(${Math.random() * 540 - 270}deg) scale(.6)`, opacity: 0 },
    ], { duration: 750 + Math.random() * 350, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
  }
  window.setTimeout(() => host.remove(), 1300)
}

/** An emoji that floats up and fades (match reactions). */
export function floatUp(target: Element | null, emoji: string) {
  if (reduced() || typeof document === 'undefined') return
  const { x, y } = centreOf(target)
  const host = layer()
  for (let i = 0; i < 3; i += 1) {
    const item = document.createElement('span')
    item.textContent = emoji
    item.style.cssText = `left:${x + (i - 1) * 14}px;top:${y}px;font-size:${20 + i * 4}px`
    host.appendChild(item)
    item.animate([
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, calc(-50% - 30px)) scale(1.1)', opacity: 1, offset: .25 },
      { transform: `translate(calc(-50% + ${(i - 1) * 18}px), calc(-50% - ${110 + i * 25}px)) scale(.9)`, opacity: 0 },
    ], { duration: 1100 + i * 150, delay: i * 90, easing: 'ease-out', fill: 'forwards' })
  }
  window.setTimeout(() => host.remove(), 1800)
}
