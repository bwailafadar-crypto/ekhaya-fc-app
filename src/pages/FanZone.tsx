import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { ChevronRight, HeartHandshake, Lock, Minus, Plus, Radio, Share2, Shirt, Star, Target, Trophy, Vote } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import Leaderboard from '../components/Leaderboard'
import PushSettings from '../components/PushSettings'
import { FanLevelCard, FansBoard } from '../components/FanLevel'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { Button, Card, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import type { Fixture, Player, Poll, PollVote, ScorePrediction } from '../types'
import { formatMalawiDate, formatMalawiTime, isPlayed, sortByDate } from '../utils/football'
import { percent, saveErrorText } from '../utils/fanZone'
import MotmCard, { ResultBar } from '../components/MotmCard'
import MatchdayHero from '../components/MatchdayHero'
import { burst } from '../utils/celebrate'

const MAX_GOALS = 20
const APP_URL = 'https://ekhaya-fc-app.web.app'

function kickoffMs(fixture: Fixture) {
  const fromTs = fixture.kickoffAt?.toMillis?.()
  if (typeof fromTs === 'number' && !Number.isNaN(fromTs)) return fromTs
  const parsed = Date.parse(fixture.date)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Friendly "2d 4h" / "3h 12m" / "Soon" countdown to kick-off. */
function countdownText(target: number, now: number) {
  const diff = target - now
  if (diff <= 0) return 'Kicking off'
  const mins = Math.floor(diff / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return minutes > 0 ? `${minutes} min` : 'Soon'
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Section({ id, icon, title, hint, children }: { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return <section id={id} className="fz-section">
    <div className="fz-section-head"><span className="fz-section-icon" aria-hidden="true">{icon}</span><div><h2>{title}</h2>{hint && <span>{hint}</span>}</div></div>
    {children}
  </section>
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
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

  async function save(button?: HTMLElement | null) {
    if (!user) return
    setSaving(true)
    try {
      // Must match the profile name exactly (the database checks it).
      const name = (profile?.fullName ?? '').slice(0, 120)
      await setDoc(doc(db, 'fixtures', fixture.id, 'predictions', user.uid), { home, away, name, updatedAt: serverTimestamp() })
      setDraft(null)
      setVersion((value) => value + 1)
      showToast(`Prediction saved: ${fixture.home} ${home}–${away} ${fixture.away}`)
      burst(button ?? null)
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
        : <Button type="button" disabled={saving || (!changed && Boolean(mine.data))} onClick={(event) => void save(event.currentTarget)}>{saving ? 'Saving...' : mine.data ? (changed ? 'Update prediction' : 'Prediction saved ✓') : 'Save prediction'}</Button>}
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

  async function vote(option: number, button?: HTMLElement | null) {
    if (!user || closed) return
    setSaving(option)
    try {
      await setDoc(doc(db, 'polls', poll.id, 'votes', user.uid), { option, updatedAt: serverTimestamp() })
      burst(button ?? null, 14)
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
        : <div className="fz-options">{poll.options.map((option, index) => <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={(event) => void vote(index, event.currentTarget)}>{saving === index ? 'Voting...' : option}</button>)}</div>}
      {mine.data && !closed && <div className="fz-options fz-options-small">{poll.options.map((option, index) => index !== mine.data?.option && <button key={option + index} type="button" className="fz-option" disabled={saving >= 0} onClick={() => void vote(index)}>Switch to {option}</button>)}</div>}
    </Card>
  )
}

function MatchHero({ live, next }: { live?: Fixture; next?: Fixture }) {
  const now = useNow(1000 * 30)
  const fixture = live ?? next
  if (!fixture) return (
    <Card className="fz-hero fz-hero-empty">
      <span className="fz-hero-eyebrow">Fan Zone</span>
      <h2>No match scheduled yet</h2>
      <p>Predictions open as soon as the next fixture is set. Meanwhile, vote in the polls and climb the fan ranks below.</p>
    </Card>
  )
  const isLive = Boolean(live)
  const women = (fixture.squad ?? 'men') === 'women'
  const ko = kickoffMs(fixture)
  return (
    <Card className={`fz-hero${isLive ? ' fz-hero-live' : ''}`}>
      <div className="fz-hero-top">
        <span className="fz-hero-eyebrow">{isLive ? <><Radio size={13} aria-hidden="true" /> Live now</> : 'Next match'}</span>
        <span className="fz-hero-tag">{women ? 'Ekhaya Women' : 'Ekhaya FC'}</span>
      </div>
      <div className="fz-hero-teams">
        <div className="fz-hero-team"><TeamLogo name={fixture.home} /><span>{fixture.home}</span></div>
        <div className="fz-hero-mid">{isLive ? <strong className="fz-hero-score">{fixture.homeScore ?? 0}–{fixture.awayScore ?? 0}</strong> : <span className="fz-hero-v">v</span>}</div>
        <div className="fz-hero-team"><TeamLogo name={fixture.away} /><span>{fixture.away}</span></div>
      </div>
      {isLive
        ? <Link className="button fz-hero-cta" to="/live"><Radio size={15} aria-hidden="true" /> Watch it live</Link>
        : <>
            <div className="fz-hero-meta"><span>{formatMalawiDate(fixture.date)} · {formatMalawiTime(fixture.date)}</span>{ko > now && <span className="fz-hero-count">{countdownText(ko, now)}</span>}</div>
            <button type="button" className="button fz-hero-cta" onClick={() => scrollToSection('fz-predict')}><Target size={15} aria-hidden="true" /> Predict the score</button>
          </>}
    </Card>
  )
}

function QuickNav({ items }: { items: Array<{ id: string; label: string; icon: ReactNode }> }) {
  if (items.length < 2) return null
  return <div className="fz-quicknav">{items.map((item) => <button key={item.id} type="button" onClick={() => scrollToSection(item.id)}>{item.icon}<span>{item.label}</span></button>)}</div>
}

function ShareCard() {
  const { showToast } = useToast()
  async function share() {
    const data = { title: 'Ekhaya FC', text: 'Follow Ekhaya FC — live scores, predictions and the Matchday Hero competition.', url: APP_URL }
    try {
      if (navigator.share) { await navigator.share(data); return }
      await navigator.clipboard.writeText(APP_URL)
      showToast('App link copied — share it with the fans.')
    } catch { /* the fan cancelled the share sheet */ }
  }
  return (
    <Card className="fz-invite">
      <div><strong>Bring more supporters in</strong><small>Share the app and climb the table together.</small></div>
      <Button type="button" variant="secondary" onClick={() => void share()}><Share2 size={15} aria-hidden="true" /> Share</Button>
    </Card>
  )
}

export default function FanZone() {
  const fanFamily = useFlag('fanFamily')
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')
  const polls = useFirestoreCollection<Poll>('polls')
  const real = fixtures.items.filter((fixture) => !fixture.isTest)
  const liveMatch = sortByDate(real.filter((fixture) => fixture.status === 'live'), 'asc')[0]
  const nextMatch = sortByDate(real.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  const lastMatch = sortByDate(real.filter(isPlayed), 'desc')[0]
  const sortedPolls = polls.items.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
  const openPolls = sortedPolls.filter((poll) => poll.status === 'open')
  const closedPolls = sortedPolls.filter((poll) => poll.status !== 'open').slice(0, 3)

  if (fixtures.loading || players.loading || polls.loading) return <><PageHeader eyebrow="Supporters" title="Fan Zone" /><div className="loading-list"><Skeleton /><Skeleton /></div></>

  const nav = [
    { id: 'fz-hero', label: 'Jersey', icon: <Shirt size={15} aria-hidden="true" /> },
    nextMatch && { id: 'fz-predict', label: 'Predict', icon: <Target size={15} aria-hidden="true" /> },
    (openPolls.length || closedPolls.length) && { id: 'fz-say', label: 'Vote', icon: <Vote size={15} aria-hidden="true" /> },
    lastMatch && { id: 'fz-motm', label: 'MOTM', icon: <Star size={15} aria-hidden="true" /> },
    { id: 'fz-ranks', label: 'Ranks', icon: <Trophy size={15} aria-hidden="true" /> },
  ].filter(Boolean) as Array<{ id: string; label: string; icon: ReactNode }>

  return <div className="fan-zone">
    <header className="fz-masthead">
      <img className="fz-masthead-crest" src="./team-logos/ekhaya-fc.png" alt="" aria-hidden="true" />
      <div>
        <h1>Fan Zone</h1>
        <p>Predict results, pick your matchday hero and climb the supporters' table.</p>
      </div>
    </header>
    {(fixtures.error || players.error || polls.error) && <p className="live-error" role="alert">Some Fan Zone content could not be loaded. Check your connection.</p>}

    <MatchHero live={liveMatch} next={nextMatch} />
    <QuickNav items={nav} />

    <Section id="fz-hero" icon={<Shirt size={17} />} title="Matchday Hero" hint="Pick a player — win a jersey">
      <MatchdayHero nextMatch={nextMatch} players={players.items} />
    </Section>

    <Section id="fz-predict" icon={<Target size={17} />} title="Predict the score" hint={nextMatch ? 'Call it right and earn fan points' : undefined}>
      {nextMatch
        ? <PredictCard fixture={nextMatch} />
        : <Card className="fz-card fz-card-compact"><p className="fz-note"><Target size={14} aria-hidden="true" /> The next fixture will appear here once it is scheduled.</p></Card>}
      {lastMatch && <LastPredictionsCard fixture={lastMatch} />}
    </Section>

    {(openPolls.length > 0 || closedPolls.length > 0) && <Section id="fz-say" icon={<Vote size={17} />} title="Have your say" hint="Club polls — tap to vote">
      {openPolls.map((poll) => <PollCard key={poll.id} poll={poll} />)}
      {closedPolls.length > 0 && <h3 className="fz-section-title">Recent results</h3>}
      {closedPolls.map((poll) => <PollCard key={poll.id} poll={poll} />)}
    </Section>}

    {lastMatch && <Section id="fz-motm" icon={<Star size={17} />} title="Man of the match" hint={`${lastMatch.home} ${lastMatch.homeScore ?? 0}–${lastMatch.awayScore ?? 0} ${lastMatch.away}`}>
      <MotmCard fixture={lastMatch} players={players.items} />
    </Section>}

    <Section id="fz-ranks" icon={<Trophy size={17} />} title="Your Ekhaya status" hint="Earn points by predicting, voting and showing up">
      <FanLevelCard />
      <FansBoard />
      <Leaderboard />
    </Section>

    <ShareCard />
    {fanFamily && <Link className="community-link" to="/community"><HeartHandshake size={20} aria-hidden="true" /><span><strong>Fan Family</strong><small>Join your district branch and invite friends</small></span><ChevronRight size={18} aria-hidden="true" /></Link>}
    <PushSettings compact />
  </div>
}
