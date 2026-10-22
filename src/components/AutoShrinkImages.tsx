// Runs quietly in admin apps: team logos and player photos that are bigger
// than fans need are re-saved at the right size once a day. Fans download all
// logos on every visit, so this keeps the app fast on mobile data without
// anyone having to remember the "Make images smaller" button.
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import { db } from '../firebase'
import type { Player, Team } from '../types'
import { dataUrlBytes, IMAGE_SIZES, shrinkDataUrl } from '../utils/compressImage'
import { logError } from '../utils/logger'

const TOO_BIG = 1.2

async function shrinkAll() {
  // One admin per day does the work (the lock can only be created once).
  try {
    await setDoc(doc(db, 'alertsSent', `shrink-images-${new Date().toISOString().slice(0, 10)}`), { title: 'shrink images', createdAt: serverTimestamp() })
  } catch { return }
  const [teams, players] = await Promise.all([getDocs(collection(db, 'teams')), getDocs(collection(db, 'players'))])
  const jobs: Array<{ ref: ReturnType<typeof doc>; field: 'logoDataUrl' | 'photoDataUrl'; value: string; size: typeof IMAGE_SIZES.logo | typeof IMAGE_SIZES.player }> = []
  teams.docs.forEach((item) => { const value = (item.data() as Team).logoDataUrl; if (value && dataUrlBytes(value) > IMAGE_SIZES.logo.maxBytes * TOO_BIG) jobs.push({ ref: item.ref, field: 'logoDataUrl', value, size: IMAGE_SIZES.logo }) })
  players.docs.forEach((item) => { const value = (item.data() as Player).photoDataUrl; if (value && dataUrlBytes(value) > IMAGE_SIZES.player.maxBytes * TOO_BIG) jobs.push({ ref: item.ref, field: 'photoDataUrl', value, size: IMAGE_SIZES.player }) })
  for (const job of jobs) {
    try {
      const small = await shrinkDataUrl(job.value, job.size)
      if (dataUrlBytes(small) < dataUrlBytes(job.value)) await updateDoc(job.ref, { [job.field]: small, updatedAt: serverTimestamp() })
    } catch (error) { logError('shrink-images', error) }
    // Leave the phone free between images.
    await new Promise((resolve) => window.setTimeout(resolve, 300))
  }
}

export default function AutoShrinkImages() {
  const { role } = useAuth()
  const isStaff = (role === 'admin' || role === 'superadmin') && config.environment === 'production'
  useEffect(() => {
    if (!isStaff) return
    const timer = window.setTimeout(() => { void shrinkAll().catch(() => undefined) }, 45000)
    return () => window.clearTimeout(timer)
  }, [isStaff])
  return null
}
