// Match preview (form guide, head-to-head, season stats and key facts) worked
// out from the results the app already has: the official league results, the
// latest form saved in the table, and the club's own matches. Pure functions,
// so they are easy to test.
import type { FormEntry, Fixture, Standing } from '../types'
import type { LeagueResult } from '../data/leagueResults2026'
import { isCupCompetition } from './competitions'
import { norm } from './leagueTable'

export type PreviewMatch = { date: string; home: string; away: string; homeScore: number; awayScore: number; cup?: boolean; competition?: string; fixtureId?: string }

const ALIAS: Record<string, string> = {
  mitundubaptist: 'luanarmitundu', luanar: 'luanarmitundu', civounited: 'civilserviceunited', civo: 'civilserviceunited',
  dedzadynamos: 'goshencitydedzadynamos', dedza: 'goshencitydedzadynamos', bigbullets: 'fcbnyasabigbullets', nyasabigbullets: 'fcbnyasabigbullets', bullets: 'fcbnyasabigbullets',
  moyale: 'moyalebarracks', creck: 'crecksporting', crecksc: 'crecksporting', kb: 'kamuzubarracks', wanderers: 'mightywanderers', karonga: 'karongaunited',
}
export const teamKey = (name: string) => { const k = norm(name); return ALIAS[k] ?? k }
export const sameTeam = (a: string, b: string) => teamKey(a) === teamKey(b)

/** Every result we know, once: official results, club matches (incl. cups) and the form saved in the table. */
export function allResults(official: LeagueResult[], fixtures: Fixture[], standings: Standing[]): PreviewMatch[] {
  const list: PreviewMatch[] = official.map((r) => ({ date: r.date, home: r.home, away: r.away, homeScore: r.homeScore, awayScore: r.awayScore }))
  const same = (a: PreviewMatch, b: PreviewMatch) => sameTeam(a.home, b.home) && sameTeam(a.away, b.away) && Math.abs(Date.parse(a.date.slice(0, 10)) - Date.parse(b.date.slice(0, 10))) <= 150 * 86400000
  const add = (m: PreviewMatch) => { const i = list.findIndex((o) => same(o, m)); if (i < 0) list.push(m); else if (m.fixtureId || m.cup) list[i] = { ...list[i], ...m } }
  for (const f of fixtures) {
    if (f.isTest || f.status !== 'finished' || f.homeScore == null || f.awayScore == null) continue
    add({ date: f.date.slice(0, 10), home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore, cup: isCupCompetition(f.competition), competition: f.competition, fixtureId: f.id })
  }
  for (const row of standings) for (const h of row.formHistory ?? []) {
    const m = fromForm(row.team, h)
    if (m) add(m)
  }
  return list.sort((a, b) => b.date.localeCompare(a.date))
}

function fromForm(team: string, h: FormEntry): PreviewMatch | null {
  const [gf, ga] = String(h.score ?? '').split(/[–-]/).map((x) => Number(x.trim()))
  if (!h.opponent || !h.date || !Number.isFinite(gf) || !Number.isFinite(ga)) return null
  return h.home ? { date: h.date, home: team, away: h.opponent, homeScore: gf, awayScore: ga } : { date: h.date, home: h.opponent, away: team, homeScore: ga, awayScore: gf }
}

export type TeamLine = { date: string; opponent: string; home: boolean; gf: number; ga: number; result: 'W' | 'D' | 'L'; cup?: boolean; fixtureId?: string }
export function teamLines(results: PreviewMatch[], team: string, opts: { leagueOnly?: boolean } = {}): TeamLine[] {
  return results.filter((m) => (!opts.leagueOnly || !m.cup) && (sameTeam(m.home, team) || sameTeam(m.away, team))).map((m) => {
    const home = sameTeam(m.home, team)
    const gf = home ? m.homeScore : m.awayScore; const ga = home ? m.awayScore : m.homeScore
    return { date: m.date, opponent: home ? m.away : m.home, home, gf, ga, result: gf > ga ? 'W' as const : gf === ga ? 'D' as const : 'L' as const, cup: m.cup, fixtureId: m.fixtureId }
  })
}

export type TeamStats = { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; cleanSheets: number; failedToScore: number; btts: number; over25: number; avgFor: number; avgAgainst: number; winPct: number; venue: { played: number; won: number; drawn: number; lost: number; gf: number; ga: number } }
export function teamStats(lines: TeamLine[], atHome: boolean): TeamStats {
  const s = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, cleanSheets: 0, failedToScore: 0, btts: 0, over25: 0 }
  const v = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 }
  for (const l of lines) {
    s.played++; s.gf += l.gf; s.ga += l.ga
    if (l.result === 'W') s.won++; else if (l.result === 'D') s.drawn++; else s.lost++
    if (l.ga === 0) s.cleanSheets++
    if (l.gf === 0) s.failedToScore++
    if (l.gf > 0 && l.ga > 0) s.btts++
    if (l.gf + l.ga > 2.5) s.over25++
    if (l.home === atHome) { v.played++; v.gf += l.gf; v.ga += l.ga; if (l.result === 'W') v.won++; else if (l.result === 'D') v.drawn++; else v.lost++ }
  }
  const d = Math.max(1, s.played)
  return { ...s, avgFor: s.gf / d, avgAgainst: s.ga / d, winPct: Math.round((s.won / d) * 100), venue: v }
}

export type HeadToHead = { meetings: PreviewMatch[]; homeWins: number; draws: number; awayWins: number; homeGoals: number; awayGoals: number }
export function headToHead(results: PreviewMatch[], home: string, away: string): HeadToHead {
  const meetings = results.filter((m) => (sameTeam(m.home, home) && sameTeam(m.away, away)) || (sameTeam(m.home, away) && sameTeam(m.away, home)))
  const h2h = { meetings, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0 }
  for (const m of meetings) {
    const hg = sameTeam(m.home, home) ? m.homeScore : m.awayScore
    const ag = sameTeam(m.home, home) ? m.awayScore : m.homeScore
    h2h.homeGoals += hg; h2h.awayGoals += ag
    if (hg > ag) h2h.homeWins++; else if (hg === ag) h2h.draws++; else h2h.awayWins++
  }
  return h2h
}

/** Short facts in the style of a TV preview ("unbeaten in 5", "scored in 6 of the last 7"...). */
export function keyFacts(name: string, lines: TeamLine[], atHome: boolean): string[] {
  const facts: string[] = []
  const recent = lines.slice(0, 8)
  const streak = (test: (l: TeamLine) => boolean, list = lines) => { let n = 0; for (const l of list) { if (!test(l)) break; n++ } return n }
  const unbeaten = streak((l) => l.result !== 'L'); const winless = streak((l) => l.result !== 'W')
  const wins = streak((l) => l.result === 'W'); const losses = streak((l) => l.result === 'L')
  if (wins >= 2) facts.push(`${name} have won their last ${wins} matches.`)
  else if (unbeaten >= 3) facts.push(`${name} are unbeaten in their last ${unbeaten} matches.`)
  if (losses >= 2) facts.push(`${name} have lost their last ${losses} matches.`)
  else if (winless >= 3 && wins === 0) facts.push(`${name} have not won in their last ${winless} matches.`)
  const scored = recent.filter((l) => l.gf > 0).length
  if (recent.length >= 5 && scored >= recent.length - 1) facts.push(`${name} have scored in ${scored} of their last ${recent.length} matches.`)
  if (recent.length >= 5 && scored <= 2) facts.push(`${name} have scored in only ${scored} of their last ${recent.length} matches.`)
  const clean = recent.filter((l) => l.ga === 0).length
  if (recent.length >= 5 && clean >= 3) facts.push(`${name} kept ${clean} clean sheets in their last ${recent.length} matches.`)
  const venue = lines.filter((l) => l.home === atHome)
  const venueUnbeaten = streak((l) => l.result !== 'L', venue)
  if (venueUnbeaten >= 3) facts.push(`${name} are unbeaten in their last ${venueUnbeaten} ${atHome ? 'home' : 'away'} matches.`)
  const venueWinless = streak((l) => l.result !== 'W', venue)
  if (venueWinless >= 3) facts.push(`${name} have not won in their last ${venueWinless} ${atHome ? 'home' : 'away'} matches.`)
  return facts.slice(0, 3)
}
