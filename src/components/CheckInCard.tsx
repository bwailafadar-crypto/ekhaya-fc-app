import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { CheckCircle2, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import type { Fixture } from '../types'
import { FAN_POINTS } from '../utils/leaderboardCalc'
import { useToast } from './ToastContext'

/** "I'm at the stadium": one check-in per fan per match, worth fan points. */
export default function CheckInCard({ fixture }: { fixture: Fixture }) {
  const { user, profile, emailVerified } = useAuth()
  const { showToast } = useToast()
  const mine = useMyDoc(user ? ['fixtures', fixture.id, 'checkins', user.uid] : null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const count = useCounts(`checkins:${fixture.id}:${version}`, () => ({ fans: collection(db, 'fixtures', fixture.id, 'checkins') }))
  const fans = count.counts.fans ?? 0
  const venue = fixture.venue || 'the stadium'
  const done = Boolean(mine.data)

  async function checkIn() {
    if (!user) return
    if (!emailVerified) { showToast('Confirm your email first (check your inbox), then check in.', 'error'); return }
    setBusy(true)
    try {
      await setDoc(doc(db, 'fixtures', fixture.id, 'checkins', user.uid), { name: profile?.fullName ?? '', createdAt: serverTimestamp() })
      setVersion((value) => value + 1)
      showToast(`You're checked in at ${venue}. +${FAN_POINTS.checkIn} fan points after the match.`)
    } catch {
      showToast('Check-in was not saved. Check-in opens when team news is out and closes at full time.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return <section className={`checkin-card${done ? ' done' : ''}`} aria-label="Stadium check-in">
    <MapPin size={20} aria-hidden="true" />
    <div>
      <strong>{done ? `You're at ${venue}` : `At ${venue}?`}</strong>
      <span>{count.loading ? 'Counting fans…' : `${fans} fan${fans === 1 ? '' : 's'} checked in`}{done ? '' : ` · +${FAN_POINTS.checkIn} points`}</span>
    </div>
    {done ? <span className="checkin-done"><CheckCircle2 size={18} aria-hidden="true" /> Checked in</span>
      : <button type="button" disabled={busy || mine.loading} onClick={() => void checkIn()}>{busy ? 'Saving…' : "I'm here"}</button>}
  </section>
}
