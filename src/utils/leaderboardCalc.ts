// Prediction league scoring (pure, no Firebase).
export const POINTS_EXACT = 3
export const POINTS_RESULT = 1

export type LeaderRow = { uid: string; name: string; points: number; exact: number; results: number; played: number; rank: number }
export type ScoredPrediction = { uid: string; fixtureId: string; home: number; away: number; name: string; updatedAt: number }
export type FinalScore = { id: string; homeScore: number; awayScore: number }

const outcome = (home: number, away: number) => Math.sign(home - away)

export function rankPredictions(results: FinalScore[], predictions: ScoredPrediction[]): LeaderRow[] {
  const finals = new Map(results.map((result) => [result.id, result]))
  const byFan = new Map<string, LeaderRow & { nameAt: number }>()
  for (const prediction of predictions) {
    const final = finals.get(prediction.fixtureId)
    if (!final) continue
    const row = byFan.get(prediction.uid) ?? { uid: prediction.uid, name: prediction.name, nameAt: -1, points: 0, exact: 0, results: 0, played: 0, rank: 0 }
    row.played += 1
    if (prediction.home === final.homeScore && prediction.away === final.awayScore) { row.exact += 1; row.points += POINTS_EXACT }
    else if (outcome(prediction.home, prediction.away) === outcome(final.homeScore, final.awayScore)) { row.results += 1; row.points += POINTS_RESULT }
    if (prediction.updatedAt >= row.nameAt) { row.name = prediction.name || 'Fan'; row.nameAt = prediction.updatedAt }
    byFan.set(prediction.uid, row)
  }
  const sorted = [...byFan.values()].sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
  const ranked: LeaderRow[] = []
  for (const [index, row] of sorted.entries()) {
    const previous = ranked[index - 1]
    const tied = previous && previous.points === row.points && previous.exact === row.exact
    ranked.push({ uid: row.uid, name: row.name, points: row.points, exact: row.exact, results: row.results, played: row.played, rank: tied ? previous.rank : index + 1 })
  }
  return ranked
}

// ---- Fan points and levels (everything a fan does for the club, not just predictions) ----
export const FAN_POINTS = { motmVote: 2, pollVote: 1, checkIn: 5, invite: 10 } as const
export const LEVELS = [
  { name: 'Rookie', from: 0 },
  { name: 'Supporter', from: 20 },
  { name: 'Regular', from: 50 },
  { name: 'Ultra', from: 100 },
  { name: 'Legend', from: 200 },
] as const

export type FanPointsBreakdown = { predictions: number; motmVotes: number; pollVotes: number; checkIns: number; invites: number }
export type FanPointsRow = { uid: string; name: string; points: number; level: string; rank: number; breakdown: FanPointsBreakdown }
export type FanActivity = {
  predictionPoints: Array<{ uid: string; points: number; name: string }>
  motmVoters: string[]
  pollVoters: string[]
  checkIns: Array<{ uid: string; name?: string }>
  inviters: string[]
  names: Record<string, string>
}

export function levelFor(points: number) {
  let index = 0
  LEVELS.forEach((level, i) => { if (points >= level.from) index = i })
  const next = LEVELS[index + 1]
  return { name: LEVELS[index].name, index, next: next ? { name: next.name, from: next.from } : null }
}

/** Adds up every fan's points; one row per fan, best first, ties share a rank. */
export function fanPointsTable(activity: FanActivity): FanPointsRow[] {
  const rows = new Map<string, { name: string; breakdown: FanPointsBreakdown }>()
  const row = (uid: string) => {
    let entry = rows.get(uid)
    if (!entry) { entry = { name: activity.names[uid] ?? '', breakdown: { predictions: 0, motmVotes: 0, pollVotes: 0, checkIns: 0, invites: 0 } }; rows.set(uid, entry) }
    return entry
  }
  for (const item of activity.predictionPoints) { const entry = row(item.uid); entry.breakdown.predictions += item.points; if (!entry.name && item.name) entry.name = item.name }
  for (const uid of activity.motmVoters) row(uid).breakdown.motmVotes += 1
  for (const uid of activity.pollVoters) row(uid).breakdown.pollVotes += 1
  for (const item of activity.checkIns) { const entry = row(item.uid); entry.breakdown.checkIns += 1; if (!entry.name && item.name) entry.name = item.name }
  for (const uid of activity.inviters) row(uid).breakdown.invites += 1
  const total = (b: FanPointsBreakdown) => b.predictions + b.motmVotes * FAN_POINTS.motmVote + b.pollVotes * FAN_POINTS.pollVote + b.checkIns * FAN_POINTS.checkIn + b.invites * FAN_POINTS.invite
  const sorted = [...rows.entries()].map(([uid, entry]) => ({ uid, name: entry.name || 'Fan', points: total(entry.breakdown), breakdown: entry.breakdown }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  const ranked: FanPointsRow[] = []
  sorted.forEach((entry, index) => {
    const previous = ranked[index - 1]
    ranked.push({ ...entry, level: levelFor(entry.points).name, rank: previous && previous.points === entry.points ? previous.rank : index + 1 })
  })
  return ranked
}
