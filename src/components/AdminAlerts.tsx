import { collection, getCountFromServer, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useToast } from './ToastContext'
import { getUsersSeenAt, SEEN_EVENT, systemNotify } from '../utils/adminAlerts'

/** Bell for the superadmin: counts fans who joined since last check and pending membership requests. */
export default function AdminAlerts() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const [seenAt, setSeenAt] = useState(getUsersSeenAt)
  const [newFans, setNewFans] = useState(0)
  const [pending, setPending] = useState(0)
  const firstSnapshot = useRef(true)
  const isSuperadmin = role === 'superadmin'

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

  return (
    <Link className="admin-bell" to="/admin?section=fans" aria-label={label} title={label}>
      <Bell size={20} aria-hidden="true" />
      {total > 0 && <span className="admin-bell-badge">{total > 99 ? '99+' : total}</span>}
    </Link>
  )
}
