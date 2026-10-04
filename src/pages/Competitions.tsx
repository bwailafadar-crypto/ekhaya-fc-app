import { ArrowRight, CalendarDays, PartyPopper, Shield, Table2, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fireConfetti } from '../utils/confetti'
import { Link, useSearchParams } from 'react-router-dom'
import TeamLogo from '../components/TeamLogo'
import { Badge, Card, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, Standing } from '../types'
import { CUPS, competitionOf, type Competition } from '../utils/competitions'
import { ekhayaOutcome, formatMalawiDate, sortByDate } from '../utils/football'

const SEASON = '2026'

// Trophy photos for cups Ekhaya won, by cup and season.
const TROPHY_PHOTOS: Record<string, { src: string; caption: string }> = {
  'airtel-top-8-2026': { src: './cups/airtel-top-8-2026.jpg', caption: 'Ekhaya FC lift the 2026 Airtel Top 8 trophy' },
}
const isEkhaya = (name: string) => name.trim().toLowerCase() === 'ekhaya fc'

function inSeason(fixture: Fixture) {
  return !fixture.isTest && (fixture.season === SEASON || fixture.date?.startsWith(SEASON))
}

function opponent(fixture: Fixture) {
  return isEkhaya(fixture.home) ? fixture.away : fixture.home
}

/** How Ekhaya's cup run ended (or where it stands). */
function cupStatus(matches: Fixture[]) {
  if (!matches.length) return { label: 'No matches yet', variant: 'default' as const }
  const last = matches[matches.length - 1]
  const final = matches.find((match) => /^final$/i.test(match.round ?? ''))
  if (final && final.status === 'finished') {
    const won = ekhayaOutcome(final) === 'W' || /ekhaya (won|win)/i.test(final.note ?? '')
    return won ? { label: '🏆 Champions', variant: 'gold' as const } : { label: 'Runners-up', variant: 'default' as const }
  }
  if (matches.some((match) => match.status === 'upcoming' || match.status === 'live')) return { label: 'Still in it', variant: 'success' as const }
  return { label: last.round ? `Out in ${last.round.split('·')[0].trim().toLowerCase()}` : 'Knocked out', variant: 'danger' as const }
}

/** Trophy-lift moment for a cup Ekhaya won: lifting trophy, confetti blast and congratulations. */
function ChampionsCelebration({ cup, final }: { cup: Competition; final: Fixture }) {
  const trophyRef = useRef<HTMLSpanElement>(null)
  const celebrate = () => {
    const box = trophyRef.current?.getBoundingClientRect()
    if (!box) return () => undefined
    return fireConfetti(box.left + box.width / 2, box.top + box.height / 3)
  }
  useEffect(() => {
    // Let the trophy rise first, then the confetti cannons go off.
    let stop: () => void = () => undefined
    const timer = window.setTimeout(() => { stop = celebrate() }, 650)
    return () => { window.clearTimeout(timer); stop() }
  }, [])
  const opponentName = opponent(final)
  const photo = TROPHY_PHOTOS[`${cup.id}-${SEASON}`]
  const [photoOk, setPhotoOk] = useState(true)
  return (
    <div className="champions">
      <div className="champions-stage" aria-hidden="true">
        <span className="champions-rays" />
        <span className="champions-trophy" ref={trophyRef}><Trophy size={64} strokeWidth={1.6} /></span>
        <span className="champions-podium" />
      </div>
      <p className="champions-congrats">Congratulations!</p>
      <h3 className="champions-title">Ekhaya FC · {SEASON} {cup.name} Champions</h3>
      {photo && photoOk && <figure className="champions-photo">
        <img src={photo.src} alt={photo.caption} loading="lazy" decoding="async" onError={() => setPhotoOk(false)} />
        <figcaption>{photo.caption}</figcaption>
      </figure>}
      <p className="champions-line">Final: {final.home} <strong>{final.homeScore}–{final.awayScore}</strong> {final.away}</p>
      <p className="champions-meta">{formatMalawiDate(final.date)}{final.venue ? ` · ${final.venue}` : ''} · beat {opponentName} to lift the cup in their first Airtel Top 8 campaign</p>
      <button type="button" className="champions-again" onClick={() => celebrate()}><PartyPopper size={16} aria-hidden="true" /> Celebrate again</button>
    </div>
  )
}

function CupCard({ cup, matches }: { cup: Competition; matches: Fixture[] }) {
  const status = cupStatus(matches)
  const champions = status.label.includes('Champions')
  const finalMatch = matches.find((match) => /^final$/i.test(match.round ?? ''))
  return (
    <Card className={`fz-card cup-card${champions ? ' cup-card-champions' : ''}`}>
      <div className="cup-card-head">
        <span className="cup-card-icon" aria-hidden="true"><Trophy size={20} /></span>
        <div><h2>{cup.name}</h2><span>{SEASON} season</span></div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      {champions && finalMatch && <ChampionsCelebration cup={cup} final={finalMatch} />}
      {!matches.length ? <p className="fz-note">No {cup.name} matches for {SEASON} yet. They will appear here once the draw is made.</p>
        : <ol className="cup-road">
            {matches.map((match) => {
              const outcome = ekhayaOutcome(match)
              const played = match.status !== 'upcoming' && match.homeScore != null && match.awayScore != null
              return <li key={match.id} className={outcome ? `cup-road-${outcome.toLowerCase()}` : undefined}>
                <span className="cup-road-round">{match.round || formatMalawiDate(match.date)}</span>
                <span className="cup-road-match"><TeamLogo name={opponent(match)} /><span>{isEkhaya(match.home) ? 'v' : '@'} {opponent(match)}</span></span>
                <strong className="cup-road-score">{played ? `${match.homeScore}–${match.awayScore}` : formatMalawiDate(match.date)}</strong>
                {match.note && <small className="cup-road-note">{match.note}</small>}
              </li>
            })}
          </ol>}
      {matches.length > 0 && <Link className="text-link" to={`/results?c=${cup.id}`}>All {cup.name} results <ArrowRight size={15} /></Link>}
    </Card>
  )
}

function LeagueCard({ fixtures, standings, loading }: { fixtures: Fixture[]; standings: Standing[]; loading: boolean }) {
  const row = standings.find((item) => item.id === 'ekhaya-fc' || isEkhaya(item.team))
  const played = fixtures.filter((fixture) => fixture.status === 'finished')
  const outcomes = played.map(ekhayaOutcome)
  const count = (value: 'W' | 'D' | 'L') => outcomes.filter((item) => item === value).length
  const next = sortByDate(fixtures.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  return (
    <Card className="fz-card">
      <div className="cup-card-head">
        <span className="cup-card-icon cup-card-icon-league" aria-hidden="true"><Shield size={20} /></span>
        <div><h2>TNM Super League</h2><span>{SEASON} season</span></div>
        {row && <Badge variant="gold">{row.position}{['st', 'nd', 'rd'][((row.position + 90) % 100 - 10) % 10 - 1] ?? 'th'} · {row.points} pts</Badge>}
      </div>
      {loading ? <Skeleton className="fz-board-skeleton" /> : <>
        <div className="league-record">
          <div><strong>{played.length}</strong><span>Played</span></div>
          <div><strong>{count('W')}</strong><span>Won</span></div>
          <div><strong>{count('D')}</strong><span>Drawn</span></div>
          <div><strong>{count('L')}</strong><span>Lost</span></div>
        </div>
        {next && <p className="fz-note">Next: {isEkhaya(next.home) ? 'v' : '@'} {opponent(next)} · {formatMalawiDate(next.date)}</p>}
      </>}
      <div className="league-links">
        <Link to="/table"><Table2 size={16} aria-hidden="true" /> Table</Link>
        <Link to="/results?c=league"><Trophy size={16} aria-hidden="true" /> Results</Link>
        <Link to="/fixtures?c=league"><CalendarDays size={16} aria-hidden="true" /> Fixtures</Link>
      </div>
    </Card>
  )
}

export default function Competitions() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cups' ? 'cups' : 'league'
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const standings = useFirestoreCollection<Standing>('standings')
  const season = fixtures.items.filter((fixture) => inSeason(fixture) && (isEkhaya(fixture.home) || isEkhaya(fixture.away)))
  const league = season.filter((fixture) => competitionOf(fixture.competition).kind === 'league')

  return <div className="fan-zone">
    <PageHeader eyebrow={`${SEASON} season`} title="Competitions" description="Ekhaya FC in the league and the cups." />
    <div className="comp-tabs"><div className="comp-tabs-row comp-tabs-big" role="tablist" aria-label="Competition type">
      <button type="button" role="tab" aria-selected={tab === 'league'} className={tab === 'league' ? 'active' : undefined} onClick={() => setParams({}, { replace: true })}><Shield size={16} aria-hidden="true" /> League</button>
      <button type="button" role="tab" aria-selected={tab === 'cups'} className={tab === 'cups' ? 'active' : undefined} onClick={() => setParams({ tab: 'cups' }, { replace: true })}><Trophy size={16} aria-hidden="true" /> Cups</button>
    </div></div>
    {fixtures.error && <p className="live-error" role="alert">Matches could not be loaded. Check your connection.</p>}
    {tab === 'league'
      ? <LeagueCard fixtures={league} standings={standings.items} loading={fixtures.loading || standings.loading} />
      : fixtures.loading ? <Skeleton className="fz-board-skeleton" />
        : CUPS.map((cup) => <CupCard key={cup.id} cup={cup} matches={sortByDate(season.filter((fixture) => competitionOf(fixture.competition).id === cup.id), 'asc')} />)}
  </div>
}
