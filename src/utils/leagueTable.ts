// League table worked out from match results: P, W, D, L, goals, points and
// form (with the match behind each letter). Used to check the saved table and
// to rebuild it after a week's results are added.
import type { FormEntry, Standing } from '../types'
import type { LeagueResult } from '../data/leagueResults2026'

export type ComputedRow = { team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; history: FormEntry[] }

export const norm = (name: string) => name.toLowerCase().replace(/\butd\b/g, 'united').replace(/\bf\.?c\.?\b/g, '').replace(/[^a-z]/g, '')

/**
 * Same match: in a league season each pairing happens once with this home team
 * (the return match has the teams the other way round), so the same home and
 * away teams within the season are the same game, even if the date differs.
 */
export function sameMatch(a: { date: string; home: string; away: string }, b: { date: string; home: string; away: string }) {
  const days = Math.abs(new Date(a.date.slice(0, 10)).getTime() - new Date(b.date.slice(0, 10)).getTime()) / 86400000
  return days <= 150 && norm(a.home) === norm(b.home) && norm(a.away) === norm(b.away)
}

export function computeTable(results: LeagueResult[]) {
  const rows = new Map<string, ComputedRow>()
  const row = (team: string) => {
    const key = norm(team)
    if (!rows.has(key)) rows.set(key, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, history: [] })
    return rows.get(key) as ComputedRow
  }
  for (const match of [...results].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [team, gf, ga, opponent, home] of [[match.home, match.homeScore, match.awayScore, match.away, true], [match.away, match.awayScore, match.homeScore, match.home, false]] as const) {
      const r = row(team)
      const result = gf > ga ? 'W' : gf === ga ? 'D' : 'L'
      r.played += 1; r.goalsFor += gf; r.goalsAgainst += ga
      if (result === 'W') { r.won += 1; r.points += 3 } else if (result === 'D') { r.drawn += 1; r.points += 1 } else r.lost += 1
      r.history.push({ fixtureId: match.id, result, opponent, score: `${gf}–${ga}`, date: match.date.slice(0, 10), home })
    }
  }
  return rows
}

/** Differences between a saved row and the results ('' when they agree). */
export function rowDifferences(saved: Standing | undefined, computed: ComputedRow) {
  if (!saved) return ['not in the table']
  const out: string[] = []
  const check = (label: string, a: number, b: number) => { if (Number(a ?? 0) !== b) out.push(`${label} ${a ?? 0} → ${b}`) }
  check('P', saved.played, computed.played); check('W', saved.won, computed.won); check('D', saved.drawn, computed.drawn); check('L', saved.lost, computed.lost)
  check('GF', saved.goalsFor, computed.goalsFor); check('GA', saved.goalsAgainst, computed.goalsAgainst); check('Pts', saved.points, computed.points)
  const form = computed.history.slice(-5).map((item) => item.result).join('')
  if ((saved.form ?? []).join('') !== form) out.push(`form ${(saved.form ?? []).join('') || '–'} → ${form}`)
  return out
}

// Short names used by score apps (Flashscore, SofaScore) → the names in the table.
const ALIASES: Record<string, string> = {
  civoutd: 'Civil Service United', civounited: 'Civil Service United', civilservice: 'Civil Service United', csu: 'Civil Service United',
  dedzadynamos: 'Goshen City Dedza Dynamos', goshencity: 'Goshen City Dedza Dynamos', dedza: 'Goshen City Dedza Dynamos',
  bigbullets: 'FCB Nyasa Big Bullets', nyasabigbullets: 'FCB Nyasa Big Bullets', bullets: 'FCB Nyasa Big Bullets',
  mitundubaptist: 'Luanar Mitundu', mitundu: 'Luanar Mitundu', luanar: 'Luanar Mitundu',
  wanderers: 'Mighty Wanderers', mafco: 'MAFCO F.C', creck: 'Creck Sporting', moyale: 'Moyale Barracks', kb: 'Kamuzu Barracks',
}

/** "Red LionsRed Lions" (score apps repeat the name) → "Red Lions". */
function undouble(name: string) {
  const text = name.trim()
  const half = text.length / 2
  return Number.isInteger(half) && text.slice(0, half) === text.slice(half) ? text.slice(0, half) : text
}

/**
 * Score-app copy (Flashscore): blocks of "18.10. 09:00", home team, away team,
 * goals run together ("21" = 2–1) and W/D/L. Turned into "Home 2-1 Away" lines.
 */
function fromScoreApp(text: string, year: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.some((line) => /^\d{1,2}\.\d{1,2}\.(\d{2,4})?(\s+\d{1,2}:\d{2})?$/.test(line))) return null
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const date = lines[i].match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/)
    if (!date || !/^\d{1,2}\.\d{1,2}\./.test(lines[i])) continue
    const home = lines[i + 1]; const away = lines[i + 2]; const goals = lines[i + 3] ?? ''
    if (!home || !away || !/^\d{2,4}$/.test(goals)) { out.push(`${lines[i]} ${home ?? ''} ? ${away ?? ''}`); continue }
    const [hs, as] = goals.length === 2 ? [goals[0], goals[1]] : goals.length === 4 ? [goals.slice(0, 2), goals.slice(2)] : ['?', '?']
    const y = date[3] ? (date[3].length === 2 ? `20${date[3]}` : date[3]) : year
    out.push(`${y}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')} ${undouble(home)} ${hs}-${as} ${undouble(away)}`)
    i += 3
  }
  return out.join('\n')
}

/** Reads pasted results like "Red Lions 0-0 Ekhaya FC" or "Red Lions 0 – 0 Ekhaya FC" (one per line). */
export function parseResults(text: string, teams: string[], fallbackDate: string) {
  const known = (raw: string) => {
    const name = undouble(raw)
    const alias = ALIASES[norm(name)]
    return teams.find((team) => norm(team) === norm(alias ?? name)) ?? teams.find((team) => norm(team).includes(norm(name)) || norm(name).includes(norm(team)))
  }
  text = fromScoreApp(text, fallbackDate.slice(0, 4)) ?? text
  const lines = text.split('\n').map((line) => line.replace(/\t/g, ' ').trim()).filter(Boolean)
  const parsed: Array<{ line: string; result?: LeagueResult; problem?: string }> = []
  for (const line of lines) {
    const date = line.match(/(\d{4})-(\d{2})-(\d{2})/)?.[0] ?? fallbackDate
    const body = line.replace(/\d{4}-\d{2}-\d{2}/, '').replace(/^(mw|week|matchweek)?\s*\d*[:.)-]?\s+(?=[a-z])/i, '').trim()
    const match = body.match(/^(.+?)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+(.+)$/)
    if (!match) { parsed.push({ line, problem: 'no score found (write it like: Red Lions 0-0 Ekhaya FC)' }); continue }
    const home = known(match[1].trim()); const away = known(match[4].trim())
    if (!home || !away) { parsed.push({ line, problem: `team not in the table: ${!home ? match[1].trim() : match[4].trim()}` }); continue }
    parsed.push({ line, result: { id: `${date}-${home}-${away}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), week: 0, date, home, away, homeScore: Number(match[2]), awayScore: Number(match[3]) } })
  }
  return parsed
}
