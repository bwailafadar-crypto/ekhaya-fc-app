import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { CheckCircle2, Lock, Minus, Plus, Star, Target, Trophy, Vote } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import Leaderboard from '../components/Leaderboard'
import PlayerAvatar from '../components/PlayerAvatar'
import PushSettings from '../components/PushSettings'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { Button, Card, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useLiveDocs } from '../hooks/useLiveDocs'
import type { Fixture, MotmVote, Player, Poll, PollVote, ScorePrediction } from '../types'
import { formatMalawiDate, formatMalawiTime, sortByDate } from '../utils/football'

const MAX_GOALS = 20

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function ResultBar({ label, value, total, mine, leading }: { label: ReactNode; value: number; total: number; mine?: boolean; leading?: boolean }) {
  const share = percent(value, total)
  return (
    <div className={`fz-bar${mine ? ' fz-bar-mine' : ''}${leading ? ' fz-bar-leading' : ''}`}>
      <span className="fz-bar-fill" style={{ width: `${share}%` }} aria-hidden="true" />
      <span className="fz-bar-label">{label}{mine && <CheckCircle2 size={14} aria-label="Your vote" />}</span>
      <span className="fz-bar-value">{share}%</span>
    </div>
  )
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <div className="fz-stepper" role="group" aria-label={`${label} goals`}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || value <= 0} aria-label={`One less goal for ${label}`}><Minus size={16} /></button>
      <strong aria-live="polite">{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(MAX_GOALS, value + 1))} disabled={disabled || value >= MAX_GOALS} aria-label={`One more goal for ${label}`}><Plus size={16} /></button>
    </div>
  )
}

function PredictCard({ fixture }: { fixture: Fixture }) {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const now = useNow()
  const predictions = useLiveDocs<Omit<ScorePrediction, 'id'>>(['fixtures', fixture.id, 'predictions'])
  const mine = predictions.items.find((item) => item.id === user?.uid)
  const [draft, setDraft] = useState<{ home: number; away: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const home = draft?.home ?? mine?.home ?? 0
  const away = draft?.away ?? mine?.away ?? 0
  const locked = fixture.status !== 'upcoming' || Date.parse(fixture.date) <= now

  const popular = useMemo(() => {
    const counts = new Map<string, number>()
    predictions.items.forEach((item) => counts.set(`${item.home}–${item.away}`, (counts.get(`${item.home}–${item.away}`) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [predictions.items])

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      const name = (profile?.fullName || user.email?.split('@')[0] || 'Fan').slice(0, 120)
      await setDoc(doc(db, 'fixtures', fixture.id, 'predictions', user.uid), { home, away, name, updatedAt: serverTimestamp() })
      setDraft(null)
      showToast(`Prediction saved: ${fixture.home} ${home}–${away} ${fixture.away}`)
    } catch {
      showToast(locked ? 'Predictions are closed for this match.' : 'Your prediction was not saved. Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const changed = draft !== null && (draft.home !== mine?.home || draft.away !== mine?.away)

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Target size={18} aria-hidden="true" /><div><h2>Predict the score</h2><span>{formatMalawiDate(fixture.date)} · {formatMalawiTime(fixture.date)}</span></div></div>
      <div className="fz-predict">
        <div className="fz-predict-team"><TeamLogo name={fixture.home} /><span>{fixture.home}</span><Stepper label={fixture.home} value={home} disabled={locked} onChange={(value) => setDraft({ home: value, away })} /></div>
        <span className="fz-predict-dash">–</span>
        <div className="fz-predict-team"><TeamLogo name={fixture.away} /><span>{fixture.away}</span><Stepper label={fixture.away} value={away} disabled={locked} onChange={(value) => setDraft({ home, away: value })} /></div>
      </div>
      {locked
        ? <p className="fz-note"><Lock size={14} aria-hidden="true" /> Predictions closed at kick-off.{mine ? ` You said ${mine.home}–${mine.away}.` : ''}</p>
        : <Button type="button" disabled={saving || (!changed && Boolean(mine))} onClick={() => void save()}>{saving ? 'Saving...' : mine ? (changed ? 'Update prediction' : 'Prediction saved ✓') : 'Save prediction'}</Button>}
      {predictions.items.length > 0 && <div className="fz-popular">
        <span>{predictions.items.length} fan{predictions.items.length === 1 ? '' : 's'} predicted</span>
        {(mine || locked) && popular.length > 0 && <div className="fz-chips">{popular.map(([score, count]) => <span className="fz-chip" key={score}>{score} <small>{percent(count, predictions.items.length)}%</small></span>)}</div>}
      </div>}
    </Card>
  )
}

function LastPredictionsCard({ fixture }: { fixture: Fixture }) {
  const { user } = useAuth()
  const predictions = useLiveDocs<Omit<ScorePrediction, 'id'>>(['fixtures', fixture.id, 'predictions'])
  if (predictions.loading || predictions.items.length === 0) return null
  const homeScore = fixture.homeScore ?? 0
  const awayScore = fixture.awayScore ?? 0
  const correct = predictions.items.filter((item) => item.home === homeScore && item.away === awayScore)
  const mine = predictions.items.find((item) => item.id === user?.uid)
  const mineCorrect = mine && mine.home === homeScore && mine.away === awayScore

  return (
    <Card className="fz-card fz-card-compact">
      <div className="fz-card-heading"><Trophy size={18} aria-hidden="true" /><div><h2>Last match predictions</h2><span>{fixture.home} {homeScore}–{awayScore} {fixture.away}</span></div></div>
      {mine && <p className={mineCorrect ? 'fz-result fz-result-win' : 'fz-result'}>{mineCorrect ? `You called it! ${mine.home}–${mine.away} 🎯` : `You said ${mine.home}–${mine.away}.`}</p>}
      <p className="fz-note">{correct.length ? `${correct.length} of ${predictions.items.length} fans got the exact score${correct.length <= 8 ? `: ${correct.map((item) => item.name).join(', ')}` : '.'}` : `None of the ${predictions.items.length} fans got the exact score.`}</p>
    </Card>
  )
}

function MotmCard({ fixture, players }: { fixture: Fixture; players: Player[] }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const votes = useLiveDocs<Omit<MotmVote, 'id'>>(['fixtures', fixture.id, 'motm'])
  const [saving, setSaving] = useState('')
  const lineup = [...(fixture.startingPlayerIds ?? []), ...(fixture.benchPlayerIds ?? [])]
  const candidates = (lineup.length ? players.filter((player) => lineup.includes(player.id)) : players)
    .slice().sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const mine = votes.items.find((item) => item.id === user?.uid)
  const closed = fixture.motmClosed === true
  const showResults = Boolean(mine) || closed
  const counts = new Map<string, number>()
  votes.items.forEach((item) => counts.set(item.playerId, (counts.get(item.playerId) ?? 0) + 1))
  const ranked = candidates.slice().sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
  const leader = ranked[0] && (counts.get(ranked[0].id) ?? 0) > 0 ? ranked[0] : null

  async function vote(player: Player) {
    if (!user || closed) return
    setSaving(player.id)
    try {
      await setDoc(doc(db, 'fixtures', fixture.id, 'motm', user.uid), { playerId: player.id, updatedAt: serverTimestamp() })
      showToast(`You voted for ${player.name}.`)
    } catch {
      showToast('Your vote was not saved. Check your connection and try again.', 'error')
    } finally {
      setSaving('')
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Star size={18} aria-hidden="true" /><div><h2>Man of the match</h2><span>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away}</span></div></div>
      {closed && leader && <p className="fz-result fz-result-win">🏆 {leader.name} is the fans' man of the match</p>}
      {!candidates.length ? <p className="fz-note">Players will appear here once the squad is added.</p>
        : showResults ? <div className="fz-bars">
            {ranked.slice(0, 8).map((player, index) => <ResultBar key={player.id} label={<><PlayerAvatar player={player} />{player.number ? `${player.number}. ` : ''}{player.name}</>} value={counts.get(player.id) ?? 0} total={votes.items.length} mine={mine?.playerId === player.id} leading={index === 0 && (counts.get(player.id) ?? 0) > 0} />)}
          </div>
        : <div className="fz-players">
            {candidates.map((player) => <button key={player.id} type="button" className="fz-player" disabled={Boolean(saving)} onClick={() => void vote(player)}>
              <PlayerAvatar player={player} /><span>{player.number ? <em>{player.number}</em> : null}{player.name}</span>{saving === player.id && <small>Voting...</small>}
            </button>)}
          </div>}
      <p className="fz-note">{closed ? <><Lock size={14} aria-hidden="true" /> Voting closed · </> : null}{votes.items.length} vote{votes.items.length === 1 ? '' : 's'}{mine && !closed ? ' · tap below to change your vote' : ''}</p>
      {mine && !closed && <details className="fz-change"><summary>Change my vote</summary><div className="fz-players">{candidates.map((player) => <button key={player.id} type="button" className={mine.playerId === player.id ? 'fz-player active' : 'fz-player'} disabled={Boolean(saving)} onClick={() => void vote(player)}><PlayerAvatar player={player} /><span>{player.name}</span></button>)}</div></details>}
    </Card>
  )
}

function PollCard({ poll }: { poll: Poll }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const votes = useLiveDocs<Omit<PollVote, 'id'>>(['polls', poll.id, 'votes'])
  const [saving, setSaving] = useState(-1)
  const mine = votes.items.find((item) => item.id === user?.uid)
  const closed = poll.status !== 'open'
  const counts = poll.options.map((_, index) => votes.items.filter((item) => item.option === index).length)
  const top = Math.max(...counts, 0)

  async function vote(option: number) {
    if (!user || closed) return
    setSaving(option)
    try {
      await setDoc(doc(db, 'polls', poll.id, 'votes', user.uid), { option, updatedAt: serverTimestamp() })
    } catch {
      showToast('Your vote was not saved. Check your connection and try again.', 'error')
    } finally {
      setSaving(-1)
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Vote size={18} aria-hidden="true" /><div><h2>{poll.question}</h2><span>{closed ? 'Final results' : 'Club poll'} · {votes.items.length} vote{votes.items.length === 1 ? '' : 's'}</span></div></div>
      {mine || closed
        ? <div className="fz-bars">{poll.options.map((option, index) => <ResultBar key={option + index} label={option} value={counts[index]} total={votes.items.length} mine={mine?.option === index} leading={top > 0 && counts[index] === top} />)}</div>
        : <div className="fz-options">{poll.options.map((option, index) => <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={() => void vote(index)}>{saving === index ? 'Voting...' : option}</button>)}</div>}
      {mine && !closed && <div className="fz-options fz-options-small">{poll.options.map((option, index) => index !== mine.option && <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={() => void vote(index)}>Switch to {option}</button>)}</div>}
    </Card>
  )
}

export default function FanZone() {
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')
  const polls = useFirestoreCollection<Poll>('polls')
  const real = fixtures.items.filter((fixture) => !fixture.isTest)
  const nextMatch = sortByDate(real.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  const lastMatch = sortByDate(real.filter((fixture) => fixture.status === 'finished'), 'desc')[0]
  const sortedPolls = polls.items.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
  const openPolls = sortedPolls.filter((poll) => poll.status === 'open')
  const closedPolls = sortedPolls.filter((poll) => poll.status !== 'open').slice(0, 3)

  if (fixtures.loading || players.loading || polls.loading) return <><PageHeader eyebrow="Supporters" title="Fan Zone" /><div className="loading-list"><Skeleton /><Skeleton /></div></>

  return <div className="fan-zone">
    <PageHeader eyebrow="Supporters" title="Fan Zone" description="Predict scores, pick the man of the match and have your say." />
    {(fixtures.error || players.error || polls.error) && <p className="live-error" role="alert">Some Fan Zone content could not be loaded. Check your connection.</p>}
    <PushSettings compact />
    {nextMatch ? <PredictCard fixture={nextMatch} /> : <Card className="fz-card"><h2>Predict the score</h2><p className="fz-note">The next fixture will appear here once it is scheduled.</p></Card>}
    <Leaderboard />
    {lastMatch && <MotmCard fixture={lastMatch} players={players.items} />}
    {lastMatch && <LastPredictionsCard fixture={lastMatch} />}
    {openPolls.map((poll) => <PollCard key={poll.id} poll={poll} />)}
    {closedPolls.length > 0 && <h2 className="fz-section-title">Recent poll results</h2>}
    {closedPolls.map((poll) => <PollCard key={poll.id} poll={poll} />)}
    {!openPolls.length && !closedPolls.length && <Card className="fz-card fz-card-compact"><p className="fz-note"><Vote size={14} aria-hidden="true" /> No polls right now. Check back soon.</p></Card>}
  </div>
}
