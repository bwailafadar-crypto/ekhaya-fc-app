// Loads a match report file (data/matches/*.json: official line-up and minutes
// played) into the live app. GPS data is never loaded into the fan app.
//   node scripts/load-match-report.cjs data/matches/<file>.json          -> preview only
//   node scripts/load-match-report.cjs data/matches/<file>.json --apply  -> save
//
// What it does:
//  - adds players from the line-up who are missing from the squad, and fills
//    shirt numbers that are empty (an existing different number is only reported);
//  - saves the line-up (starters + bench) and the official minutes on the match;
//  - if the match is finished and its stats were counted, corrects each
//    player's appearances, starts and minutes so they match the official sheet
//    (goals, assists and cards are not touched) - running it twice changes nothing;
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/load-match-report.cjs data/matches/<file>.json [--apply]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const report = JSON.parse(fs.readFileSync(file, 'utf8'))

const norm = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
const EMPTY_STATS = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }
const KEYS = ['appearances', 'starts', 'minutes']

async function main() {
  console.log(apply ? `SAVING ${report.match}` : `PREVIEW - ${report.match} (nothing is changed)`)
  const fixtureRef = db.collection('fixtures').doc(report.fixtureId)
  const fixtureSnap = await fixtureRef.get()
  if (!fixtureSnap.exists) throw new Error(`Match ${report.fixtureId} is not in the app.`)
  const fixture = fixtureSnap.data()
  console.log(`\nMatch in the app: ${fixture.home} ${fixture.homeScore ?? '-'}-${fixture.awayScore ?? '-'} ${fixture.away} [${fixture.status}] at ${fixture.venue || 'venue not set'}`)

  // 1. Squad: match every line-up name to a live player.
  const live = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
  const idFor = new Map()
  const additions = []
  const numberFixes = []
  console.log('\nSquad:')
  for (const row of report.lineup) {
    const match = live.find((p) => p.id === row.playerId) || live.find((p) => norm(p.name) === norm(row.name))
    if (!match) {
      additions.push(row)
      idFor.set(row.playerId, row.playerId)
      console.log(`  + add ${row.name} #${row.number} (${row.position})`)
      continue
    }
    idFor.set(row.playerId, match.id)
    if (match.number == null && row.number != null) { numberFixes.push({ ref: match.ref, number: row.number }); console.log(`  ~ ${match.name}: shirt number set to ${row.number}`) }
    else if (row.number != null && match.number !== row.number) console.log(`  ! ${match.name}: app has #${match.number}, sheet says #${row.number} (not changed - fix in Admin if the sheet is right)`)
  }
  if (!additions.length && !numberFixes.length) console.log('  everyone is already in the squad')

  // 2. Line-up and official minutes on the match.
  const starters = report.lineup.filter((r) => r.started).map((r) => idFor.get(r.playerId))
  const bench = report.lineup.filter((r) => !r.started).map((r) => idFor.get(r.playerId))
  const officialMinutes = Object.fromEntries(report.lineup.filter((r) => r.minutes > 0).map((r) => [idFor.get(r.playerId), r.minutes]))
  console.log(`\nLine-up: ${starters.length} starters, ${bench.length} on the bench, ${Object.keys(officialMinutes).length} played`)

  // 3. Season stats (only when the app already counted this match).
  const statChanges = []
  let newApplied = null
  if (fixture.status === 'finished' && fixture.statsApplied === true && !fixture.statsSkipped) {
    const applied = fixture.statsAppliedChanges?.players ?? {}
    const target = {}
    for (const r of report.lineup) {
      if (r.minutes <= 0) continue
      target[idFor.get(r.playerId)] = { appearances: 1, starts: r.started ? 1 : 0, minutes: r.minutes }
    }
    newApplied = JSON.parse(JSON.stringify(applied))
    for (const id of new Set([...Object.keys(applied), ...Object.keys(target)])) {
      const had = applied[id] ?? {}
      const want = target[id] ?? { appearances: 0, starts: 0, minutes: 0 }
      const diff = Object.fromEntries(KEYS.map((k) => [k, Number(want[k] ?? 0) - Number(had[k] ?? 0)]).filter(([, v]) => v !== 0))
      if (!Object.keys(diff).length) continue
      statChanges.push({ id, diff })
      const next = { ...(newApplied[id] ?? {}) }
      for (const k of KEYS) { if (want[k]) next[k] = want[k]; else delete next[k] }
      if (Object.keys(next).length) newApplied[id] = next; else delete newApplied[id]
    }
    console.log(`\nSeason stats: ${statChanges.length ? `${statChanges.length} player(s) corrected to the official minutes` : 'already match the official sheet'}`)
    const nameOf = (id) => live.find((p) => p.id === id)?.name ?? report.lineup.find((r) => idFor.get(r.playerId) === id)?.name ?? id
    statChanges.forEach(({ id, diff }) => console.log(`  ${nameOf(id).padEnd(22)} ${Object.entries(diff).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`))
  } else if (fixture.status === 'finished') {
    console.log('\nSeason stats: this result was not counted by the app (imported), so player totals are not changed.')
  } else {
    console.log('\nSeason stats: the match is not finished in the app yet. When you finish it, the official minutes above are used.')
  }

  for (const note of report.notes ?? []) console.log(`\nNote: ${note}`)

  if (!apply) { console.log('\nRun again with --apply to save.'); return }

  const batch = db.batch()
  for (const row of additions) {
    batch.set(db.collection('players').doc(row.playerId), {
      name: row.name, number: row.number ?? null, team: 'senior', position: row.appPosition ?? null, dob: null,
      nationality: 'Malawian', preferredFoot: null, heightCm: null, photoDataUrl: null, stats: { ...EMPTY_STATS },
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
  }
  for (const fix of numberFixes) batch.update(fix.ref, { number: fix.number, updatedAt: FieldValue.serverTimestamp() })
  for (const { id, diff } of statChanges) {
    const current = live.find((p) => p.id === id)?.stats ?? { ...EMPTY_STATS }
    const stats = { ...EMPTY_STATS, ...current }
    for (const [k, v] of Object.entries(diff)) stats[k] = Math.max(0, Number(stats[k] ?? 0) + v)
    batch.set(db.collection('players').doc(id), { stats, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  }
  batch.update(fixtureRef, {
    startingPlayerIds: starters, benchPlayerIds: bench, lineupConfirmed: true, officialMinutes,
    ...(newApplied ? { 'statsAppliedChanges.players': newApplied } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log('\nDone. Fans see the line-up and minutes straight away.')
}

main().catch((error) => { console.error('Match report failed:', error.message); process.exit(1) })
