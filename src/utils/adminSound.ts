// Sound for the superadmin's alerts (made in the browser, no sound file).
// Choices are kept on this device.
const KEY = 'ekhaya-admin-sounds'
export type AdminSounds = { newFan: boolean; fanOpens: boolean }
export const SOUNDS_EVENT = 'ekhaya-admin-sounds'

export function getAdminSounds(): AdminSounds {
  try { return { newFan: true, fanOpens: true, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { newFan: true, fanOpens: true } }
}
export function setAdminSounds(next: AdminSounds) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(SOUNDS_EVENT))
}

/** 'join' = bright three-note chime; 'open' = soft single blip. */
export function playAdminSound(kind: 'join' | 'open') {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const notes = kind === 'join' ? [784, 988, 1319] : [660]
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      const at = ctx.currentTime + index * 0.14
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(kind === 'join' ? 0.25 : 0.12, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.4)
    })
    if (kind === 'join') navigator.vibrate?.([120, 60, 120])
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500)
  } catch { /* sound needs one tap on the page first */ }
}
