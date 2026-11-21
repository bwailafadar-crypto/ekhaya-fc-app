import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Clapperboard, Newspaper, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import MatchCard from '../components/MatchCard'
import MatchSummary from '../components/MatchSummary'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import TeamLogo from '../components/TeamLogo'
import StoriesBar from '../components/StoriesBar'
import NewsCoverImage from '../components/NewsCoverImage'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { usePublishedNews } from '../hooks/usePublishedNews'
import type { Fixture } from '../types'
import { isLiveNow, isPlayed, sortByDate } from '../utils/football'
import { matchMinute } from '../utils/matchClock'
import { LatestGoal, NextLineup } from '../components/HomeParts'
import NewHome from './HomeNew'

export default function Home() {
  // Admin → App health → "New Home screen" switches back to the old one in one tap.
  const newHome = useFlag('newHome')
  return newHome ? <NewHome /> : <LegacyHome />
}

function LegacyHome() {
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
  // Home follows the men's first team only; women's fixtures live on their own pages.
  const mens = fixturesResult.items.filter((fixture) => !fixture.isTest && (fixture.squad ?? 'men') === 'men')
  const liveMatch = mens.find((fixture) => isLiveNow(fixture))
  const upcoming = sortByDate(mens.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  const lastResult = sortByDate(mens.filter((fixture) => isPlayed(fixture)), 'desc')[0]
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
          : lastResult ? <><MatchCard fixture={lastResult} /><MatchSummary fixture={lastResult} compact /></>
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
      <StoriesBar fixtures={mens} />
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

