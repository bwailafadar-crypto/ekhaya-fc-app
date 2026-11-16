// Clean sheets for goalkeepers, worked out from finished men's matches where
// Ekhaya conceded 0. A clean sheet is credited to the keeper in that match's
// starting XI; any clean sheet with no keeper recorded in the lineup goes to
// the main keeper (most appearances). node scripts/set-clean-sheets.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const CLUB = /ekhaya/i

;(async () => {
  const players = (await db.collection('players').get()).docs
  const men = players.filter((d) => (d.data().squad ?? 'men') === 'men')
  const keepers = men.filter((d) => d.data().position === 'GK')
  const keeperIds = new Set(keepers.map((d) => d.id))
  // main keeper = most appearances
  const mainKeeper = keepers.slice().sort((a, b) => (b.data().stats?.appearances ?? 0) - (a.data().stats?.appearances ?? 0))[0]

  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && f.status === 'finished'
      && f.homeScore != null && f.awayScore != null
      && (CLUB.test(f.home || '') || CLUB.test(f.away || '')))

  const sheets = {} // keeperId -> count
  let teamCleanSheets = 0, unassigned = 0
  for (const f of fixtures) {
    const ekhayaHome = CLUB.test(f.home || '')
    const against = ekhayaHome ? f.awayScore : f.homeScore
    if (against !== 0) continue
    teamCleanSheets += 1
    const starters = f.startingPlayerIds ?? []
    const gk = starters.find((id) => keeperIds.has(id))
    if (gk) sheets[gk] = (sheets[gk] || 0) + 1
    else unassigned += 1
  }
  // Unattributed clean sheets go to the main keeper (recommended).
  if (mainKeeper && unassigned) sheets[mainKeeper.id] = (sheets[mainKeeper.id] || 0) + unassigned

  const batch = db.batch()
  for (const k of keepers) {
    const cs = sheets[k.id] || 0
    batch.set(k.ref, { stats: { cleanSheets: cs }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  }
  await batch.commit()
  note(`Finished men's matches: ${fixtures.length}; team clean sheets: ${teamCleanSheets} (${unassigned} had no keeper in the lineup, credited to main keeper).`)
  for (const k of keepers) note(`${k.data().name}: ${sheets[k.id] || 0} clean sheets (${k.data().stats?.appearances ?? 0} apps)`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
