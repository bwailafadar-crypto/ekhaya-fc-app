// Official minutes for a finished match (from the club's match sheet).
// Saving also corrects each player's appearances, starts and minutes so they
// match the sheet: goals, assists and cards are never touched, and saving the
// same sheet twice changes nothing. Replaces the `npm run match-report` step.
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { Clock3 } from 'lucide-react'
import { useState } from 'react'
import PlayerAvatar from '../../components/PlayerAvatar'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import type { Fixture, MatchEvent, Player, PlayerStats } from '../../types'

const KEYS = ['appearances', 'starts', 'minutes'] as const
const EMPTY: PlayerStats = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }

/** First guess from the commentary: starters play to full time or until taken off; subs from when they came on. */
function guessMinutes(fixture: Fixture, events: MatchEvent[], fullTime: number) {
  const minutes: Record<string, number> = {}
  for (const id of fixture.startingPlayerIds ?? []) minutes[id] = fullTime
  const subs = events.filter((event) => event.kind === 'substitution').sort((a, b) => a.minute - b.minute)
  for (const sub of subs) {
    const at = Math.min(fullTime, Math.max(0, sub.minute))
    if (sub.subbedOutPlayerId && minutes[sub.subbedOutPlayerId] != null) minutes[sub.subbedOutPlayerId] = Math.max(0, at - (fullTime - minutes[sub.subbedOutPlayerId]))
    if (sub.subbedInPlayerId) minutes[sub.subbedInPlayerId] = Math.max(1, fullTime - at)
  }
  for (const red of events.filter((event) => event.kind === 'card' && event.card === 'red' && event.playerId)) {
    const id = red.playerId as string
    if (minutes[id] != null) minutes[id] = Math.min(minutes[id], Math.max(1, red.minute))
  }
  return minutes
}

export default function MinutesEditor({ fixture, players, events }: { fixture: Fixture; players: Player[]; events: MatchEvent[] }) {
  const { showToast } = useToast()
  const starters = fixture.startingPlayerIds ?? []
  const bench = fixture.benchPlayerIds ?? []
  const squad = [...starters, ...bench].map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const initial = fixture.officialMinutes ?? guessMinutes(fixture, events, 90)
  const [minutes, setMinutes] = useState<Record<string, string>>(() => Object.fromEntries(squad.map((player) => [player.id, initial[player.id] ? String(initial[player.id]) : ''])))
  const [busy, setBusy] = useState(false)
  if (!squad.length) return null
  const fromSheet = Boolean(fixture.officialMinutes)

  async function save() {
    const official = Object.fromEntries(Object.entries(minutes).map(([id, value]) => [id, Math.max(0, Math.min(130, Number.parseInt(value || '0', 10) || 0))]).filter(([, value]) => (value as number) > 0)) as Record<string, number>
    setBusy(true)
    try {
      const changedCount = await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', fixture.id)
        const snap = await transaction.get(fixtureRef)
        if (!snap.exists()) throw new Error('This match no longer exists.')
        const current = snap.data() as Fixture
        const counted = current.status === 'finished' && current.statsApplied === true && !current.statsSkipped && !current.isTest
        const applied = { ...(current.statsAppliedChanges?.players ?? {}) } as Record<string, Partial<PlayerStats>>
        const target: Record<string, Partial<PlayerStats>> = {}
        for (const [id, value] of Object.entries(official)) target[id] = { appearances: 1, starts: (current.startingPlayerIds ?? []).includes(id) ? 1 : 0, minutes: value }
        const ids = counted ? [...new Set([...Object.keys(applied), ...Object.keys(target)])] : []
        const playerSnaps = await Promise.all(ids.map((id) => transaction.get(doc(db, 'players', id))))
        let changes = 0
        ids.forEach((id, index) => {
          const had = applied[id] ?? {}
          const want = target[id] ?? {}
          const diff = Object.fromEntries(KEYS.map((key) => [key, Number(want[key] ?? 0) - Number(had[key] ?? 0)]).filter(([, value]) => value !== 0)) as Partial<PlayerStats>
          if (!Object.keys(diff).length || !playerSnaps[index].exists()) return
          const stats = { ...EMPTY, ...(playerSnaps[index].data().stats as Partial<PlayerStats> | undefined) }
          for (const key of KEYS) stats[key] = Math.max(0, Number(stats[key] ?? 0) + Number(diff[key] ?? 0))
          transaction.update(playerSnaps[index].ref, { stats, updatedAt: serverTimestamp() })
          const next = { ...had }
          for (const key of KEYS) { if (want[key]) next[key] = want[key]; else delete next[key] }
          if (Object.keys(next).length) applied[id] = next; else delete applied[id]
          changes += 1
        })
        transaction.update(fixtureRef, { officialMinutes: official, ...(counted ? { 'statsAppliedChanges.players': applied } : {}), updatedAt: serverTimestamp() })
        return counted ? changes : -1
      })
      showToast(changedCount < 0 ? 'Minutes saved. (This result was imported, so season totals were not changed.)' : changedCount ? `Minutes saved. ${changedCount} player${changedCount === 1 ? '' : 's'}' season totals corrected.` : 'Minutes saved. Season totals already matched.')
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error')
    } finally { setBusy(false) }
  }

  const total = Object.values(minutes).filter((value) => Number(value) > 0).length
  return <Card className="admin-card minutes-editor">
    <div className="fz-card-heading"><Clock3 size={18} aria-hidden="true" /><div><h2>Official minutes played</h2><span>{fromSheet ? 'From the saved match sheet' : 'First guess from the commentary: check against the match sheet'} · {total} played</span></div></div>
    <ul>{squad.map((player) => <li key={player.id}>
      <PlayerAvatar player={player} />
      <span>{player.number != null ? <b>{player.number}</b> : null}{player.name}<small>{starters.includes(player.id) ? 'Started' : 'Bench'}</small></span>
      <input inputMode="numeric" aria-label={`${player.name} minutes`} placeholder="0" value={minutes[player.id] ?? ''} onChange={(event) => setMinutes((current) => ({ ...current, [player.id]: event.target.value.replace(/\D/g, '').slice(0, 3) }))} />
      <em>′</em>
    </li>)}</ul>
    <p className="live-help">Leave a player empty (or 0) if he did not play. Saving updates appearances, starts and minutes on every player page. Goals and cards are not changed.</p>
    <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save minutes'}</Button>
  </Card>
}
