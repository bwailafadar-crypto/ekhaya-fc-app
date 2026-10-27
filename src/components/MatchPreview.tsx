// Match centre "Preview": form guide, head-to-head, season comparison, home and
// away record, key facts and Ekhaya players to watch, like a TV match preview.
import { useMemo, useState } from 'react'
import { OFFICIAL_RESULTS } from '../data/leagueResults2026'
import type { Fixture, Standing } from '../types'
import { competitionLabel } from '../utils/competitions'
import { formatMalawiDate } from '../utils/football'
import { allResults, headToHead, keyFacts, sameTeam, teamLines, teamStats, type TeamLine } from '../utils/matchPreview'
import TeamLogo from './TeamLogo'

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`

function FormChips({ lines, onPick, picked }: { lines: TeamLine[]; onPick: (i: number) => void; picked: number | null }) {
  const last5 = lines.slice(0, 5)
  if (!last5.length) return <span className="pv-none">No results yet</span>
  return <div className="pv-form">{last5.map((l, i) => <button type="button" key={`${l.date}-${i}`} className={`pv-chip pv-${l.result}${picked === i ? ' on' : ''}`} onClick={() => onPick(i)} title={`${l.home ? 'v' : '@'} ${l.opponent} ${l.gf}–${l.ga}`}>{l.result}</button>)}</div>
}

function Compare({ label, home, away, lowerIsBetter = false, format = (v: number) => String(v) }: { label: string; home: number; away: number; lowerIsBetter?: boolean; format?: (v: number) => string }) {
  const total = home + away || 1
  const better = home === away ? 0 : (home > away) !== lowerIsBetter ? -1 : 1
  return <div className="pv-compare">
    <div className="pv-compare-top"><b className={better === -1 ? 'best' : ''}>{format(home)}</b><span>{label}</span><b className={better === 1 ? 'best' : ''}>{format(away)}</b></div>
    {/* The better side always gets the longer bar (for "lower is better" rows too). */}
    <div className="pv-bar"><i className="h" style={{ width: `${((lowerIsBetter ? away : home) / total) * 100}%` }} /><i className="a" style={{ width: `${((lowerIsBetter ? home : away) / total) * 100}%` }} /></div>
  </div>
}

export default function MatchPreview({ fixture, fixtures, standings }: { fixture: Fixture; fixtures: Fixture[]; standings: Standing[] }) {
  const { home, away } = fixture
  const [pickHome, setPickHome] = useState<number | null>(null)
  const [pickAway, setPickAway] = useState<number | null>(null)
  const data = useMemo(() => {
    // Only what happened before this match (so a finished match shows its own preview).
    const before = fixture.date.slice(0, 10)
    const results = allResults(OFFICIAL_RESULTS, fixtures.filter((f) => f.id !== fixture.id), standings).filter((m) => m.date < before || fixture.status === 'upcoming')
    const homeLines = teamLines(results, home, { leagueOnly: true })
    const awayLines = teamLines(results, away, { leagueOnly: true })
    const row = (team: string) => standings.find((s) => sameTeam(s.team, team))
    const h2h = headToHead(results, home, away)
    return { homeLines, awayLines, homeRow: row(home), awayRow: row(away), h2h, homeStats: teamStats(homeLines, true), awayStats: teamStats(awayLines, false) }
  }, [fixture.id, fixture.date, fixture.status, home, away, fixtures, standings])
  const { homeLines, awayLines, homeRow, awayRow, h2h, homeStats, awayStats } = data
  const hs = homeRow ? { p: homeRow.played, w: homeRow.won, d: homeRow.drawn, l: homeRow.lost, pts: homeRow.points, gf: homeRow.goalsFor, ga: homeRow.goalsAgainst } : { p: homeStats.played, w: homeStats.won, d: homeStats.drawn, l: homeStats.lost, pts: homeStats.won * 3 + homeStats.drawn, gf: homeStats.gf, ga: homeStats.ga }
  const as = awayRow ? { p: awayRow.played, w: awayRow.won, d: awayRow.drawn, l: awayRow.lost, pts: awayRow.points, gf: awayRow.goalsFor, ga: awayRow.goalsAgainst } : { p: awayStats.played, w: awayStats.won, d: awayStats.drawn, l: awayStats.lost, pts: awayStats.won * 3 + awayStats.drawn, gf: awayStats.gf, ga: awayStats.ga }
  const short = (name: string) => name.replace(/\s*(F\.?C\.?|FC)$/i, '').trim()
  const last = h2h.meetings[0]
  const facts = [
    ...keyFacts(short(home), homeLines, true),
    ...keyFacts(short(away), awayLines, false),
    ...(last ? [`Last meeting: ${last.home} ${last.homeScore}–${last.awayScore} ${last.away} (${formatMalawiDate(last.date)}${last.cup ? `, ${competitionLabel(last.competition)}` : ''}).`] : []),
  ].slice(0, 6)
  const picked = (lines: TeamLine[], i: number | null) => i == null ? null : lines[i]
  const ph = picked(homeLines, pickHome); const pa = picked(awayLines, pickAway)
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–')

  return <section className="match-preview" aria-label="Match preview">
    <div className="pv-head">
      <div><TeamLogo name={home} crest /><strong>{short(home)}</strong><small>{homeRow ? `${ordinal(homeRow.position)} · ${homeRow.points} pts` : '–'}</small></div>
      <span className="pv-vs">{fixture.status === 'upcoming' ? 'PREVIEW' : 'BEFORE THE MATCH'}</span>
      <div><TeamLogo name={away} crest /><strong>{short(away)}</strong><small>{awayRow ? `${ordinal(awayRow.position)} · ${awayRow.points} pts` : '–'}</small></div>
    </div>

    <div className="pv-card">
      <h3>Form guide <small>last 5 league matches, newest first</small></h3>
      <div className="pv-form-row"><span>{short(home)}</span><FormChips lines={homeLines} picked={pickHome} onPick={(i) => setPickHome(pickHome === i ? null : i)} /></div>
      {ph && <p className="pv-picked">{formatMalawiDate(ph.date)} · {ph.home ? 'Home' : 'Away'} v {ph.opponent} · <b>{ph.gf}–{ph.ga}</b></p>}
      <div className="pv-form-row"><span>{short(away)}</span><FormChips lines={awayLines} picked={pickAway} onPick={(i) => setPickAway(pickAway === i ? null : i)} /></div>
      {pa && <p className="pv-picked">{formatMalawiDate(pa.date)} · {pa.home ? 'Home' : 'Away'} v {pa.opponent} · <b>{pa.gf}–{pa.ga}</b></p>}
      <p className="pv-note">Tap a letter to see the match.</p>
    </div>

    <div className="pv-card">
      <h3>Head to head <small>{h2h.meetings.length ? `${h2h.meetings.length} meeting${h2h.meetings.length === 1 ? '' : 's'} this season` : 'this season'}</small></h3>
      {h2h.meetings.length ? <>
        <div className="pv-h2h">
          <div><b>{h2h.homeWins}</b><span>{short(home)} wins</span></div>
          <div><b>{h2h.draws}</b><span>Draws</span></div>
          <div><b>{h2h.awayWins}</b><span>{short(away)} wins</span></div>
        </div>
        <div className="pv-h2h-bar">{h2h.homeWins > 0 && <i className="h" style={{ flexGrow: h2h.homeWins }} />}{h2h.draws > 0 && <i className="d" style={{ flexGrow: h2h.draws }} />}{h2h.awayWins > 0 && <i className="a" style={{ flexGrow: h2h.awayWins }} />}</div>
        <ul className="pv-meetings">{h2h.meetings.slice(0, 6).map((m, i) => <li key={`${m.date}-${i}`}><small>{formatMalawiDate(m.date)}{m.cup ? ` · ${competitionLabel(m.competition)}` : ''}</small><span className={m.homeScore > m.awayScore ? 'won' : ''}>{short(m.home)}</span><b>{m.homeScore} – {m.awayScore}</b><span className={m.awayScore > m.homeScore ? 'won' : ''}>{short(m.away)}</span></li>)}</ul>
      </> : <p className="pv-none">These teams have not met yet this season.</p>}
    </div>

    <div className="pv-card">
      <h3>Season so far <small>league</small></h3>
      {homeRow && awayRow && <Compare label="League position" home={homeRow.position} away={awayRow.position} lowerIsBetter format={ordinal} />}
      <Compare label="Points" home={hs.pts} away={as.pts} />
      <Compare label="Won" home={hs.w} away={as.w} />
      <Compare label="Drawn" home={hs.d} away={as.d} />
      <Compare label="Lost" home={hs.l} away={as.l} lowerIsBetter />
      <Compare label="Goals scored" home={hs.gf} away={as.gf} />
      <Compare label="Goals conceded" home={hs.ga} away={as.ga} lowerIsBetter />
      <Compare label="Clean sheets" home={homeStats.cleanSheets} away={awayStats.cleanSheets} />
      <Compare label="Goals per match" home={Math.round(homeStats.avgFor * 10) / 10} away={Math.round(awayStats.avgFor * 10) / 10} format={(v) => v.toFixed(1)} />
      <Compare label="Conceded per match" home={Math.round(homeStats.avgAgainst * 10) / 10} away={Math.round(awayStats.avgAgainst * 10) / 10} lowerIsBetter format={(v) => v.toFixed(1)} />
      <div className="pv-legend"><span><i className="h" />{short(home)}</span><span><i className="a" />{short(away)}</span></div>
    </div>

    <div className="pv-card">
      <h3>Home and away</h3>
      <div className="pv-venue">
        <div><small>{short(home)} at home</small><b>{homeStats.venue.won}W {homeStats.venue.drawn}D {homeStats.venue.lost}L</b><span>{homeStats.venue.gf} scored · {homeStats.venue.ga} conceded</span></div>
        <div><small>{short(away)} away</small><b>{awayStats.venue.won}W {awayStats.venue.drawn}D {awayStats.venue.lost}L</b><span>{awayStats.venue.gf} scored · {awayStats.venue.ga} conceded</span></div>
      </div>
      <div className="pv-goals">
        <div><small>Both teams scored</small><b>{pct(homeStats.btts, homeStats.played)}</b><b>{pct(awayStats.btts, awayStats.played)}</b></div>
        <div><small>Over 2.5 goals</small><b>{pct(homeStats.over25, homeStats.played)}</b><b>{pct(awayStats.over25, awayStats.played)}</b></div>
        <div><small>Failed to score</small><b>{pct(homeStats.failedToScore, homeStats.played)}</b><b>{pct(awayStats.failedToScore, awayStats.played)}</b></div>
      </div>
    </div>

    {facts.length > 0 && <div className="pv-card"><h3>Key facts</h3><ul className="pv-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul></div>}


    <p className="pv-note">Based on the 2026 season ({homeStats.played} and {awayStats.played} league matches). Updated after every result.</p>
  </section>
}
