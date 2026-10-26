import { collection, collectionGroup, doc, getCountFromServer, getDoc, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { thisDeviceId } from '../utils/device'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useToast } from './ToastContext'
import { getUsersSeenAt, SEEN_EVENT, systemNotify } from '../utils/adminAlerts'
import { getAdminSounds, playAdminSound, SOUNDS_EVENT } from '../utils/adminSound'

/** Bell for the superadmin: counts fans who joined since last check and pending membership requests. */
export default function AdminAlerts() {
  const { role, user } = useAuth()
  const { showToast } = useToast()
  const [seenAt, setSeenAt] = useState(getUsersSeenAt)
  const [newFans, setNewFans] = useState(0)
  const [pending, setPending] = useState(0)
  const firstSnapshot = useRef(true)
  const isSuperadmin = role === 'superadmin'
  const [sounds, setSounds] = useState(getAdminSounds)
  const soundsRef = useRef(sounds)
  useEffect(() => { soundsRef.current = sounds }, [sounds])
  useEffect(() => {
    const update = () => setSounds(getAdminSounds())
    window.addEventListener(SOUNDS_EVENT, update)
    return () => window.removeEventListener(SOUNDS_EVENT, update)
  }, [])

  // A fan opening the app (their visit count goes up): soft sound and a note.
  const [seen, setSeen] = useState<Map<string, number>>(new Map())
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  const live = [...seen.entries()].filter(([id, at]) => id !== user?.uid && at > clock - 7 * 60_000).length
  useEffect(() => {
    if (!isSuperadmin) return
    let first = true
    const visits = new Map<string, number>()
    return onSnapshot(collection(db, 'activity'), (snapshot) => {
      setSeen(new Map(snapshot.docs.map((item) => { const at = item.data().lastSeenAt; return [item.id, at instanceof Timestamp ? at.toMillis() : 0] })))
      setClock(Date.now())
      snapshot.docChanges().forEach((change) => {
        const count = Number(change.doc.data().visits ?? 0)
        const before = visits.get(change.doc.id)
        visits.set(change.doc.id, count)
        if (first || !soundsRef.current.fanOpens || change.type === 'removed' || (before != null && count <= before)) return
        void getDoc(doc(db, 'users', change.doc.id)).then((user) => {
          const data = user.data() ?? {}
          if (data.role === 'superadmin') return
          const name = (typeof data.fullName === 'string' && data.fullName) || 'A fan'
          playAdminSound('open')
          showToast(`${name} opened the app`, 'info')
        }).catch(() => undefined)
      })
      first = false
    }, () => undefined)
  }, [isSuperadmin, showToast])

  // An admin account (including this one) used on a new phone or computer.
  useEffect(() => {
    if (!isSuperadmin) return
    let first = true
    return onSnapshot(collectionGroup(db, 'devices'), (snapshot) => {
      if (!first) snapshot.docChanges().filter((change) => change.type === 'added' && change.doc.id !== thisDeviceId()).forEach((change) => {
        const d = change.doc.data()
        const mine = change.doc.ref.parent.parent?.id === user?.uid
        const text = `${mine ? 'Your account' : `${d.name || 'An admin'} (${d.role || 'admin'})`} signed in on a new device: ${d.label || 'unknown device'}`
        playAdminSound('join')
        showToast(`🔐 ${text}. If this wasn't you, change your password now.`, 'error')
        void systemNotify('New sign-in on Ekhaya FC', text)
      })
      first = false
    }, () => undefined)
  }, [isSuperadmin, showToast, user?.uid])

  // New shop order: chime, a note and a phone notification.
  useEffect(() => {
    if (!isSuperadmin) return
    let first = true
    return onSnapshot(query(collection(db, 'shopOrders'), where('status', '==', 'new')), (snapshot) => {
      if (!first) snapshot.docChanges().filter((change) => change.type === 'added').forEach((change) => {
        const o = change.doc.data()
        const text = `${o.ref ?? 'Order'} · MK ${Number(o.total ?? 0).toLocaleString('en-US')} from ${o.name ?? 'a fan'}`
        playAdminSound('join')
        showToast(`New shop order ${text}`, 'success')
        void systemNotify('New Ekhaya shop order', text)
      })
      first = false
    }, () => undefined)
  }, [isSuperadmin, showToast])

  useEffect(() => {
    const update = () => setSeenAt(getUsersSeenAt())
    window.addEventListener(SEEN_EVENT, update)
    return () => window.removeEventListener(SEEN_EVENT, update)
  }, [])

  useEffect(() => {
    if (!isSuperadmin) return
    firstSnapshot.current = true
    const newUsers = query(collection(db, 'users'), where('createdAt', '>', Timestamp.fromMillis(seenAt)), orderBy('createdAt', 'desc'))
    return onSnapshot(newUsers, (snapshot) => {
      setNewFans(snapshot.size)
      if (firstSnapshot.current) {
        firstSnapshot.current = false
        return
      }
      snapshot.docChanges().filter((change) => change.type === 'added').forEach((change) => {
        const data = change.doc.data()
        const name = (typeof data.fullName === 'string' && data.fullName) || data.email || 'A new fan'
        showToast(`New fan joined: ${name}`, 'success')
        if (soundsRef.current.newFan) playAdminSound('join')
        void systemNotify('New Ekhaya FC fan', `${name} just joined the app.`)
      })
    }, () => setNewFans(0))
  }, [isSuperadmin, seenAt, showToast])

  useEffect(() => {
    if (!isSuperadmin) return
    let active = true
    const load = () => getCountFromServer(query(collection(db, 'memberships'), where('status', '==', 'pending')))
      .then((result) => { if (active) setPending(result.data().count) })
      .catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 60000)
    return () => { active = false; window.clearInterval(timer) }
  }, [isSuperadmin])

  if (!isSuperadmin) return null
  const total = newFans + pending
  const label = `${newFans} new fan${newFans === 1 ? '' : 's'}, ${pending} pending membership request${pending === 1 ? '' : 's'}`

  return (<>
    {live > 0 && <Link className="admin-live" to="/admin?section=fans" aria-label={`${live} fan${live === 1 ? '' : 's'} in the app now`} title="Fans in the app now"><i aria-hidden="true" />{live} live</Link>}
    <Link className="admin-bell" to="/admin?section=fans" aria-label={label} title={label}>
      <Bell size={20} aria-hidden="true" />
      {total > 0 && <span className="admin-bell-badge">{total > 99 ? '99+' : total}</span>}
    </Link>
  </>)
}
