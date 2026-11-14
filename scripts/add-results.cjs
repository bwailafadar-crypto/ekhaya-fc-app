// Adds league results (one per line: "Home 2-1 Away", optional YYYY-MM-DD)
// to leagueResults and rebuilds the whole table from all results: points,
// order (▲▼), form with the match behind each letter, and next matches.
// Results already counted (official list, earlier additions, Ekhaya's
// finished matches) are skipped.
//   RESULTS="..." node scripts/add-results.cjs          -> preview only
//   RESULTS="..." node scripts/add-results.cjs --apply  -> save
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
  // Men's league rebuild only — never touch women's standings rows.
  const mensStandings = standingsSnap.docs.filter((doc) => (doc.data().squad ?? 'men') === 'men')
  const teamNames = mensStandings.map((doc) => doc.data().team)
  const ALIAS = { civoutd: 'Civil Service United', civilservice: 'Civil Service United', csu: 'Civil Service United', dedzadynamos: 'Goshen City Dedza Dynamos', gcdedzadynamos: 'Goshen City Dedza Dynamos', bigbullets: 'FCB Nyasa Big Bullets', bullets: 'FCB Nyasa Big Bullets', mitundu: 'Luanar Mitundu', luanar: 'Luanar Mitundu', mafco: 'MAFCO F.C', creck: 'Creck Sporting', crecksc: 'Creck Sporting', moyale: 'Moyale Barracks', kb: 'Kamuzu Barracks' }
  const known = (raw) => { const n = norm(ALIAS[norm(raw)] || raw); return teamNames.find((t) => norm(t) === n) || teamNames.find((t) => norm(t).includes(n) || n.includes(norm(t))) }
  const today0 = new Date().toISOString().slice(0, 10)
  const fresh = []
  for (const line of String(process.env.RESULTS || '').split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
    const date = (line.match(/\d{4}-\d{2}-\d{2}/) || [today0])[0]
    const m = line.replace(/\d{4}-\d{2}-\d{2}/, '').trim().match(/^(.+?)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\s+(.+)$/)
    const home = m && known(m[1].trim()); const away = m && known(m[4].trim())
    if (!home || !away) { say(`Not understood (skipped): ${line}`); continue }
    const r = { id: `${date}-${home}-${away}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), week: 0, date, home, away, homeScore: Number(m[2]), awayScore: Number(m[3]) }
    if (results.some((o) => sameMatch(o, r))) { const o = results.find((x) => sameMatch(x, r)); say(`Already counted: ${o.home} ${o.homeScore}-${o.awayScore} ${o.away} (${o.date})${o.homeScore !== r.homeScore || o.awayScore !== r.awayScore ? ' ⚠ DIFFERENT SCORE pasted: ' + r.homeScore + '-' + r.awayScore : ''}`); continue }
    fresh.push(r); results.push(r); say(`New: ${home} ${r.homeScore}-${r.awayScore} ${away} (${date})`)
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

  const ordered = mensStandings.map((doc) => ({ doc, row: doc.data(), c: table.get(norm(doc.data().team)) })).filter((x) => x.c)
    .sort((a, b) => b.c.points - a.c.points || (b.c.goalsFor - b.c.goalsAgainst) - (a.c.goalsFor - a.c.goalsAgainst) || b.c.goalsFor - a.c.goalsFor || a.row.team.localeCompare(b.row.team))
  say(`${apply ? 'SAVING' : 'PREVIEW'}: table from ${results.length} results (${fresh.length} new)`)
  const batch = db.batch()
  fresh.forEach((r) => batch.set(db.collection('leagueResults').doc(r.id), { ...r, createdAt: FieldValue.serverTimestamp() }))
  ordered.forEach(({ doc, row, c }, index) => {
    const form = c.history.slice(-5).map((h) => h.result)
    say(`${index + 1}. ${row.team}  P${c.played} W${c.won} D${c.drawn} L${c.lost} ${c.goalsFor}:${c.goalsAgainst} ${c.points}pts  form ${form.join('')}${row.position !== index + 1 ? `  (was ${row.position})` : ''}${row.points !== c.points ? `  (pts were ${row.points})` : ''}`)
    batch.set(doc.ref, { position: index + 1, previousPosition: row.position ?? index + 1, played: c.played, won: c.won, drawn: c.drawn, lost: c.lost, goalsFor: c.goalsFor, goalsAgainst: c.goalsAgainst, goalDifference: c.goalsFor - c.goalsAgainst, points: c.points, form, formHistory: c.history.slice(-5), next: nextFor(row.team), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
  if (apply) { await batch.commit(); say(`Saved ${fresh.length} result(s) and the table.`) }
  else say('Nothing saved. Run with apply to save.')
}

main().catch((error) => { console.error(error); process.exit(1) })
