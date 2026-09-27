import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteField, deleteDoc, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Activity, Clock3, CornerUpLeft, Goal, MessageSquareText, Radio, ShieldAlert, Square, SquareArrowOutUpRight, Trash2, Users, Zap } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useAuth } from '../auth/AuthContext'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { db } from '../firebase'
import type { Fixture, MatchEvent, MatchEventKind, MatchStats, Player, PlayerStats, Standing } from '../types'
import { sortByDate } from '../utils/football'
import { activePeriod, elapsedMatchSeconds, matchMinute } from '../utils/matchClock'
import TeamLogo from '../components/TeamLogo'

const CLUB_NAME = 'ekhaya fc'
const EMPTY_STATS: PlayerStats = {
  appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
  yellowCards: 0, redCards: 0, cleanSheets: 0,
}
const EMPTY_MATCH_STATS: MatchStats = { shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, offsides: 0 }
type QuickAction = 'goal' | 'opponent-goal' | 'yellow' | 'red' | 'substitution' | 'commentary'
const QUICK_ACTIONS: Array<{ action: QuickAction; label: string; icon: typeof Goal }> = [
  { action: 'goal', label: 'Goal', icon: Goal },
  { action: 'opponent-goal', label: 'Opponent goal', icon: Goal },
  { action: 'yellow', label: 'Yellow', icon: Square },
  { action: 'red', label: 'Red', icon: Square },
  { action: 'substitution', label: 'Sub', icon: Users },
  { action: 'commentary', label: 'Commentary', icon: MessageSquareText },
]

function sameTeam(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save this match update.'
}

function currentEventMinute(fixture: Fixture, now: number) {
  if (!fixture.period) return Math.max(1, fixture.minute ?? 1)
  return Math.max(1, Math.ceil(elapsedMatchSeconds(fixture, now) / 60))
}

function EventForm({
  fixture,
  players,
  minute,
  kind,
  defaultSide,
  defaultCard,
  busy,
  onSubmit,
}: {
  fixture: Fixture
  players: Player[]
  minute: number
  kind: MatchEventKind
  defaultSide: 'home' | 'away'
  defaultCard: 'yellow' | 'red'
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [side, setSide] = useState<'home' | 'away'>(defaultSide)
  const teamName = side === 'home' ? fixture.home : fixture.away
  const isClubSide = sameTeam(teamName, CLUB_NAME)
  const matchdayIds = [...(fixture.startingPlayerIds ?? []), ...(fixture.benchPlayerIds ?? [])]
  const sidePlayers = players.filter((player) => player.team === 'senior' && (!matchdayIds.length || matchdayIds.includes(player.id)))

  return <form className="live-event-form" key={`${fixture.id}-${kind}-${defaultSide}-${defaultCard}`} onSubmit={onSubmit}>
    <input type="hidden" name="kind" value={kind} />
    <div className="live-form-grid">
      <label className="admin-field"><span>Team</span><select name="side" value={side} onChange={(event) => setSide(event.target.value as 'home' | 'away')}><option value="home">{fixture.home}</option><option value="away">{fixture.away}</option></select></label>
      <label className="admin-field"><span>Minute</span><input name="minute" type="number" min={1} max={130} defaultValue={minute || 1} required /></label>
    </div>
    {kind === 'commentary' ? <label className="admin-field"><span>Commentary</span><textarea name="text" rows={2} maxLength={180} placeholder="Chance for Stambuli!" required /></label>
      : kind === 'substitution' ? <div className="live-form-grid">
      {isClubSide ? <>
        <label className="admin-field"><span>Player off</span><select name="playerOff" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="admin-field"><span>Player on</span><select name="playerOn" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      </> : <><label className="admin-field"><span>Player off</span><input name="playerOffName" required /></label><label className="admin-field"><span>Player on</span><input name="playerOnName" required /></label></>}
    </div> : <div className="live-form-grid">
      {isClubSide ? <label className="admin-field"><span>{kind === 'goal' ? 'Scorer' : 'Player'}</span><select name="player" required defaultValue=""><option value="" disabled>Choose player</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        : <label className="admin-field"><span>{kind === 'goal' ? 'Opponent scorer (optional)' : 'Player (optional)'}</span><input name="playerName" /></label>}
      {kind === 'goal' && (isClubSide
        ? <label className="admin-field"><span>Assist (optional)</span><select name="assist" defaultValue=""><option value="">No assist</option>{sidePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        : <label className="admin-field"><span>Assist (optional)</span><input name="assistName" /></label>)}
      {kind === 'card' && <label className="admin-field"><span>Card</span><select name="card" defaultValue={defaultCard}><option value="yellow">Yellow</option><option value="red">Red</option></select></label>}
    </div>}
    <Button type="submit" disabled={busy} icon={<SquareArrowOutUpRight size={16} />}>{kind === 'commentary' ? 'Post update' : `Add ${kind === 'substitution' ? 'sub' : kind}`}</Button>
  </form>
}

export default function LiveMatch() {
  const { role, user } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const playersResult = useFirestoreCollection<Player>('players')
  const standingsResult = useFirestoreCollection<Standing>('standings')
  const [selectedId, setSelectedId] = useState('')
  const [testOpponent, setTestOpponent] = useState('Test XI')
  const [lineupDraft, setLineupDraft] = useState<{ fixtureId: string; playerIds: string[] } | null>(null)
  const [benchDraft, setBenchDraft] = useState<{ fixtureId: string; playerIds: string[] } | null>(null)
  const [eventState, setEventState] = useState<{ fixtureId: string; items: MatchEvent[]; error: string | null } | null>(null)
  const [reactionState, setReactionState] = useState<{ fixtureId: string; items: Array<{ uid: string; emoji: string }> } | null>(null)
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null)
  const [activeTab, setActiveTab] = useState<'timeline' | 'lineups' | 'stats'>('timeline')
  const [clockNow, setClockNow] = useState(0)
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
    ? lineupDraft && lineupDraft.fixtureId === selectedFixture.id ? lineupDraft.playerIds : selectedFixture.startingPlayerIds ?? []
    : []
  const benchPlayers = selectedFixture
    ? benchDraft && benchDraft.fixtureId === selectedFixture.id ? benchDraft.playerIds : selectedFixture.benchPlayerIds ?? []
    : []
  const events = selectedFixture && eventState?.fixtureId === selectedFixture.id ? (eventState?.items ?? []) : []
  const eventsLoading = Boolean(selectedFixture && eventState?.fixtureId !== selectedFixture.id)
  const eventsError = selectedFixture && eventState?.fixtureId === selectedFixture.id ? eventState?.error ?? null : null
  const selectedFixtureId = selectedFixture?.id
  const hasClubTeam = Boolean(selectedFixture && [selectedFixture.home, selectedFixture.away].some((team) => sameTeam(team, CLUB_NAME)))
  const reactions = selectedFixtureId && reactionState?.fixtureId === selectedFixtureId ? (reactionState?.items ?? []) : []

  useEffect(() => {
    if (!selectedFixtureId) return
    return onSnapshot(collection(db, 'fixtures', selectedFixtureId, 'events'), (snapshot) => {
      const nextEvents = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as MatchEvent)
      nextEvents.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0
        const bTime = b.createdAt?.toMillis?.() ?? 0
        return b.minute - a.minute || bTime - aTime
      })
      setEventState({ fixtureId: selectedFixtureId, items: nextEvents, error: null })
    }, () => {
      setEventState({ fixtureId: selectedFixtureId, items: [], error: 'Could not load match events. Check your connection and try again.' })
    })
  }, [selectedFixtureId])

  useEffect(() => {
    if (!selectedFixtureId) return
    return onSnapshot(collection(db, 'fixtures', selectedFixtureId, 'reactions'), (snapshot) => {
      setReactionState({ fixtureId: selectedFixtureId, items: snapshot.docs.map((item) => ({ uid: item.id, emoji: String(item.data().emoji ?? '') })) })
    }, () => setReactionState({ fixtureId: selectedFixtureId, items: [] }))
  }, [selectedFixtureId])

  useEffect(() => {
    if (selectedFixture?.status !== 'live' && selectedFixture?.status !== 'upcoming') return
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [selectedFixture?.id, selectedFixture?.status])

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
    setBenchDraft((current) => ({
      fixtureId: selectedFixture.id,
      playerIds: (current?.fixtureId === selectedFixture.id ? current.playerIds : selectedFixture.benchPlayerIds ?? []).filter((id) => id !== playerId),
    }))
  }

  function toggleBenchPlayer(playerId: string) {
    if (!selectedFixture) return
    setBenchDraft((current) => {
      const currentIds = current?.fixtureId === selectedFixture.id
        ? current.playerIds
        : selectedFixture.benchPlayerIds ?? []
      const nextIds = currentIds.includes(playerId)
        ? currentIds.filter((id) => id !== playerId)
        : currentIds.length < 7 ? [...currentIds, playerId] : currentIds
      return { fixtureId: selectedFixture.id, playerIds: nextIds }
    })
  }

  function reportError(error: unknown) {
    setProblem(errorMessage(error))
    setMessage('')
  }

  async function confirmLineup() {
    if (!selectedFixture || startingPlayers.length !== 11) return
    setBusy(true)
    setProblem('')
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists() || snapshot.data().status !== 'upcoming') throw new Error('Lineups can only be confirmed before kick-off.')
        transaction.update(fixtureRef, { startingPlayerIds: startingPlayers, benchPlayerIds: benchPlayers, lineupConfirmed: true, updatedAt: serverTimestamp() })
      })
      setMessage('Starting XI and bench confirmed for fans.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
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
        const kickoffAt = serverTimestamp()
        transaction.update(fixtureRef, {
          status: 'live', homeScore: 0, awayScore: 0, period: 'first-half',
          kickoffAt, periodStartedAt: kickoffAt, clockElapsedSeconds: 0, firstHalfSeconds: 0, addedTime: 0,
          matchStats: selectedFixture.matchStats ?? { home: { ...EMPTY_MATCH_STATS }, away: { ...EMPTY_MATCH_STATS } },
          eventCount: 0,
          startingPlayerIds: hasClubTeam ? startingPlayers : [],
          benchPlayerIds: hasClubTeam ? benchPlayers : [], lineupConfirmed: hasClubTeam,
          liveStartedAt: kickoffAt, updatedAt: serverTimestamp(),
        })
      })
      setQuickAction(null)
      setMessage('Kick-off. Fans can follow the live match now.')
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
      setBenchDraft(null)
      setSelectedId(fixture.id)
      setMessage('Test match created. It is visible to admins only.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function setMatchPeriod(nextPeriod: 'half-time' | 'second-half') {
    if (!selectedFixture) return
    setBusy(true)
    setProblem('')
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists()) throw new Error('This fixture no longer exists.')
        const fixture = snapshot.data() as Fixture
        if (fixture.status !== 'live') throw new Error('Only a live match can change period.')
        if (nextPeriod === 'half-time') {
          if (fixture.period !== 'first-half') throw new Error('Half-time can only follow the first half.')
          const seconds = elapsedMatchSeconds(fixture, Date.now())
          transaction.update(fixtureRef, {
            period: 'half-time', clockElapsedSeconds: seconds, firstHalfSeconds: seconds,
            periodStartedAt: deleteField(), updatedAt: serverTimestamp(),
          })
        } else {
          if (fixture.period !== 'half-time') throw new Error('Start the second half after half-time.')
          transaction.update(fixtureRef, {
            period: 'second-half', periodStartedAt: serverTimestamp(), addedTime: 0,
            updatedAt: serverTimestamp(),
          })
        }
      })
      setMessage(nextPeriod === 'half-time' ? 'Half-time recorded.' : 'Second half started.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function setAddedTime(minutes: number) {
    if (!selectedFixture) return
    try {
      await updateDoc(doc(db, 'fixtures', selectedFixture.id), { addedTime: minutes, updatedAt: serverTimestamp() })
    } catch (error) {
      reportError(error)
    }
  }

  async function changeQuickStat(side: 'home' | 'away', key: keyof MatchStats, change: -1 | 1) {
    if (!selectedFixture) return
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists() || snapshot.data().status !== 'live') throw new Error('Match stats are only available during a live match.')
        const current = (snapshot.data().matchStats ?? { home: { ...EMPTY_MATCH_STATS }, away: { ...EMPTY_MATCH_STATS } }) as { home: MatchStats; away: MatchStats }
        const next = { home: { ...EMPTY_MATCH_STATS, ...current.home }, away: { ...EMPTY_MATCH_STATS, ...current.away } }
        next[side][key] = Math.max(0, Number(next[side][key] ?? 0) + change)
        transaction.update(fixtureRef, { matchStats: next, updatedAt: serverTimestamp() })
      })
    } catch (error) {
      reportError(error)
    }
  }

  async function reactToMatch(emoji: string) {
    if (!selectedFixture || !user) return
    const reactionRef = doc(db, 'fixtures', selectedFixture.id, 'reactions', user.uid)
    try {
      if (reactions.find((reaction) => reaction.uid === user.uid)?.emoji === emoji) await deleteDoc(reactionRef)
      else await setDoc(reactionRef, { emoji, updatedAt: serverTimestamp() })
    } catch (error) {
      reportError(error)
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
    const eventData: Record<string, unknown> = { kind, minute, team, createdAt: serverTimestamp() }
    if (kind === 'commentary') eventData.text = String(form.get('text') ?? '').trim()
    else if (kind === 'substitution') {
      Object.assign(eventData, {
        ...(subbedOutPlayerId ? { subbedOutPlayerId } : {}),
        subbedOutPlayerName: clubSide ? byId.get(subbedOutPlayerId)?.name ?? '' : String(form.get('playerOffName') ?? '').trim(),
        ...(subbedInPlayerId ? { subbedInPlayerId } : {}),
        subbedInPlayerName: clubSide ? byId.get(subbedInPlayerId)?.name ?? '' : String(form.get('playerOnName') ?? '').trim(),
      })
    } else {
      Object.assign(eventData, {
        ...(playerId ? { playerId } : {}),
        ...((clubSide ? byId.get(playerId)?.name : String(form.get('playerName') ?? '').trim()) ? { playerName: clubSide ? byId.get(playerId)?.name : String(form.get('playerName') ?? '').trim() } : {}),
      })
      if (kind === 'goal') Object.assign(eventData, {
          ...(assistPlayerId ? { assistPlayerId } : {}),
          ...(clubSide ? byId.get(assistPlayerId)?.name ? { assistPlayerName: byId.get(assistPlayerId)?.name } : {} : String(form.get('assistName') ?? '').trim() ? { assistPlayerName: String(form.get('assistName') ?? '').trim() } : {}),
      })
      if (kind === 'card') eventData.card = String(form.get('card')) as 'yellow' | 'red'
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
      setQuickAction(null)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function deleteMatchEvent(eventId: string) {
    if (!selectedFixture) return
    setBusy(true)
    setProblem('')
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const eventRef = doc(db, 'fixtures', selectedFixture.id, 'events', eventId)
        const [fixtureSnapshot, eventSnapshot] = await Promise.all([transaction.get(fixtureRef), transaction.get(eventRef)])
        if (!fixtureSnapshot.exists() || fixtureSnapshot.data().status !== 'live') throw new Error('Only live match events can be removed.')
        if (!eventSnapshot.exists()) return
        const fixture = fixtureSnapshot.data()
        const matchEvent = eventSnapshot.data() as MatchEvent
        const update: Record<string, number | ReturnType<typeof serverTimestamp>> = {
          eventCount: Math.max(0, Number(fixture.eventCount ?? 0) - 1), updatedAt: serverTimestamp(),
        }
        if (matchEvent.kind === 'goal') {
          const field = sameTeam(matchEvent.team, fixture.home) ? 'homeScore' : 'awayScore'
          update[field] = Math.max(0, Number(fixture[field] ?? 0) - 1)
        }
        transaction.delete(eventRef)
        transaction.update(fixtureRef, update)
      })
      setMessage('Match event removed.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function undoLastEvent() {
    if (!events.length) return
    const latest = [...events].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0]
    await deleteMatchEvent(latest.id)
  }

  async function editMatchEvent(event: MatchEvent, form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    if (!selectedFixture) return
    const values = new FormData(form.currentTarget)
    const kind = String(values.get('kind')) as MatchEventKind
    const side = String(values.get('side')) as 'home' | 'away'
    const team = side === 'home' ? selectedFixture.home : selectedFixture.away
    const minute = Math.max(1, Number(values.get('minute')) || event.minute)
    const isClubSide = sameTeam(team, CLUB_NAME)
    const findPlayer = (name: string) => players.find((player) => player.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    const next: Record<string, unknown> = {
      kind, team, minute, updatedAt: serverTimestamp(),
      playerId: deleteField(), playerName: deleteField(), assistPlayerId: deleteField(), assistPlayerName: deleteField(),
      card: deleteField(), subbedInPlayerId: deleteField(), subbedInPlayerName: deleteField(),
      subbedOutPlayerId: deleteField(), subbedOutPlayerName: deleteField(), text: deleteField(),
    }
    if (kind === 'commentary') next.text = String(values.get('text') ?? '').trim()
    if (kind === 'goal' || kind === 'card') {
      const name = String(values.get('playerName') ?? '').trim()
      const scorer = isClubSide ? findPlayer(name) : undefined
      if (name) next.playerName = name
      if (scorer) next.playerId = scorer.id
      if (kind === 'goal') {
        const assistName = String(values.get('assistPlayerName') ?? '').trim()
        const assist = isClubSide ? findPlayer(assistName) : undefined
        if (assistName) next.assistPlayerName = assistName
        if (assist) next.assistPlayerId = assist.id
      } else next.card = String(values.get('card')) as 'yellow' | 'red'
    }
    if (kind === 'substitution') {
      const offName = String(values.get('subbedOutPlayerName') ?? '').trim()
      const onName = String(values.get('subbedInPlayerName') ?? '').trim()
      const off = isClubSide ? findPlayer(offName) : undefined
      const on = isClubSide ? findPlayer(onName) : undefined
      next.subbedOutPlayerName = offName
      next.subbedInPlayerName = onName
      if (off) next.subbedOutPlayerId = off.id
      if (on) next.subbedInPlayerId = on.id
      if (off && on && off.id === on.id) {
        setProblem('Choose two different players for a substitution.')
        return
      }
    }
    setBusy(true)
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const eventRef = doc(db, 'fixtures', selectedFixture.id, 'events', event.id)
        const [fixtureSnapshot, eventSnapshot] = await Promise.all([transaction.get(fixtureRef), transaction.get(eventRef)])
        if (!fixtureSnapshot.exists() || fixtureSnapshot.data().status !== 'live' || !eventSnapshot.exists()) throw new Error('This event is no longer editable.')
        const fixtureData = fixtureSnapshot.data()
        const oldEvent = eventSnapshot.data() as MatchEvent
        const score = { homeScore: Number(fixtureData.homeScore ?? 0), awayScore: Number(fixtureData.awayScore ?? 0) }
        if (oldEvent.kind === 'goal') score[sameTeam(oldEvent.team, fixtureData.home) ? 'homeScore' : 'awayScore'] = Math.max(0, score[sameTeam(oldEvent.team, fixtureData.home) ? 'homeScore' : 'awayScore'] - 1)
        if (kind === 'goal') score[side === 'home' ? 'homeScore' : 'awayScore'] += 1
        transaction.update(eventRef, next)
        transaction.update(fixtureRef, { ...score, updatedAt: serverTimestamp() })
      })
      setMessage('Match event updated.')
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
        if (fixture.period && fixture.period !== 'second-half') throw new Error('Start the second half before full-time.')
        const clockSeconds = elapsedMatchSeconds(fixture, Date.now())
        const finalMinute = Math.max(90, Math.ceil(clockSeconds / 60))

        if (fixture.eventCount != null && Number(fixture.eventCount) !== eventSnapshot.size) throw new Error('A match update arrived while ending the game. Please press End match again.')
        if (fixture.isTest) {
          transaction.update(fixtureRef, {
            status: 'finished', period: 'full-time', minute: finalMinute,
            clockElapsedSeconds: clockSeconds, periodStartedAt: deleteField(),
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
          status: 'finished', period: 'full-time', minute: finalMinute,
          clockElapsedSeconds: clockSeconds, periodStartedAt: deleteField(), statsApplied: true, statsSkipped: false,
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
          benchPlayerIds: deleteField(), lineupConfirmed: deleteField(), kickoffAt: deleteField(), periodStartedAt: deleteField(),
          period: deleteField(), clockElapsedSeconds: deleteField(), firstHalfSeconds: deleteField(), addedTime: deleteField(), matchStats: deleteField(),
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
      setBenchDraft(null)
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
      <p>Test matches run through the full match flow but never change the table or player statistics and stay hidden from fans.</p>
      <form className="test-match-form" onSubmit={(event) => void createTestMatch(event)}>
        <label className="admin-field"><span>Opponent name</span><input value={testOpponent} onChange={(event) => setTestOpponent(event.target.value)} required /></label>
        <Button type="submit" disabled={busy || !testOpponent.trim()}>Create TEST match</Button>
      </form>
    </Card>}
    <EmptyState icon={Activity} title="No match to follow" description="Live match updates will appear here when a fixture is selected." />
  </>

  const isLive = selectedFixture.status === 'live'
  const isFinished = selectedFixture.status === 'finished'
  const homeScore = selectedFixture.homeScore ?? 0
  const awayScore = selectedFixture.awayScore ?? 0
  const clubPlayers = players.filter((player) => player.team === 'senior')
  const homeSide: 'home' | 'away' = sameTeam(selectedFixture.home, CLUB_NAME) ? 'home' : 'away'
  const actionKind: MatchEventKind | null = quickAction === 'yellow' || quickAction === 'red' ? 'card'
    : quickAction === 'opponent-goal' ? 'goal' : quickAction
  const actionSide: 'home' | 'away' = quickAction === 'opponent-goal' ? (homeSide === 'home' ? 'away' : 'home') : homeSide
  const cardColor = quickAction === 'red' ? 'red' : 'yellow'
  const homeStats = { ...EMPTY_MATCH_STATS, ...selectedFixture.matchStats?.home }
  const awayStats = { ...EMPTY_MATCH_STATS, ...selectedFixture.matchStats?.away }
  const homeLineup = (selectedFixture.startingPlayerIds ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const benchLineup = (selectedFixture.benchPlayerIds ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const countdownSeconds = Math.max(0, Math.floor((new Date(selectedFixture.date).getTime() - clockNow) / 1000))
  const countdown = `${Math.floor(countdownSeconds / 86400)}d ${String(Math.floor(countdownSeconds % 86400 / 3600)).padStart(2, '0')}:${String(Math.floor(countdownSeconds % 3600 / 60)).padStart(2, '0')}:${String(countdownSeconds % 60).padStart(2, '0')}`
  const matchReportGoals = events.filter((matchEvent) => matchEvent.kind === 'goal').slice().reverse()

  return <>
    <PageHeader eyebrow="Match centre" title="Live match" description="The clock runs locally. Match updates sync only when staff post an action." />
    {isAdmin && <Card className="admin-card test-match-card">
      <h2>Safe TEST match</h2>
      <form className="test-match-form" onSubmit={(event) => void createTestMatch(event)}>
        <label className="admin-field"><span>Opponent name</span><input value={testOpponent} onChange={(event) => setTestOpponent(event.target.value)} required /></label>
        <Button type="submit" disabled={busy || !testOpponent.trim()}>Create TEST match</Button>
      </form>
    </Card>}
    {fixtures.length > 1 && <label className="live-fixture-select"><span>Choose match</span><select value={selectedFixture.id} onChange={(event) => { setSelectedId(event.target.value); setActiveTab('timeline'); setQuickAction(null) }}>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} v {fixture.away} · {fixture.status === 'live' ? 'LIVE' : fixture.status === 'finished' ? 'FT' : fixture.date.slice(0, 10)}</option>)}</select></label>}
    <section className={`matchday-scoreboard${isLive ? ' matchday-scoreboard-live' : ''}`} aria-label="Match scoreboard">
      <div className="matchday-scoreboard-top"><span>{selectedFixture.competition}</span><div>{selectedFixture.isTest && <Badge variant="warning">TEST</Badge>}{isLive ? <Badge variant="live"><span className="live-pulse-dot" />LIVE</Badge> : <Badge variant={isFinished ? 'default' : 'gold'}>{isFinished ? 'FULL TIME' : 'UPCOMING'}</Badge>}</div></div>
      <div className="matchday-teams">
        <div className="matchday-team"><TeamLogo name={selectedFixture.home} crest /><strong>{selectedFixture.home}</strong></div>
        <div className="matchday-score"><strong>{selectedFixture.status === 'upcoming' ? 'vs' : `${homeScore} – ${awayScore}`}</strong>{isLive && <span>{matchMinute(selectedFixture, clockNow)}</span>}{selectedFixture.period === 'half-time' && <span>HALF-TIME</span>}{selectedFixture.period === 'full-time' && <span>FULL-TIME</span>}</div>
        <div className="matchday-team matchday-team-away"><TeamLogo name={selectedFixture.away} crest /><strong>{selectedFixture.away}</strong></div>
      </div>
      <div className="matchday-scoreboard-bottom"><span>{selectedFixture.venue || 'Venue TBC'}</span><span>{new Date(selectedFixture.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
    </section>
    {message && <p className="live-feedback" role="status">{message}</p>}
    {problem && <p className="live-error" role="alert"><ShieldAlert size={15} />{problem}</p>}

    {selectedFixture.status === 'upcoming' && <section className="matchday-countdown"><Clock3 size={17} /><div><span>Kick-off countdown</span><strong>{countdown}</strong></div><span>{selectedFixture.lineupConfirmed ? 'Lineup confirmed' : 'Lineup to be confirmed'}</span></section>}

    {isAdmin && selectedFixture.status === 'upcoming' && <Card className="admin-card live-admin-card">
      <div className="matchday-admin-heading"><h2>Matchday squad</h2><span>{startingPlayers.length}/11 starters · {benchPlayers.length}/7 bench</span></div>
      {hasClubTeam ? playersResult.loading ? <Skeleton className="live-player-skeleton" /> : <div className="matchday-squad-grid"><section><h3>Starting XI</h3><div className="starting-player-list">{clubPlayers.map((player) => <label key={player.id} className="starting-player"><input type="checkbox" checked={startingPlayers.includes(player.id)} onChange={() => toggleStartingPlayer(player.id)} /><span>{player.name}</span><small>{player.number == null ? '—' : `#${player.number}`}</small></label>)}</div></section><section><h3>Bench</h3><div className="starting-player-list">{clubPlayers.filter((player) => !startingPlayers.includes(player.id)).map((player) => <label key={player.id} className="starting-player"><input type="checkbox" checked={benchPlayers.includes(player.id)} onChange={() => toggleBenchPlayer(player.id)} /><span>{player.name}</span><small>{player.number == null ? '—' : `#${player.number}`}</small></label>)}</div></section></div> : <p className="live-help">This fixture does not include Ekhaya FC. Its result can still be followed here.</p>}
      {hasClubTeam && <Button type="button" variant="secondary" disabled={busy || startingPlayers.length !== 11 || playersResult.loading} onClick={() => void confirmLineup()}>Confirm lineup</Button>}
      <Button type="button" disabled={busy || (hasClubTeam && (startingPlayers.length !== 11 || playersResult.loading))} onClick={() => void startMatch()} icon={<Zap size={17} />}>Kick off</Button>
    </Card>}

    {isAdmin && isLive && <section className="matchday-console">
      <div className="matchday-period-controls"><div><span className="matchday-period-label">{selectedFixture.period === 'first-half' ? 'FIRST HALF' : selectedFixture.period === 'half-time' ? 'HALF-TIME' : 'SECOND HALF'}</span><strong>{matchMinute(selectedFixture, clockNow)}</strong></div>
        {selectedFixture.period === 'first-half' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void setMatchPeriod('half-time')}>Half-time</Button>}
        {selectedFixture.period === 'half-time' && <Button type="button" disabled={busy} onClick={() => void setMatchPeriod('second-half')}>Start 2nd half</Button>}
        {selectedFixture.period === 'second-half' && <Button type="button" variant="danger" disabled={busy} onClick={() => void endMatch()}>Full-time</Button>}
        {activePeriod(selectedFixture.period) && <div className="added-time-controls"><span>Added time <b>+{selectedFixture.addedTime ?? 0}</b></span>{[1, 2, 3].map((amount) => <button key={amount} type="button" className={selectedFixture.addedTime === amount ? 'selected' : ''} onClick={() => void setAddedTime(amount)}>+{amount}</button>)}</div>}
      </div>
      <div className="matchpad-actions">{QUICK_ACTIONS.map(({ action, label, icon: Icon }) => <button type="button" key={action} className={`matchpad-action${quickAction === action ? ' active' : ''} matchpad-${action}`} onClick={() => setQuickAction((current) => current === action ? null : action)}><Icon size={20} /><span>{label}</span></button>)}<button type="button" className="matchpad-action matchpad-undo" disabled={busy || !events.length} onClick={() => void undoLastEvent()}><CornerUpLeft size={20} /><span>Undo last</span></button></div>
      {actionKind && <div className="matchpad-form"><EventForm fixture={selectedFixture} players={players} minute={currentEventMinute(selectedFixture, clockNow)} kind={actionKind} defaultSide={actionSide} defaultCard={cardColor} busy={busy} onSubmit={(event) => void addEvent(event)} />{quickAction === 'opponent-goal' && <p className="matchpad-hint">Adds a goal to {selectedFixture.home === CLUB_NAME ? selectedFixture.away : selectedFixture.home}.</p>}</div>}
      <div className="matchday-quick-stats"><div className="matchday-stats-heading"><h2>Match stats</h2><span>{selectedFixture.home}</span><span>{selectedFixture.away}</span></div>{(['shots', 'shotsOnTarget', 'corners', 'fouls', 'offsides'] as Array<keyof MatchStats>).map((key) => <div className="quick-stat-row" key={key}><span>{key === 'shotsOnTarget' ? 'On target' : key[0].toUpperCase() + key.slice(1)}</span>{(['home', 'away'] as const).map((side) => <div key={side}><button type="button" aria-label={`Remove ${key} for ${side}`} onClick={() => void changeQuickStat(side, key, -1)}>−</button><strong>{(side === 'home' ? homeStats : awayStats)[key]}</strong><button type="button" aria-label={`Add ${key} for ${side}`} onClick={() => void changeQuickStat(side, key, 1)}>+</button></div>)}</div>)}</div>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button>
    </section>}

    {isAdmin && isFinished && <Card className="admin-card live-admin-card"><h2>Match finished</h2><p className="live-help">{selectedFixture.isTest ? 'This TEST match did not change standings or player statistics.' : 'Resetting reverses its recorded table and player-stat changes.'}</p><Button type="button" variant="danger" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button></Card>}
    {isLive && !isAdmin && <div className="live-fan-note"><span className="live-pulse-dot" />Live from Chiwembe Stadium</div>}
    {eventsError && <p className="live-error" role="alert"><ShieldAlert size={15} />{eventsError}</p>}

    <div className="matchday-tabs" role="tablist" aria-label="Match details">{(['timeline', 'lineups', 'stats'] as const).map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
    {activeTab === 'timeline' && <>
      {eventsLoading ? <Skeleton className="live-player-skeleton" /> : <section className="live-timeline"><div className="live-section-heading"><h2>Timeline</h2><span>{events.length} updates</span></div>{events.length ? events.map((matchEvent) => <article className="live-event" key={matchEvent.id}><strong>{matchEvent.minute}'</strong><span className={`live-event-mark live-event-${matchEvent.kind}`}>{matchEvent.kind === 'goal' ? <Goal size={15} /> : matchEvent.kind === 'card' ? <Square size={14} /> : matchEvent.kind === 'commentary' ? <MessageSquareText size={14} /> : <Users size={14} />}</span><div><p>{eventDescription(matchEvent)}</p><small>{matchEvent.team}</small>{isAdmin && isLive && <details className="match-event-edit"><summary>Edit event</summary><form className="match-event-editor" onSubmit={(event) => void editMatchEvent(matchEvent, event)}>
        <div className="live-form-grid"><label className="admin-field"><span>Type</span><select name="kind" defaultValue={matchEvent.kind}><option value="goal">Goal</option><option value="card">Card</option><option value="substitution">Sub</option><option value="commentary">Commentary</option></select></label><label className="admin-field"><span>Team</span><select name="side" defaultValue={sameTeam(matchEvent.team, selectedFixture.home) ? 'home' : 'away'}><option value="home">{selectedFixture.home}</option><option value="away">{selectedFixture.away}</option></select></label><label className="admin-field"><span>Minute</span><input name="minute" type="number" min={1} max={130} defaultValue={matchEvent.minute} /></label></div>
        <input className="match-event-edit-input" name="playerName" defaultValue={matchEvent.playerName ?? ''} placeholder="Scorer / player name" /><input className="match-event-edit-input" name="assistPlayerName" defaultValue={matchEvent.assistPlayerName ?? ''} placeholder="Assist name" /><div className="live-form-grid"><input className="match-event-edit-input" name="subbedOutPlayerName" defaultValue={matchEvent.subbedOutPlayerName ?? ''} placeholder="Player off" /><input className="match-event-edit-input" name="subbedInPlayerName" defaultValue={matchEvent.subbedInPlayerName ?? ''} placeholder="Player on" /></div><label className="admin-field"><span>Commentary</span><input name="text" defaultValue={matchEvent.text ?? ''} maxLength={180} /></label><label className="admin-field"><span>Card</span><select name="card" defaultValue={matchEvent.card ?? 'yellow'}><option value="yellow">Yellow</option><option value="red">Red</option></select></label><div className="admin-actions"><Button type="submit" variant="secondary" disabled={busy}>Save event</Button><button type="button" className="match-event-delete" disabled={busy} onClick={() => void deleteMatchEvent(matchEvent.id)}><Trash2 size={15} />Delete</button></div></form></details>}</div></article>) : <div className="live-timeline-empty">{isLive ? 'No updates yet. The match is ready.' : 'No match events recorded.'}</div>}</section>}
      {isLive && <section className="matchday-reactions" aria-label="Match reactions">{['⚽', '🔥', '👏', '😱'].map((emoji) => <button type="button" key={emoji} aria-label={`React ${emoji}`} aria-pressed={reactions.some((reaction) => reaction.uid === user?.uid && reaction.emoji === emoji)} className={reactions.some((reaction) => reaction.uid === user?.uid && reaction.emoji === emoji) ? 'selected' : ''} onClick={() => void reactToMatch(emoji)}><span>{emoji}</span><strong>{reactions.filter((reaction) => reaction.emoji === emoji).length}</strong></button>)}</section>}
    </>}
    {activeTab === 'lineups' && <section className="matchday-lineups"><div className="matchday-section-title"><h2>Lineups</h2>{selectedFixture.status === 'upcoming' && <Badge variant="gold">{homeLineup.length ? 'CONFIRMED' : 'AWAITING'}</Badge>}</div>{homeLineup.length ? <><h3>Starting XI</h3><div className="matchday-player-list">{homeLineup.map((player) => <div key={player.id}><strong>{player.number ?? '—'}</strong><span>{player.name}</span><small>{player.position ?? 'Squad'}</small></div>)}</div><h3>Bench</h3>{benchLineup.length ? <div className="matchday-player-list">{benchLineup.map((player) => <div key={player.id}><strong>{player.number ?? '—'}</strong><span>{player.name}</span><small>{player.position ?? 'Squad'}</small></div>)}</div> : <p className="live-timeline-empty">No substitutes named.</p>}</> : <p className="live-timeline-empty">The confirmed Ekhaya XI will appear here before kick-off.</p>}</section>}
    {activeTab === 'stats' && <section className="matchday-stats-view"><div className="matchday-section-title"><h2>Match stats</h2><span>Live comparison</span></div>{(['shots', 'shotsOnTarget', 'corners', 'fouls', 'offsides'] as Array<keyof MatchStats>).map((key) => { const home = homeStats[key]; const away = awayStats[key]; const total = Math.max(1, home, away); return <div className="match-stat-compare" key={key}><div><strong>{home}</strong><span>{key === 'shotsOnTarget' ? 'Shots on target' : key[0].toUpperCase() + key.slice(1)}</span><strong>{away}</strong></div><div className="match-stat-bars"><i style={{ width: `${home / total * 50}%` }} /><i style={{ width: `${away / total * 50}%` }} /></div></div> })}<div className="matchday-stat-legend"><span>{selectedFixture.home}</span><span>{selectedFixture.away}</span></div></section>}
    {isFinished && <section className="match-report"><span className="page-eyebrow">Final score</span><h2>Match report</h2><p>{selectedFixture.home} {homeScore}–{awayScore} {selectedFixture.away}. {matchReportGoals.length ? `Goals: ${matchReportGoals.map((goal) => `${goal.playerName || goal.team} ${goal.minute}'`).join(', ')}.` : 'No goals were recorded.'}</p></section>}
    {standingsResult.error && isAdmin && <p className="live-error">Standings could not be loaded: {standingsResult.error}</p>}
  </>
}

function eventDescription(event: MatchEvent) {
  if (event.kind === 'commentary') return event.text || 'Match update'
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
