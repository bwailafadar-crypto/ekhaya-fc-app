// Shared public documents with the club's public data. Fans read these instead
// of every fixture, table row and team separately.
//
// How fans get the data, cheapest first (to stay inside the free plan even with
// thousands of fans on a match day):
//   1. A static file baked into the site (./data/snapshot.json, ./data/teams.json)
//      — served from the CDN with ZERO database reads. Instant first paint and
//      works offline.
//   2. One reconcile read of the live Firestore document (publicData/*), so any
//      change an admin made since the last deploy shows up. Refreshed when the
//      app comes back to the foreground, not held open as a live listener — so a
//      fan who leaves the app open during a match is not charged for every goal.
//   3. If both are unavailable (not signed in, offline, document switched off),
//      the app falls back to reading the collections directly.
// The live-match page keeps its own real-time listener for the match in play.
import { Timestamp, doc, getDoc, type DocumentData } from 'firebase/firestore'
import { db } from '../firebase'

export type PublicDoc = 'snapshot' | 'teams'
/** Which shared document holds each collection. */
export const PUBLIC_SOURCES: Record<string, PublicDoc> = { fixtures: 'snapshot', standings: 'snapshot', teams: 'teams' }
export const SNAPSHOT_REF = (name: PublicDoc = 'snapshot') => doc(db, 'publicData', name)
const STATIC_URL: Record<PublicDoc, string> = {
  snapshot: `${import.meta.env.BASE_URL}data/snapshot.json`,
  teams: `${import.meta.env.BASE_URL}data/teams.json`,
}
// Don't reconcile more than once per this window, however often pages re-subscribe.
const RECONCILE_EVERY = 45_000

export type SnapshotState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; data: DocumentData }

type Entry = {
  state: SnapshotState
  listeners: Set<() => void>
  from: 'none' | 'static' | 'live'
  busy: boolean
  lastLive: number
  stopTimer?: number
}
const entries: Record<PublicDoc, Entry> = {
  snapshot: { state: { status: 'loading' }, listeners: new Set(), from: 'none', busy: false, lastLive: 0 },
  teams: { state: { status: 'loading' }, listeners: new Set(), from: 'none', busy: false, lastLive: 0 },
}

function emit(entry: Entry, next: SnapshotState) {
  entry.state = next
  entry.listeners.forEach((listener) => listener())
}

// Turn the {"__ts__": ms} markers from the static file back into real
// Timestamps, so static data has the same shape as data read from Firestore.
function rehydrate(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const marker = value as { __ts__?: number }
    if (typeof marker.__ts__ === 'number') return Timestamp.fromMillis(marker.__ts__)
    if (Array.isArray(value)) return value.map(rehydrate)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = rehydrate(v)
    return out
  }
  return value
}

async function loadStatic(name: PublicDoc): Promise<DocumentData | null> {
  try {
    const res = await fetch(STATIC_URL[name], { cache: 'no-cache' })
    if (!res.ok) return null
    const data = rehydrate(await res.json()) as DocumentData
    return data && data.disabled !== true ? data : null
  } catch { return null }
}

async function loadLive(name: PublicDoc): Promise<DocumentData | null | 'denied'> {
  try {
    const snap = await getDoc(SNAPSHOT_REF(name))
    const data = snap.data()
    if (!snap.exists() || !data || data.disabled === true) return null
    return data
  } catch { return 'denied' }
}

async function refresh(name: PublicDoc, force = false) {
  const entry = entries[name]
  if (entry.busy) return
  if (!force && entry.from === 'live' && Date.now() - entry.lastLive < RECONCILE_EVERY) return
  entry.busy = true
  try {
    // First paint from the static file: no database read.
    if (entry.from === 'none') {
      const stat = await loadStatic(name)
      if (stat) { emit(entry, { status: 'ready', data: stat }); entry.from = 'static' }
    }
    // Reconcile with the live document (one read) to pick up recent changes.
    const live = await loadLive(name)
    entry.lastLive = Date.now()
    if (live && live !== 'denied') { emit(entry, { status: 'ready', data: live }); entry.from = 'live' }
    else if (live === null) { emit(entry, { status: 'missing' }); entry.from = 'none' }
    else if (entry.from === 'none') { emit(entry, { status: 'missing' }) } // denied + no static: read directly
  } finally {
    entry.busy = false
  }
}

// When the app returns to the foreground, pick up anything that changed while
// it was away (cheaper than holding a live listener open the whole time).
let visBound = false
function bindVisibility() {
  if (visBound || typeof document === 'undefined') return
  visBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    for (const name of Object.keys(entries) as PublicDoc[]) if (entries[name].listeners.size) refresh(name)
  })
}

export function subscribeTo(name: PublicDoc) {
  return (listener: () => void) => {
    const entry = entries[name]
    entry.listeners.add(listener)
    window.clearTimeout(entry.stopTimer)
    bindVisibility()
    refresh(name)
    return () => {
      entry.listeners.delete(listener)
      // Keep the cached data briefly so moving between pages shows it instantly.
      if (!entry.listeners.size) entry.stopTimer = window.setTimeout(() => {
        if (!entry.listeners.size) { entry.from = 'none'; entry.state = { status: 'loading' } }
      }, 30_000)
    }
  }
}

const subscribers = { snapshot: subscribeTo('snapshot'), teams: subscribeTo('teams') }
const getters = { snapshot: () => entries.snapshot.state, teams: () => entries.teams.state }

export function snapshotStore(name: PublicDoc) {
  return { subscribe: subscribers[name], getState: getters[name] }
}
