// Formations for the line-up pitch. Numbers run from defence to attack
// (the goalkeeper is always added on top of these 10 outfield players).
export const FORMATIONS = ['4-3-3', '4-4-2', '4-2-3-1', '4-1-4-1', '4-5-1', '4-3-1-2', '3-5-2', '3-4-3', '5-3-2', '5-4-1'] as const
export type Formation = (typeof FORMATIONS)[number]
export const DEFAULT_FORMATION: Formation = '4-3-3'

export function isFormation(value: unknown): value is Formation {
  return typeof value === 'string' && (FORMATIONS as readonly string[]).includes(value)
}

const RANK: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }

/**
 * Places 11 players into formation lines: goalkeeper first, then defence to
 * attack. Players are ordered by their position (GK, DEF, MID, FWD); players
 * without a position keep the order they were picked in.
 */
export function arrangeFormation<T extends { position?: string | null }>(starters: T[], formation: Formation): T[][] {
  const lines = formation.split('-').map(Number)
  const ordered = starters
    .map((player, index) => ({ player, index }))
    .sort((a, b) => (RANK[a.player.position ?? ''] ?? 2) - (RANK[b.player.position ?? ''] ?? 2) || a.index - b.index)
    .map(({ player }) => player)
  const keeper = ordered.find((player) => player.position === 'GK') ?? ordered[0]
  const outfield = ordered.filter((player) => player !== keeper)
  const result: T[][] = keeper ? [[keeper]] : []
  let start = 0
  for (const size of lines) {
    result.push(outfield.slice(start, start + size))
    start += size
  }
  // Anyone left over (e.g. more than 11 picked) joins the front line.
  if (start < outfield.length) result[result.length - 1].push(...outfield.slice(start))
  return result
}
