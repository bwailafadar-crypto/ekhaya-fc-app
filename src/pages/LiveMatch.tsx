import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteField, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Activity, CircleStop, FlaskConical, Play, Plus, Radio, ShieldAlert } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useAuth } from '../auth/AuthContext'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { db } from '../firebase'
import type { Fixture, MatchEvent, MatchEventKind, Player, PlayerStats, Standing } from '../types'
import { sortByDate } from '../utils/football'

const CLUB_NAME = 'ekhaya fc'
const EMPTY_STATS: PlayerStats = {
  appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
  yellowCards: 0, redCards: 0, cleanSheets: 0,
}

function sameTeam(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save this match update.'
}

function EventForm({
  fixture,
  players,
  minute,
  busy,
  onSubmit,
}: {
  fixture: Fixture
  players: Player[]
  minute: number
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [kind, setKind] = useState<MatchEventKind>('goal')
  const [side, setSide] = useState<'home' | 'away'>('home')
  const teamName = side === 'home' ? fixture.home : fixture.away
  const isClubSide = sameTeam(teamName, CLUB_NAME)
  const sidePlayers = players.filter((player) => player.team === 'senior')

  return <form className="live-event-form" key={`${fixture.id}-${kind}-${side}`} onSubmit={onSubmit}>
    <div className="live-form-grid">
      <label className="admin-field"><span>Event</span><select name="kind" value={kind} onChange={(event) => setKind(event.target.value as MatchEventKind)}><option value="goal">Goal</option><option value="card">Card</option><option value="substitution">Substitution</option></select></label>
      <label className="admin-field"><span>Team</span><select name="side" value={side} onChange={(event) => setSide(event.target.value as 'home' | 'away')}><option value="home">{fixture.home}</option><option value="away">{fixture.away}</option></select></label>
      <label className="admin-field"><span>Minute</span><input name="minute" type="number" min={1} max={130} defaultValue={minute || 1} required /></label>
    </div>
    {kind === 'substitution' ? <div className="live-form-grid">
      {isClubSide ? <>
        <label className="admin-field"><span>Player off</span><select name="playerOff" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="admin-field"><span>Player on</span><select name="playerOn" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      </> : <><label className="admin-field"><span>Player off</span><input name="playerOffName" required /></label><label className="admin-field"><span>Player on</span><input name="playerOnName" required /></label></>}
    </div> : <div className="live-form-grid">
      {isClubSide ? <label className="admin-field"><span>{kind === 'goal' ? 'Scorer' : 'Player'}</span><select name="player" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        : <label className="admin-field"><span>{kind === 'goal' ? 'Scorer' : 'Player'}</span><input name="playerName" required /></label>}
      {kind === 'goal' && (isClubSide
        ? <label className="admin-field"><span>Assist (optional)</span><select name="assist" defaultValue=""><option value="">No assist</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        : <label className="admin-field"><span>Assist (optional)</span><input name="assistName" /></label>)}
      {kind === 'card' && <label className="admin-field"><span>Card</span><select name="card" defaultValue="yellow"><option value="yellow">Yellow</option><option value="red">Red</option></select></label>}
    </div>}
    <Button type="submit" disabled={busy} icon={<Plus size={16} />}>Add event</Button>
  </form>
}

export default function LiveMatch() {
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const playersResult = useFirestoreCollection<Player>('players')
  const standingsResult = useFirestoreCollection<Standing>('standings')
  const [selectedId, setSelectedId] = useState('')
  const [testOpponent, setTestOpponent] = useState('Test XI')
  const [lineupDraft, setLineupDraft] = useState<{ fixtureId: string; playerIds: string[] } | null>(null)
  const [eventState, setEventState] = useState<{ fixtureId: string; items: MatchEvent[]; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')

  const availableFixtures = fixturesResult.items.filter((fixture) => isAdmin || !fixture.isTest)
  const fixtures = [
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'live'), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'upcoming'), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'finished'), 'desc'),
  ]
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedId)
    ?? fixtures.find((fixture) => fixture.status === 'live')
    ?? fixtures.find((fixture) => fixture.status === 'upcoming')
    ?? fixtures[0]
  const players = [...playersResult.items].sort((a, b) => a.name.localeCompare(b.name))
  const startingPlayers = selectedFixture
    ? lineupDraft?.fixtureId === selectedFixture.id ? lineupDraft.playerIds : selectedFixture.startingPlayerIds ?? []
    : []
  const events = eventState?.fixtureId === selectedFixture?.id ? eventState.items : []
  const eventsLoading = Boolean(selectedFixture && eventState?.fixtureId !== selectedFixture.id)
  const eventsError = eventState?.fixtureId === selectedFixture?.id ? eventState.error : null
  const selectedFixtureId = selectedFixture?.id
  const hasClubTeam = Boolean(selectedFixture && [selectedFixture.home, selectedFixture.away].some((team) => sameTeam(team, CLUB_NAME)))

  useEffect(() => {
    if (!selectedFixtureId) return
    return onSnapshot(collection(db, 'fixtures', selectedFixtureId, 'events'), (snapshot) => {
      const nextEvents = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as MatchEvent)
      nextEvents.sort((a, b) => a.minute - b.minute)
      setEventState({ fixtureId: selectedFixtureId, items: nextEvents, error: null })
    }, () => {
      setEventState({ fixtureId: selectedFixtureId, items: [], error: 'Could not load match events. Check your connection and try again.' })
    })
  }, [selectedFixtureId])

  function toggleStartingPlayer(playerId: string) {
    if (!selectedFixture) return
    setLineupDraft((current) => {
      const currentIds = current?.fixtureId === selectedFixture.id
        ? current.playerIds
        : selectedFixture.startingPlayerIds ?? []
      const nextIds = currentIds.includes(playerId)
        ? currentIds.filter((id) => id !== playerId)
        : currentIds.length < 11 ? [...currentIds, playerId] : currentIds
      return { fixtureId: selectedFixture.id, playerIds: nextIds }
    })
  }

  function reportError(error: unknown) {
    setProblem(errorMessage(error))
    setMessage('')
  }

  async function startMatch() {
    if (!selectedFixture) return
    if (hasClubTeam && startingPlayers.length !== 11) {
      setProblem('Select the 11 Ekhaya starters before starting this match.')
      return
    }
    setBusy(true)
    setProblem('')
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists() || snapshot.data().status !== 'upcoming') throw new Error('Only an upcoming fixture can be started.')
        transaction.update(fixtureRef, {
          status: 'live', homeScore: 0, awayScore: 0, minute: 0,
          eventCount: 0,
          startingPlayerIds: hasClubTeam ? startingPlayers : [],
          liveStartedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
      })
      setMessage('Match started. Fans can see the live score now.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function createTestMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const opponent = testOpponent.trim()
    if (!opponent) return
    setBusy(true)
    setProblem('')
    try {
      const fixture = await addDoc(collection(db, 'fixtures'), {
        competition: 'Internal test',
        season: new Date().getFullYear().toString(),
        date: new Date().toISOString(),
        home: 'Ekhaya FC',
        away: opponent,
        venue: 'Training ground',
        status: 'upcoming',
        homeScore: null,
        awayScore: null,
        isTest: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setLineupDraft(null)
      setSelectedId(fixture.id)
      setMessage('Test match created. It is visible to admins only.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function saveScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFixture) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setProblem('')
    try {
      await updateDoc(doc(db, 'fixtures', selectedFixture.id), {
        homeScore: Number(form.get('homeScore')),
        awayScore: Number(form.get('awayScore')),
        minute: Number(form.get('minute')),
        updatedAt: serverTimestamp(),
      })
      setMessage('Score and minute updated.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFixture || selectedFixture.status !== 'live') return
    const form = new FormData(event.currentTarget)
    const kind = String(form.get('kind')) as MatchEventKind
    const side = String(form.get('side'))
    const team = side === 'home' ? selectedFixture.home : selectedFixture.away
    const minute = Number(form.get('minute'))
    const clubSide = sameTeam(team, CLUB_NAME)
    const byId = new Map(players.map((player) => [player.id, player]))
    const playerId = clubSide && kind !== 'substitution' ? String(form.get('player') ?? '') : ''
    const assistPlayerId = clubSide && kind === 'goal' ? String(form.get('assist') ?? '') : ''
    const subbedOutPlayerId = clubSide && kind === 'substitution' ? String(form.get('playerOff') ?? '') : ''
    const subbedInPlayerId = clubSide && kind === 'substitution' ? String(form.get('playerOn') ?? '') : ''
    if (kind === 'substitution' && subbedInPlayerId && subbedInPlayerId === subbedOutPlayerId) {
      setProblem('Choose two different players for a substitution.')
      return
    }
    const eventData = {
      kind, minute, team,
      ...(kind === 'substitution' ? {
        ...(subbedOutPlayerId ? { subbedOutPlayerId } : {}),
        subbedOutPlayerName: clubSide ? byId.get(subbedOutPlayerId)?.name ?? '' : String(form.get('playerOffName') ?? '').trim(),
        ...(subbedInPlayerId ? { subbedInPlayerId } : {}),
        subbedInPlayerName: clubSide ? byId.get(subbedInPlayerId)?.name ?? '' : String(form.get('playerOnName') ?? '').trim(),
      } : {
        ...(playerId ? { playerId } : {}),
        playerName: clubSide ? byId.get(playerId)?.name ?? '' : String(form.get('playerName') ?? '').trim(),
        ...(kind === 'goal' ? {
          ...(assistPlayerId ? { assistPlayerId } : {}),
          ...(clubSide ? byId.get(assistPlayerId)?.name ? { assistPlayerName: byId.get(assistPlayerId)?.name } : {} : String(form.get('assistName') ?? '').trim() ? { assistPlayerName: String(form.get('assistName') ?? '').trim() } : {}),
        } : { card: String(form.get('card')) as 'yellow' | 'red' }),
      }),
      createdAt: serverTimestamp(),
    }

    setBusy(true)
    setProblem('')
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists() || snapshot.data().status !== 'live') throw new Error('This match is no longer live.')
        const fixture = snapshot.data()
        const update: Record<string, number | ReturnType<typeof serverTimestamp>> = {
          minute: Math.max(Number(fixture.minute ?? 0), minute),
          eventCount: Number(fixture.eventCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
        }
        if (kind === 'goal') {
          const scoreField = side === 'home' ? 'homeScore' : 'awayScore'
          update[scoreField] = Number(fixture[scoreField] ?? 0) + 1
        }
        transaction.set(doc(collection(db, 'fixtures', selectedFixture.id, 'events')), eventData)
        transaction.update(fixtureRef, update)
      })
      setMessage(kind === 'goal' ? 'Goal added and score updated.' : 'Match event added.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function endMatch() {
    if (!selectedFixture) return
    if (!window.confirm('End this match and apply its result and player statistics?')) return
    setBusy(true)
    setProblem('')
    try {
      const eventSnapshot = await getDocs(collection(db, 'fixtures', selectedFixture.id, 'events'))
      const standingsSnapshot = selectedFixture.isTest ? null : await getDocs(collection(db, 'standings'))
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const fixtureSnapshot = await transaction.get(fixtureRef)
        if (!fixtureSnapshot.exists()) throw new Error('This fixture no longer exists.')
        const fixture = fixtureSnapshot.data() as Fixture
        if (fixture.statsApplied) throw new Error('This match result has already been applied.')
        if (fixture.status !== 'live') throw new Error('Only a live match can be ended here.')

        if (fixture.eventCount != null && Number(fixture.eventCount) !== eventSnapshot.size) throw new Error('A match update arrived while ending the game. Please press End match again.')
        if (fixture.isTest) {
          transaction.update(fixtureRef, {
            status: 'finished', minute: Math.max(1, Number(fixture.minute) || 90),
            statsApplied: false, statsSkipped: true, finishedAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
          return
        }
        if (!standingsSnapshot) throw new Error('Could not load standings for this real match.')
        const standingsSnapshots = await Promise.all(standingsSnapshot.docs.map((item) => transaction.get(item.ref)))
        const matchEvents = eventSnapshot.docs.map((item) => item.data() as MatchEvent)
        const lineup = Array.isArray(fixture.startingPlayerIds) ? fixture.startingPlayerIds : []
        const playerIds = new Set(lineup)
        for (const matchEvent of matchEvents) {
          for (const id of [matchEvent.playerId, matchEvent.assistPlayerId, matchEvent.subbedInPlayerId, matchEvent.subbedOutPlayerId]) {
            if (id) playerIds.add(id)
          }
        }
        const playerRefs = [...playerIds].map((id) => doc(db, 'players', id))
        const playerSnapshots = await Promise.all(playerRefs.map((ref) => transaction.get(ref)))
        const tableRows = standingsSnapshots.map((item) => ({ ref: item.ref, data: item.data() as Standing }))
        const homeRow = tableRows.find((row) => sameTeam(row.data.team, fixture.home))
        const awayRow = tableRows.find((row) => sameTeam(row.data.team, fixture.away))
        if (!homeRow || !awayRow) throw new Error('Both clubs need a standings row before the result can be finalized.')

        const homeGoals = Number(fixture.homeScore ?? 0)
        const awayGoals = Number(fixture.awayScore ?? 0)
        const outcome = homeGoals === awayGoals ? 'D' : homeGoals > awayGoals ? 'W' : 'L'
        const awayOutcome = outcome === 'W' ? 'L' : outcome === 'L' ? 'W' : 'D'
        const nextRows = tableRows.map((row) => {
          if (row.ref.path === homeRow.ref.path) return { ...row, data: applyResult(row.data, homeGoals, awayGoals, outcome, fixtureSnapshot.id) }
          if (row.ref.path === awayRow.ref.path) return { ...row, data: applyResult(row.data, awayGoals, homeGoals, awayOutcome, fixtureSnapshot.id) }
          return row
        })
        nextRows.sort((a, b) => b.data.points - a.data.points || b.data.goalDifference - a.data.goalDifference || b.data.goalsFor - a.data.goalsFor || a.data.position - b.data.position)

        const finalMinute = Math.max(1, Number(fixture.minute) || 90)
        const playerUpdates = new Map<string, PlayerStats>()
        const playerData = new Map<string, Player>()
        playerSnapshots.forEach((snapshot) => {
          if (snapshot.exists()) playerData.set(snapshot.id, snapshot.data() as Player)
        })
        const appearanceIds = new Set(lineup)
        const minutes = new Map<string, number>()
        const onField = new Map(lineup.map((id) => [id, 0]))
        matchEvents.sort((a, b) => a.minute - b.minute)
        for (const matchEvent of matchEvents) {
          if (matchEvent.kind === 'substitution') {
            const off = matchEvent.subbedOutPlayerId
            const on = matchEvent.subbedInPlayerId
            const eventMinute = Math.min(finalMinute, Math.max(0, matchEvent.minute))
            if (off && onField.has(off)) {
              minutes.set(off, (minutes.get(off) ?? 0) + eventMinute - (onField.get(off) ?? 0))
              onField.delete(off)
            }
            if (on && !onField.has(on)) {
              onField.set(on, eventMinute)
              appearanceIds.add(on)
            }
          }
          if (matchEvent.playerId) appearanceIds.add(matchEvent.playerId)
          if (matchEvent.assistPlayerId) appearanceIds.add(matchEvent.assistPlayerId)
        }
        for (const [id, enteredAt] of onField) minutes.set(id, (minutes.get(id) ?? 0) + Math.max(0, finalMinute - enteredAt))

        for (const matchEvent of matchEvents) {
          if (matchEvent.kind === 'goal' && matchEvent.playerId) incrementStat(playerUpdates, playerData, matchEvent.playerId, 'goals')
          if (matchEvent.kind === 'goal' && matchEvent.assistPlayerId) incrementStat(playerUpdates, playerData, matchEvent.assistPlayerId, 'assists')
          if (matchEvent.kind === 'card' && matchEvent.playerId) incrementStat(playerUpdates, playerData, matchEvent.playerId, matchEvent.card === 'red' ? 'redCards' : 'yellowCards')
        }
        const clubConceded = sameTeam(fixture.home, CLUB_NAME) ? awayGoals : sameTeam(fixture.away, CLUB_NAME) ? homeGoals : -1
        for (const id of appearanceIds) {
          const player = playerData.get(id)
          if (!player) continue
          const current = playerUpdates.get(id) ?? { ...EMPTY_STATS, ...player.stats }
          playerUpdates.set(id, {
            ...current,
            appearances: current.appearances + 1,
            starts: current.starts + (lineup.includes(id) ? 1 : 0),
            minutes: current.minutes + (minutes.get(id) ?? 0),
            cleanSheets: current.cleanSheets + (player.position === 'GK' && clubConceded === 0 ? 1 : 0),
          })
        }

        const playerDeltas: Record<string, Partial<PlayerStats>> = {}
        for (const [id, stats] of playerUpdates) {
          const before = { ...EMPTY_STATS, ...playerData.get(id)?.stats }
          const delta: Partial<PlayerStats> = {}
          for (const key of Object.keys(EMPTY_STATS) as Array<keyof PlayerStats>) {
            const difference = Number(stats[key] ?? 0) - Number(before[key] ?? 0)
            if (difference !== 0) delta[key] = difference
          }
          if (Object.keys(delta).length > 0) playerDeltas[id] = delta
        }
        const standingChanges = [
          standingChange(homeRow.data, homeGoals, awayGoals, outcome),
          standingChange(awayRow.data, awayGoals, homeGoals, awayOutcome),
        ]
        transaction.update(fixtureRef, {
          status: 'finished', minute: finalMinute, statsApplied: true, statsSkipped: false,
          statsAppliedChanges: { standings: standingChanges, players: playerDeltas },
          finishedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        nextRows.forEach((row, index) => {
          if (row.data.position !== index + 1 || row.ref.path === homeRow.ref.path || row.ref.path === awayRow.ref.path) {
            transaction.update(row.ref, { ...row.data, position: index + 1, updatedAt: serverTimestamp() })
          }
        })
        for (const [id, stats] of playerUpdates) transaction.update(doc(db, 'players', id), { stats, updatedAt: serverTimestamp() })
      })
      setMessage(selectedFixture.isTest
        ? 'TEST match ended. Standings and player statistics were not changed.'
        : 'Match ended. The result, standings and player statistics have been updated.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function resetMatch() {
    if (!selectedFixture || selectedFixture.status === 'upcoming') return
    const applied = Boolean(selectedFixture.statsApplied)
    if (!window.confirm(applied
      ? 'Reset this match? Its standings and player-stat changes will be reversed, then its events deleted.'
      : 'Reset this match? Its events will be deleted and its score cleared.')) return
    setBusy(true)
    setProblem('')
    try {
      const eventSnapshot = await getDocs(collection(db, 'fixtures', selectedFixture.id, 'events'))
      const eventRefs = eventSnapshot.docs.map((item) => item.ref)
      const standingsSnapshot = selectedFixture.isTest ? null : await getDocs(collection(db, 'standings'))
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const fixtureSnapshot = await transaction.get(fixtureRef)
        if (!fixtureSnapshot.exists()) throw new Error('This fixture no longer exists.')
        const fixture = fixtureSnapshot.data() as Fixture
        if (fixture.status === 'upcoming') throw new Error('This match is already reset.')
        if (fixture.eventCount != null && Number(fixture.eventCount) !== eventRefs.length) throw new Error('A match event changed during reset. Please press Reset match again.')

        const eventDocs = await Promise.all(eventRefs.map((ref) => transaction.get(ref)))
        const changes = fixture.statsAppliedChanges
        let currentStandings: Array<{ ref: (typeof standingsSnapshot extends null ? never : NonNullable<typeof standingsSnapshot>['docs'][number]['ref']); data: Standing }> = []
        let playerDocs: Awaited<ReturnType<typeof transaction.get>>[] = []
        if (fixture.statsApplied) {
          if (!changes || !standingsSnapshot) throw new Error('This result has no reversal record, so it cannot be safely reset.')
          currentStandings = await Promise.all(changes.standings.map(async (change) => {
            const snapshot = await transaction.get(doc(db, 'standings', change.standingId))
            if (!snapshot.exists()) throw new Error(`Missing standings row ${change.standingId}; no changes were reset.`)
            return { ref: snapshot.ref, data: snapshot.data() as Standing }
          }))
          const playerRefs = Object.keys(changes.players).map((id) => doc(db, 'players', id))
          playerDocs = await Promise.all(playerRefs.map((ref) => transaction.get(ref)))
          if (playerDocs.some((snapshot) => !snapshot.exists())) throw new Error('A player record is missing, so this result cannot be safely reset.')
          const allStandingRefs = standingsSnapshot.docs.map((item) => item.ref)
          const knownPaths = new Set(currentStandings.map((row) => row.ref.path))
          const remainingRefs = allStandingRefs.filter((ref) => !knownPaths.has(ref.path))
          const remainingDocs = await Promise.all(remainingRefs.map((ref) => transaction.get(ref)))
          currentStandings.push(...remainingDocs.map((snapshot) => ({ ref: snapshot.ref, data: snapshot.data() as Standing })))
        }

        let reversedRows = currentStandings
        if (fixture.statsApplied && changes) {
          reversedRows = currentStandings.map((row) => {
            const change = changes.standings.find((item) => item.standingId === row.ref.id)
            if (!change) return row
            const data = {
              ...row.data,
              played: Number(row.data.played ?? 0) - change.played,
              won: Number(row.data.won ?? 0) - change.won,
              drawn: Number(row.data.drawn ?? 0) - change.drawn,
              lost: Number(row.data.lost ?? 0) - change.lost,
              goalsFor: Number(row.data.goalsFor ?? 0) - change.goalsFor,
              goalsAgainst: Number(row.data.goalsAgainst ?? 0) - change.goalsAgainst,
              goalDifference: Number(row.data.goalDifference ?? 0) - (change.goalsFor - change.goalsAgainst),
              points: Number(row.data.points ?? 0) - change.points,
            }
            const history = Array.isArray(row.data.formHistory) ? row.data.formHistory.filter((item) => item.fixtureId !== selectedFixture.id) : null
            if (history) return { ...row, data: { ...data, formHistory: history, form: history.slice(-5).map((item) => item.result) } }
            const form = [...(Array.isArray(row.data.form) ? row.data.form : [])]
            const formIndex = form.lastIndexOf(change.result)
            if (formIndex >= 0) form.splice(formIndex, 1)
            return { ...row, data: { ...data, form } }
          })
          reversedRows.sort((a, b) => b.data.points - a.data.points || b.data.goalDifference - a.data.goalDifference || b.data.goalsFor - a.data.goalsFor || a.data.position - b.data.position)
        }

        transaction.update(fixtureRef, {
          status: 'upcoming', homeScore: deleteField(), awayScore: deleteField(), minute: deleteField(),
          eventCount: deleteField(), startingPlayerIds: deleteField(), liveStartedAt: deleteField(), finishedAt: deleteField(),
          statsApplied: false, statsAppliedChanges: deleteField(), statsSkipped: deleteField(), updatedAt: serverTimestamp(),
        })
        eventDocs.forEach((snapshot) => { if (snapshot.exists()) transaction.delete(snapshot.ref) })
        if (fixture.statsApplied && changes) {
          reversedRows.forEach((row, index) => {
            if (row.data.position !== index + 1 || changes.standings.some((item) => item.standingId === row.ref.id)) {
              transaction.update(row.ref, { ...row.data, position: index + 1, updatedAt: serverTimestamp() })
            }
          })
          playerDocs.forEach((snapshot) => {
            const deltas = changes.players[snapshot.id]
            const currentPlayer = snapshot.data() as Player
            const stats = { ...EMPTY_STATS, ...currentPlayer.stats }
            for (const key of Object.keys(deltas) as Array<keyof PlayerStats>) {
              stats[key] = Number(stats[key] ?? 0) - Number(deltas[key] ?? 0)
            }
            transaction.update(snapshot.ref, { stats, updatedAt: serverTimestamp() })
          })
        }
      })
      setLineupDraft(null)
      setMessage('Match reset to upcoming. Its events and any applied stat changes were removed.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  if (fixturesResult.loading) return <div className="loading-list"><Skeleton /><Skeleton /></div>
  if (fixturesResult.error) return <EmptyState icon={Radio} title="Live match unavailable" description={fixturesResult.error} />
  if (!selectedFixture) return <>
    <PageHeader eyebrow="Match centre" title="Live match" />
    {isAdmin && <Card className="admin-card test-match-card">
      <h2>Create a safe TEST match</h2>
      <p>Test matches run through the live controls but never change the table or player statistics and are hidden from fans.</p>
      <form className="test-match-form" onSubmit={(event) => void createTestMatch(event)}>
        <label className="admin-field"><span>Opponent name</span><input value={testOpponent} onChange={(event) => setTestOpponent(event.target.value)} required /></label>
        <Button type="submit" disabled={busy || !testOpponent.trim()} icon={<FlaskConical size={16} />}>Create TEST match</Button>
      </form>
    </Card>}
    <EmptyState icon={Activity} title="No match to follow" description="Live match updates will appear here when a fixture is selected." />
  </>

  const isLive = selectedFixture.status === 'live'
  const isFinished = selectedFixture.status === 'finished'
  const homeScore = selectedFixture.homeScore ?? 0
  const awayScore = selectedFixture.awayScore ?? 0
  const clubPlayers = players.filter((player) => player.team === 'senior')

  return <>
    <PageHeader eyebrow="Match centre" title="Live match" description="Score and match events update as the club reports them." />
    {isAdmin && <Card className="admin-card test-match-card">
      <h2>Create a safe TEST match</h2>
      <p>Test matches run through the live controls but never change the table or player statistics and are hidden from fans.</p>
      <form className="test-match-form" onSubmit={(event) => void createTestMatch(event)}>
        <label className="admin-field"><span>Opponent name</span><input value={testOpponent} onChange={(event) => setTestOpponent(event.target.value)} required /></label>
        <Button type="submit" disabled={busy || !testOpponent.trim()} icon={<FlaskConical size={16} />}>Create TEST match</Button>
      </form>
    </Card>}
    {fixtures.length > 1 && <label className="live-fixture-select"><span>Choose match</span><select value={selectedFixture.id} onChange={(event) => setSelectedId(event.target.value)}>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} v {fixture.away} · {fixture.status === 'live' ? 'LIVE' : fixture.status === 'finished' ? 'FT' : fixture.date.slice(0, 10)}</option>)}</select></label>}
    <Card className="live-score-card">
      <div className="live-score-meta"><span>{selectedFixture.competition}</span><span className="live-badges">{selectedFixture.isTest && <Badge variant="warning">TEST</Badge>}{isLive ? <Badge variant="live"><span className="live-pulse-dot" />LIVE · {selectedFixture.minute ?? 0}'</Badge> : <Badge variant={isFinished ? 'default' : 'gold'}>{isFinished ? 'FULL TIME' : 'UPCOMING'}</Badge>}</span></div>
      <div className="live-score-teams"><span>{selectedFixture.home}</span><strong className="live-score-number">{selectedFixture.status === 'upcoming' ? 'vs' : `${homeScore} - ${awayScore}`}</strong><span>{selectedFixture.away}</span></div>
      <div className="live-score-venue">{selectedFixture.venue || selectedFixture.date.slice(0, 10)}</div>
    </Card>
    {message && <p className="live-feedback" role="status">{message}</p>}
    {problem && <p className="live-error" role="alert"><ShieldAlert size={15} />{problem}</p>}

    {isAdmin && selectedFixture.status === 'upcoming' && <Card className="admin-card live-admin-card">
      <h2>Start this match</h2>
      {hasClubTeam ? <>
        <p className="live-help">Choose the Ekhaya starting eleven so appearances and minutes can be recorded at full time.</p>
        {playersResult.loading ? <Skeleton className="live-player-skeleton" /> : <div className="starting-player-list">
          {clubPlayers.map((player) => <label key={player.id} className="starting-player"><input type="checkbox" checked={startingPlayers.includes(player.id)} onChange={() => toggleStartingPlayer(player.id)} /><span>{player.name}</span><small>{player.position ?? 'Squad'}{player.number == null ? '' : ` · #${player.number}`}</small></label>)}
        </div>}
        <p className="live-selection-count">{startingPlayers.length} of 11 selected</p>
      </> : <p className="live-help">This fixture does not include Ekhaya FC. Its score and events can still be followed here.</p>}
      <Button type="button" disabled={busy || (hasClubTeam && (startingPlayers.length !== 11 || playersResult.loading))} onClick={() => void startMatch()} icon={<Play size={16} />}>Start match</Button>
    </Card>}

    {isAdmin && isLive && <Card className="admin-card live-admin-card">
      <h2>Match controls</h2>
      <form className="live-score-form" onSubmit={(event) => void saveScore(event)}>
        <label className="admin-field"><span>{selectedFixture.home} score</span><input name="homeScore" type="number" min={0} defaultValue={homeScore} key={`${selectedFixture.id}-home-${homeScore}`} required /></label>
        <label className="admin-field"><span>{selectedFixture.away} score</span><input name="awayScore" type="number" min={0} defaultValue={awayScore} key={`${selectedFixture.id}-away-${awayScore}`} required /></label>
        <label className="admin-field"><span>Minute</span><input name="minute" type="number" min={0} max={130} defaultValue={selectedFixture.minute ?? 0} key={`${selectedFixture.id}-minute-${selectedFixture.minute}`} required /></label>
        <Button type="submit" variant="secondary" disabled={busy}>Update score</Button>
      </form>
      <h3>Add event</h3>
      {playersResult.error ? <p className="live-error">{playersResult.error}</p> : <EventForm fixture={selectedFixture} players={players} minute={selectedFixture.minute ?? 0} busy={busy} onSubmit={(event) => void addEvent(event)} />}
      <div className="live-end-match"><Button type="button" variant="danger" disabled={busy} onClick={() => void endMatch()} icon={<CircleStop size={16} />}>{selectedFixture.isTest ? 'End TEST match' : 'End match and update stats'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button></div>
    </Card>}

    {isAdmin && isFinished && <Card className="admin-card live-admin-card"><h2>Match finished</h2><p className="live-help">{selectedFixture.isTest ? 'This test match did not change standings or player statistics.' : 'Resetting removes this result from the table and reverses its player-stat changes.'}</p><Button type="button" variant="danger" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button></Card>}

    {isLive && !isAdmin && <div className="live-fan-note"><span className="live-pulse-dot" />Live updates from Ekhaya FC</div>}
    {eventsError && <p className="live-error" role="alert"><ShieldAlert size={15} />{eventsError}</p>}
    {(events.length > 0 || eventsLoading) && <section className="live-timeline"><div className="live-section-heading"><h2>Match events</h2><span>{events.length}</span></div>
      {eventsLoading ? <Skeleton className="live-player-skeleton" /> : events.map((matchEvent) => <article className="live-event" key={matchEvent.id}><strong>{matchEvent.minute}'</strong><span className={`live-event-mark live-event-${matchEvent.kind}`}>{matchEvent.kind === 'goal' ? 'G' : matchEvent.kind === 'card' ? (matchEvent.card === 'red' ? 'R' : 'Y') : '↔'}</span><div><p>{eventDescription(matchEvent)}</p><small>{matchEvent.team}</small></div></article>)}
    </section>}
    {!events.length && !eventsLoading && isLive && <div className="live-timeline-empty">No match events yet.</div>}
    {standingsResult.error && isAdmin && <p className="live-error">Standings could not be loaded: {standingsResult.error}</p>}
  </>
}

function eventDescription(event: MatchEvent) {
  if (event.kind === 'goal') return `Goal · ${event.playerName || 'Unknown player'}${event.assistPlayerName ? ` (assist: ${event.assistPlayerName})` : ''}`
  if (event.kind === 'card') return `${event.card === 'red' ? 'Red' : 'Yellow'} card · ${event.playerName || 'Unknown player'}`
  return `Substitution · ${event.subbedInPlayerName || 'Player on'} for ${event.subbedOutPlayerName || 'Player off'}`
}

function applyResult(row: Standing, goalsFor: number, goalsAgainst: number, result: 'W' | 'D' | 'L', fixtureId: string): Standing {
  const played = Number(row.played ?? 0) + 1
  const won = Number(row.won ?? 0) + (result === 'W' ? 1 : 0)
  const drawn = Number(row.drawn ?? 0) + (result === 'D' ? 1 : 0)
  const lost = Number(row.lost ?? 0) + (result === 'L' ? 1 : 0)
  const totalFor = Number(row.goalsFor ?? 0) + goalsFor
  const totalAgainst = Number(row.goalsAgainst ?? 0) + goalsAgainst
  const priorHistory = Array.isArray(row.formHistory)
    ? row.formHistory
    : (Array.isArray(row.form) ? row.form : []).map((formResult, index) => ({ fixtureId: `legacy-${row.id}-${index}`, result: formResult }))
  const formHistory = [...priorHistory, { fixtureId, result }]
  return {
    ...row, played, won, drawn, lost, goalsFor: totalFor, goalsAgainst: totalAgainst,
    goalDifference: totalFor - totalAgainst,
    points: Number(row.points ?? 0) + (result === 'W' ? 3 : result === 'D' ? 1 : 0),
    formHistory,
    form: formHistory.slice(-5).map((item) => item.result),
  }
}

function standingChange(row: Standing, goalsFor: number, goalsAgainst: number, result: 'W' | 'D' | 'L') {
  return {
    standingId: row.id,
    played: 1 as const,
    won: (result === 'W' ? 1 : 0) as 0 | 1,
    drawn: (result === 'D' ? 1 : 0) as 0 | 1,
    lost: (result === 'L' ? 1 : 0) as 0 | 1,
    goalsFor,
    goalsAgainst,
    points: result === 'W' ? 3 : result === 'D' ? 1 : 0,
    result,
  }
}

function incrementStat(
  updates: Map<string, PlayerStats>,
  players: Map<string, Player>,
  id: string,
  key: 'goals' | 'assists' | 'yellowCards' | 'redCards',
) {
  const player = players.get(id)
  if (!player) return
  const current = updates.get(id) ?? { ...EMPTY_STATS, ...player.stats }
  updates.set(id, { ...current, [key]: Number(current[key] ?? 0) + 1 })
}
