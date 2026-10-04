import { ArrowRight, PartyPopper, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Fixture } from '../types'
import type { Competition } from '../utils/competitions'
import { fireConfetti } from '../utils/confetti'
import { useFlag } from '../hooks/useFlag'
import { SEASON, TROPHY_PHOTOS, cupStatus, isEkhaya, opponent } from '../utils/cupSeason'
import { ekhayaOutcome, formatMalawiDate } from '../utils/football'
import TeamLogo from './TeamLogo'
import { Badge, Card } from './UI'

/** Trophy-lift moment for a cup Ekhaya won: lifting trophy, confetti blast and congratulations. */
export function ChampionsCelebration({ cup, final }: { cup: Competition; final: Fixture }) {
  const trophyRef = useRef<HTMLSpanElement>(null)
  const confetti = useFlag('celebrationConfetti')
  const celebrate = () => {
    const box = trophyRef.current?.getBoundingClientRect()
    if (!box) return () => undefined
    return fireConfetti(box.left + box.width / 2, box.top + box.height / 3)
  }
  useEffect(() => {
    if (!confetti) return
    // Let the trophy rise first, then the confetti cannons go off.
    let stop: () => void = () => undefined
    const timer = window.setTimeout(() => { stop = celebrate() }, 650)
    return () => { window.clearTimeout(timer); stop() }
  }, [confetti])
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

export default function CupCard({ cup, matches }: { cup: Competition; matches: Fixture[] }) {
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

