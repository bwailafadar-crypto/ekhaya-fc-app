// The Home screen: next match with a live countdown, last result with its
// scorers, Ekhaya's league place and top scorer, the trophy, then news.
// Admin → App health → "New Home screen" switches back to the old Home.
import { ArrowRight, CalendarDays, Clapperboard, MapPin, Medal, Newspaper, ShieldCheck, ShoppingBag, Target, Trophy, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LatestGoal, MotmSpotlight, NextLineup } from '../components/HomeParts'
import NewsCoverImage from '../components/NewsCoverImage'
import StoriesBar from '../components/StoriesBar'
import TeamLogo from '../components/TeamLogo'
import { Badge, Card, EmptyState, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useFlag } from '../hooks/useFlag'
import { usePublishedNews } from '../hooks/usePublishedNews'
import type { Fixture, Standing } from '../types'
import { competitionLabel, isCupCompetition } from '../utils/competitions'
import { ekhayaOutcome, formatMalawiDate, formatMalawiTime, isLiveNow, isPlayed, sortByDate } from '../utils/football'
import { scorerText } from '../utils/goals'
import { matchMinute } from '../utils/matchClock'

const isClub = (name: string) => /ekhaya/i.test(name)

function Countdown({ to, now }: { to: number; now: number }) {
  const left = Math.max(0, Math.floor((to - now) / 1000))
  const parts = [['days', Math.floor(left / 86400)], ['hrs', Math.floor(left % 86400 / 3600)], ['min', Math.floor(left % 3600 / 60)], ['sec', left % 60]] as const
  return <div className="nh-countdown" aria-label="Time to kick-off">{parts.map(([label, value]) => <span key={label}><b>{String(value).padStart(2, '0')}</b><small>{label}</small></span>)}</div>
}

export default function NewHome() {
  const { user, profile } = useAuth()
  const firstName = profile?.fullName?.trim().split(/\s+/)[0] || user?.displayName?.trim().split(/\s+/)[0] || 'Fan'
  const fixturesResult = useFirestoreCollection<Fixture>('fixtures')
  const standings = useFirestoreCollection<Standing>('standings')
  const membershipOpen = useFlag('membershipPayments')
  const scorersOpen = useFlag('topScorers')
  // Staff see the Shop link even while it's "coming soon" to fans, so they can
  // keep setting it up.
  const shopOpen = useFlag('clubShop') || profile?.role === 'admin' || profile?.role === 'superadmin'
  const tvOpen = useFlag('ekhayaTv')
  const newsResult = usePublishedNews()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])

  const fixtures = fixturesResult.items.filter((fixture) => !fixture.isTest)
  // Home is the men's team's page; women's team has its own section. A LIVE match
  // can be either team, but next match, last result and the table are men's only.
  const mens = fixtures.filter((fixture) => (fixture.squad ?? 'men') === 'men')
  const live = fixtures.find(isLiveNow)
  // Matches still marked upcoming long after kick-off (not recorded yet) are skipped.
  // Next match is the club's soonest game across BOTH teams (men's or women's).
  const next = sortByDate(fixtures.filter((fixture) => fixture.status === 'upcoming' && new Date(fixture.date).getTime() > now - 3 * 3600000), 'asc')[0]
  const last = sortByDate(mens.filter((fixture) => isPlayed(fixture) && !fixture.editing), 'desc')[0]
  const table = [...standings.items].filter((row) => (row.squad ?? 'men') === 'men').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const ekhaya = table.find((row) => isClub(row.team))
  // A cup Ekhaya won this season (the final is in the fixtures).
  const trophy = sortByDate(mens.filter((fixture) => fixture.status === 'finished' && isCupCompetition(fixture.competition) && /final/i.test(`${fixture.round ?? ''} ${fixture.id}`) && !/semi|quarter|qf|sf/i.test(`${fixture.round ?? ''} ${fixture.id}`) && ekhayaOutcome(fixture) === 'W'), 'desc')[0]
  // Home is the men's page, so keep women's-team stories out of its news feed
  // (they live on the Ekhaya Women page). Matches "women", "cowgirls", "ladies".
  const news = newsResult.items.filter((item) => !/\b(women'?s?|cowgirls?|ladies)\b/i.test(`${item.title} ${item.summary}`)).slice(0, 3)
  const outcome = last ? ekhayaOutcome(last) : null

  return <div className="nh">
    {live && <Link className="home-live-banner" to={`/live?match=${live.id}`} aria-label={`Live match: ${live.home} ${live.homeScore ?? 0}, ${live.awayScore ?? 0} ${live.away}. Open match centre.`}>
      <span className="home-live-label"><i className="live-pulse-dot" />LIVE NOW</span>
      <span className="home-live-teams"><span><TeamLogo name={live.home} />{live.home}</span><strong>{live.homeScore ?? 0} – {live.awayScore ?? 0}</strong><span><TeamLogo name={live.away} />{live.away}</span></span>
      <span className="home-live-clock">{matchMinute(live, now)} <ArrowRight size={15} /></span>
      <LatestGoal fixtureId={live.id} />
    </Link>}

    <p className="nh-greeting">Welcome home, <b>{firstName}</b> 💛</p>
    <StoriesBar fixtures={fixturesResult.items} />

    {fixturesResult.loading ? <Skeleton className="nh-skeleton" /> : next && !live ? <section className="nh-hero" aria-label="Next match">
      <img className="nh-hero-crest" src="./team-logos/ekhaya-fc.png" alt="" aria-hidden="true" />
      <div className="nh-hero-top"><span>{new Date(next.date).getTime() - now < 36 * 3600000 ? '🔥 Match day' : 'Next match'}</span><em>{competitionLabel(next.competition)}{next.round ? ` · ${next.round}` : ''}</em></div>
      <div className="nh-teams">
        <div><TeamLogo name={next.home} crest /><span>{next.home}</span></div>
        <strong>VS</strong>
        <div><TeamLogo name={next.away} crest /><span>{next.away}</span></div>
      </div>
      <Countdown to={new Date(next.date).getTime()} now={now} />
      <p className="nh-when"><CalendarDays size={14} aria-hidden="true" /> {formatMalawiDate(next.date)} · {formatMalawiTime(next.date)}{next.venue ? <><MapPin size={14} aria-hidden="true" /> {next.venue}</> : null}</p>
      {next.lineupConfirmed && <Link className="nh-chip" to={`/live?match=${next.id}&tab=lineups`}>📋 Team news is in: see the starting XI</Link>}
      <div className="nh-actions">
        <Link className="nh-btn nh-btn-gold" to={`/live?match=${next.id}`}>Match centre</Link>
        <Link className="nh-btn" to="/fanzone"><Target size={15} aria-hidden="true" /> Predict the score</Link>
      </div>
    </section> : null}
    {next?.lineupConfirmed && !live && <NextLineup fixture={next} />}

    {last && <section className="nh-section">
      <div className="nh-head"><h2>Last result</h2><Link to="/results">All results <ArrowRight size={14} /></Link></div>
      <Link className={`nh-result nh-result-${outcome ? outcome.toLowerCase() : 'n'}`} to={`/report/${encodeURIComponent(last.id)}`}>
        <div className="nh-result-top"><span>{competitionLabel(last.competition)} · {formatMalawiDate(last.date)}</span>{outcome && <b>{outcome === 'W' ? 'WIN' : outcome === 'D' ? 'DRAW' : 'LOSS'}</b>}</div>
        <div className="nh-result-score">
          <div><TeamLogo name={last.home} /><span>{last.home}</span></div>
          <strong>{last.homeScore ?? 0}<i>–</i>{last.awayScore ?? 0}</strong>
          <div><TeamLogo name={last.away} /><span>{last.away}</span></div>
        </div>
        {last.goals && (scorerText(last.goals, 'home') || scorerText(last.goals, 'away')) && <div className="nh-result-scorers"><span>{scorerText(last.goals, 'home')}</span><i>⚽</i><span>{scorerText(last.goals, 'away')}</span></div>}
        <span className="nh-result-link">Match report <ArrowRight size={14} /></span>
      </Link>
      <MotmSpotlight fixture={last} />
    </section>}

    <section className="nh-stats nh-stats-one" aria-label="Season">
      {ekhaya ? <Link className="nh-stat" to="/table">
        <small>League position</small>
        <strong className="nh-big">{ekhaya.position}<sup>{['th', 'st', 'nd', 'rd'][ekhaya.position % 100 > 10 && ekhaya.position % 100 < 14 ? 0 : Math.min(ekhaya.position % 10, 4) % 4] ?? 'th'}</sup></strong>
        <span>{ekhaya.points} pts · {ekhaya.played} played</span>
        <div className="table-form-boxes">{[...(ekhaya.form ?? [])].slice(-5).reverse().map((result, index) => <span key={index} className={`form-box form-box-${result.toLowerCase()}`}>{result}</span>)}</div>
      </Link> : <div className="nh-stat"><Skeleton /></div>}
    </section>

    {trophy && <Link className="nh-trophy" to="/competitions?tab=cups">
      <span className="nh-trophy-cup" aria-hidden="true">🏆</span>
      <span><small>Champions</small><strong>{competitionLabel(trophy.competition)} {new Date(trophy.date).getFullYear()}</strong><em>{trophy.home} {trophy.homeScore}–{trophy.awayScore} {trophy.away}{trophy.goals ? ` · ${scorerText(trophy.goals, isClub(trophy.home) ? 'home' : 'away')}` : ''}</em></span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>}

    <section className="nh-shortcuts" aria-label="Quick links">
      <Link to="/squad"><Users size={19} /><span>Squad</span></Link>
      {scorersOpen && <Link to="/scorers"><Medal size={19} /><span>Scorers</span></Link>}
      <Link to="/table"><Trophy size={19} /><span>Table</span></Link>
      {shopOpen && <Link to="/shop"><ShoppingBag size={19} /><span>Shop</span></Link>}
      <Link to="/tv"><Clapperboard size={19} /><span>TV</span>{!tvOpen && <small className="shortcut-soon">Soon</small>}</Link>
      <Link to="/membership"><ShieldCheck size={19} /><span>Join</span>{!membershipOpen && <small className="shortcut-soon">Soon</small>}</Link>
    </section>

    <section className="nh-section">
      <div className="nh-head"><h2>Latest news</h2><Link to="/news">All news <ArrowRight size={14} /></Link></div>
      {newsResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
        : news.length ? news.map((item) => <Link className="home-news-link" key={item.id} to={`/news/${item.id}`}><Card className="home-news-item">
          <NewsCoverImage article={item} className="home-news-cover" alt="" />
          <div><Badge variant="gold">{item.category}</Badge><time>{item.publishedDate}</time></div>
          <h3>{item.title}</h3><p>{item.summary}</p>
        </Card></Link>) : <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>}
    </section>
  </div>
}
