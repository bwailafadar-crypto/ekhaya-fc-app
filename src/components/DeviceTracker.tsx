// Remembers which phones and computers each admin account is signed in on
// (users/{uid}/devices). The superadmin gets a chime and a message when an
// admin account, including their own, is used on a new device.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { deviceId, deviceLabel } from '../utils/device'

export default function DeviceTracker() {
  const { user, role, profile } = useAuth()
  const staff = role === 'admin' || role === 'superadmin'
  useEffect(() => {
    if (!user || !staff) return
    const id = deviceId()
    if (!id) return
    const ref = doc(db, 'users', user.uid, 'devices', id)
    void getDoc(ref).then((snap) => setDoc(ref, {
      label: deviceLabel(),
      name: (profile?.fullName || user.email || '').slice(0, 80),
      role,
      lastSeen: serverTimestamp(),
      ...(snap.exists() ? {} : { firstSeen: serverTimestamp() }),
    }, { merge: true })).catch(() => undefined)
  }, [user, staff, role, profile?.fullName])
  return null
}
