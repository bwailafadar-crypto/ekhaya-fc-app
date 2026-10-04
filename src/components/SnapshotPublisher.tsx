import { collection, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import { SNAPSHOT_REF, type PublicDoc } from '../data/publicSnapshot'
import { buildMatchSnapshot, buildTeamsSnapshot } from '../data/snapshotPayload'
import { db } from '../firebase'
import { logError } from '../utils/logger'

const SOURCES = ['fixtures', 'standings', 'teams'] as const
type Source = (typeof SOURCES)[number]
type Rows = Array<DocumentData & { id: string }>

/**
 * Runs in admin apps. Whenever fixtures, the table or teams change, it
 * rebuilds the shared public documents fans read (one write per real change,
 * nothing when the data is the same). Only confirmed server data is published.
 */
export default function SnapshotPublisher() {
  const { role } = useAuth()
  // Staging and local copies never publish: fans only ever see production data.
  const isStaff = (role === 'admin' || role === 'superadmin') && config.environment === 'production'

  useEffect(() => {
    if (!isStaff) return
    const latest: Partial<Record<Source, Rows>> = {}
    const published: Record<PublicDoc, string | null> = { snapshot: null, teams: null }
    let timer: number | undefined
    let writing = false

    async function write(name: PublicDoc, built: { doc: DocumentData; hash: string }) {
      if (published[name] === null || built.hash === published[name]) return
      await setDoc(SNAPSHOT_REF(name), { ...built.doc, updatedAt: serverTimestamp() })
      published[name] = built.hash
    }

    const publish = async () => {
      if (writing) return
      writing = true
      try {
        if (latest.fixtures && latest.standings) await write('snapshot', buildMatchSnapshot({ fixtures: latest.fixtures, standings: latest.standings }))
        if (latest.teams) await write('teams', buildTeamsSnapshot(latest.teams))
      } catch (error) {
        logError('snapshot-publish', error)
      } finally {
        writing = false
      }
    }
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void publish(), 800) }

    const stops = SOURCES.map((name) => onSnapshot(collection(db, name), { includeMetadataChanges: true }, (snapshot) => {
      // Wait until the server has confirmed every change (no half-saved times).
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return
      latest[name] = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))
      schedule()
    }, () => undefined))
    // Learn what is already published once, so an unchanged app open writes
    // nothing. Later changes to these documents never trigger a publish, so
    // two admins online at the same time can never keep overwriting each other.
    for (const name of ['snapshot', 'teams'] as PublicDoc[]) {
      const stop = onSnapshot(SNAPSHOT_REF(name), (snapshot) => {
        if (snapshot.metadata.fromCache || published[name] !== null) return
        const hash = snapshot.data()?.hash
        published[name] = typeof hash === 'string' ? hash : ''
        schedule()
        stop()
      }, () => undefined)
      stops.push(stop)
    }

    return () => { window.clearTimeout(timer); stops.forEach((stop) => stop()) }
  }, [isStaff])

  return null
}
