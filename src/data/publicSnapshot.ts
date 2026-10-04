// Shared public documents with the club's public data. Fans read these instead
// of every fixture, table row and team separately: about 2 reads per app open
// instead of 70+, which keeps the app inside the free plan's daily allowance
// even on a busy match day.
//
// Admin apps keep them up to date (see SnapshotPublisher), and so do the GitHub
// workflows (scripts/publish-snapshot.cjs). If one is missing or switched off,
// the app falls back to reading the collections directly.
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../firebase'

export type PublicDoc = 'snapshot' | 'teams'
/** Which shared document holds each collection. */
export const PUBLIC_SOURCES: Record<string, PublicDoc> = { fixtures: 'snapshot', standings: 'snapshot', teams: 'teams' }
export const SNAPSHOT_REF = (name: PublicDoc = 'snapshot') => doc(db, 'publicData', name)

export type SnapshotState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; data: DocumentData }

type Entry = { state: SnapshotState; listeners: Set<() => void>; stop: (() => void) | null; stopTimer?: number }
const entries: Record<PublicDoc, Entry> = {
  snapshot: { state: { status: 'loading' }, listeners: new Set(), stop: null },
  teams: { state: { status: 'loading' }, listeners: new Set(), stop: null },
}

function emit(entry: Entry, next: SnapshotState) {
  entry.state = next
  entry.listeners.forEach((listener) => listener())
}

function start(name: PublicDoc) {
  const entry = entries[name]
  if (entry.stop) return
  // A new attempt (e.g. after signing in again): wait for it instead of
  // falling back to the expensive direct reads straight away.
  if (entry.state.status === 'missing') entry.state = { status: 'loading' }
  entry.stop = onSnapshot(SNAPSHOT_REF(name), (snapshot) => {
    const data = snapshot.data()
    if (!snapshot.exists() || !data || data.disabled === true) emit(entry, { status: 'missing' })
    else emit(entry, { status: 'ready', data })
  }, () => {
    // Not signed in yet, or no permission: fall back to direct reads, and
    // allow a fresh attempt the next time a page asks for the data.
    entry.stop = null
    emit(entry, { status: 'missing' })
  })
}

export function subscribeTo(name: PublicDoc) {
  return (listener: () => void) => {
    const entry = entries[name]
    entry.listeners.add(listener)
    window.clearTimeout(entry.stopTimer)
    start(name)
    return () => {
      entry.listeners.delete(listener)
      // Keep the connection briefly so moving between pages does not re-read it.
      if (!entry.listeners.size) entry.stopTimer = window.setTimeout(() => {
        if (!entry.listeners.size && entry.stop) { entry.stop(); entry.stop = null; entry.state = { status: 'loading' } }
      }, 30_000)
    }
  }
}

const subscribers = { snapshot: subscribeTo('snapshot'), teams: subscribeTo('teams') }
const getters = { snapshot: () => entries.snapshot.state, teams: () => entries.teams.state }

export function snapshotStore(name: PublicDoc) {
  return { subscribe: subscribers[name], getState: getters[name] }
}
