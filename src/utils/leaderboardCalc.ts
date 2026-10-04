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
