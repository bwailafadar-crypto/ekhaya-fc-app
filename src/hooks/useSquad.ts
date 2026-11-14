// Which Ekhaya side (men's / women's) the fan is currently viewing. Shared
// across Squad, Fixtures and the League table, and remembered for the session.
import { useSyncExternalStore } from 'react'

export type Squad = 'men' | 'women'
const KEY = 'ekhaya-squad'
const listeners = new Set<() => void>()
let current: Squad = read()

function read(): Squad {
  try { return sessionStorage.getItem(KEY) === 'women' ? 'women' : 'men' } catch { return 'men' }
}
export function setSquad(next: Squad) {
  if (next === current) return
  current = next
  try { sessionStorage.setItem(KEY, next) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
export function useSquad(): [Squad, (next: Squad) => void] {
  const value = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => current,
    () => 'men' as Squad,
  )
  return [value, setSquad]
}

/** True when a record (player/fixture/standing) belongs to the given side. Missing = men's. */
export const inSquad = (recordSquad: Squad | undefined, side: Squad) => (recordSquad ?? 'men') === side
