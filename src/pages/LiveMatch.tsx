import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import GoalSplash from '../components/GoalSplash'
import ShareBar from '../components/ShareBar'
import MatchMedia from '../components/MatchMedia'
import VideoPlayer from '../components/VideoPlayer'
import { parseVideo } from '../utils/video'
import PlayerAvatar from '../components/PlayerAvatar'
import { DEFAULT_FORMATION, FORMATIONS, isFormation, slotRoles, type Formation } from '../utils/formations'
import { competitionLabel, isCupCompetition } from '../utils/competitions'
import LineupPitch, { type PlayerMarks } from '../components/LineupPitch'
import MatchTimeline from '../components/MatchTimeline'
import MatchSummary from '../components/MatchSummary'
import MinutesEditor from './admin/MinutesEditor'
import { floatUp } from '../utils/celebrate'
import { collection, deleteField, deleteDoc, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Activity, Clock3, CornerUpLeft, FlaskConical, Goal, MessageSquareText, Play, Radio, ShieldAlert, Square, SquareArrowOutUpRight, Trash2, Users, Zap } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useAuth } from '../auth/AuthContext'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { db } from '../firebase'
import type { Fixture, MatchEvent, MatchEventKind, MatchStats, Player, PlayerStats, Standing } from '../types'
import { sortByDate } from '../utils/football'
import { activePeriod, currentEventMinute, elapsedMatchSeconds, matchMinute } from '../utils/matchClock'
import TeamLogo from '../components/TeamLogo'
import MatchChat from '../components/MatchChat'
import MatchPreview from '../components/MatchPreview'
import { buildGoals, minuteLabel } from '../utils/goals'
import { useFlag } from '../hooks/useFlag'

const CLUB_NAME = 'ekhaya fc'
const EMPTY_STATS: PlayerStats = {
  appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
  yellowCards: 0, redCards: 0, cleanSheets: 0,
}
const EMPTY_MATCH_STATS: MatchStats = { shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, offsides: 0 }
type QuickAction = 'goal' | 'opponent-goal' | 'yellow' | 'red' | 'substitution' | 'commentary'
const TAB_LABELS = { preview: 'Preview', timeline: 'Commentary', lineups: 'Lineups', stats: 'Stats', chat: 'Fan chat' } as const
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


/** Who is on the pitch now: the starting XI, plus subs who came on, minus players taken off or sent off. */
function playersOnPitch(fixture: Fixture, events: MatchEvent[]) {
  const onPitch = new Set(fixture.startingPlayerIds ?? [])
  const used = new Set<string>()
  for (const matchEvent of [...events].sort((a, b) => a.minute - b.minute)) {
    if (!sameTeam(matchEvent.team, CLUB_NAME)) continue
    if (matchEvent.kind === 'substitution') {
      if (matchEvent.subbedOutPlayerId) { onPitch.delete(matchEvent.subbedOutPlayerId); used.add(matchEvent.subbedOutPlayerId) }
      if (matchEvent.subbedInPlayerId) { onPitch.add(matchEvent.subbedInPlayerId); used.add(matchEvent.subbedInPlayerId) }
    }
    if (matchEvent.kind === 'card' && matchEvent.card === 'red' && matchEvent.playerId) { onPitch.delete(matchEvent.playerId); used.add(matchEvent.playerId) }
  }
  return { onPitch, used }
}

const byNumber = (a: Player, b: Player) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name)
const playerLabel = (player: Player) => `${player.number != null ? `${player.number} · ` : ''}${player.name}${player.position ? ` (${player.position})` : ''}`

function EventForm({
  fixture,
  players,
  events,
  minute,
  kind,
  defaultSide,
  defaultCard,
  busy,
  onSubmit,
}: {
  fixture: Fixture
  players: Player[]
  events: MatchEvent[]
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
  const [scorerId, setScorerId] = useState('')
  const hasLineup = (fixture.startingPlayerIds ?? []).length > 0
  const { onPitch, used } = playersOnPitch(fixture, events)
  const senior = players.filter((player) => player.team === 'senior')
  // With a confirmed line-up only the players on the pitch can score, assist or be taken off.
  const pitchPlayers = (hasLineup ? senior.filter((player) => onPitch.has(player.id)) : senior).sort(byNumber)
  const benchIds = fixture.benchPlayerIds ?? []
  const benchPlayers = senior.filter((player) => benchIds.includes(player.id) && !onPitch.has(player.id)).sort(byNumber)
  const subsAvailable = (benchIds.length ? benchPlayers.filter((player) => !used.has(player.id)) : senior.filter((player) => !onPitch.has(player.id))).sort(byNumber)

  return <form className="live-event-form" key={`${fixture.id}-${kind}-${defaultSide}-${defaultCard}`} onSubmit={onSubmit}>
    <input type="hidden" name="kind" value={kind} />
    <div className="live-form-grid">
      <label className="admin-field"><span>Team</span><select name="side" value={side} onChange={(event) => setSide(event.target.value as 'home' | 'away')}><option value="home">{fixture.home}</option><option value="away">{fixture.away}</option></select></label>
      <label className="admin-field"><span>Minute</span><input name="minute" type="number" min={1} max={130} defaultValue={Math.min(130, Math.max(1, minute || 1))} required /></label>
    </div>
    {kind === 'commentary' ? <label className="admin-field"><span>Commentary</span><textarea name="text" rows={2} maxLength={180} placeholder="Chance for Stambuli!" required /></label>
      : kind === 'substitution' ? <div className="live-form-grid">
      {isClubSide ? <>
        <label className="admin-field"><span>Player off (on the pitch)</span><select name="playerOff" required defaultValue=""><option value="" disabled>Choose player</option>{pitchPlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>
        <label className="admin-field"><span>Player on (sub)</span><select name="playerOn" required defaultValue=""><option value="" disabled>{subsAvailable.length ? 'Choose sub' : 'No subs left'}</option>{subsAvailable.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>
      </> : <><label className="admin-field"><span>Player off</span><input name="playerOffName" required /></label><label className="admin-field"><span>Player on</span><input name="playerOnName" required /></label></>}
    </div> : <div className="live-form-grid">
      {isClubSide ? <label className="admin-field"><span>{kind === 'goal' ? 'Scorer (on the pitch)' : 'Player'}</span><select name="player" required value={scorerId} onChange={(event) => setScorerId(event.target.value)}><option value="" disabled>Choose player</option>{kind === 'card' && hasLineup && benchPlayers.length
        ? <><optgroup label="On the pitch">{pitchPlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</optgroup><optgroup label="Bench">{benchPlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</optgroup></>
        : pitchPlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>
        : <label className="admin-field"><span>{kind === 'goal' ? 'Opponent scorer (optional)' : 'Player (optional)'}</span><input name="playerName" /></label>}
      {kind === 'goal' && (isClubSide
        ? <label className="admin-field"><span>Assist (optional)</span><select name="assist" defaultValue=""><option value="">No assist</option>{pitchPlayers.filter((player) => player.id !== scorerId).map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>
        : <label className="admin-field"><span>Assist (optional)</span><input name="assistName" /></label>)}
      {kind === 'card' && <label className="admin-field"><span>Card</span><select name="card" defaultValue={defaultCard}><option value="yellow">Yellow</option><option value="red">Red</option></select></label>}
    </div>}
    {isClubSide && hasLineup && kind !== 'commentary' && <p className="live-help event-form-hint">{pitchPlayers.length} on the pitch{kind === 'substitution' ? ` · ${subsAvailable.length} sub${subsAvailable.length === 1 ? '' : 's'} left` : ''}</p>}
    <Button type="submit" disabled={busy} icon={<SquareArrowOutUpRight size={16} />}>{kind === 'commentary' ? 'Post update' : `Add ${kind === 'substitution' ? 'sub' : kind}`}</Button>
  </form>
}

export default function LiveMatch() {
  const { role, user } = useAuth()
  const chatFlag = useFlag('matchChat')
  const isAdmin = role === 'admin' || role === 'superadmin'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const playersResult = useFirestoreCollection<Player>('players')
  const standingsResult = useFirestoreCollection<Standing>('standings')
  // Alerts and Home link straight to a match and tab: /live?match=<id>&tab=lineups
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState(() => params.get('match') ?? '')
  const [lineupDraft, setLineupDraft] = useState<{ fixtureId: string; playerIds: string[] } | null>(null)
  const [benchDraft, setBenchDraft] = useState<{ fixtureId: string; playerIds: string[] } | null>(null)
  const [formationDraft, setFormationDraft] = useState<{ fixtureId: string; value: Formation } | null>(null)
  const [eventState, setEventState] = useState<{ fixtureId: string; items: MatchEvent[]; error: string | null } | null>(null)
  const [reactionState, setReactionState] = useState<{ fixtureId: string; items: Array<{ uid: string; emoji: string }> } | null>(null)
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null)
  const [activeTab, setActiveTab] = useState<'preview' | 'timeline' | 'lineups' | 'stats' | 'chat' | null>(() => { const tab = params.get('tab'); return tab === 'lineups' || tab === 'stats' || tab === 'chat' || tab === 'preview' || tab === 'timeline' ? tab : null })
  // Big-club style GOAL! moment: only for Ekhaya goals that arrive while you watch.
  const [goalMoment, setGoalMoment] = useState<MatchEvent | null>(null)
  const seenGoals = useRef<{ fixtureId: string; ids: Set<string> } | null>(null)
  const closeGoal = useCallback(() => setGoalMoment(null), [])
  const [editPromptUsed, setEditPromptUsed] = useState(false)
  const [clip, setClip] = useState<{ url: string; title: string } | null>(null)
  // Start from the real time (not 0), so the first second never shows a wrong minute or countdown.
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')

  // Practice matches are only ever visible to admins.
  const availableFixtures = fixturesResult.items.filter((fixture) => !fixture.isTest || isAdmin)
  const fixtures = [
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'live' && !fixture.isTest), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'live' && fixture.isTest), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'upcoming' && fixture.isTest), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest), 'asc'),
    ...sortByDate(availableFixtures.filter((fixture) => fixture.status === 'finished'), 'desc'),
  ]
  // The live match centre is the men's team's by default; a women's match only
  // shows here when it is opened directly (its id is in the link). So the match
  // picker and the default pick are men's only.
  const menFixtures = fixtures.filter((fixture) => (fixture.squad ?? 'men') === 'men')
  const listedFixture = fixtures.find((fixture) => fixture.id === selectedId)
    ?? menFixtures.find((fixture) => fixture.status === 'live')
    ?? menFixtures.find((fixture) => fixture.status === 'upcoming')
    ?? menFixtures[0]
    ?? fixtures[0]
  // Fans normally get matches from the shared copy; the match they are looking
  // at is also read directly, so stats, line-ups and edits show within seconds.
  const [directFixture, setDirectFixture] = useState<Fixture | null>(null)
  const watchId = !isAdmin && listedFixture && !listedFixture.isTest ? listedFixture.id : ''
  useEffect(() => {
    if (!watchId) return
    return onSnapshot(doc(db, 'fixtures', watchId), (snapshot) => {
      setDirectFixture(snapshot.exists() ? { ...(snapshot.data() as Fixture), id: snapshot.id } : null)
    }, () => setDirectFixture(null))
  }, [watchId])
  const selectedFixture = listedFixture && directFixture?.id === listedFixture.id ? { ...listedFixture, ...directFixture } : listedFixture
  // Match picker: men's matches, plus the current one if a women's match was opened directly.
  const pickerFixtures = selectedFixture && (selectedFixture.squad ?? 'men') !== 'men' ? [selectedFixture, ...menFixtures] : menFixtures
  const players = [...playersResult.items].sort((a, b) => a.name.localeCompare(b.name))
  // The Starting XI is 11 fixed places (GK, defence, midfield, attack); '' = empty place.
  const startingSlots: string[] = (() => {
    const saved = selectedFixture
      ? lineupDraft && lineupDraft.fixtureId === selectedFixture.id ? lineupDraft.playerIds : selectedFixture.startingPlayerIds ?? []
      : []
    return Array.from({ length: 11 }, (_, index) => saved[index] ?? '')
  })()
  const startingPlayers = startingSlots.filter(Boolean)
  // Every senior player who does not start is a sub, unless an admin leaves them out
  // (injured, suspended). The draft stores who is left OUT, so new players join the bench.
  const nonStarters = playersResult.items.filter((player) => player.team === 'senior' && !startingPlayers.includes(player.id)).map((player) => player.id)
  const savedBench = selectedFixture?.benchPlayerIds ?? []
  const leftOut = selectedFixture
    ? benchDraft && benchDraft.fixtureId === selectedFixture.id ? benchDraft.playerIds : savedBench.length ? nonStarters.filter((id) => !savedBench.includes(id)) : []
    : []
  const benchPlayers = nonStarters.filter((id) => !leftOut.includes(id))
  const formation: Formation = selectedFixture && formationDraft?.fixtureId === selectedFixture.id ? formationDraft.value : isFormation(selectedFixture?.formation) ? selectedFixture.formation : DEFAULT_FORMATION
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
      const goals = nextEvents.filter((item) => item.kind === 'goal' && sameTeam(item.team, CLUB_NAME))
      const seen = seenGoals.current
      if (seen?.fixtureId === selectedFixtureId && !snapshot.metadata.hasPendingWrites) {
        const fresh = goals.find((item) => !seen.ids.has(item.id))
        if (fresh) setGoalMoment(fresh)
      }
      // The first load only remembers existing goals; it never celebrates old ones.
      seenGoals.current = { fixtureId: selectedFixtureId, ids: new Set([...(seen?.fixtureId === selectedFixtureId ? seen.ids : []), ...goals.map((item) => item.id)]) }
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

  /** Puts a player in one of the 11 places. Picking someone already in the XI swaps them. */
  function setStartingSlot(index: number, playerId: string) {
    if (!selectedFixture) return
    const next = [...startingSlots]
    const existing = playerId ? next.indexOf(playerId) : -1
    if (existing >= 0 && existing !== index) next[existing] = next[index]
    next[index] = playerId
    setLineupDraft({ fixtureId: selectedFixture.id, playerIds: next })
  }

  function toggleBenchPlayer(playerId: string) {
    if (!selectedFixture) return
    // Ticked = on the bench as a sub; unticked = left out of the squad today.
    setBenchDraft((current) => {
      const currentIds = current?.fixtureId === selectedFixture.id ? current.playerIds : leftOut
      const nextIds = currentIds.includes(playerId) ? currentIds.filter((id) => id !== playerId) : [...currentIds, playerId]
      return { fixtureId: selectedFixture.id, playerIds: nextIds }
    })
  }

  function reportError(error: unknown) {
    setProblem(errorMessage(error))
    setMessage('')
  }

  function showReactionProblem() {
    setProblem('Your reaction was not saved. Sign out and sign in again, then tap it once more.')
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
        transaction.update(fixtureRef, { startingPlayerIds: startingSlots.filter(Boolean), benchPlayerIds: benchPlayers, formation, lineupConfirmed: true, updatedAt: serverTimestamp() })
      })
      setMessage(selectedFixture.isTest ? 'Starting XI and subs confirmed (practice: fans cannot see it).' : 'Starting XI and subs confirmed for fans.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  /** Admin: save new places for the same XI (also after the match); who started does not change. */
  async function arrangeLineup(order: string[], shape: Formation) {
    if (!selectedFixture) return
    const same = [...order].sort().join(',') === [...(selectedFixture.startingPlayerIds ?? [])].sort().join(',')
    if (!same || order.length !== 11) throw new Error('The starting XI changed. Reload and try again.')
    await updateDoc(doc(db, 'fixtures', selectedFixture.id), { startingPlayerIds: order, formation: shape, updatedAt: serverTimestamp() })
    setMessage('Positions saved. Fans see the new line-up now.')
  }

  /** A private rehearsal: admins only, no alerts, never touches the table, stats or leaderboard. */
  async function createPracticeMatch() {
    setBusy(true)
    setProblem('')
    try {
      const id = `practice-${Date.now()}`
      await setDoc(doc(db, 'fixtures', id), {
        id, isTest: true, competition: 'Practice match', season: new Date().getFullYear().toString(),
        date: new Date(Date.now() + 5 * 60 * 1000).toISOString(), home: 'Ekhaya FC', away: 'Practice XI',
        venue: 'Training ground', status: 'upcoming', homeScore: null, awayScore: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      setSelectedId(id)
      setActiveTab('timeline')
      setQuickAction(null)
      setMessage('Practice match created. Pick 11 starters, then Kick off. Fans cannot see it and no alerts are sent.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function deletePracticeMatch() {
    if (!selectedFixture?.isTest || !window.confirm('Delete this practice match and everything recorded in it?')) return
    setBusy(true)
    setProblem('')
    try {
      for (const sub of ['events', 'reactions']) {
        const snapshot = await getDocs(collection(db, 'fixtures', selectedFixture.id, sub))
        await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)))
      }
      await deleteDoc(doc(db, 'fixtures', selectedFixture.id))
      setSelectedId('')
      setMessage('Practice match deleted.')
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
          // Close score predictions for good at kick-off (kept even if the match is reset).
          predictionsLocked: true,
          kickoffAt, periodStartedAt: kickoffAt, clockElapsedSeconds: 0, firstHalfSeconds: 0, addedTime: 0,
          matchStats: selectedFixture.matchStats ?? { home: { ...EMPTY_MATCH_STATS }, away: { ...EMPTY_MATCH_STATS } },
          eventCount: 0,
          startingPlayerIds: hasClubTeam ? startingPlayers : [],
          benchPlayerIds: hasClubTeam ? benchPlayers : [], lineupConfirmed: hasClubTeam,
          ...(hasClubTeam ? { formation } : {}),
          liveStartedAt: kickoffAt, updatedAt: serverTimestamp(),
        })
      })
      setQuickAction(null)
      setMessage(selectedFixture.isTest ? 'Kick-off (practice match: only admins can see it).' : 'Kick-off. Fans can follow the live match now.')
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

  /** A shot is either on or off target; total shots always = on + off. */
  async function changeShot(side: 'home' | 'away', onTarget: boolean, change: -1 | 1) {
    if (!selectedFixture) return
    try {
      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        if (!snapshot.exists() || snapshot.data().status !== 'live') throw new Error('Match stats are only available during a live match.')
        const current = (snapshot.data().matchStats ?? { home: { ...EMPTY_MATCH_STATS }, away: { ...EMPTY_MATCH_STATS } }) as { home: MatchStats; away: MatchStats }
        const next = { home: { ...EMPTY_MATCH_STATS, ...current.home }, away: { ...EMPTY_MATCH_STATS, ...current.away } }
        const stats = next[side]
        const on = Number(stats.shotsOnTarget ?? 0)
        const off = Math.max(0, Number(stats.shots ?? 0) - on)
        const nextOn = onTarget ? Math.max(0, on + change) : on
        const nextOff = onTarget ? off : Math.max(0, off + change)
        stats.shotsOnTarget = nextOn
        stats.shots = nextOn + nextOff
        transaction.update(fixtureRef, { matchStats: next, updatedAt: serverTimestamp() })
      })
    } catch (error) {
      reportError(error)
    }
  }

  /** Puts the clock on a given minute (e.g. it was started late), and it keeps running from there. */
  async function setClockMinute(minute: number) {
    if (!selectedFixture || !Number.isFinite(minute)) return
    setProblem('')
    try {
      const shown = await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const snapshot = await transaction.get(fixtureRef)
        const fixture = snapshot.data() as Fixture | undefined
        if (!snapshot.exists() || !fixture || fixture.status !== 'live') throw new Error('The clock can only be changed during a live match.')
        const secondHalf = fixture.period === 'second-half'
        if (!secondHalf && fixture.period !== 'first-half') throw new Error('Start the half first, then set the clock.')
        const lowest = secondHalf ? 46 : 1
        const highest = secondHalf ? 130 : 60
        const target = Math.min(highest, Math.max(lowest, Math.round(minute)))
        const halfStart = secondHalf ? Number(fixture.firstHalfSeconds ?? 45 * 60) : 0
        const minuteInHalf = target - (secondHalf ? 45 : 0)
        // One second into the chosen minute, so the clock shows exactly that minute now.
        transaction.update(fixtureRef, { clockElapsedSeconds: halfStart + (minuteInHalf - 1) * 60 + 1, periodStartedAt: serverTimestamp(), updatedAt: serverTimestamp() })
        return target
      })
      setMessage(`Clock set to ${shown}'.`)
    } catch (error) {
      reportError(error)
    }
  }

  async function setOpponentScore(nextScore: number) {
    if (!selectedFixture || selectedFixture.status !== 'live') return
    const targetScore = Math.max(0, Math.trunc(nextScore))
    const currentScore = sameTeam(selectedFixture.home, CLUB_NAME)
      ? Number(selectedFixture.awayScore ?? 0)
      : Number(selectedFixture.homeScore ?? 0)
    if (targetScore < currentScore && !window.confirm('Lower the opponent score and remove the latest opponent goal events?')) return

    const opponentTeam = sameTeam(selectedFixture.home, CLUB_NAME) ? selectedFixture.away : selectedFixture.home
    const scoreField = sameTeam(selectedFixture.home, CLUB_NAME) ? 'awayScore' : 'homeScore'
    setBusy(true)
    setProblem('')
    try {
      const eventCollection = collection(db, 'fixtures', selectedFixture.id, 'events')
      const eventSnapshot = await getDocs(eventCollection)
      const opponentGoals = eventSnapshot.docs
        .filter((item) => {
          const event = item.data() as MatchEvent
          return event.kind === 'goal' && sameTeam(event.team, opponentTeam)
        })
        .sort((left, right) => {
          const leftEvent = left.data() as MatchEvent
          const rightEvent = right.data() as MatchEvent
          return rightEvent.minute - leftEvent.minute
            || (rightEvent.createdAt?.toMillis?.() ?? 0) - (leftEvent.createdAt?.toMillis?.() ?? 0)
        })

      await runTransaction(db, async (transaction) => {
        const fixtureRef = doc(db, 'fixtures', selectedFixture.id)
        const fixtureSnapshot = await transaction.get(fixtureRef)
        if (!fixtureSnapshot.exists() || fixtureSnapshot.data().status !== 'live') throw new Error('This match is no longer live.')
        const fixture = fixtureSnapshot.data()
        if (fixture.eventCount != null && Number(fixture.eventCount) !== eventSnapshot.size) throw new Error('A match update arrived. Please set the score again.')
        const score = Number(fixture[scoreField] ?? 0)
        const difference = targetScore - score
        if (difference === 0) return

        if (difference > 0) {
          for (let index = 0; index < difference; index += 1) {
            transaction.set(doc(eventCollection), {
              kind: 'goal', team: opponentTeam, minute: currentEventMinute(selectedFixture, clockNow), createdAt: serverTimestamp(),
            })
          }
          transaction.update(fixtureRef, {
            [scoreField]: targetScore,
            eventCount: Number(fixture.eventCount ?? eventSnapshot.size) + difference,
            updatedAt: serverTimestamp(),
          })
          return
        }

        const removalRefs = opponentGoals.slice(0, -difference).map((item) => item.ref)
        const removalSnapshots = await Promise.all(removalRefs.map((ref) => transaction.get(ref)))
        const removedCount = removalSnapshots.filter((item) => item.exists()).length
        removalSnapshots.forEach((item) => { if (item.exists()) transaction.delete(item.ref) })
        transaction.update(fixtureRef, {
          [scoreField]: targetScore,
          eventCount: Math.max(0, Number(fixture.eventCount ?? eventSnapshot.size) - removedCount),
          updatedAt: serverTimestamp(),
        })
      })
      setMessage('Opponent score updated with matching goal events.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function reactToMatch(emoji: string, button?: HTMLElement | null) {
    if (!selectedFixture || !user) return
    if (reactions.find((reaction) => reaction.uid === user.uid)?.emoji !== emoji) floatUp(button ?? null, emoji)
    const reactionRef = doc(db, 'fixtures', selectedFixture.id, 'reactions', user.uid)
    try {
      if (reactions.find((reaction) => reaction.uid === user.uid)?.emoji === emoji) await deleteDoc(reactionRef)
      else await setDoc(reactionRef, { emoji, updatedAt: serverTimestamp() })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'permission-denied') showReactionProblem()
      else reportError(error)
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
      subbedOutPlayerId: deleteField(), subbedOutPlayerName: deleteField(), text: deleteField(), videoUrl: deleteField(),
    }
    const clipUrl = String(values.get('videoUrl') ?? '').trim()
    if (clipUrl && !parseVideo(clipUrl)) { setProblem('The video link must be a YouTube or Facebook video.'); return }
    if (clipUrl) next.videoUrl = clipUrl.slice(0, 300)
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

  /** Admins add a goal's video clip to a finished match without reopening it. */
  async function setEventClip(matchEvent: MatchEvent) {
    if (!selectedFixture) return
    const value = window.prompt('Paste the YouTube or Facebook link for this goal (leave empty to remove):', matchEvent.videoUrl ?? '')
    if (value == null) return
    const url = value.trim()
    if (url && !parseVideo(url)) { setProblem('The video link must be a YouTube or Facebook video.'); return }
    try {
      await updateDoc(doc(db, 'fixtures', selectedFixture.id, 'events', matchEvent.id), url ? { videoUrl: url.slice(0, 300), updatedAt: serverTimestamp() } : { videoUrl: deleteField(), updatedAt: serverTimestamp() })
      setMessage(url ? 'Clip added. Fans can tap ▶ Watch on this goal.' : 'Clip removed.')
    } catch (error) { reportError(error) }
  }

  async function endMatch() {
    if (!selectedFixture) return
    if (!window.confirm(selectedFixture.isTest ? 'End this practice match? Nothing is added to the table or player stats.'
      : selectedFixture.editing ? (selectedFixture.editNoStats ? 'Save your changes? The league table and player stats stay as they are for this match.' : 'Save your changes? The table and player stats will be updated with the corrected result.')
      : 'End this match and apply its result and player statistics?')) return
    setBusy(true)
    setProblem('')
    try {
      const eventSnapshot = await getDocs(collection(db, 'fixtures', selectedFixture.id, 'events'))
      const standingsSnapshot = await getDocs(collection(db, 'standings'))
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
        const tableRows = standingsSnapshots.map((item) => ({ ref: item.ref, data: { ...item.data(), id: item.id } as Standing }))
        // Cup matches (Airtel Top 8, Castel Cup) never change the league table.
        // Practice matches never change the table or player stats.
        const isPractice = Boolean(fixture.isTest)
        // A result that came from the official table (imported, never counted by the app)
        // is corrected without touching the table or player stats, so nothing counts twice.
        const keepTable = Boolean(fixture.editNoStats)
        const isCup = isPractice || keepTable || isCupCompetition(fixture.competition)
        const homeRow = isCup ? undefined : tableRows.find((row) => sameTeam(row.data.team, fixture.home))
        const awayRow = isCup ? undefined : tableRows.find((row) => sameTeam(row.data.team, fixture.away))
        if (!isCup && (!homeRow || !awayRow)) throw new Error('Both clubs need a standings row before the result can be finalized.')

        const homeGoals = Number(fixture.homeScore ?? 0)
        const awayGoals = Number(fixture.awayScore ?? 0)
        const outcome = homeGoals === awayGoals ? 'D' : homeGoals > awayGoals ? 'W' : 'L'
        const awayOutcome = outcome === 'W' ? 'L' : outcome === 'L' ? 'W' : 'D'
        const nextRows = !homeRow || !awayRow ? [] : tableRows.map((row) => {
          if (row.ref.path === homeRow.ref.path) return { ...row, data: applyResult(row.data, homeGoals, awayGoals, outcome, { fixtureId: fixtureSnapshot.id, opponent: fixture.away, date: String(fixture.date).slice(0, 10), home: true }) }
          if (row.ref.path === awayRow.ref.path) return { ...row, data: applyResult(row.data, awayGoals, homeGoals, awayOutcome, { fixtureId: fixtureSnapshot.id, opponent: fixture.home, date: String(fixture.date).slice(0, 10), home: false }) }
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
        // Official minutes from the club's match sheet (loaded with the match report) win over the app's count.
        const official = fixture.officialMinutes
        if (official && Object.keys(official).length) {
          minutes.clear()
          for (const [id, value] of Object.entries(official)) {
            if (Number(value) > 0) { minutes.set(id, Number(value)); appearanceIds.add(id) }
          }
        }

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
        const standingChanges = !homeRow || !awayRow ? [] : [
          standingChange(homeRow.data, homeGoals, awayGoals, outcome),
          standingChange(awayRow.data, awayGoals, homeGoals, awayOutcome),
        ]
        transaction.update(fixtureRef, {
          goals: buildGoals(matchEvents, fixture),
          status: 'finished', period: 'full-time', minute: finalMinute,
          clockElapsedSeconds: clockSeconds, periodStartedAt: deleteField(), editing: deleteField(), editNoStats: deleteField(),
          ...(keepTable
            ? { statsApplied: false, statsSkipped: true, statsAppliedChanges: deleteField() }
            : { statsApplied: true, statsSkipped: false, statsAppliedChanges: { standings: standingChanges, players: isPractice ? {} : playerDeltas } }),
          finishedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        nextRows.forEach((row, index) => {
          // previousPosition drives the ▲ ▼ arrows on the league table.
          const oldPosition = Number(row.data.position ?? index + 1)
          const staleArrow = row.data.previousPosition != null && row.data.previousPosition !== oldPosition
          if (oldPosition !== index + 1 || staleArrow || row.ref.path === homeRow?.ref.path || row.ref.path === awayRow?.ref.path) {
            transaction.update(row.ref, { ...row.data, position: index + 1, previousPosition: oldPosition, updatedAt: serverTimestamp() })
          }
        })
        if (!isPractice && !keepTable) for (const [id, stats] of playerUpdates) transaction.update(doc(db, 'players', id), { stats, updatedAt: serverTimestamp() })
      })
      setMessage(selectedFixture.editNoStats ? 'Result corrected. The league table and player stats were not changed (the official table already counts this match).' : selectedFixture.isTest ? 'Practice match ended. Nothing was added to the table, player stats or fans\' apps.' : isCupCompetition(selectedFixture.competition) ? 'Match ended. The cup result and player statistics have been updated (the league table is not affected).' : 'Match ended. The result, standings and player statistics have been updated.')
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  /**
   * mode 'reset': back to upcoming, events deleted.
   * mode 'edit': reopen a finished match for corrections. Events, score, line-up and
   * stats are kept; its table and player-stat changes are taken back out, and are
   * applied again (with the corrections) when the admin taps Save changes.
   */
  async function resetMatch(mode: 'reset' | 'edit' = 'reset') {
    if (!selectedFixture || selectedFixture.status === 'upcoming') return
    if (mode === 'edit' && selectedFixture.status !== 'finished') return
    const applied = Boolean(selectedFixture.statsApplied)
    if (!window.confirm(mode === 'edit'
      ? 'Edit this match? You can change scorers, minutes, cards, the score and stats, then tap Save changes. Fans get no alerts while you edit.'
      : applied
        ? 'Reset this match? Its standings and player-stat changes will be reversed, then its events deleted.'
        : 'Reset this match? Its events will be deleted and its score cleared.')) return
    setBusy(true)
    setProblem('')
    try {
      const eventSnapshot = await getDocs(collection(db, 'fixtures', selectedFixture.id, 'events'))
      const eventRefs = eventSnapshot.docs.map((item) => item.ref)
      const standingsSnapshot = await getDocs(collection(db, 'standings'))
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
            return { ref: snapshot.ref, data: { ...snapshot.data(), id: snapshot.id } as Standing }
          }))
          const playerRefs = Object.keys(changes.players).map((id) => doc(db, 'players', id))
          playerDocs = await Promise.all(playerRefs.map((ref) => transaction.get(ref)))
          if (playerDocs.some((snapshot) => !snapshot.exists())) throw new Error('A player record is missing, so this result cannot be safely reset.')
          const allStandingRefs = standingsSnapshot.docs.map((item) => item.ref)
          const knownPaths = new Set(currentStandings.map((row) => row.ref.path))
          const remainingRefs = allStandingRefs.filter((ref) => !knownPaths.has(ref.path))
          const remainingDocs = await Promise.all(remainingRefs.map((ref) => transaction.get(ref)))
          currentStandings.push(...remainingDocs.map((snapshot) => ({ ref: snapshot.ref, data: { ...snapshot.data(), id: snapshot.id } as Standing })))
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
            const fullHistory = Array.isArray(row.data.formHistory) ? row.data.formHistory : []
            const historyFresh = fullHistory.length > 0 && fullHistory.slice(-5).map((item) => item.result).join('') === (Array.isArray(row.data.form) ? row.data.form : []).slice(-5).join('') && fullHistory.some((item) => item.fixtureId === selectedFixture.id)
            const history = historyFresh ? fullHistory.filter((item) => item.fixtureId !== selectedFixture.id) : null
            if (history) return { ...row, data: { ...data, formHistory: history, form: history.slice(-5).map((item) => item.result) } }
            const form = [...(Array.isArray(row.data.form) ? row.data.form : [])]
            const formIndex = form.lastIndexOf(change.result)
            if (formIndex >= 0) form.splice(formIndex, 1)
            return { ...row, data: { ...data, form } }
          })
          reversedRows.sort((a, b) => b.data.points - a.data.points || b.data.goalDifference - a.data.goalDifference || b.data.goalsFor - a.data.goalsFor || a.data.position - b.data.position)
        }

        if (mode === 'edit') {
          // Back to a paused second half (clock frozen), marked as a correction.
          transaction.update(fixtureRef, {
            status: 'live', period: 'second-half', editing: true, periodStartedAt: deleteField(),
            editNoStats: !fixture.statsApplied,
            clockElapsedSeconds: Math.max(Number(fixture.clockElapsedSeconds ?? 0), 90 * 60),
            statsApplied: false, statsAppliedChanges: deleteField(), statsSkipped: deleteField(), updatedAt: serverTimestamp(),
          })
        } else transaction.update(fixtureRef, {
          status: 'upcoming', homeScore: deleteField(), awayScore: deleteField(), minute: deleteField(), goals: deleteField(),
          eventCount: deleteField(), startingPlayerIds: deleteField(), liveStartedAt: deleteField(), finishedAt: deleteField(),
          benchPlayerIds: deleteField(), lineupConfirmed: deleteField(), kickoffAt: deleteField(), periodStartedAt: deleteField(),
          period: deleteField(), clockElapsedSeconds: deleteField(), firstHalfSeconds: deleteField(), addedTime: deleteField(), matchStats: deleteField(),
          statsApplied: false, statsAppliedChanges: deleteField(), statsSkipped: deleteField(), updatedAt: serverTimestamp(),
        })
        if (mode === 'reset') eventDocs.forEach((snapshot) => { if (snapshot.exists()) transaction.delete(snapshot.ref) })
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
      setMessage(mode === 'edit'
        ? (applied ? 'Editing the result. Change anything below, then tap Save changes. The table and player stats update when you save.' : 'Editing the result. Change anything below, then tap Save changes. The league table stays as it is for this match.')
        : 'Match reset to upcoming. Its events and any applied stat changes were removed.')
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
    {isAdmin && <div className="practice-bar"><span><FlaskConical size={15} aria-hidden="true" /> Rehearse match day safely</span><Button type="button" variant="secondary" disabled={busy} onClick={() => void createPracticeMatch()} icon={<FlaskConical size={15} />}>Start practice match</Button></div>}
    {message && <p className="live-feedback" role="status">{message}</p>}
    {problem && <p className="live-error" role="alert"><ShieldAlert size={15} />{problem}</p>}
    <EmptyState icon={Activity} title="No match to follow" description="Live match updates will appear here when a fixture is selected." />
  </>

  // While staff edit a finished match, fans keep seeing it as full time.
  const isLive = selectedFixture.status === 'live' && (isAdmin || !selectedFixture.editing)
  const isFinished = selectedFixture.status === 'finished' || (selectedFixture.status === 'live' && !isLive)
  const homeScore = selectedFixture.homeScore ?? 0
  const awayScore = selectedFixture.awayScore ?? 0
  const opponentScore = sameTeam(selectedFixture.home, CLUB_NAME) ? awayScore : homeScore
  const clubPlayers = players.filter((player) => player.team === 'senior')
  const homeSide: 'home' | 'away' = sameTeam(selectedFixture.home, CLUB_NAME) ? 'home' : 'away'
  const actionKind: MatchEventKind | null = quickAction === 'yellow' || quickAction === 'red' ? 'card'
    : quickAction === 'opponent-goal' ? 'goal' : quickAction
  const actionSide: 'home' | 'away' = quickAction === 'opponent-goal' ? (homeSide === 'home' ? 'away' : 'home') : homeSide
  const cardColor = quickAction === 'red' ? 'red' : 'yellow'
  const homeStats = { ...EMPTY_MATCH_STATS, ...selectedFixture.matchStats?.home }
  const awayStats = { ...EMPTY_MATCH_STATS, ...selectedFixture.matchStats?.away }
  // Substitutions, goals and cards from the commentary, shown on the line-up.
  const lineupMarks: Record<string, PlayerMarks> = {}
  const markFor = (id: string) => (lineupMarks[id] ??= {})
  const shortOf = (id?: string, fallback?: string) => { const name = players.find((p) => p.id === id)?.name ?? fallback ?? ''; const parts = name.trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : name }
  for (const matchEvent of [...events].sort((a, b) => a.minute - b.minute)) {
    if (!sameTeam(matchEvent.team, CLUB_NAME)) continue
    if (matchEvent.kind === 'substitution') {
      if (matchEvent.subbedOutPlayerId) Object.assign(markFor(matchEvent.subbedOutPlayerId), { off: matchEvent.minute, replacedBy: shortOf(matchEvent.subbedInPlayerId, matchEvent.subbedInPlayerName) })
      if (matchEvent.subbedInPlayerId) Object.assign(markFor(matchEvent.subbedInPlayerId), { on: matchEvent.minute, replaced: shortOf(matchEvent.subbedOutPlayerId, matchEvent.subbedOutPlayerName) })
    }
    if (matchEvent.kind === 'goal' && matchEvent.playerId) markFor(matchEvent.playerId).goals = (markFor(matchEvent.playerId).goals ?? 0) + 1
    if (matchEvent.kind === 'goal' && matchEvent.assistPlayerId) markFor(matchEvent.assistPlayerId).assists = (markFor(matchEvent.assistPlayerId).assists ?? 0) + 1
    if (matchEvent.kind === 'card' && matchEvent.playerId) { if (matchEvent.card === 'red') markFor(matchEvent.playerId).red = true; else markFor(matchEvent.playerId).yellow = true }
  }
  const homeLineup = (selectedFixture.startingPlayerIds ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const benchLineup = (selectedFixture.benchPlayerIds ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const countdownSeconds = Math.max(0, Math.floor((new Date(selectedFixture.date).getTime() - clockNow) / 1000))
  const canChat = chatFlag && hasClubTeam && !selectedFixture.isTest && (selectedFixture.status !== 'upcoming' || selectedFixture.lineupConfirmed === true)
  const tabs = (['preview', 'timeline', 'lineups', 'stats', 'chat'] as const).filter((tab) => tab !== 'chat' || canChat)
  // Before kick-off the match centre opens on the preview; during and after, on the commentary.
  const currentTab = activeTab && tabs.includes(activeTab as typeof tabs[number]) ? activeTab : selectedFixture.status === 'upcoming' ? 'preview' : 'timeline'
  const countdown = `${Math.floor(countdownSeconds / 86400)}d ${String(Math.floor(countdownSeconds % 86400 / 3600)).padStart(2, '0')}:${String(Math.floor(countdownSeconds % 3600 / 60)).padStart(2, '0')}:${String(countdownSeconds % 60).padStart(2, '0')}`

  return <>
    <PageHeader eyebrow="Match centre" title="Live match" description="The clock runs locally. Match updates sync only when staff post an action." />
    {isAdmin && <div className="practice-bar">
      {selectedFixture?.isTest
        ? <><span><FlaskConical size={15} aria-hidden="true" /> You are in a practice match</span><Button type="button" variant="ghost" disabled={busy} onClick={() => void deletePracticeMatch()} icon={<Trash2 size={15} />}>Delete practice</Button></>
        : <><span><FlaskConical size={15} aria-hidden="true" /> Rehearse match day safely</span><Button type="button" variant="secondary" disabled={busy} onClick={() => void createPracticeMatch()} icon={<FlaskConical size={15} />}>Start practice match</Button></>}
    </div>}
    {pickerFixtures.length > 1 && <label className="live-fixture-select"><span>Choose match</span><select value={selectedFixture.id} onChange={(event) => { setSelectedId(event.target.value); setActiveTab(null); setQuickAction(null) }}>{pickerFixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.isTest ? '🧪 Practice: ' : ''}{fixture.home} v {fixture.away} · {fixture.editing ? 'FT · editing' : fixture.status === 'live' ? 'LIVE' : fixture.status === 'finished' ? 'FT' : fixture.date.slice(0, 10)}</option>)}</select></label>}
    <section className={`matchday-scoreboard${isLive ? ' matchday-scoreboard-live' : ''}`} aria-label="Match scoreboard">
      <div className="matchday-scoreboard-top"><span>{selectedFixture.isTest ? <span className="practice-badge"><FlaskConical size={12} aria-hidden="true" /> PRACTICE · only admins see this</span> : competitionLabel(selectedFixture.competition)}</span><div>{isLive && selectedFixture.editing ? <Badge variant="gold">EDITING</Badge> : isLive ? <Badge variant="live"><span className="live-pulse-dot" />LIVE</Badge> : <Badge variant={isFinished ? 'default' : 'gold'}>{isFinished ? 'FULL TIME' : 'UPCOMING'}</Badge>}</div></div>
      <div className="matchday-teams">
        <div className="matchday-team"><TeamLogo name={selectedFixture.home} crest /><strong>{selectedFixture.home}</strong></div>
        <div className="matchday-score"><strong key={`${homeScore}-${awayScore}`} className={selectedFixture.status === 'upcoming' ? '' : 'score-pop'}>{selectedFixture.status === 'upcoming' ? 'vs' : `${homeScore} – ${awayScore}`}</strong>{isLive && <span>{matchMinute(selectedFixture, clockNow)}</span>}{selectedFixture.period === 'half-time' && <span>HALF-TIME</span>}{selectedFixture.period === 'full-time' && <span>FULL-TIME</span>}</div>
        <div className="matchday-team matchday-team-away"><TeamLogo name={selectedFixture.away} crest /><strong>{selectedFixture.away}</strong></div>
      </div>
      <div className="matchday-scoreboard-bottom"><span>{selectedFixture.venue || 'Venue TBC'}</span><span>{new Date(selectedFixture.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
    </section>
    {isAdmin && isFinished && !selectedFixture.isTest && params.get('edit') === '1' && params.get('match') === selectedFixture.id && !editPromptUsed && <div className="edit-prompt"><span>Fix the scorers, minutes, cards or score of this match.</span><Button type="button" disabled={busy} onClick={() => { setEditPromptUsed(true); void resetMatch('edit') }}>Edit match</Button></div>}
    <ShareBar fixture={selectedFixture} events={events} players={players} minuteLabel={matchMinute(selectedFixture, clockNow)} />
    {message && <p className="live-feedback" role="status">{message}</p>}
    {problem && <p className="live-error" role="alert"><ShieldAlert size={15} />{problem}</p>}

    {selectedFixture.status === 'upcoming' && <section className="matchday-countdown"><Clock3 size={17} /><div><span>Kick-off countdown</span><strong>{countdown}</strong></div><span>{selectedFixture.lineupConfirmed ? 'Lineup confirmed' : 'Lineup to be confirmed'}</span></section>}

    {isAdmin && selectedFixture.status === 'upcoming' && <Card className="admin-card live-admin-card">
      <div className="matchday-admin-heading"><h2>Matchday squad</h2><span>{startingPlayers.length}/11 starters · {benchPlayers.length} subs</span></div>
      {hasClubTeam && <label className="admin-field formation-picker"><span>Formation</span><select value={formation} onChange={(event) => setFormationDraft({ fixtureId: selectedFixture.id, value: event.target.value as Formation })}>{FORMATIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
      {hasClubTeam ? playersResult.loading ? <Skeleton className="live-player-skeleton" /> : <div className="matchday-squad-grid"><section><h3>Starting XI <small className="squad-hint">{formation} · tap a place to choose the player</small></h3><ol className="xi-sheet">{slotRoles(formation).map((role, index) => { const chosen = clubPlayers.find((player) => player.id === startingSlots[index]); return <li key={index} className={`xi-slot xi-${role.toLowerCase()}${chosen ? ' filled' : ''}`}><span className="xi-role">{role}</span>{chosen ? <PlayerAvatar player={chosen} /> : <span className="xi-empty-avatar" aria-hidden="true">+</span>}<select aria-label={`${role} place ${index + 1}`} value={startingSlots[index]} onChange={(event) => setStartingSlot(index, event.target.value)}><option value="">Choose {role === 'GK' ? 'goalkeeper' : role === 'DEF' ? 'defender' : role === 'MID' ? 'midfielder' : 'forward'}…</option>{[...clubPlayers].sort((a, b) => Number(b.position === role) - Number(a.position === role) || a.name.localeCompare(b.name)).map((player) => <option key={player.id} value={player.id}>{player.number != null ? `#${player.number} ` : ''}{player.name}{player.position ? ` · ${player.position}` : ''}{startingSlots.includes(player.id) && startingSlots[index] !== player.id ? ' (in XI)' : ''}</option>)}</select>{chosen && <button type="button" className="xi-clear" aria-label={`Remove ${chosen.name}`} onClick={() => setStartingSlot(index, '')}>×</button>}</li> })}</ol></section><section><h3>Subs <small className="squad-hint">everyone not starting · untick anyone not available</small></h3><div className="starting-player-list">{clubPlayers.filter((player) => !startingPlayers.includes(player.id)).map((player) => <label key={player.id} className="starting-player"><input type="checkbox" checked={benchPlayers.includes(player.id)} onChange={() => toggleBenchPlayer(player.id)} /><PlayerAvatar player={player} /><span>{player.name}{player.position ? <i className="squad-pos">{player.position}</i> : null}</span>{benchPlayers.includes(player.id) ? <em className="sub-tag">SUB</em> : <em className="out-tag">OUT</em>}<small>{player.number == null ? '—' : `#${player.number}`}</small></label>)}</div></section></div> : <p className="live-help">This fixture does not include Ekhaya FC. Its result can still be followed here.</p>}
      {hasClubTeam && <Button type="button" variant="secondary" disabled={busy || startingPlayers.length !== 11 || playersResult.loading} onClick={() => void confirmLineup()}>Confirm lineup</Button>}
      <Button type="button" disabled={busy || (hasClubTeam && (startingPlayers.length !== 11 || playersResult.loading))} onClick={() => void startMatch()} icon={<Zap size={17} />}>Kick off</Button>
    </Card>}

    {isAdmin && <datalist id="squad-names">{clubPlayers.map((player) => <option key={player.id} value={player.name} />)}</datalist>}
    {isAdmin && isLive && selectedFixture.editing && <p className="editing-banner">✏️ Editing a finished match. Fans see this as full time (score updates as you fix it) and get no alerts. When you are done, tap <strong>Save changes</strong>.</p>}
    {isAdmin && isLive && <section className="matchday-console">
      <div className="matchday-period-controls"><div><span className="matchday-period-label">{selectedFixture.period === 'first-half' ? 'FIRST HALF' : selectedFixture.period === 'half-time' ? 'HALF-TIME' : 'SECOND HALF'}</span><strong>{matchMinute(selectedFixture, clockNow)}</strong></div>
        {selectedFixture.period === 'first-half' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void setMatchPeriod('half-time')}>Half-time</Button>}
        {selectedFixture.period === 'half-time' && <Button type="button" disabled={busy} onClick={() => void setMatchPeriod('second-half')}>Start 2nd half</Button>}
        {selectedFixture.period === 'second-half' && <Button type="button" variant="danger" disabled={busy} onClick={() => void endMatch()}>{selectedFixture.editing ? 'Save changes' : 'Full-time'}</Button>}
        {activePeriod(selectedFixture.period) && <form className="clock-controls" onSubmit={(event) => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get('minute')); void setClockMinute(value) }}>
          <span>Clock</span>
          <button type="button" aria-label="Clock back one minute" disabled={busy} onClick={() => void setClockMinute(currentEventMinute(selectedFixture, clockNow) - 1)}>−1′</button>
          <input name="minute" type="number" inputMode="numeric" min={1} max={130} placeholder={String(currentEventMinute(selectedFixture, clockNow))} aria-label="Set match minute" />
          <button type="submit" disabled={busy}>Set</button>
          <button type="button" aria-label="Clock forward one minute" disabled={busy} onClick={() => void setClockMinute(currentEventMinute(selectedFixture, clockNow) + 1)}>+1′</button>
        </form>}
        {activePeriod(selectedFixture.period) && <div className="added-time-controls"><span>Added time <b>+{selectedFixture.addedTime ?? 0}</b></span>{[1, 2, 3].map((amount) => <button key={amount} type="button" className={selectedFixture.addedTime === amount ? 'selected' : ''} onClick={() => void setAddedTime(amount)}>+{amount}</button>)}</div>}
      </div>
      <div className="matchpad-actions">{QUICK_ACTIONS.map(({ action, label, icon: Icon }) => <button type="button" key={action} className={`matchpad-action${quickAction === action ? ' active' : ''} matchpad-${action}`} onClick={() => setQuickAction((current) => current === action ? null : action)}><Icon size={20} /><span>{label}</span></button>)}<button type="button" className="matchpad-action matchpad-undo" disabled={busy || !events.length} onClick={() => void undoLastEvent()}><CornerUpLeft size={20} /><span>Undo last</span></button></div>
      {actionKind && <div className="matchpad-form"><EventForm fixture={selectedFixture} players={players} events={events} minute={currentEventMinute(selectedFixture, clockNow)} kind={actionKind} defaultSide={actionSide} defaultCard={cardColor} busy={busy} onSubmit={(event) => void addEvent(event)} />{quickAction === 'opponent-goal' && <p className="matchpad-hint">Adds a goal to {selectedFixture.home === CLUB_NAME ? selectedFixture.away : selectedFixture.home}.</p>}</div>}
      <section className="opponent-score-control" aria-label="Opponent score controls">
        <div className="opponent-score-value"><span>Opponent score</span><strong>{opponentScore}</strong></div>
        <div className="opponent-score-buttons" role="group" aria-label="Set opponent score">
          <button type="button" aria-label="Decrease opponent score" disabled={busy || opponentScore === 0} onClick={() => void setOpponentScore(opponentScore - 1)}>−</button>
          {[0, 1, 2, 3, 4, 5].map((score) => <button type="button" key={score} className={opponentScore === score ? 'selected' : ''} disabled={busy} onClick={() => void setOpponentScore(score)}>{score}</button>)}
          <button type="button" aria-label="Increase opponent score" disabled={busy} onClick={() => void setOpponentScore(opponentScore + 1)}>+</button>
        </div>
      </section>
      <div className="matchday-quick-stats"><div className="matchday-stats-heading"><h2>Match stats</h2><span>{selectedFixture.home}</span><span>{selectedFixture.away}</span></div>{([true, false] as const).map((onTarget) => <div className="quick-stat-row" key={onTarget ? 'on' : 'off'}><span>{onTarget ? 'Shots on target' : 'Shots off target'}</span>{(['home', 'away'] as const).map((side) => { const stats = side === 'home' ? homeStats : awayStats; const value = onTarget ? stats.shotsOnTarget : Math.max(0, stats.shots - stats.shotsOnTarget); return <div key={side}><button type="button" aria-label={`Remove shot ${onTarget ? 'on' : 'off'} target for ${side}`} onClick={() => void changeShot(side, onTarget, -1)}>−</button><strong>{value}</strong><button type="button" aria-label={`Add shot ${onTarget ? 'on' : 'off'} target for ${side}`} onClick={() => void changeShot(side, onTarget, 1)}>+</button></div> })}</div>)}<div className="quick-stat-row quick-stat-total"><span>Total shots</span><div><strong>{homeStats.shots}</strong></div><div><strong>{awayStats.shots}</strong></div></div>{(['corners', 'fouls', 'offsides'] as Array<keyof MatchStats>).map((key) => <div className="quick-stat-row" key={key}><span>{key[0].toUpperCase() + key.slice(1)}</span>{(['home', 'away'] as const).map((side) => <div key={side}><button type="button" aria-label={`Remove ${key} for ${side}`} onClick={() => void changeQuickStat(side, key, -1)}>−</button><strong>{(side === 'home' ? homeStats : awayStats)[key]}</strong><button type="button" aria-label={`Add ${key} for ${side}`} onClick={() => void changeQuickStat(side, key, 1)}>+</button></div>)}</div>)}</div>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button>
    </section>}

    {isAdmin && isFinished && <Card className="admin-card live-admin-card"><h2>Match finished</h2><p className="live-help"><strong>Edit match</strong> to correct scorers, minutes, cards, the score or stats. The table and player stats are fixed when you save. <strong>Reset</strong> wipes the match back to upcoming.</p><div className="finished-actions"><Button type="button" disabled={busy} onClick={() => void resetMatch('edit')}>Edit match</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void resetMatch()}>Reset match</Button></div></Card>}
    {isAdmin && isFinished && !selectedFixture.isTest && (selectedFixture.startingPlayerIds ?? []).length > 0 && <MinutesEditor key={`${selectedFixture.id}:${JSON.stringify(selectedFixture.officialMinutes ?? {})}:${events.length}`} fixture={selectedFixture} players={players} events={events} />}
    {isLive && !isAdmin && <div className="live-fan-note"><span className="live-pulse-dot" />Live from {selectedFixture.venue || (/^ekhaya/i.test(selectedFixture.home) ? 'Chiwembe Stadium' : 'the stadium')}</div>}
    {eventsError && <p className="live-error" role="alert"><ShieldAlert size={15} />{eventsError}</p>}

    <div className="matchday-tabs" role="tablist" aria-label="Match details">{tabs.map((tab) => <button type="button" role="tab" aria-selected={currentTab === tab} className={currentTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</button>)}</div>
    {currentTab === 'timeline' && <>
      {eventsLoading ? <Skeleton className="live-player-skeleton" /> : <section className="live-timeline"><div className="live-section-heading"><h2>Summary</h2><span>{events.length} events</span></div><MatchTimeline events={events} home={selectedFixture.home} away={selectedFixture.away} isClub={(team) => sameTeam(team, CLUB_NAME)} isHome={(team) => sameTeam(team, selectedFixture.home)} finished={isFinished} live={isLive} homeScore={homeScore} awayScore={awayScore} renderExtra={(matchEvent) => matchEvent.videoUrl ? <button type="button" className="mt-watch" onClick={() => setClip({ url: matchEvent.videoUrl ?? '', title: eventDescription(matchEvent) })} aria-label="Watch clip"><Play size={11} /></button> : null} />{!events.length && <div className="live-timeline-empty">{isLive ? 'No updates yet. The match is ready.' : 'No match events recorded.'}</div>}{isAdmin && events.length > 0 && <details className="mt-admin-manage"><summary>Manage events (admin)</summary>{events.map((matchEvent) => <article className={`live-event${matchEvent.kind === 'goal' ? ' live-event-big' : ''}${matchEvent.kind === 'card' ? ` live-event-big-${matchEvent.card === 'red' ? 'red' : 'yellow'}` : ''}`} key={matchEvent.id}><strong>{matchEvent.kind === 'goal' ? minuteLabel(matchEvent).replace("'", '') : matchEvent.minute}{matchEvent.kind === 'goal' && (matchEvent.minuteApprox) ? '' : "'"}</strong><span className={`live-event-mark live-event-${matchEvent.kind}${matchEvent.kind === 'card' ? ` live-event-card-${matchEvent.card === 'red' ? 'red' : 'yellow'}` : ''}`} aria-label={matchEvent.kind === 'card' ? `${matchEvent.card === 'red' ? 'Red' : 'Yellow'} card` : undefined}>{matchEvent.kind === 'goal' ? <Goal size={15} /> : matchEvent.kind === 'card' ? <i className="card-shape" /> : matchEvent.kind === 'commentary' ? <MessageSquareText size={14} /> : <Users size={14} />}</span><div>{matchEvent.kind === 'goal' && <span className="live-event-headline">{sameTeam(matchEvent.team, CLUB_NAME) ? 'GOAL!' : 'Goal'}</span>}<p>{(() => { const scorer = matchEvent.kind === 'goal' || matchEvent.kind === 'card' ? players.find((player) => player.id === matchEvent.playerId) : undefined; return scorer ? <span className="live-event-who"><PlayerAvatar player={scorer} />{eventDescription(matchEvent)}</span> : eventDescription(matchEvent) })()}</p><small>{matchEvent.team}</small>{matchEvent.videoUrl && <button type="button" className="live-event-watch" onClick={() => setClip({ url: matchEvent.videoUrl ?? '', title: eventDescription(matchEvent) })}>▶ Watch</button>}{isAdmin && !isLive && matchEvent.kind === 'goal' && <button type="button" className="live-event-watch add" onClick={() => void setEventClip(matchEvent)}>{matchEvent.videoUrl ? 'Change clip' : '+ Add clip'}</button>}{isAdmin && isLive && <details className="match-event-edit"><summary>Edit event</summary><form className="match-event-editor" onSubmit={(event) => void editMatchEvent(matchEvent, event)}>
        <div className="live-form-grid"><label className="admin-field"><span>Type</span><select name="kind" defaultValue={matchEvent.kind}><option value="goal">Goal</option><option value="card">Card</option><option value="substitution">Sub</option><option value="commentary">Commentary</option></select></label><label className="admin-field"><span>Team</span><select name="side" defaultValue={sameTeam(matchEvent.team, selectedFixture.home) ? 'home' : 'away'}><option value="home">{selectedFixture.home}</option><option value="away">{selectedFixture.away}</option></select></label><label className="admin-field"><span>Minute</span><input name="minute" type="number" min={1} max={130} defaultValue={matchEvent.minute} /></label></div>
        <input className="match-event-edit-input" name="playerName" list="squad-names" defaultValue={matchEvent.playerName ?? ''} placeholder="Scorer / player name" /><input className="match-event-edit-input" name="assistPlayerName" list="squad-names" defaultValue={matchEvent.assistPlayerName ?? ''} placeholder="Assist name" /><div className="live-form-grid"><input className="match-event-edit-input" name="subbedOutPlayerName" list="squad-names" defaultValue={matchEvent.subbedOutPlayerName ?? ''} placeholder="Player off" /><input className="match-event-edit-input" name="subbedInPlayerName" list="squad-names" defaultValue={matchEvent.subbedInPlayerName ?? ''} placeholder="Player on" /></div><label className="admin-field"><span>Commentary</span><input name="text" defaultValue={matchEvent.text ?? ''} maxLength={180} /></label><label className="admin-field"><span>Video clip (YouTube/Facebook link)</span><input name="videoUrl" inputMode="url" defaultValue={matchEvent.videoUrl ?? ''} placeholder="https://youtu.be/…" /></label><label className="admin-field"><span>Card</span><select name="card" defaultValue={matchEvent.card ?? 'yellow'}><option value="yellow">Yellow</option><option value="red">Red</option></select></label><div className="admin-actions"><Button type="submit" variant="secondary" disabled={busy}>Save event</Button><button type="button" className="match-event-delete" disabled={busy} onClick={() => void deleteMatchEvent(matchEvent.id)}><Trash2 size={15} />Delete</button></div></form></details>}</div></article>)}</details>}</section>}
      {isLive && <section className="matchday-reactions" aria-label="Match reactions">{['⚽', '🔥', '👏', '😱'].map((emoji) => <button type="button" key={emoji} aria-label={`React ${emoji}`} aria-pressed={reactions.some((reaction) => reaction.uid === user?.uid && reaction.emoji === emoji)} className={reactions.some((reaction) => reaction.uid === user?.uid && reaction.emoji === emoji) ? 'selected' : ''} onClick={(event) => void reactToMatch(emoji, event.currentTarget)}><span>{emoji}</span><strong>{reactions.filter((reaction) => reaction.emoji === emoji).length}</strong></button>)}</section>}
    </>}
    {currentTab === 'lineups' && <section className="matchday-lineups"><div className="matchday-section-title"><h2>Lineups</h2>{selectedFixture.status === 'upcoming' && <Badge variant="gold">{homeLineup.length ? 'CONFIRMED' : 'AWAITING'}</Badge>}</div>{homeLineup.length ? <LineupPitch starters={homeLineup} bench={benchLineup} formation={selectedFixture.formation} onArrange={isAdmin ? arrangeLineup : undefined} marks={lineupMarks} /> : <p className="live-timeline-empty">The confirmed Ekhaya XI will appear here before kick-off.</p>}{selectedFixture.officialMinutes && Object.keys(selectedFixture.officialMinutes).length > 0 && <div className="minutes-played"><h3>Minutes played</h3><ul>{Object.entries(selectedFixture.officialMinutes).sort((a, b) => b[1] - a[1]).map(([id, mins]) => { const player = playersResult.items.find((item) => item.id === id); const started = (selectedFixture.startingPlayerIds ?? []).includes(id); return <li key={id}><span>{player?.number != null ? <b>{player.number}</b> : null}{player?.name ?? id}</span><small>{started ? (mins < 90 ? 'Subbed off' : 'Full match') : 'Came on'}</small><strong>{mins}′</strong></li> })}</ul><p className="live-help">From the club's official match sheet.</p></div>}</section>}
    {currentTab === 'stats' && <section className="matchday-stats-view"><div className="matchday-section-title"><h2>Match stats</h2><span>Live comparison</span></div>{(['shots', 'shotsOnTarget', 'shotsOffTarget', 'corners', 'fouls', 'offsides'] as const).map((key) => { const value = (stats: MatchStats) => key === 'shotsOffTarget' ? Math.max(0, stats.shots - stats.shotsOnTarget) : stats[key]; const home = value(homeStats); const away = value(awayStats); const total = Math.max(1, home, away); return <div className="match-stat-compare" key={key}><div><strong>{home}</strong><span>{key === 'shotsOnTarget' ? 'Shots on target' : key === 'shotsOffTarget' ? 'Shots off target' : key[0].toUpperCase() + key.slice(1)}</span><strong>{away}</strong></div><div className="match-stat-bars"><i style={{ width: `${home / total * 50}%` }} /><i style={{ width: `${away / total * 50}%` }} /></div></div> })}<div className="matchday-stat-legend"><span>{selectedFixture.home}</span><span>{selectedFixture.away}</span></div></section>}
    {currentTab === 'preview' && <MatchPreview key={`preview-${selectedFixture.id}`} fixture={selectedFixture} fixtures={fixturesResult.items} standings={standingsResult.items} />}
    {currentTab === 'chat' && <MatchChat key={`chat-${selectedFixture.id}`} fixture={selectedFixture} />}
    {isFinished && <MatchSummary fixture={selectedFixture} onEdit={isAdmin ? () => void resetMatch('edit') : undefined} />}
    {!selectedFixture.isTest && selectedFixture.status !== 'upcoming' && <MatchMedia key={selectedFixture.id} fixture={selectedFixture} />}
    {clip && <VideoPlayer url={clip.url} title={clip.title} onClose={() => setClip(null)} />}
    {goalMoment && isLive && !selectedFixture.editing && goalMoment.id && <GoalSplash event={goalMoment} player={players.find((player) => player.id === goalMoment.playerId)} score={`${selectedFixture.home} ${homeScore}–${awayScore} ${selectedFixture.away}`} onClose={closeGoal} />}
    {standingsResult.error && isAdmin && <p className="live-error">Standings could not be loaded: {standingsResult.error}</p>}
  </>
}

function eventDescription(event: MatchEvent) {
  if (event.kind === 'commentary') return event.text || 'Match update'
  if (event.kind === 'goal') return `Goal${event.playerName ? ` · ${event.playerName}` : ''}${event.assistPlayerName ? ` (assist: ${event.assistPlayerName})` : ''}`
  if (event.kind === 'card') return `${event.card === 'red' ? 'Red' : 'Yellow'} card${event.playerName ? ` · ${event.playerName}` : ''}`
  return `Substitution · ${event.subbedInPlayerName || 'Player on'} for ${event.subbedOutPlayerName || 'Player off'}`
}

function applyResult(row: Standing, goalsFor: number, goalsAgainst: number, result: 'W' | 'D' | 'L', match: { fixtureId: string; opponent: string; date: string; home: boolean }): Standing {
  const played = Number(row.played ?? 0) + 1
  const won = Number(row.won ?? 0) + (result === 'W' ? 1 : 0)
  const drawn = Number(row.drawn ?? 0) + (result === 'D' ? 1 : 0)
  const lost = Number(row.lost ?? 0) + (result === 'L' ? 1 : 0)
  const totalFor = Number(row.goalsFor ?? 0) + goalsFor
  const totalAgainst = Number(row.goalsAgainst ?? 0) + goalsAgainst
  // The saved form is the truth: the history is used only when it still matches
  // it (the table editor may have changed the form since).
  const savedForm = Array.isArray(row.form) ? row.form : []
  const history = Array.isArray(row.formHistory) ? row.formHistory : []
  const priorHistory = history.length && history.slice(-5).map((item) => item.result).join('') === savedForm.slice(-5).join('')
    ? history
    : savedForm.map((formResult, index) => ({ fixtureId: `legacy-${row.id}-${index}`, result: formResult }))
  const formHistory = [...priorHistory.filter((item) => item.fixtureId !== match.fixtureId), { ...match, result, score: `${goalsFor}–${goalsAgainst}` }].slice(-10)
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
