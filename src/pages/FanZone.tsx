import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { CheckCircle2, ChevronRight, HeartHandshake, Lock, Minus, Plus, Star, Target, Trophy, Vote } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import Leaderboard from '../components/Leaderboard'
import PlayerAvatar from '../components/PlayerAvatar'
import PushSettings from '../components/PushSettings'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { Button, Card, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useCounts, useMyDoc } from '../hooks/useCounts'
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

const COMMON_SCORES: Array<[number, number]> = [[1, 0], [2, 1], [1, 1], [2, 0], [0, 0], [0, 1], [1, 2], [3, 1], [2, 2], [3, 0]]

function predictionsRef(fixtureId: string) {
  return collection(db, 'fixtures', fixtureId, 'predictions')
}

function saveErrorText(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code
  return code === 'permission-denied' ? 'Please verify your email first (check your inbox), then try again.' : fallback
}

function PredictCard({ fixture }: { fixture: Fixture }) {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const now = useNow()
  const mine = useMyDoc<Omit<ScorePrediction, 'id'>>(user ? ['fixtures', fixture.id, 'predictions', user.uid] : null)
  const [draft, setDraft] = useState<{ home: number; away: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(0)
  const home = draft?.home ?? mine.data?.home ?? 0
  const away = draft?.away ?? mine.data?.away ?? 0
  const locked = fixture.status !== 'upcoming' || fixture.predictionsLocked === true || Date.parse(fixture.date) <= now
  const showPopular = Boolean(mine.data) || locked
  // Totals come from counts (cheap), not by downloading every prediction.
  const totals = useCounts(`${fixture.id}:${version}:${showPopular ? 'p' : 't'}`, () => ({
    total: predictionsRef(fixture.id),
    ...(showPopular ? Object.fromEntries(COMMON_SCORES.map(([h, a]) => [`${h}–${a}`, query(predictionsRef(fixture.id), where('home', '==', h), where('away', '==', a))])) : {}),
  }))
  const total = totals.counts.total ?? 0
  const popular = Object.entries(totals.counts).filter(([key, count]) => key !== 'total' && count > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      // Must match the profile name exactly (the database checks it).
      const name = (profile?.fullName ?? '').slice(0, 120)
      await setDoc(doc(db, 'fixtures', fixture.id, 'predictions', user.uid), { home, away, name, updatedAt: serverTimestamp() })
      setDraft(null)
      setVersion((value) => value + 1)
      showToast(`Prediction saved: ${fixture.home} ${home}–${away} ${fixture.away}`)
    } catch (error) {
      showToast(locked ? 'Predictions are closed for this match.' : saveErrorText(error, 'Your prediction was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const changed = draft !== null && (draft.home !== mine.data?.home || draft.away !== mine.data?.away)

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Target size={18} aria-hidden="true" /><div><h2>Predict the score</h2><span>{formatMalawiDate(fixture.date)} · {formatMalawiTime(fixture.date)}</span></div></div>
      <div className="fz-predict">
        <div className="fz-predict-team"><TeamLogo name={fixture.home} /><span>{fixture.home}</span><Stepper label={fixture.home} value={home} disabled={locked} onChange={(value) => setDraft({ home: value, away })} /></div>
        <span className="fz-predict-dash">–</span>
        <div className="fz-predict-team"><TeamLogo name={fixture.away} /><span>{fixture.away}</span><Stepper label={fixture.away} value={away} disabled={locked} onChange={(value) => setDraft({ home, away: value })} /></div>
      </div>
      {locked
        ? <p className="fz-note"><Lock size={14} aria-hidden="true" /> Predictions are closed.{mine.data ? ` You said ${mine.data.home}–${mine.data.away}.` : ''}</p>
        : <Button type="button" disabled={saving || (!changed && Boolean(mine.data))} onClick={() => void save()}>{saving ? 'Saving...' : mine.data ? (changed ? 'Update prediction' : 'Prediction saved ✓') : 'Save prediction'}</Button>}
      {total > 0 && <div className="fz-popular">
        <span>{total} fan{total === 1 ? '' : 's'} predicted</span>
        {showPopular && popular.length > 0 && <div className="fz-chips">{popular.map(([score, count]) => <span className="fz-chip" key={score}>{score} <small>{percent(count, total)}%</small></span>)}</div>}
      </div>}
    </Card>
  )
}

function LastPredictionsCard({ fixture }: { fixture: Fixture }) {
  const { user } = useAuth()
  const homeScore = fixture.homeScore ?? 0
  const awayScore = fixture.awayScore ?? 0
  const mine = useMyDoc<Omit<ScorePrediction, 'id'>>(user ? ['fixtures', fixture.id, 'predictions', user.uid] : null)
  const exactQuery = () => query(predictionsRef(fixture.id), where('home', '==', homeScore), where('away', '==', awayScore))
  const totals = useCounts(`${fixture.id}:${homeScore}-${awayScore}`, () => ({ total: predictionsRef(fixture.id), exact: exactQuery() }))
  const [names, setNames] = useState<{ key: string; list: string[] }>({ key: '', list: [] })
  const exact = totals.counts.exact ?? 0
  const namesKey = `${fixture.id}:${homeScore}-${awayScore}:${exact}`
  useEffect(() => {
    if (exact === 0 || exact > 8) return
    let active = true
    getDocs(query(exactQuery(), limit(8))).then((snapshot) => { if (active) setNames({ key: namesKey, list: snapshot.docs.map((item) => String(item.data().name || 'Fan')) }) }).catch(() => undefined)
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey])
  const total = totals.counts.total ?? 0
  if (totals.loading || total === 0) return null
  const mineCorrect = mine.data && mine.data.home === homeScore && mine.data.away === awayScore
  const nameList = names.key === namesKey ? names.list : []

  return (
    <Card className="fz-card fz-card-compact">
      <div className="fz-card-heading"><Trophy size={18} aria-hidden="true" /><div><h2>Last match predictions</h2><span>{fixture.home} {homeScore}–{awayScore} {fixture.away}</span></div></div>
      {mine.data && <p className={mineCorrect ? 'fz-result fz-result-win' : 'fz-result'}>{mineCorrect ? `You called it! ${mine.data.home}–${mine.data.away} 🎯` : `You said ${mine.data.home}–${mine.data.away}.`}</p>}
      <p className="fz-note">{exact ? `${exact} of ${total} fans got the exact score${nameList.length ? `: ${nameList.join(', ')}` : '.'}` : `None of the ${total} fans got the exact score.`}</p>
    </Card>
  )
}

function MotmCard({ fixture, players }: { fixture: Fixture; players: Player[] }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const mine = useMyDoc<Omit<MotmVote, 'id'>>(user ? ['fixtures', fixture.id, 'motm', user.uid] : null)
  const [saving, setSaving] = useState('')
  const [version, setVersion] = useState(0)
  const lineup = [...(fixture.startingPlayerIds ?? []), ...(fixture.benchPlayerIds ?? [])]
  const candidates = (lineup.length ? players.filter((player) => lineup.includes(player.id)) : players)
    .slice().sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const closed = fixture.motmClosed === true
  const showResults = Boolean(mine.data) || closed
  const savedTally = fixture.motmTally
  // When voting is closed the final tally is saved on the match (no extra reads);
  // while open, results are counted once after the fan votes.
  const live = useCounts(showResults && !savedTally && candidates.length ? `${fixture.id}:${version}` : null, () => Object.fromEntries(candidates.map((player) => [player.id, query(collection(db, 'fixtures', fixture.id, 'motm'), where('playerId', '==', player.id))])))
  const tally: Record<string, number> = savedTally ?? live.counts
  const totalVotes = Object.values(tally).reduce((sum, count) => sum + count, 0)
  const ranked = candidates.slice().sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0))
  const winner = closed && fixture.motmWinnerId ? players.find((player) => player.id === fixture.motmWinnerId) : (ranked[0] && (tally[ranked[0].id] ?? 0) > 0 ? ranked[0] : null)

  async function vote(player: Player) {
    if (!user || closed) return
    setSaving(player.id)
    try {
      await setDoc(doc(db, 'fixtures', fixture.id, 'motm', user.uid), { playerId: player.id, updatedAt: serverTimestamp() })
      setVersion((value) => value + 1)
      showToast(`You voted for ${player.name}.`)
    } catch (error) {
      showToast(saveErrorText(error, 'Your vote was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving('')
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Star size={18} aria-hidden="true" /><div><h2>Man of the match</h2><span>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away}</span></div></div>
      {closed && winner && <p className="fz-result fz-result-win">🏆 {winner.name} is the fans' man of the match</p>}
      {!candidates.length ? <p className="fz-note">Players will appear here once the squad is added.</p>
        : showResults ? (live.loading ? <Skeleton className="fz-board-skeleton" /> : <div className="fz-bars">
            {ranked.slice(0, 8).map((player, index) => <ResultBar key={player.id} label={<><PlayerAvatar player={player} />{player.number ? `${player.number}. ` : ''}{player.name}</>} value={tally[player.id] ?? 0} total={totalVotes} mine={mine.data?.playerId === player.id} leading={index === 0 && (tally[player.id] ?? 0) > 0} />)}
          </div>)
        : <div className="fz-players">
            {candidates.map((player) => <button key={player.id} type="button" className="fz-player" disabled={Boolean(saving)} onClick={() => void vote(player)}>
              <PlayerAvatar player={player} /><span>{player.number ? <em>{player.number}</em> : null}{player.name}</span>{saving === player.id && <small>Voting...</small>}
            </button>)}
          </div>}
      <p className="fz-note">{closed ? <><Lock size={14} aria-hidden="true" /> Voting closed · </> : null}{totalVotes} vote{totalVotes === 1 ? '' : 's'}{mine.data && !closed ? ' · tap below to change your vote' : ''}</p>
      {mine.data && !closed && <details className="fz-change"><summary>Change my vote</summary><div className="fz-players">{candidates.map((player) => <button key={player.id} type="button" className={mine.data?.playerId === player.id ? 'fz-player active' : 'fz-player'} disabled={Boolean(saving)} onClick={() => void vote(player)}><PlayerAvatar player={player} /><span>{player.name}</span></button>)}</div></details>}
    </Card>
  )
}

function PollCard({ poll }: { poll: Poll }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const mine = useMyDoc<Omit<PollVote, 'id'>>(user ? ['polls', poll.id, 'votes', user.uid] : null)
  const [saving, setSaving] = useState(-1)
  const [version, setVersion] = useState(0)
  const closed = poll.status !== 'open'
  const showResults = Boolean(mine.data) || closed
  // Closed polls keep their final results on the poll itself (no extra reads).
  const live = useCounts(showResults && !poll.results ? `${poll.id}:${version}` : null, () => Object.fromEntries(poll.options.map((_, index) => [String(index), query(collection(db, 'polls', poll.id, 'votes'), where('option', '==', index))])))
  const counts = poll.options.map((_, index) => poll.results?.[index] ?? live.counts[String(index)] ?? 0)
  const total = counts.reduce((sum, count) => sum + count, 0)
  const top = Math.max(...counts, 0)

  async function vote(option: number) {
    if (!user || closed) return
    setSaving(option)
    try {
      await setDoc(doc(db, 'polls', poll.id, 'votes', user.uid), { option, updatedAt: serverTimestamp() })
      setVersion((value) => value + 1)
    } catch (error) {
      showToast(saveErrorText(error, 'Your vote was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving(-1)
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Vote size={18} aria-hidden="true" /><div><h2>{poll.question}</h2><span>{closed ? 'Final results' : 'Club poll'}{showResults ? ` · ${total} vote${total === 1 ? '' : 's'}` : ''}</span></div></div>
      {showResults
        ? (live.loading ? <Skeleton className="fz-board-skeleton" /> : <div className="fz-bars">{poll.options.map((option, index) => <ResultBar key={option + index} label={option} value={counts[index]} total={total} mine={mine.data?.option === index} leading={top > 0 && counts[index] === top} />)}</div>)
        : <div className="fz-options">{poll.options.map((option, index) => <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={() => void vote(index)}>{saving === index ? 'Voting...' : option}</button>)}</div>}
      {mine.data && !closed && <div className="fz-options fz-options-small">{poll.options.map((option, index) => index !== mine.data?.option && <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={() => void vote(index)}>Switch to {option}</button>)}</div>}
    </Card>
  )
}

function VerifyEmailNotice() {
  const { user, emailVerified, sendVerificationEmail, refreshEmailVerification } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  if (!user || emailVerified) return null
  return <Card className="push-prompt">
    <Lock size={20} aria-hidden="true" />
    <div><strong>Verify your email to take part</strong><span>Voting and predictions need a verified email, so every vote is a real fan.</span></div>
    <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        if (await refreshEmailVerification()) showToast('Email verified. You can vote now!')
        else { await sendVerificationEmail(); showToast(`Verification email sent to ${user.email}.`) }
      } catch { showToast('Could not send the email. Try again shortly.', 'error') } finally { setBusy(false) }
    }}>{busy ? '...' : 'Verify'}</Button>
  </Card>
}

export default function FanZone() {
  const fanFamily = useFlag('fanFamily')
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
    <VerifyEmailNotice />
    <PushSettings compact />
    {fanFamily && <Link className="community-link" to="/community"><HeartHandshake size={20} aria-hidden="true" /><span><strong>Fan Family</strong><small>Join your district branch and invite friends</small></span><ChevronRight size={18} aria-hidden="true" /></Link>}
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
