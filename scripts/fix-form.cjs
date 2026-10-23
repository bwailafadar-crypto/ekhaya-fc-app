// Puts every team's last-5 form (and the match behind each letter, and the
// next match) into the live table, worked out from the league results:
// the official results (src/data/leagueResults2026.ts), results added in
// Admin → Table → Form tracker, and Ekhaya's finished matches.
// Only form, formHistory and next are written; points and positions are
// reported if they differ, never changed.
//   node scripts/fix-form.cjs          -> preview only
//   node scripts/fix-form.cjs --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)

const norm = (name) => String(name).toLowerCase().replace(/\butd\b/g, 'united').replace(/\bf\.?c\.?\b/g, '').replace(/[^a-z]/g, '')
const sameMatch = (a, b) => Math.abs(new Date(a.date.slice(0, 10)) - new Date(b.date.slice(0, 10))) / 86400000 <= 150 && norm(a.home) === norm(b.home) && norm(a.away) === norm(b.away)

function officialFile() {
  const text = fs.readFileSync(path.resolve('src/data/leagueResults2026.ts'), 'utf8')
  const results = [...text.matchAll(/R\((\d+), '([\d-]+)', '([^']+)', (\d+), (\d+), '([^']+)'\)/g)].map((m) => ({ id: `${m[2]}-${m[3]}-${m[6]}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), date: m[2], home: m[3], homeScore: Number(m[4]), awayScore: Number(m[5]), away: m[6] }))
  const next = [...text.matchAll(/\{ week: \d+, date: '([\d-]+)', home: '([^']+)', away: '([^']+)', venue: '([^']+)' \}/g)].map((m) => ({ date: m[1], home: m[2], away: m[3], venue: m[4] }))
  return { results, next }
}

async function main() {
  const { results: official, next: nextOfficial } = officialFile()
  const [standingsSnap, fixturesSnap, addedSnap, addedFixturesSnap] = await Promise.all(['standings', 'fixtures', 'leagueResults', 'leagueFixtures'].map((name) => db.collection(name).get()))
  const fixtures = fixturesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const isCup = (f) => /cup|top 8|airtel|charity|trophy|shield|friendly/i.test(String(f.competition ?? ''))
  const results = [...official]
  for (const doc of addedSnap.docs) { const r = doc.data(); if (!results.some((o) => sameMatch(o, r))) results.push({ id: doc.id, ...r }) }
  for (const f of fixtures) {
    if (f.isTest || f.status !== 'finished' || isCup(f) || f.homeScore == null || f.awayScore == null) continue
    const r = { id: f.id, date: String(f.date).slice(0, 10), home: f.home, away: f.away, homeScore: Number(f.homeScore), awayScore: Number(f.awayScore) }
    if (!results.some((o) => sameMatch(o, r))) results.push(r)
  }
  const table = new Map()
  for (const m of [...results].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [team, gf, ga, opponent, home] of [[m.home, m.homeScore, m.awayScore, m.away, true], [m.away, m.awayScore, m.homeScore, m.home, false]]) {
      const key = norm(team)
      if (!table.has(key)) table.set(key, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, history: [] })
      const r = table.get(key)
      const result = gf > ga ? 'W' : gf === ga ? 'D' : 'L'
      r.played++; r.goalsFor += gf; r.goalsAgainst += ga
      if (result === 'W') { r.won++; r.points += 3 } else if (result === 'D') { r.drawn++; r.points++ } else r.lost++
      r.history.push({ fixtureId: m.id, result, opponent, score: `${gf}–${ga}`, date: m.date, home })
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = [
    ...fixtures.filter((f) => f.status === 'upcoming' && !f.isTest && !isCup(f)).map((f) => ({ date: String(f.date).slice(0, 10), home: f.home, away: f.away, venue: f.venue || undefined })),
    ...addedFixturesSnap.docs.map((doc) => doc.data()),
    ...nextOfficial,
  ]
  const nextFor = (team) => {
    const n = upcoming.filter((f) => (norm(f.home) === norm(team) || norm(f.away) === norm(team)) && f.date >= today && !results.some((r) => sameMatch(r, f))).sort((a, b) => a.date.localeCompare(b.date))[0]
    return n ? { opponent: norm(n.home) === norm(team) ? n.away : n.home, date: n.date, home: norm(n.home) === norm(team), ...(n.venue ? { venue: n.venue } : {}) } : null
  }

  say(`${apply ? 'SAVING' : 'PREVIEW'}: form from ${results.length} league results`)
  const batch = db.batch()
  let changed = 0
  for (const doc of standingsSnap.docs) {
    const row = doc.data()
    const c = table.get(norm(row.team))
    if (!c) { say(`${row.team}: no results found, left alone`); continue }
    const numbers = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'].filter((k) => Number(row[k] ?? 0) !== c[k])
    if (numbers.length) say(`${row.team}: numbers differ from the results (${numbers.map((k) => `${k} ${row[k]}→${c[k]}`).join(', ')}) - not changed`)
    const form = c.history.slice(-5).map((h) => h.result)
    const before = (row.form ?? []).join('')
    if (before !== form.join('')) say(`${row.team}: form ${before || '-'} → ${form.join('')} (oldest → newest)`)
    batch.set(doc.ref, { form, formHistory: c.history.slice(-5), next: nextFor(row.team), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    changed++
  }
  if (apply) { await batch.commit(); say(`Saved form, match details and next match for ${changed} teams.`) }
  else say(`Nothing saved. ${changed} teams would get form details. Run again with --apply to save.`)
}

main().catch((error) => { console.error(error); process.exit(1) })
