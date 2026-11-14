// Seeds the Ekhaya women's team ("The Cowgirls"): squad, the known results, and
// a starting women's league table. Everything is tagged squad:'women' so it only
// shows under the Women's tab and never mixes with the men's data. Idempotent.
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const zeroStats = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }

// From the FOMO FC v EKHAYA line-up (starters + subs). Positions are set only
// where known (keepers, and Fabiano the striker); the rest are left for admins.
const players = [
  { n: 99, name: 'Bwitubwitu', pos: 'GK' },
  { n: 9, name: 'Chinkusa', captain: true },
  { n: 20, name: 'Mwalilino' },
  { n: 6, name: 'Carlos' },
  { n: 12, name: 'Mugwa' },
  { n: 22, name: 'Moses' },
  { n: 17, name: 'Genala' },
  { n: 66, name: 'Fabiano', pos: 'FWD', goals: 6, apps: 2 },
  { n: 14, name: 'Dafter' },
  { n: 13, name: 'Lloyd' },
  { n: 15, name: 'Issa' },
  { n: 0, name: 'Chakalamba', pos: 'GK' },
  { n: 47, name: 'Munthali' },
  { n: 18, name: 'Mhango' },
  { n: 48, name: 'John' },
  { n: 21, name: 'Mwale' },
  { n: 26, name: 'Mbisa' },
  { n: 4, name: 'Kaira' },
  { n: 9, name: 'Nthambo' },
  { n: 30, name: 'Jonathan' },
]

// Known results (Ekhaya's two wins). Bangwe date is an estimate — confirm it.
const results = [
  { id: 'w-2026-11-02-ekhaya-bangwe', date: '2026-11-02', home: 'Ekhaya FC', away: 'Bangwe All Stars', homeScore: 3, awayScore: 0, venue: 'Mpira Stadium', dateEstimated: true },
  { id: 'w-2026-11-07-fomo-ekhaya', date: '2026-11-07', home: 'Fomo FC', away: 'Ekhaya FC', homeScore: 0, awayScore: 6, venue: 'Mulanje Park' },
]

// Starting women's table built from those two results (partial — full standings to follow).
const standings = [
  { team: 'Ekhaya FC', position: 1, played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 9, goalsAgainst: 0, points: 6, form: ['W', 'W'] },
  { team: 'Bangwe All Stars', position: 2, played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 3, points: 0, form: ['L'] },
  { team: 'Fomo FC', position: 3, played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 6, points: 0, form: ['L'] },
]

;(async () => {
  const batch = db.batch()
  for (const p of players) {
    const ref = db.collection('players').doc(`women-${slug(p.name)}-${p.n}`)
    batch.set(ref, {
      name: p.name, number: p.n, team: 'Ekhaya FC', squad: 'women',
      position: p.pos ?? null, nationality: 'Malawian', captain: p.captain ?? false,
      dob: null, preferredFoot: null, heightCm: null, photoDataUrl: null, injured: false,
      stats: { ...zeroStats, goals: p.goals ?? 0, appearances: p.apps ?? 0, starts: p.apps ?? 0 },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  for (const r of results) {
    batch.set(db.collection('fixtures').doc(r.id), {
      competition: "Women's League", squad: 'women', date: `${r.date}T14:00:00+02:00`,
      home: r.home, away: r.away, homeScore: r.homeScore, awayScore: r.awayScore,
      status: 'finished', venue: r.venue, season: '2026', updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  for (const s of standings) {
    batch.set(db.collection('standings').doc(`women-${slug(s.team)}`), {
      ...s, squad: 'women', goalDifference: s.goalsFor - s.goalsAgainst, formHistory: [], next: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
  note(`Seeded ${players.length} women's players, ${results.length} results, ${standings.length} table rows.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
