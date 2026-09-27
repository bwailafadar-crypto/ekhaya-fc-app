import { ArrowRight, CalendarDays, Newspaper, ShieldCheck, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import MatchCard from '../components/MatchCard'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, NewsItem } from '../types'
import { sortByDate } from '../utils/football'

export default function Home() {
  const { user, profile } = useAuth()
  const firstName = profile?.fullName.trim().split(/\s+/)[0]
    || user?.displayName?.trim().split(/\s+/)[0]
    || 'Fan'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const newsResult = useFirestoreCollection<NewsItem>('news')
  const upcoming = sortByDate(fixturesResult.items.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  const lastResult = sortByDate(fixturesResult.items.filter((fixture) => fixture.status === 'finished'), 'desc')[0]
  const latestNews = [...newsResult.items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)

  return (
    <>
      <section className="home-hero">
        <span className="page-eyebrow">The heart of the home</span>
        <h1>Welcome home, {firstName}</h1>
        <p>One club. One community. Ekhaya FC.</p>
        <div className="home-hero-footer"><ShieldCheck size={15} /> Chiwembe Stadium · Blantyre</div>
      </section>
      <section className="home-section">
        <PageHeader eyebrow="Next up" title="Next match" action={<Link className="text-link" to="/fixtures">All fixtures <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
          : upcoming ? <MatchCard fixture={upcoming} />
            : <Card><EmptyState icon={CalendarDays} title="No upcoming match" description="Check back when the next fixture is announced." /></Card>}
      </section>
      <section className="home-section">
        <PageHeader eyebrow="Full time" title="Last result" action={<Link className="text-link" to="/results">Results <ArrowRight size={15} /></Link>} />
        {fixturesResult.loading ? <Skeleton className="home-skeleton" />
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
          : latestNews.length ? latestNews.map((item) => <Card key={item.id} className="home-news-item">
            <div><Badge variant="gold">{item.category}</Badge><time>{item.date}</time></div>
            <h3>{item.title}</h3><p>{item.summary}</p>
          </Card>) : <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>}
      </section>
    </>
  )
}
