import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Newspaper, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import MatchCard from '../components/MatchCard'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import TeamLogo from '../components/TeamLogo'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, NewsItem } from '../types'
import { sortByDate } from '../utils/football'
import { matchMinute } from '../utils/matchClock'

export default function Home() {
  const { user, profile } = useAuth()
  const firstName = profile?.fullName.trim().split(/\s+/)[0]
    || user?.displayName?.trim().split(/\s+/)[0]
    || 'Fan'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const newsResult = useFirestoreCollection<NewsItem>('news')
  const [clockNow, setClockNow] = useState(0)
  const liveMatch = fixturesResult.items.find((fixture) => fixture.status === 'live' && !fixture.isTest)
  const upcoming = sortByDate(fixturesResult.items.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest), 'asc')[0]
  const lastResult = sortByDate(fixturesResult.items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest), 'desc')[0]
  const latestNews = [...newsResult.items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)

  const liveMatchId = liveMatch?.id
  useEffect(() => {
    if (!liveMatchId) return
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [liveMatchId])

  return (
    <>
      {liveMatch && <Link className="home-live-banner" to="/live" aria-label={`Live match: ${liveMatch.home} ${liveMatch.homeScore ?? 0}, ${liveMatch.awayScore ?? 0} ${liveMatch.away}. Open match centre.`}>
        <span className="home-live-label"><i className="live-pulse-dot" />LIVE NOW</span>
        <span className="home-live-teams"><span><TeamLogo name={liveMatch.home} />{liveMatch.home}</span><strong>{liveMatch.homeScore ?? 0} – {liveMatch.awayScore ?? 0}</strong><span><TeamLogo name={liveMatch.away} />{liveMatch.away}</span></span>
        <span className="home-live-clock">{matchMinute(liveMatch, clockNow)} <ArrowRight size={15} /></span>
      </Link>}
      <section className="home-hero">
        <span className="page-eyebrow">The heart of the home</span>
        <h1>Welcome home, {firstName}</h1>
        <p>One club. One community. Ekhaya FC.</p>
        <div className="home-hero-footer"><ShieldCheck size={15} /> Chiwembe Stadium · Blantyre</div>
      </section>
      <section className="home-section">
        <PageHeader eyebrow="Next up" title="Next match" action={<Link className="text-link" to="/fixtures">All fixtures <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
          : fixturesResult.error ? <p className="live-error" role="alert">Fixtures could not be loaded: {fixturesResult.error}</p>
          : upcoming ? <MatchCard fixture={upcoming} />
            : <Card><EmptyState icon={CalendarDays} title="No upcoming match" description="Check back when the next fixture is announced." /></Card>}
      </section>
      <section className="home-section">
        <PageHeader eyebrow="Full time" title="Last result" action={<Link className="text-link" to="/results">Results <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
          : fixturesResult.error ? null
          : lastResult ? <MatchCard fixture={lastResult} />
            : <Card><EmptyState icon={Trophy} title="No results yet" /></Card>}
      </section>
      <section className="home-shortcuts" aria-label="Quick links">
        <Link to="/squad"><Users size={19} /><span>Squad</span></Link>
        <Link to="/table"><Trophy size={19} /><span>Table</span></Link>
        <Link to="/membership"><ShieldCheck size={19} /><span>Join</span></Link>
      </section>
      <section className="home-section">
        <PageHeader eyebrow="From the club" title="Latest news" action={<Link className="text-link" to="/news">All news <ArrowRight size={15} /></Link>} />
        {newsResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
          : newsResult.error ? <p className="live-error" role="alert">News could not be loaded: {newsResult.error}</p>
          : latestNews.length ? latestNews.map((item) => <Card key={item.id} className="home-news-item">
            <div><Badge variant="gold">{item.category}</Badge><time>{item.date}</time></div>
            <h3>{item.title}</h3><p>{item.summary}</p>
          </Card>) : <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>}
      </section>
    </>
  )
}
