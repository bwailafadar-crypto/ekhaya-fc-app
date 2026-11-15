// Seeds the Ekhaya women's team ("The Cowgirls"): squad, known results, the
// official Southern Region FAM Women's League table, and goal scorers. Everything
// is tagged squad:'women' so it only shows under the Women's section. Idempotent.
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const zeroStats = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }

// Full squad from the lineup v Allan Ladies (real names and numbers).
// Goals carried from the Golden Boot graphic for the known scorers.
const players = [
  // Starting XI
  { id: 'women-chakalamba-0', name: 'Scolastica Chakalamba', n: 0, pos: 'GK' },
  { id: 'women-mwalilino-20', name: 'Precious Mwalilino', n: 20 },
  { id: 'women-mugwa-12', name: 'Eliza Mugwa', n: 12 },
  { id: 'women-genala-17', name: 'Wonderful Genala', n: 17 },
  { id: 'women-fabiano-66', name: 'Eneless Fabiano', n: 66, pos: 'FWD', goals: 6, apps: 2 },
  { id: 'women-chinkusa-8', name: 'Stella Chinkusa', n: 8, captain: true },
  { id: 'women-nzokomela-4', name: 'Patuma Nzokomela', n: 4 },
  { id: 'women-carlos-6', name: 'Nirza Carlos', n: 6 },
  { id: 'women-lloyd-13', name: 'Evelyn Lloyd', n: 13 },
  { id: 'women-kayira', name: 'Joyce Kayira', n: null },
  { id: 'women-issa-15', name: 'Tema Issa', n: 15, goals: 1, apps: 2 },
  // Substitutes
  { id: 'women-bwitubwitu-99', name: 'Fortune Bwitubwitu', n: 99, pos: 'GK' },
  { id: 'women-munthali-47', name: 'Kettie Munthali', n: 47 },
  { id: 'women-moses-22', name: 'Eunice Moses', n: 22, goals: 1, apps: 2 },
  { id: 'women-jonathan-30', name: 'Agness Jonathan', n: 30 },
  { id: 'women-nthambo-9', name: 'Catherine Nthambo', n: 9 },
  { id: 'women-dafter-14', name: 'Mirriam Dafter', n: 14 },
  { id: 'women-john-48', name: 'Sina John', n: 48 },
  { id: 'women-mwale-21', name: 'Rabecca Mwale', n: 21 },
]

// Played results (Ekhaya's two wins), dates from the FAM first-round fixture list.
const results = [
  { id: 'w-2026-11-01-ekhaya-bangwe', date: '2026-11-01', time: '10:00', home: 'Ekhaya Women', away: 'Bangwe All Stars', homeScore: 3, awayScore: 0, venue: 'Mpira Stadium' },
  { id: 'w-2026-11-07-fomo-ekhaya', date: '2026-11-07', time: '14:00', home: 'Fomo FC', away: 'Ekhaya Women', homeScore: 0, awayScore: 6, venue: 'Mulanje Park' },
]

// Ekhaya's upcoming fixtures (weeks 3–7) from the FAM first-round fixture list.
const upcoming = [
  { id: 'w-2026-11-15-allan-ekhaya', date: '2026-11-15', time: '14:30', home: 'Allan Ladies', away: 'Ekhaya Women', venue: 'Works Ground' },
  { id: 'w-2026-11-21-ekhaya-nsuwadzi', date: '2026-11-21', time: '11:00', home: 'Ekhaya Women', away: 'Nsuwadzi Queens', venue: 'Mpira Stadium' },
  { id: 'w-2026-11-28-ekhaya-sitima', date: '2026-11-28', time: '10:00', home: 'Ekhaya Women', away: 'Sitima YCE', venue: 'Mpira Stadium' },
  { id: 'w-2026-12-05-emmanuel-ekhaya', date: '2026-12-05', time: '14:00', home: 'Emmanuel Bullets', away: 'Ekhaya Women', venue: 'St. Mathews Stadium' },
  { id: 'w-2026-12-12-ndirande-ekhaya', date: '2026-12-12', time: '14:00', home: 'Ndirande Soccer Giants', away: 'Ekhaya Women', venue: 'Nyambadwe Ground' },
]

// Official Southern Region FAM Women's League table (2026). W/D/L derived from
// points over 2 games; the graphic publishes only P, GD and Pts.
const wdl = (pts) => pts === 6 ? [2, 0, 0] : pts === 3 ? [1, 0, 1] : [0, 0, 2]
const standings = [
  { id: 'women-ekhaya-fc', team: 'Ekhaya Women', position: 1, gd: 9, points: 6, gf: 9, ga: 0 },
  { id: 'women-allan-ladies', team: 'Allan Ladies', position: 2, gd: 3, points: 6 },
  { id: 'women-nsuwadzi-queens', team: 'Nsuwadzi Queens', position: 3, gd: 2, points: 3 },
  { id: 'women-emmanuel-bullets', team: 'Emmanuel Bullets', position: 4, gd: -1, points: 3 },
  { id: 'women-bangwe-all-stars', team: 'Bangwe All Stars', position: 5, gd: -1, points: 3 },
  { id: 'women-ndirande-soccer-giants', team: 'Ndirande Soccer Giants', position: 6, gd: -1, points: 3 },
  { id: 'women-sitima-yce', team: 'Sitima YCE', position: 7, gd: -2, points: 0 },
  { id: 'women-fomo-fc', team: 'FOMO FC', position: 8, gd: -9, points: 0 },
]

;(async () => {
  const batch = db.batch()
  // Remove earlier estimated women's players that aren't in the real squad.
  const keep = new Set(players.map((p) => p.id))
  const existing = await db.collection('players').where('squad', '==', 'women').get()
  let removed = 0
  for (const d of existing.docs) { if (!keep.has(d.id)) { batch.delete(d.ref); removed += 1 } }
  for (const p of players) {
    batch.set(db.collection('players').doc(p.id), {
      name: p.name, number: p.n, team: 'Ekhaya Women', squad: 'women',
      position: p.pos ?? null, nationality: 'Malawian', captain: p.captain ?? false,
      dob: null, preferredFoot: null, heightCm: null, photoDataUrl: null, injured: false,
      stats: { ...zeroStats, goals: p.goals ?? 0, appearances: p.apps ?? 0, starts: p.apps ?? 0 },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  // Remove the earlier estimated-date Bangwe fixture (now dated from the list).
  batch.delete(db.collection('fixtures').doc('w-2026-11-02-ekhaya-bangwe'))
  for (const r of results) {
    batch.set(db.collection('fixtures').doc(r.id), {
      competition: "Women's League", squad: 'women', date: `${r.date}T${r.time}:00+02:00`,
      home: r.home, away: r.away, homeScore: r.homeScore, awayScore: r.awayScore,
      status: 'finished', venue: r.venue, season: '2026', updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  for (const f of upcoming) {
    batch.set(db.collection('fixtures').doc(f.id), {
      competition: "Women's League", squad: 'women', date: `${f.date}T${f.time}:00+02:00`,
      home: f.home, away: f.away, homeScore: null, awayScore: null,
      status: 'upcoming', venue: f.venue, season: '2026', updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  // Confirmed lineup for the Allan Ladies match (XI in sheet order + subs).
  const startingXI = ['women-chakalamba-0', 'women-mwalilino-20', 'women-mugwa-12', 'women-genala-17', 'women-fabiano-66', 'women-chinkusa-8', 'women-nzokomela-4', 'women-carlos-6', 'women-lloyd-13', 'women-kayira', 'women-issa-15']
  const bench = ['women-bwitubwitu-99', 'women-munthali-47', 'women-moses-22', 'women-jonathan-30', 'women-nthambo-9', 'women-dafter-14', 'women-john-48', 'women-mwale-21']
  batch.set(db.collection('fixtures').doc('w-2026-11-15-allan-ekhaya'), {
    startingPlayerIds: startingXI, benchPlayerIds: bench, formation: '4-3-3', lineupConfirmed: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  for (const s of standings) {
    const [won, drawn, lost] = wdl(s.points)
    batch.set(db.collection('standings').doc(s.id), {
      team: s.team, position: s.position, squad: 'women', played: 2, won, drawn, lost,
      goalsFor: s.gf ?? 0, goalsAgainst: s.ga ?? 0, goalDifference: s.gd, points: s.points,
      form: won === 2 ? ['W', 'W'] : lost === 2 ? ['L', 'L'] : ['W', 'L'],
      formHistory: [], next: null, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
  note(`Seeded ${players.length} players (removed ${removed} old), ${results.length} results, ${upcoming.length} fixtures, ${standings.length} table rows.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
