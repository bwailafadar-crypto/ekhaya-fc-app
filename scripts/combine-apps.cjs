// Total appearances = sheet (1st round) + matches recorded live in the app since
// the 2nd round began (>= 2026-09-01), counting starters and anyone in that
// match's events. Avoids double-counting the 1st-round matches (which are in the
// sheet and have no live line-ups). node scripts/combine-apps.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const WRITE = process.env.WRITE === '1'
// A "new" match (not in the sheet) is one the app fully recorded with a confirmed
// starting XI. The 1st-round matches were imported with results only (0 starters),
// so this cleanly separates the two without date guessing or duplicate risk.

const sheet = { 'chimwemwe chunga': 16, 'vincent salawira': 15, 'james lumbe': 15, 'clever mkungula': 14, 'samuel rukura': 14, 'isaiah nyirenda': 14, 'blessings malinda': 14, 'happy mphepo': 13, 'andrew lameck': 13, 'hermas masinja': 13, 'allen chihana': 13, 'levison mnyenyembe': 12, 'charles mafaiti': 11, 'wongani kaponya': 11, 'moses banda': 10, 'james stambuli': 9, 'aubrey simbi': 8, 'gift chunga': 6, 'josephy mcdonald': 5, 'lucky tizola': 2, 'alfred chizinga': 2, 'fanizo mwansambo': 1, 'gift magola': 1, 'george mateyo': 1, 'amos sande': 0, 'joshua waka': 0, 'mudrick salomu': 0, 'joseph saiwa': 0, 'alick lungu': 0, 'hadji james': 0, 'limbani kutambe': 0, 'davie juao': 0 }
const floor = { 'john mchema': 3 } // user-stated totals that must not be reduced

;(async () => {
  const players = (await db.collection('players').get()).docs
  const men = players.filter((d) => (d.data().squad ?? 'men') === 'men')

  // New-match live appearances (>= CUTOFF)
  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && f.status === 'finished' && (f.startingPlayerIds ?? []).length >= 11)
  const newApps = {}
  for (const f of fixtures) {
    const ids = new Set(f.startingPlayerIds ?? [])
    const evs = (await db.collection('fixtures').doc(f.id).collection('events').get()).docs.map((d) => d.data())
    for (const e of evs) { if (e.playerId) ids.add(e.playerId); if (e.assistPlayerId) ids.add(e.assistPlayerId); if (e.inPlayerId) ids.add(e.inPlayerId) }
    for (const id of ids) newApps[id] = (newApps[id] || 0) + 1
  }
  note(`New matches counted (confirmed XI): ${fixtures.length} -> ${fixtures.map((f) => `${f.date?.slice(0,10)} ${f.home} v ${f.away}`).join('; ')}`)

  const batch = db.batch()
  const rows = []
  for (const d of men) {
    const n = norm(d.data().name)
    const s = sheet[n] ?? 0
    const nw = newApps[d.id] || 0
    let total = s + nw
    if (floor[n] != null && total < floor[n]) total = floor[n]
    rows.push({ name: d.data().name, s, nw, total })
    if (WRITE) batch.set(d.ref, { stats: { appearances: total }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  }
  if (WRITE) await batch.commit()
  rows.sort((a, b) => b.total - a.total)
  for (const r of rows) note(`${r.name}: ${r.s} sheet + ${r.nw} new = ${r.total}${WRITE ? ' (saved)' : ''}`)
  note(WRITE ? 'Appearances updated.' : 'DRY RUN (set WRITE=1 to save).')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
