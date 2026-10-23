// Fast checks for the app's core rules (no database needed). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMatchSnapshot, buildTeamsSnapshot, fingerprint, SNAPSHOT_MAX_BYTES } from '../../src/data/snapshotPayload.ts'
import type { Fixture } from '../../src/types.ts'
import { cardAlert, matchAlerts, newsAlert } from '../../src/utils/alertRules.ts'
import { isLiveNow, isPlayed } from '../../src/utils/football.ts'
import { currentEventMinute, matchMinute } from '../../src/utils/matchClock.ts'
import { autoStories } from '../../src/utils/stories.ts'
import { fanPointsTable, levelFor } from '../../src/utils/leaderboardCalc.ts'
import { parseVideo } from '../../src/utils/video.ts'
import { competitionLabel, competitionOf, isCupCompetition, matchesFilter } from '../../src/utils/competitions.ts'
import { cupStatus } from '../../src/utils/cupSeason.ts'
import { ekhayaOutcome } from '../../src/utils/football.ts'
import { rankPredictions } from '../../src/utils/leaderboardCalc.ts'

const fixture = (over: Partial<Fixture>): Fixture => ({ id: 'f', competition: 'TNM Super League', date: '2026-08-30T14:30:00+02:00', venue: null, home: 'Ekhaya FC', away: 'Mighty Wanderers', status: 'finished', homeScore: 2, awayScore: 1, ...over }) as Fixture

test('competitions: cups are recognised, everything else is league', () => {
  assert.equal(competitionOf('Airtel Top 8').id, 'airtel-top-8')
  assert.equal(competitionOf('castel cup').id, 'castel-cup')
  assert.equal(competitionOf('TNM Super League').kind, 'league')
  assert.equal(competitionOf(undefined).kind, 'league')
  assert.ok(isCupCompetition('AIRTEL TOP 8'))
  assert.ok(matchesFilter('Airtel Top 8', 'cups'))
  assert.ok(!matchesFilter('TNM Super League', 'cups'))
  assert.ok(matchesFilter('anything', 'all'))
  // Matches saved under the league's old name show its current name.
  assert.equal(competitionLabel('TNM Super League'), 'FDH Championship')
  assert.equal(competitionLabel('FDH Championship'), 'FDH Championship')
  assert.equal(competitionLabel('Airtel Top 8'), 'Airtel Top 8')
})

test('results: W/D/L from Ekhaya\'s point of view', () => {
  assert.equal(ekhayaOutcome(fixture({})), 'W')
  assert.equal(ekhayaOutcome(fixture({ home: 'Silver Strikers', away: 'Ekhaya FC', homeScore: 3, awayScore: 0 })), 'L')
  assert.equal(ekhayaOutcome(fixture({ homeScore: 1, awayScore: 1 })), 'D')
  assert.equal(ekhayaOutcome(fixture({ status: 'upcoming' })), null)
})

test('cups: winning the final makes Ekhaya champions', () => {
  const run = [fixture({ round: 'Semi-final' }), fixture({ round: 'Final' })]
  assert.match(cupStatus(run).label, /Champions/)
  assert.equal(cupStatus([fixture({ round: 'Final', homeScore: 0, awayScore: 1 })]).label, 'Runners-up')
  assert.equal(cupStatus([]).label, 'No matches yet')
  assert.match(cupStatus([fixture({ round: 'Final', homeScore: 1, awayScore: 1, note: 'Ekhaya won 5–4 on penalties' })]).label, /Champions/)
})

test('prediction league: 3 for exact, 1 for result, ties share a rank', () => {
  const rows = rankPredictions([{ id: 'm1', homeScore: 2, awayScore: 1 }], [
    { uid: 'a', fixtureId: 'm1', home: 2, away: 1, name: 'Ann', updatedAt: 1 },
    { uid: 'b', fixtureId: 'm1', home: 1, away: 0, name: 'Ben', updatedAt: 1 },
    { uid: 'c', fixtureId: 'm1', home: 3, away: 2, name: 'Cat', updatedAt: 1 },
    { uid: 'd', fixtureId: 'm1', home: 0, away: 0, name: 'Dan', updatedAt: 1 },
  ])
  assert.deepEqual(rows.map((row) => [row.name, row.points, row.rank]), [['Ann', 3, 1], ['Ben', 1, 2], ['Cat', 1, 2], ['Dan', 0, 4]])
})

test('alerts: kick-off, goal and full time fire once, test matches never', () => {
  const base = { id: 'm1', home: 'Ekhaya FC', away: 'Blue Eagles' }
  assert.equal(matchAlerts({ ...base, status: 'upcoming' }, { ...base, status: 'live' })[0]?.title, 'Kick-off! Ekhaya FC v Blue Eagles')
  assert.match(matchAlerts({ ...base, status: 'live', homeScore: 0, awayScore: 0 }, { ...base, status: 'live', homeScore: 1, awayScore: 0 })[0]?.title ?? '', /^GOAL!/)
  assert.match(matchAlerts({ ...base, status: 'live' }, { ...base, status: 'finished' })[0]?.title ?? '', /^Full time/)
  assert.equal(matchAlerts({ ...base, status: 'upcoming' }, { ...base, status: 'live', isTest: true }).length, 0)
  assert.equal(matchAlerts(undefined, { ...base, status: 'finished' }).length, 0)
  // Team news fires once when the XI is confirmed before kick-off.
  assert.equal(matchAlerts({ ...base, status: 'upcoming' }, { ...base, status: 'upcoming', lineupConfirmed: true, formation: '4-3-3' })[0]?.title, 'Team news is in!')
  assert.equal(matchAlerts({ ...base, status: 'upcoming', lineupConfirmed: true }, { ...base, status: 'upcoming', lineupConfirmed: true }).length, 0)
  // Editing a finished match never alerts fans: reopening, goals while editing, or saving.
  assert.equal(matchAlerts({ ...base, status: 'finished' }, { ...base, status: 'live', editing: true }).length, 0)
  assert.equal(matchAlerts({ ...base, status: 'live', editing: true, homeScore: 0 }, { ...base, status: 'live', editing: true, homeScore: 1 }).length, 0)
  assert.equal(matchAlerts({ ...base, status: 'live', editing: true }, { ...base, status: 'finished' }).length, 0)
  assert.ok(newsAlert({ status: 'draft' }, { id: 'n', status: 'published', title: 'Hi' }))
  assert.equal(newsAlert({ status: 'published' }, { id: 'n', status: 'published', title: 'Hi' }), null)
})

test('shared snapshot: hides admin-only fields and test matches', () => {
  const built = buildMatchSnapshot({
    fixtures: [{ id: 'b', statsAppliedChanges: { x: 1 }, home: 'A' }, { id: 'a', home: 'B' }, { id: 't', isTest: true }],
    standings: [{ id: 's', points: 3 }],
  })
  const fixtures = built.doc.fixtures as Array<Record<string, unknown>>
  assert.deepEqual(fixtures.map((row) => row.id), ['a', 'b'])
  assert.ok(!('statsAppliedChanges' in fixtures[1]))
  assert.ok(!('teams' in built.doc))
})

test('shared snapshot: two admins always agree on the fingerprint (no rewrite loop)', () => {
  const one = buildMatchSnapshot({ fixtures: [{ id: 'a', home: 'B', away: 'C', kickoffAt: { toMillis: () => 5 } }], standings: [] })
  const two = buildMatchSnapshot({ fixtures: [{ away: 'C', kickoffAt: { toMillis: () => 5 }, id: 'a', home: 'B' }], standings: [] })
  assert.equal(one.hash, two.hash)
  assert.notEqual(fingerprint({ a: 1 }).hash, fingerprint({ a: 2 }).hash)
})

test('shared snapshot: switches itself off when too big (fans read directly)', () => {
  const big = 'x'.repeat(SNAPSHOT_MAX_BYTES)
  assert.equal(buildTeamsSnapshot([{ id: 't', logoDataUrl: big }]).doc.disabled, true)
  assert.equal(buildMatchSnapshot({ fixtures: [{ id: 'a', note: big }], standings: [] }).doc.disabled, true)
  assert.equal(buildTeamsSnapshot([{ id: 't', name: 'Ekhaya FC' }]).doc.disabled, undefined)
})

test('formations: keeper first, then lines from defence to attack', async () => {
  const { arrangeFormation, FORMATIONS } = await import('../../src/utils/formations.ts')
  const xi = [
    { id: 'f1', position: 'FWD' }, { id: 'g', position: 'GK' }, { id: 'd1', position: 'DEF' }, { id: 'm1', position: 'MID' },
    { id: 'd2', position: 'DEF' }, { id: 'm2', position: 'MID' }, { id: 'd3', position: 'DEF' }, { id: 'f2', position: 'FWD' },
    { id: 'm3', position: 'MID' }, { id: 'd4', position: 'DEF' }, { id: 'u', position: null },
  ]
  const lines = arrangeFormation(xi, '4-3-3')
  assert.deepEqual(lines.map((line) => line.length), [1, 4, 3, 3])
  assert.equal(lines[0][0].id, 'g')
  assert.deepEqual(lines[1].map((p) => p.id), ['d1', 'd2', 'd3', 'd4'])
  assert.deepEqual(arrangeFormation(xi, '3-5-2').map((line) => line.length), [1, 3, 5, 2])
  // Every formation uses exactly 10 outfield players.
  for (const f of FORMATIONS) assert.equal(f.split('-').map(Number).reduce((a, b) => a + b, 0), 10, f)
})

test('team sheet: 11 places in formation order, drawn where the coach put them', async () => {
  const { slotRoles, linesBySlot } = await import('../../src/utils/formations.ts')
  assert.deepEqual(slotRoles('4-3-3'), ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'])
  assert.deepEqual(slotRoles('4-2-3-1').filter((r) => r === 'MID').length, 5)
  assert.equal(slotRoles('5-4-1').length, 11)
  const xi = Array.from({ length: 11 }, (_, i) => `p${i}`)
  assert.deepEqual(linesBySlot(xi, '4-4-2'), [['p0'], ['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8'], ['p9', 'p10']])
})

test('a match being edited after full time still counts as a result for fans', () => {
  const f = { id: 'x', home: 'Ekhaya FC', away: 'Blue Eagles', date: '2026-10-01T13:00:00Z', competition: 'FDH Championship' }
  assert.equal(isPlayed({ ...f, status: 'live', editing: true }), true)
  assert.equal(isLiveNow({ ...f, status: 'live', editing: true }), false)
  assert.equal(isLiveNow({ ...f, status: 'live' }), true)
  assert.equal(isPlayed({ ...f, status: 'live' }), false)
})

test('match clock: events are recorded at the minute fans see, also after first-half stoppage time', () => {
  const base = { id: 'c', home: 'Ekhaya FC', away: 'Blue Eagles', date: '2026-10-01T13:00:00Z', competition: 'FDH Championship', status: 'live' as const }
  // First half ran 48 minutes; 10 minutes into the second half.
  const second = { ...base, period: 'second-half' as const, firstHalfSeconds: 48 * 60, clockElapsedSeconds: 48 * 60 + 10 * 60 - 30 }
  assert.equal(matchMinute(second as never), "55'")
  assert.equal(currentEventMinute(second as never), 55)
  assert.equal(currentEventMinute({ ...base, period: 'first-half', clockElapsedSeconds: 22 * 60 + 5 } as never), 23)
  // Never above the form limit, or the browser refuses to save the event.
  assert.equal(currentEventMinute({ ...base, period: 'first-half', clockElapsedSeconds: 500 * 60 } as never), 130)
})

test('stories: live score, team news, next match and full time come from the fixtures', () => {
  const now = Date.parse('2026-10-17T08:00:00Z')
  const f = (o: Record<string, unknown>) => ({ competition: 'FDH Championship', venue: 'Chiwembe Stadium', ...o }) as never
  const fixtures = [
    f({ id: 'next', home: 'Ekhaya FC', away: 'Blue Eagles', date: '2026-10-18T12:30:00Z', status: 'upcoming', lineupConfirmed: true, startingPlayerIds: ['a', 'b'], formation: '4-3-3' }),
    f({ id: 'last', home: 'Ekhaya FC', away: 'Kamuzu Barracks', date: '2026-10-15T12:30:00Z', status: 'finished', homeScore: 2, awayScore: 0 }),
    f({ id: 'old', home: 'Silver Strikers', away: 'Ekhaya FC', date: '2026-09-01T12:30:00Z', status: 'finished', homeScore: 1, awayScore: 1 }),
    f({ id: 'practice', home: 'Ekhaya FC', away: 'Practice XI', date: '2026-10-17T07:00:00Z', status: 'live', isTest: true }),
  ]
  const labels = autoStories(fixtures, now).map((story) => story.label)
  assert.deepEqual(labels, ['Team news', 'Next match', 'Full time'])
  const live = autoStories([f({ id: 'l', home: 'Ekhaya FC', away: 'Red Lions', date: '2026-10-17T07:30:00Z', status: 'live', homeScore: 1, awayScore: 0 })], now)
  assert.equal(live[0].label, 'LIVE')
  assert.equal(live[0].title, 'Ekhaya FC 1–0 Red Lions')
})

test('fan points: predictions, votes, check-ins and invites add up; levels follow the points', () => {
  const rows = fanPointsTable({
    predictionPoints: [{ uid: 'a', points: 4, name: 'Amos' }],
    motmVoters: ['a', 'b', 'b'],
    pollVoters: ['b'],
    checkIns: [{ uid: 'c', name: 'Chikondi' }, { uid: 'a' }],
    inviters: ['c', 'c'],
    names: { b: 'Bertha' },
  })
  // a: 4 + 2 (vote) + 5 (check-in) = 11; b: 2 votes x2 + 1 poll = 5; c: 5 + 2 invites x10 = 25
  assert.deepEqual(rows.map((row) => [row.name, row.points, row.rank, row.level]), [['Chikondi', 25, 1, 'Supporter'], ['Amos', 11, 2, 'Rookie'], ['Bertha', 5, 3, 'Rookie']])
  assert.equal(levelFor(0).name, 'Rookie')
  assert.equal(levelFor(100).name, 'Ultra')
  assert.equal(levelFor(250).next, null)
  assert.deepEqual(levelFor(60).next, { name: 'Ultra', from: 100 })
})

test('videos: YouTube and Facebook links are understood, anything else is refused', () => {
  for (const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ']) {
    assert.equal(parseVideo(link)?.id, 'dQw4w9WgXcQ', link)
  }
  assert.equal(parseVideo('https://youtube.com/shorts/dQw4w9WgXcQ')?.portrait, true)
  assert.equal(parseVideo('https://www.facebook.com/EkhayaFC/videos/123456789/')?.provider, 'facebook')
  assert.equal(parseVideo('https://fb.watch/abcDEF123/')?.provider, 'facebook')
  assert.equal(parseVideo('https://www.facebook.com/EkhayaFC'), null)
  assert.equal(parseVideo('https://example.com/video.mp4'), null)
  assert.equal(parseVideo('not a link'), null)
})

test('card alerts: one per card in a live Ekhaya match, never for practice or other matches', () => {
  const live = { id: 'm1', home: 'Ekhaya FC', away: 'Blue Eagles', status: 'live' as const, homeScore: 1, awayScore: 0, kickoffAt: { seconds: 5 } as never }
  const yellow = cardAlert(live, { id: 'e1', kind: 'card', card: 'yellow', minute: 40, team: 'Blue Eagles', playerName: 'No. 6' })
  assert.ok(yellow && yellow.title.includes('Yellow card') && yellow.title.includes("40'") && yellow.body.includes('Ekhaya FC 1–0 Blue Eagles'))
  const red = cardAlert(live, { id: 'e2', kind: 'card', card: 'red', minute: 61, team: 'Ekhaya FC', playerName: 'Charles Mafaiti' })
  assert.ok(red && red.title.includes('Red card') && red.key !== yellow?.key)
  assert.equal(cardAlert({ ...live, isTest: true }, { id: 'e3', kind: 'card', card: 'red', minute: 1, team: 'Ekhaya FC' }), null)
  assert.equal(cardAlert({ ...live, home: 'Red Lions', away: 'Blue Eagles' }, { id: 'e4', kind: 'card', card: 'red', minute: 1, team: 'Red Lions' }), null)
  assert.equal(cardAlert(live, { id: 'e5', kind: 'goal', minute: 1, team: 'Ekhaya FC' }), null)
})

test('official results rebuild the week 17 table and form exactly', async () => {
  const { OFFICIAL_RESULTS } = await import('../../src/data/leagueResults2026')
  const { computeTable, norm, parseResults } = await import('../../src/utils/leagueTable')
  const { readFileSync } = await import('node:fs')
  const data = JSON.parse(readFileSync(new URL('../../ekhaya-data.json', import.meta.url), 'utf8'))
  const table = computeTable(OFFICIAL_RESULTS)
  assert.equal(OFFICIAL_RESULTS.length, 136)
  for (const row of data.standings) {
    const c = table.get(norm(row.team))
    assert.ok(c, row.team)
    assert.deepEqual([c.played, c.won, c.drawn, c.lost, c.goalsFor, c.goalsAgainst, c.points], [row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, row.points], row.team)
    assert.deepEqual(c.history.slice(-5).map((item) => item.result), row.form, `${row.team} form`)
  }
  const ekhaya = table.get(norm('Ekhaya FC'))
  assert.equal(ekhaya?.history.at(-1)?.opponent, 'Red Lions')
  const parsed = parseResults('Creck Sporting 2-1 Red Lions\nKaronga Utd 0 – 3 Mighty Wanderers\nnonsense', data.standings.map((row: { team: string }) => row.team), '2026-10-25')
  assert.equal(parsed[0].result?.homeScore, 2)
  assert.equal(parsed[1].result?.home, 'Karonga United')
  assert.ok(parsed[2].problem)
})

test('a pasted result for a match already counted is not counted twice', async () => {
  const { sameMatch } = await import('../../src/utils/leagueTable')
  assert.ok(sameMatch({ date: '2026-10-18', home: 'Red Lions', away: 'Ekhaya FC' }, { date: '2026-10-24', home: 'Red Lions', away: 'Ekhaya FC' }))
  assert.ok(!sameMatch({ date: '2026-05-02', home: 'Ekhaya FC', away: 'Red Lions' }, { date: '2026-10-18', home: 'Red Lions', away: 'Ekhaya FC' }))
})

test('a Flashscore copy of Ekhaya results is read and matches the official results', async () => {
  const { OFFICIAL_RESULTS } = await import('../../src/data/leagueResults2026')
  const { parseResults, sameMatch } = await import('../../src/utils/leagueTable')
  const { readFileSync } = await import('node:fs')
  const data = JSON.parse(readFileSync(new URL('../../ekhaya-data.json', import.meta.url), 'utf8'))
  const text = readFileSync(new URL('./flashscore-ekhaya.txt', import.meta.url), 'utf8')
  const parsed = parseResults(text, data.standings.map((row: { team: string }) => row.team), '2026-10-25')
  assert.equal(parsed.length, 17)
  for (const item of parsed) {
    assert.ok(item.result, item.problem ?? item.line)
    const official = OFFICIAL_RESULTS.find((other) => sameMatch(other, item.result!))
    assert.ok(official, item.line)
    assert.deepEqual([official.homeScore, official.awayScore, official.date], [item.result!.homeScore, item.result!.awayScore, item.result!.date], item.line)
  }
})

test('pressing added time early does not jump the clock to 90+', () => {
  const now = Date.now()
  const fixture = { period: 'second-half', firstHalfSeconds: 2988, clockElapsedSeconds: 2988 + 20 * 60 + 1, periodStartedAt: { toMillis: () => now }, addedTime: 1 }
  assert.equal(matchMinute(fixture as never, now), "66'")
  const late = { ...fixture, clockElapsedSeconds: 2988 + 46 * 60 }
  assert.equal(matchMinute(late as never, now), "90+1'")
})
