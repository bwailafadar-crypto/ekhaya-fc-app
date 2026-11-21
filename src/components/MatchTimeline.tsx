import { ArrowDownRight, ArrowUpRight, Goal, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MatchEvent } from '../types'

// Flashscore-style match summary: key events grouped by half, each row aligned
// to the team it belongs to, with the minute, scorer + assist, cards and subs.
type Props = {
  events: MatchEvent[]
  home: string
  away: string
  isClub: (team: string) => boolean
  isHome: (team: string) => boolean
  finished: boolean
  live: boolean
  homeScore: number
  awayScore: number
  renderExtra?: (event: MatchEvent) => ReactNode
}

const half = (minute: number) => (minute <= 45 ? 1 : 2)

function EventIcon({ event, club }: { event: MatchEvent; club: boolean }) {
  if (event.kind === 'goal') return <span className={`mt-ic mt-goal${club ? ' club' : ''}`}><Goal size={14} /></span>
  if (event.kind === 'card') return <span className={`mt-ic mt-card mt-card-${event.card === 'red' ? 'red' : 'yellow'}`} aria-label={`${event.card === 'red' ? 'Red' : 'Yellow'} card`} />
  if (event.kind === 'substitution') return <span className="mt-ic mt-sub"><ArrowUpRight size={12} className="in" /><ArrowDownRight size={12} className="out" /></span>
  return <span className="mt-ic mt-note"><Repeat size={12} /></span>
}

function EventText({ event }: { event: MatchEvent }) {
  if (event.kind === 'goal') return <span className="mt-text"><b>{event.playerName || 'Goal'}</b>{event.assistPlayerName ? <i> ({event.assistPlayerName})</i> : null}</span>
  if (event.kind === 'card') return <span className="mt-text">{event.playerName || (event.card === 'red' ? 'Red card' : 'Yellow card')}</span>
  if (event.kind === 'substitution') return <span className="mt-text mt-text-sub"><b>{event.subbedInPlayerName || '—'}</b><i>{event.subbedOutPlayerName || '—'}</i></span>
  return <span className="mt-text mt-note-text">{event.text}</span>
}

function Row({ event, home, away, isClub, isHome, renderExtra }: { event: MatchEvent } & Pick<Props, 'home' | 'away' | 'isClub' | 'isHome' | 'renderExtra'>) {
  const mine = isHome(event.team)
  const min = `${event.minute}'`
  // Commentary (e.g. a disallowed goal / VAR note) spans the middle like Flashscore.
  if (event.kind === 'commentary') {
    return <li className="mt-row mt-row-note"><span className="mt-min">{min}</span><div className="mt-mid"><EventIcon event={event} club={false} /><EventText event={event} /></div>{renderExtra?.(event)}</li>
  }
  const club = isClub(event.team)
  const body = <div className={`mt-body${event.kind === 'goal' ? ' is-goal' : ''}`}><EventIcon event={event} club={club} /><EventText event={event} /></div>
  return (
    <li className={`mt-row ${mine ? 'mt-left' : 'mt-right'}`} title={event.team === home ? home : away}>
      {mine ? <>{body}<span className="mt-min">{min}</span></> : <><span className="mt-min">{min}</span>{body}</>}
      {renderExtra?.(event)}
    </li>
  )
}

export default function MatchTimeline(props: Props) {
  const { events, isHome, finished, live, homeScore, awayScore, home } = props
  const ordered = [...events].sort((a, b) => a.minute - b.minute)
  const scored = ordered.filter((event) => event.kind === 'goal')
  const halfScore = (h: 1 | 2) => {
    let hs = 0, as = 0
    for (const g of scored) if (half(g.minute) === h) { if (isHome(g.team)) hs += 1; else as += 1 }
    return `${hs} - ${as}`
  }
  const firstHalf = ordered.filter((event) => half(event.minute) === 1)
  const secondHalf = ordered.filter((event) => half(event.minute) === 2)
  const hasSecond = secondHalf.length > 0 || live || finished

  if (!events.length) return null
  return (
    <div className="match-timeline" aria-label="Match summary">
      {finished && <div className="mt-fulltime">Full time · {homeScore} – {awayScore}</div>}
      <section className="mt-half">
        <header className="mt-half-head"><span>1st half</span><b>{halfScore(1)}</b></header>
        <ol className="mt-list">{firstHalf.map((event) => <Row key={event.id} event={event} {...props} />)}{!firstHalf.length && <li className="mt-empty">No events</li>}</ol>
      </section>
      {hasSecond && <section className="mt-half">
        <header className="mt-half-head"><span>2nd half</span><b>{halfScore(2)}</b></header>
        <ol className="mt-list">{secondHalf.map((event) => <Row key={event.id} event={event} {...props} />)}{!secondHalf.length && <li className="mt-empty">—</li>}</ol>
      </section>}
      <div className="mt-kickoff">Kick-off · {home}</div>
    </div>
  )
}
