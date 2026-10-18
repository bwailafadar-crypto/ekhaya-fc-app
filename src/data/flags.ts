// Feature flags: switch features on or off for everyone from Admin → App
// health, instantly, without a new deploy. Stored in appConfig/flags.
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export const FLAGS = {
  alertsPrompt: { label: 'One-tap alerts card after sign-in', default: true },
  fanFamily: { label: 'Fan Family (branches & invites)', default: true },
  competitions: { label: 'Competitions & cup filters', default: true },
  celebrationConfetti: { label: 'Confetti on the champions card', default: true },
  smartBars: { label: 'Bars hide while scrolling', default: true },
  membershipPayments: { label: 'Membership payments (off shows "Coming soon")', default: false },
} as const

export type FlagName = keyof typeof FLAGS
export type FlagState = { flags: Partial<Record<FlagName, boolean>>; notice: string; loaded: boolean }

let state: FlagState = { flags: {}, notice: '', loaded: false }
const listeners = new Set<() => void>()
let stop: (() => void) | null = null

function start() {
  if (stop) return
  stop = onSnapshot(doc(db, 'appConfig', 'flags'), (snapshot) => {
    const data = snapshot.data() ?? {}
    state = { flags: (data.flags ?? {}) as FlagState['flags'], notice: typeof data.notice === 'string' ? data.notice : '', loaded: true }
    listeners.forEach((listener) => listener())
  }, () => {
    // Signed out or offline: keep the defaults, try again later.
    stop = null
  })
}

export function subscribeFlags(listener: () => void) {
  listeners.add(listener)
  start()
  return () => { listeners.delete(listener) }
}

export function getFlags() {
  return state
}

export function flagValue(current: FlagState, name: FlagName) {
  return current.flags[name] ?? FLAGS[name].default
}

/** Superadmin only (enforced by the database rules). */
export function saveFlags(flags: Partial<Record<FlagName, boolean>>, notice: string) {
  return setDoc(doc(db, 'appConfig', 'flags'), { flags, notice: notice.trim().slice(0, 200), updatedAt: serverTimestamp() })
}
