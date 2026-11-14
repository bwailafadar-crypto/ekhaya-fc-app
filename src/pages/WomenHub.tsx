// Landing page for the Ekhaya women's team ("The Cowgirls"): a hero photo,
// quick links to the dedicated women's Squad/Results/Fixtures/Table, and the
// latest club news. Opens from the More menu.
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ChevronRight, Newspaper, Table2, Trophy, Users } from 'lucide-react'
import { Badge, Card, EmptyState, Skeleton } from '../components/UI'
import NewsCoverImage from '../components/NewsCoverImage'
import { usePublishedNews } from '../hooks/usePublishedNews'

const links = [
  { to: '/women/squad', label: 'Squad', icon: Users },
  { to: '/women/results', label: 'Results', icon: Trophy },
  { to: '/women/fixtures', label: 'Fixtures', icon: CalendarDays },
  { to: '/women/table', label: 'League table', icon: Table2 },
]

export default function WomenHub() {
  const newsResult = usePublishedNews()
  const news = newsResult.items.slice(0, 3)

  return <>
    <section className="women-hero" style={{ backgroundImage: 'url(./women/hero.jpg)' }} aria-label="Ekhaya Women">
      <div className="women-hero-overlay">
        <span className="women-hero-eyebrow">The Cowgirls</span>
        <h1 className="women-hero-title">Ekhaya Women</h1>
        <p className="women-hero-sub">Ekhaya FC women's team</p>
      </div>
    </section>

    <div className="menu-list">
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="menu-item">
          <l.icon className="menu-icon" size={20} aria-hidden="true" />
          <span>{l.label}</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>

    <section className="nh-section">
      <div className="nh-head"><h2>Latest news</h2><Link to="/news">All news <ArrowRight size={14} /></Link></div>
      {newsResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
        : news.length ? news.map((item) => <Link className="home-news-link" key={item.id} to={`/news/${item.id}`}><Card className="home-news-item">
          <NewsCoverImage article={item} className="home-news-cover" alt="" />
          <div><Badge variant="gold">{item.category}</Badge><time>{item.publishedDate}</time></div>
          <h3>{item.title}</h3><p>{item.summary}</p>
        </Card></Link>) : <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>}
    </section>
  </>
}
