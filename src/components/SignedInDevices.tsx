// Profile (admins): the phones and computers this account is signed in on.
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { MonitorSmartphone, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { thisDeviceId } from '../utils/device'
import { Card } from './UI'

type Device = { id: string; label?: string; firstSeen?: { toMillis?: () => number }; lastSeen?: { toMillis?: () => number } }
const when = (t?: { toMillis?: () => number }) => (t?.toMillis ? new Date(t.toMillis()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')

export default function SignedInDevices() {
  const { user, role } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'superadmin')) return
    return onSnapshot(collection(db, 'users', user.uid, 'devices'), (s) => setDevices(s.docs.map((d) => ({ ...(d.data() as Device), id: d.id })).sort((a, b) => (b.lastSeen?.toMillis?.() ?? 0) - (a.lastSeen?.toMillis?.() ?? 0))), () => setDevices([]))
  }, [user, role])
  if (!user || (role !== 'admin' && role !== 'superadmin')) return null
  const here = thisDeviceId()
  return <Card className="admin-card devices-card">
    <div className="fz-card-heading"><MonitorSmartphone size={18} aria-hidden="true" /><div><h2>Signed-in devices</h2><span>Phones and computers that used this admin account</span></div></div>
    <ul className="devices-list">{devices.map((d) => <li key={d.id}>
      <div><strong>{d.label ?? 'Device'}{d.id === here && <em> · this device</em>}</strong><small>First seen {when(d.firstSeen)} · last seen {when(d.lastSeen)}</small></div>
      {d.id !== here && <button type="button" aria-label="Remove from the list" onClick={() => void deleteDoc(doc(db, 'users', user.uid, 'devices', d.id)).catch(() => undefined)}><Trash2 size={15} /></button>}
    </li>)}</ul>
    <p className="live-help">Don't recognise a device? Change your password straight away (above). That signs the account out everywhere within an hour.</p>
  </Card>
}
