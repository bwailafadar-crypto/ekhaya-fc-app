import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Clapperboard, Newspaper, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import LineupPitch from '../components/LineupPitch'
import MatchCard from '../components/MatchCard'
import MatchSummary from '../components/MatchSummary'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import TeamLogo from '../components/TeamLogo'
import StoriesBar from '../components/StoriesBar'
import NewsCoverImage from '../components/NewsCoverImage'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { usePublishedNews } from '../hooks/usePublishedNews'
import type { Fixture, MatchEvent, Player } from '../types'
import { useLiveDocs } from '../hooks/useLiveDocs'
import { useMyDoc } from '../hooks/useCounts'
import PlayerAvatar from '../components/PlayerAvatar'
import { isLiveNow, isPlayed, sortByDate } from '../utils/football'
import { matchMinute } from '../utils/matchClock'

export default function Home() {
  const { user, profile } = useAuth()
  const firstName = profile?.fullName?.trim().split(/\s+/)[0]
    || user?.displayName?.trim().split(/\s+/)[0]
    || 'Fan'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const competitions = useFlag('competitions')
  const membershipOpen = useFlag('membershipPayments')
  const newsResult = usePublishedNews()
  // Start from the real time (not 0), so the first second never shows a wrong minute or countdown.
  const [clockNow, setClockNow] = useState(() => Date.now())
  const liveMatch = fixturesResult.items.find((fixture) => isLiveNow(fixture) && !fixture.isTest)
  const upcoming = sortByDate(fixturesResult.items.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest), 'asc')[0]
  const lastResult = sortByDate(fixturesResult.items.filter((fixture) => isPlayed(fixture) && !fixture.isTest), 'desc')[0]
  const latestNews = newsResult.items.slice(0, 3)

  const liveMatchId = liveMatch?.id
  useEffect(() => {
    if (!liveMatchId) return
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [liveMatchId])

  // Home follows match day: the match comes first before kick-off (36 h) and after full time (48 h).
  const kickoffIn = upcoming ? new Date(upcoming.date).getTime() - clockNow : Infinity
  const sinceResult = lastResult ? clockNow - new Date(lastResult.date).getTime() : Infinity
  const phase: 'live' | 'pre' | 'post' | 'normal' = liveMatch ? 'live' : kickoffIn < 36 * 3_600_000 && kickoffIn > -3 * 3_600_000 ? 'pre' : sinceResult < 48 * 3_600_000 ? 'post' : 'normal'
  const matchDayLabel = kickoffIn < 12 * 3_600_000 ? 'Today' : 'Tomorrow'
  const nextSection = <section className="home-section">
        <PageHeader eyebrow={phase === 'pre' ? matchDayLabel : 'Next up'} title={phase === 'pre' ? 'Match day' : 'Next match'} action={<Link className="text-link" to="/fixtures">All fixtures <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
          : fixturesResult.error ? <p className="live-error" role="alert">Fixtures could not be loaded: {fixturesResult.error}</p>
          : upcoming ? <><MatchCard fixture={upcoming} />{upcoming.lineupConfirmed && <NextLineup fixture={upcoming} />}</>
            : <Card><EmptyState icon={CalendarDays} title="No upcoming match" description="Check back when the next fixture is announced." /></Card>}
      </section>
  const lastSection = <section className="home-section">
        <PageHeader eyebrow="Full time" title="Last result" action={<Link className="text-link" to="/results">Results <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
          : fixturesResult.error ? null
          : lastResult ? <><MatchCard fixture={lastResult} /><MotmSpotlight fixture={lastResult} /><MatchSummary fixture={lastResult} compact /></>
            : <Card><EmptyState icon={Trophy} title="No results yet" /></Card>}
      </section>

  return (
    <>
      {liveMatch && <Link className="home-live-banner" to={`/live?match=${liveMatch.id}`} aria-label={`Live match: ${liveMatch.home} ${liveMatch.homeScore ?? 0}, ${liveMatch.awayScore ?? 0} ${liveMatch.away}. Open match centre.`}>
        <span className="home-live-label"><i className="live-pulse-dot" />LIVE NOW</span>
        <span className="home-live-teams"><span><TeamLogo name={liveMatch.home} />{liveMatch.home}</span><strong>{liveMatch.homeScore ?? 0} – {liveMatch.awayScore ?? 0}</strong><span><TeamLogo name={liveMatch.away} />{liveMatch.away}</span></span>
        <span className="home-live-clock">{matchMinute(liveMatch, clockNow)} <ArrowRight size={15} /></span>
        <LatestGoal fixtureId={liveMatch.id} />
      </Link>}
      <StoriesBar fixtures={fixturesResult.items} />
      {phase === 'pre' && nextSection}
      {phase === 'post' && lastSection}
      <section className="home-hero">
        <span className="page-eyebrow">The heart of the home</span>
        <h1>Welcome home, {firstName}</h1>
        <p>One club. One community. Ekhaya FC.</p>
        <div className="home-hero-footer"><ShieldCheck size={15} /> Chiwembe Stadium · Blantyre</div>
      </section>
      {phase !== 'pre' && nextSection}
      {phase !== 'post' && lastSection}
      <section className="home-shortcuts" aria-label="Quick links">
        <Link to="/squad"><Users size={19} /><span>Squad</span></Link>
        {competitions ? <Link to="/competitions?tab=cups"><Trophy size={19} /><span>Cups</span></Link> : <Link to="/table"><Trophy size={19} /><span>Table</span></Link>}
        <Link to="/tv"><Clapperboard size={19} /><span>TV</span></Link>
        <Link to="/membership"><ShieldCheck size={19} /><span>Join</span>{!membershipOpen && <small className="shortcut-soon">Soon</small>}</Link>
      </section>
      <section className="home-section">
        <PageHeader eyebrow="From the club" title="Latest news" action={<Link className="text-link" to="/news">All news <ArrowRight size={15} /></Link>} />
        {newsResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
          : newsResult.error ? <p className="live-error" role="alert">News could not be loaded: {newsResult.error}</p>
          : latestNews.length ? latestNews.map((item) => <Link className="home-news-link" key={item.id} to={`/news/${item.id}`}><Card className="home-news-item">
            <NewsCoverImage article={item} className="home-news-cover" alt="" />
            <div><Badge variant="gold">{item.category}</Badge><time>{item.publishedDate}</time></div>
            <h3>{item.title}</h3><p>{item.summary}</p>
          </Card></Link>) : <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>}
      </section>
    </>
  )
}

function LatestGoal({ fixtureId }: { fixtureId: string }) {
  const events = useLiveDocs<Omit<MatchEvent, 'id'>>(['fixtures', fixtureId, 'events'])
  const goal = events.items.filter((event) => event.kind === 'goal').sort((a, b) => b.minute - a.minute)[0]
  // The scorer's photo (one small read, only when an Ekhaya player scored).
  const scorer = useMyDoc<Player>(goal?.playerId ? ['players', goal.playerId] : null).data
  if (!goal) return null
  const isClubGoal = /ekhaya/i.test(goal.team)
  return <span className={`home-live-goal${isClubGoal ? ' home-live-goal-club' : ''}`}>
    {scorer ? <PlayerAvatar player={{ ...scorer, id: goal.playerId ?? '' }} /> : <span className="home-live-goal-ball" aria-hidden="true">⚽</span>}
    <span><b>{isClubGoal ? 'GOAL!' : 'Goal'} {goal.minute}'</b> {goal.playerName || goal.team}</span>
  </span>
}

// Players (with photos) are only downloaded when a confirmed line-up is shown.
function NextLineup({ fixture }: { fixture: Fixture }) {
  const players = useFirestoreCollection<Player>('players').items
  const pick = (ids: string[] | undefined) => (ids ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const starters = pick(fixture.startingPlayerIds)
  if (!starters.length) return null
  return <details className="home-lineup" open><summary>Starting XI confirmed</summary><LineupPitch starters={starters} bench={pick(fixture.benchPlayerIds)} formation={fixture.formation} /></details>
}

// Fans' man of the match: the winner's photo once voting closes, a vote button while it is open.
function MotmSpotlight({ fixture }: { fixture: Fixture }) {
  const [openedAt] = useState(() => Date.now())
  const winner = useMyDoc<Player>(fixture.motmClosed && fixture.motmWinnerId ? ['players', fixture.motmWinnerId] : null).data
  if (!/ekhaya/i.test(`${fixture.home} ${fixture.away}`) || fixture.editing) return null
  if (fixture.motmClosed) {
    if (!winner || !fixture.motmWinnerId) return null
    const share = fixture.motmWinnerVotes && fixture.motmTotalVotes ? Math.round(fixture.motmWinnerVotes / fixture.motmTotalVotes * 100) : null
    return <Link className="motm-spotlight" to={`/squad/${fixture.motmWinnerId}`}>
      <PlayerAvatar player={{ ...winner, id: fixture.motmWinnerId }} large />
      <span><small>★ Fans' man of the match</small><strong>{winner.name}{winner.number != null ? <em> #{winner.number}</em> : null}</strong>{share != null && <i>{share}% of the vote</i>}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  }
  // Only nudge fans to vote for a recent match (voting left open on an old one stays quiet).
  if (openedAt - new Date(fixture.date).getTime() > 4 * 86400000) return null
  return <Link className="motm-spotlight motm-spotlight-vote" to={`/live?match=${fixture.id}&tab=vote`}>
    <span className="motm-spotlight-star" aria-hidden="true">★</span>
    <span><small>Voting open</small><strong>Pick your man of the match</strong></span>
    <ArrowRight size={16} aria-hidden="true" />
  </Link>
}
