// Fix many fixtures at once from Admin → Fixtures (replaces the kickoff-3pm,
// venue and move-match terminal steps).
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { CalendarClock, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import type { Fixture, Team } from '../../types'
import { formatMalawiDate } from '../../utils/football'

import { malawiDay, malawiTime } from '../../utils/malawiTime'
const norm = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

export default function FixtureTools({ fixtures, teams }: { fixtures: Fixture[]; teams: Team[] }) {
  const { showToast } = useToast()
  const [time, setTime] = useState('15:00')
  const [busy, setBusy] = useState('')
  const upcoming = fixtures.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest)
  const toMove = upcoming.filter((fixture) => malawiTime(fixture.date) !== time)
  const groundOf = (name: string) => teams.find((team) => norm(team.name) === norm(name) || norm(team.shortName ?? '') === norm(name))?.homeGround?.trim() || ''
  const noVenue = upcoming.filter((fixture) => !fixture.venue?.trim() && groundOf(fixture.home))
  const stillMissing = upcoming.filter((fixture) => !fixture.venue?.trim() && !groundOf(fixture.home))

  async function setKickoffs() {
    if (!toMove.length || !window.confirm(`Set the kick-off of ${toMove.length} upcoming match(es) to ${time} (Malawi time)?`)) return
    setBusy('time')
    try {
      const batch = writeBatch(db)
      toMove.forEach((fixture) => batch.update(doc(db, 'fixtures', fixture.id), { date: `${malawiDay(fixture.date)}T${time}:00+02:00`, updatedAt: serverTimestamp() }))
      await batch.commit()
      showToast(`${toMove.length} match(es) now kick off at ${time}.`)
    } catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') } finally { setBusy('') }
  }

  async function fillVenues() {
    if (!noVenue.length) return
    setBusy('venue')
    try {
      const batch = writeBatch(db)
      noVenue.forEach((fixture) => batch.update(doc(db, 'fixtures', fixture.id), { venue: groundOf(fixture.home), updatedAt: serverTimestamp() }))
      await batch.commit()
      showToast(`Stadium added to ${noVenue.length} match(es).`)
    } catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') } finally { setBusy('') }
  }

  return <Card className="admin-card fixture-tools">
    <div className="fz-card-heading"><CalendarClock size={18} aria-hidden="true" /><div><h2>Fix all upcoming matches</h2><span>{upcoming.length} upcoming match{upcoming.length === 1 ? '' : 'es'}</span></div></div>
    <div className="fixture-tool">
      <label className="admin-field"><span>Kick-off time for every upcoming match (Malawi time)</span><input type="time" value={time} onChange={(event) => setTime(event.target.value || '15:00')} /></label>
      <Button type="button" variant="secondary" disabled={Boolean(busy) || !toMove.length} onClick={() => void setKickoffs()}>{busy === 'time' ? 'Saving…' : toMove.length ? `Set ${toMove.length} match${toMove.length === 1 ? '' : 'es'} to ${time}` : `All already at ${time}`}</Button>
      {toMove.length > 0 && <small className="fixture-tool-list">{toMove.slice(0, 6).map((fixture) => `${formatMalawiDate(fixture.date)} ${fixture.home} v ${fixture.away} (${malawiTime(fixture.date)})`).join(' · ')}{toMove.length > 6 ? ' …' : ''}</small>}
    </div>
    <div className="fixture-tool">
      <span className="fixture-tool-title"><MapPin size={15} aria-hidden="true" /> Stadiums from each club's home ground</span>
      <Button type="button" variant="secondary" disabled={Boolean(busy) || !noVenue.length} onClick={() => void fillVenues()}>{busy === 'venue' ? 'Saving…' : noVenue.length ? `Add the stadium to ${noVenue.length} match${noVenue.length === 1 ? '' : 'es'}` : 'Every match with a known home ground has its stadium'}</Button>
      {noVenue.length > 0 && <small className="fixture-tool-list">{noVenue.slice(0, 6).map((fixture) => `${fixture.home} v ${fixture.away} → ${groundOf(fixture.home)}`).join(' · ')}</small>}
      {stillMissing.length > 0 && <small className="fixture-tool-list">No home ground saved for: {[...new Set(stillMissing.map((fixture) => fixture.home))].join(', ')}. Add it in Admin → Teams, then come back.</small>}
    </div>
    <p className="live-help">To move one match to another day, choose it below and change "Date and CAT kick-off".</p>
  </Card>
}
