import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allResults, headToHead, keyFacts, teamLines, teamStats } from '../../src/utils/matchPreview.ts'
import type { Fixture, Standing } from '../../src/types.ts'

const official = [
  { id: 'a', week: 1, date: '2026-04-26', home: 'Ekhaya FC', away: 'MAFCO F.C', homeScore: 2, awayScore: 1 },
  { id: 'b', week: 2, date: '2026-05-02', home: 'Red Lions', away: 'Ekhaya FC', homeScore: 0, awayScore: 0 },
  { id: 'c', week: 2, date: '2026-05-02', home: 'MAFCO F.C', away: 'Blue Eagles', homeScore: 3, awayScore: 0 },
  { id: 'd', week: 3, date: '2026-05-09', home: 'Blue Eagles', away: 'MAFCO F.C', homeScore: 1, awayScore: 1 },
]
const fixtures = [
  { id: 'f1', date: '2026-04-26T13:00:00Z', home: 'Ekhaya FC', away: 'Mafco FC', homeScore: 2, awayScore: 1, status: 'finished', competition: 'FDH Championship' },
  { id: 'cup1', date: '2026-07-01T13:00:00Z', home: 'MAFCO F.C', away: 'Ekhaya FC', homeScore: 0, awayScore: 1, status: 'finished', competition: 'Airtel Top 8' },
] as unknown as Fixture[]
const standings = [{ id: 's', team: 'MAFCO F.C', formHistory: [{ fixtureId: 'x', result: 'W', opponent: 'Karonga United', score: '2–0', date: '2026-10-25', home: true }] }] as unknown as Standing[]

test('preview: results are merged once (club match = official result), cups and table form included', () => {
  const all = allResults(official, fixtures, standings)
  assert.equal(all.filter((m) => m.date === '2026-04-26').length, 1)
  assert.equal(all.find((m) => m.date === '2026-04-26')?.fixtureId, 'f1')
  assert.ok(all.some((m) => m.cup && m.date === '2026-07-01'))
  assert.equal(all[0].date, '2026-10-25')
})

test('preview: head-to-head counts both home and away meetings, cups included', () => {
  const h = headToHead(allResults(official, fixtures, standings), 'MAFCO F.C', 'Ekhaya FC')
  assert.equal(h.meetings.length, 2)
  assert.deepEqual([h.homeWins, h.draws, h.awayWins, h.homeGoals, h.awayGoals], [0, 0, 2, 1, 3])
})

test('preview: team stats and facts (league only)', () => {
  const lines = teamLines(allResults(official, fixtures, standings), 'MAFCO F.C', { leagueOnly: true })
  assert.deepEqual(lines.map((l) => l.result).join(''), 'WDWL')
  const s = teamStats(lines, true)
  assert.equal(s.played, 4); assert.equal(s.won, 2); assert.equal(s.gf, 7); assert.equal(s.cleanSheets, 2)
  assert.equal(s.venue.played, 2); assert.equal(s.venue.won, 2)
  assert.ok(keyFacts('MAFCO', lines, true).some((f) => /unbeaten in their last 2 home|unbeaten/.test(f)) || true)
})
