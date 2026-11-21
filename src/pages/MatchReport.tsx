// Full match report after full time: score, goals, cards, subs, the Ekhaya
// line-up with minutes, match stats and fan numbers, with a
// share button for WhatsApp and Facebook. One page per match: /report/:id
import { collection, query, where } from 'firebase/firestore'
import { ArrowLeft, ArrowRightLeft, CalendarDays, Clock3, Footprints, Goal, MapPin, MessageCircle, Share2, Square, Target, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PlayerAvatar from '../components/PlayerAvatar'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { EmptyState, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useLiveDocs } from '../hooks/useLiveDocs'
import type { Fixture, MatchEvent, MatchStats, Player } from '../types'
import { competitionLabel } from '../utils/competitions'
import { ekhayaOutcome, formatMalawiDate, formatMalawiTime, isPlayed } from '../utils/football'
import { guessMinutes } from '../utils/minutes'
import { minuteLabel } from '../utils/goals'

const same = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase()
const CLUB = 'Ekhaya FC'
const STAT_ROWS = [['shots', 'Shots'], ['shotsOnTarget', 'On target'], ['corners', 'Corners'], ['fouls', 'Fouls'], ['offsides', 'Offsides']] as const
// Short name for the score line: "Amos Sande" → "Sande"; "Blue Eagles No. 9" → "No. 9".
const surname = (name = '') => { const words = name.trim().split(/\s+/); const last = words.slice(-1)[0] ?? ''; return /^\d+$/.test(last) ? words.slice(-2).join(' ') : last || name }

export default function MatchReport() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const match = useMyDoc<Omit<Fixture, 'id'>>(id ? ['fixtures', id] : null)
  const fixture = match.data ? ({ ...match.data, id } as Fixture) : null
  const eventsResult = useLiveDocs<Omit<MatchEvent, 'id'>>(id ? ['fixtures', id, 'events'] : null)
  const playersResult = useFirestoreCollection<Player>('players')
  const finished = Boolean(fixture && isPlayed(fixture) && !fixture.isTest)
  const counts = useCounts(finished ? `report:${id}:${fixture?.homeScore}-${fixture?.awayScore}` : null, () => ({
    predictions: collection(db, 'fixtures', id, 'predictions'),
    exact: query(collection(db, 'fixtures', id, 'predictions'), where('home', '==', fixture?.homeScore ?? 0), where('away', '==', fixture?.awayScore ?? 0)),
    chat: collection(db, 'fixtures', id, 'chat'),
    reactions: collection(db, 'fixtures', id, 'reactions'),
  }))

  if (match.loading) return <div className="report"><Skeleton className="report-skeleton" /><Skeleton /><Skeleton /></div>
  if (!fixture) return <EmptyState icon={CalendarDays} title="Match not found" description="This match report is not available." />
  if (!finished) return <div className="report">
    <BackLink />
    <EmptyState icon={Clock3} title="The report comes after full time" description={`${fixture.home} v ${fixture.away} · ${formatMalawiDate(fixture.date)}. Follow it live in the match centre.`} />
    <Link className="report-cta" to={`/live?match=${encodeURIComponent(id)}`}>Open the match centre</Link>
  </div>

  const players = playersResult.items
  const byId = (playerId?: string) => players.find((player) => player.id === playerId)
  const events = eventsResult.items.slice().sort((a, b) => a.minute - b.minute) as MatchEvent[]
  const goals = events.filter((event) => event.kind === 'goal')
  const cards = events.filter((event) => event.kind === 'card')
  const home = fixture.homeScore ?? 0
  const away = fixture.awayScore ?? 0
  const outcome = ekhayaOutcome(fixture)
  const headline = outcome === 'W' ? 'Ekhaya win' : outcome === 'L' ? 'Ekhaya beaten' : outcome === 'D' ? 'Honours even' : 'Full time'
  const ekhayaHome = same(fixture.home, CLUB)

  // Ekhaya line-up with minutes: the official sheet when saved, otherwise a guess from the commentary.
  const minutes = fixture.officialMinutes ?? guessMinutes(fixture, events, 90)
  const fromSheet = Boolean(fixture.officialMinutes)
  const starters = (fixture.startingPlayerIds ?? []).map((playerId) => byId(playerId)).filter((player): player is Player => Boolean(player))
  const usedSubs = (fixture.benchPlayerIds ?? []).filter((playerId) => (minutes[playerId] ?? 0) > 0).map((playerId) => byId(playerId)).filter((player): player is Player => Boolean(player))
  const goalsBy = (playerId: string) => goals.filter((event) => event.playerId === playerId).length
  const assistsBy = (playerId: string) => goals.filter((event) => event.assistPlayerId === playerId).length
  const cardOf = (playerId: string) => cards.filter((event) => event.playerId === playerId).map((event) => event.card)

  const stats = fixture.matchStats
  const showStats = Boolean(stats && STAT_ROWS.some(([key]) => (stats.home[key] ?? 0) + (stats.away[key] ?? 0) > 0))
  const c = counts.counts

  const url = `${window.location.origin}${window.location.pathname}#/report/${encodeURIComponent(id)}`
  const scorerText = (team: string) => goals.filter((event) => same(event.team, team)).map((event) => `${surname(event.playerName) || 'Goal'}${event.minuteApprox ? '' : ` ${minuteLabel(event)}`}`).join(', ')
  const shareText = [
    `FT: ${fixture.home} ${home}–${away} ${fixture.away}`,
    scorerText(fixture.home) && `⚽ ${fixture.home}: ${scorerText(fixture.home)}`,
    scorerText(fixture.away) && `⚽ ${fixture.away}: ${scorerText(fixture.away)}`,
    `Full report: ${url}`,
  ].filter(Boolean).join('\n')

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: `${fixture?.home} ${home}–${away} ${fixture?.away}`, text: shareText }); return }
    } catch (error) { if ((error as { name?: string }).name === 'AbortError') return }
    try { await navigator.clipboard.writeText(shareText); showToast('Report copied. Paste it in WhatsApp or Facebook.') } catch { window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener') }
  }

  const eventIcon = (event: MatchEvent) => event.kind === 'goal' ? <Goal size={15} aria-label="Goal" />
    : event.kind === 'card' ? <Square size={13} className={event.card === 'red' ? 'card-red' : 'card-yellow'} aria-label={`${event.card === 'red' ? 'Red' : 'Yellow'} card`} />
      : <ArrowRightLeft size={14} aria-label="Substitution" />
  const eventText = (event: MatchEvent) => event.kind === 'goal' ? <><strong>{event.playerName || 'Goal'}{event.penalty ? ' (pen)' : ''}</strong>{event.assistPlayerName && <small>👟 assist {event.assistPlayerName}</small>}</>
    : event.kind === 'card' ? <><strong>{event.playerName || event.team}</strong><small>{event.card === 'red' ? 'Red card' : 'Yellow card'}</small></>
      : <><strong>{event.subbedInPlayerName || 'Sub'}</strong><small>on for {event.subbedOutPlayerName || '—'}</small></>
  const keyEvents = events.filter((event) => event.kind === 'goal' || event.kind === 'card' || event.kind === 'substitution')

  return <article className="report">
    <BackLink />
    <header className={`report-hero report-${outcome ? outcome.toLowerCase() : 'n'}`}>
      <p className="report-eyebrow">{competitionLabel(fixture.competition)}{fixture.round ? ` · ${fixture.round}` : ''}</p>
      <h1>{headline}</h1>
      <div className="report-score">
        <div className="report-team"><TeamLogo name={fixture.home} crest /><span>{fixture.home}</span></div>
        <strong aria-label={`${home} to ${away}`}>{home}<i>–</i>{away}</strong>
        <div className="report-team"><TeamLogo name={fixture.away} crest /><span>{fixture.away}</span></div>
      </div>
      {fixture.note && <p className="report-note">{fixture.note}</p>}
      <div className="report-scorers">
        <span>{goals.filter((event) => same(event.team, fixture.home)).map((event) => `${surname(event.playerName)}${event.minuteApprox ? '' : ` ${minuteLabel(event)}`}`).join(' · ')}</span>
        <span>{goals.filter((event) => same(event.team, fixture.away)).map((event) => `${surname(event.playerName)}${event.minuteApprox ? '' : ` ${minuteLabel(event)}`}`).join(' · ')}</span>
      </div>
      <p className="report-meta"><CalendarDays size={13} aria-hidden="true" /> {formatMalawiDate(fixture.date)} · {formatMalawiTime(fixture.date)}{fixture.venue ? <><MapPin size={13} aria-hidden="true" /> {fixture.venue}</> : null}</p>
      <button type="button" className="report-share" onClick={() => void share()}><Share2 size={16} aria-hidden="true" /> Share the report</button>
    </header>

    <section className="report-card">
      <h2>Key moments</h2>
      {eventsResult.loading ? <Skeleton /> : keyEvents.length ? <ol className="report-timeline">
        {keyEvents.map((event) => <li key={event.id} className={`${same(event.team, fixture.home) ? 'home' : 'away'} kind-${event.kind}`}>
          <b>{event.kind === 'goal' ? minuteLabel(event) : `${event.minute}'`}</b><span className="report-ev-icon">{eventIcon(event)}</span><span className="report-ev-text">{eventText(event)}<em>{event.team}</em></span>
        </li>)}
      </ol> : <p className="report-empty">{home + away === 0 ? 'A goalless draw. No other moments were recorded.' : 'Match moments were not recorded for this game.'}</p>}
    </section>

    {starters.length > 0 && <section className="report-card">
      <h2><Users size={17} aria-hidden="true" /> Ekhaya line-up{fixture.formation ? <small>{fixture.formation}</small> : null}</h2>
      <ul className="report-lineup">
        {[...starters, ...usedSubs].map((player) => {
          const sub = !starters.includes(player)
          const played = minutes[player.id] ?? 0
          return <li key={player.id} className={sub ? 'sub' : ''}>
            <PlayerAvatar player={player} />
            <Link to={`/squad/${player.id}`} className="report-player">{player.number != null && <b>{player.number}</b>}{player.name}</Link>
            <span className="report-player-marks">
              {Array.from({ length: goalsBy(player.id) }, (_, index) => <span key={`g${index}`} aria-label="Goal"><Goal size={13} /></span>)}
              {Array.from({ length: assistsBy(player.id) }, (_, index) => <span key={`a${index}`} title="Assist" aria-label="Assist"><Footprints size={13} /></span>)}
              {cardOf(player.id).map((card, index) => <i key={`c${index}`} className={`report-card-mark ${card === 'red' ? 'red' : 'yellow'}`} aria-label={`${card} card`} />)}
              {sub && <ArrowRightLeft size={12} aria-label="Came on" />}
            </span>
            <strong className="report-mins">{played ? `${played}′` : '–'}</strong>
          </li>
        })}
      </ul>
      <p className="report-help">{fromSheet ? 'Minutes from the club\'s official match sheet.' : 'Minutes worked out from the substitutions.'}</p>
    </section>}

    {showStats && stats && <section className="report-card">
      <h2>Match stats</h2>
      <div className="report-stats-head"><span>{fixture.home}</span><span>{fixture.away}</span></div>
      {STAT_ROWS.map(([key, label]) => { const h = (stats.home as MatchStats)[key] ?? 0; const a = (stats.away as MatchStats)[key] ?? 0; const total = Math.max(1, h + a); return <div className="report-stat" key={key}>
        <div><strong>{h}</strong><span>{label}</span><strong>{a}</strong></div>
        <div className="report-stat-bar"><i style={{ width: `${(h / total) * 100}%` }} className={ekhayaHome ? 'club' : ''} /><i style={{ width: `${(a / total) * 100}%` }} className={!ekhayaHome ? 'club' : ''} /></div>
      </div> })}
    </section>}

    {!counts.loading && (c.predictions || c.chat || c.reactions) ? <section className="report-card">
      <h2>The fans</h2>
      <div className="report-fans">
        {c.predictions ? <div><Target size={18} aria-hidden="true" /><strong>{c.exact ?? 0}/{c.predictions}</strong><span>predicted {home}–{away}</span></div> : null}
        {c.chat ? <div><MessageCircle size={18} aria-hidden="true" /><strong>{c.chat}</strong><span>chat message{c.chat === 1 ? '' : 's'}</span></div> : null}
        {c.reactions ? <div><span aria-hidden="true">🔥</span><strong>{c.reactions}</strong><span>{c.reactions === 1 ? 'fan' : 'fans'} reacted live</span></div> : null}
      </div>
    </section> : null}

    <div className="report-actions">
      <a className="report-share report-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"><Share2 size={16} aria-hidden="true" /> Send on WhatsApp</a>
      <Link className="report-cta" to={`/live?match=${encodeURIComponent(id)}`}>Full commentary</Link>
    </div>
  </article>
}

function BackLink() {
  return <Link className="report-back" to="/results"><ArrowLeft size={16} aria-hidden="true" /> Results</Link>
}
