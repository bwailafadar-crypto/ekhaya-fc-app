// Removes duplicate/stray men's player records (exact name match). The canonical
// spelling with the real stats is kept. node scripts/clean-stray-men.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Exact names to delete (strays / duplicate spellings). Canonical kept: George
// Mateyo, Lucky Tizola, Josephy McDonald.
const remove = ['George Mateyu', 'Lucky Tizitola', 'Sholinga Stambuli', 'Joseph McDonald'].map(norm)
const keepSafe = ['George Mateyo', 'Lucky Tizola', 'Josephy McDonald'].map(norm)

;(async () => {
  const men = (await db.collection('players').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const present = new Set(men.map((d) => norm(d.data().name)))
  // Safety: only delete a duplicate if its canonical twin still exists.
  const twin = { [norm('George Mateyu')]: norm('George Mateyo'), [norm('Lucky Tizitola')]: norm('Lucky Tizola'), [norm('Joseph McDonald')]: norm('Josephy McDonald') }
  const batch = db.batch()
  const deleted = []
  for (const d of men) {
    const n = norm(d.data().name)
    if (!remove.includes(n)) continue
    if (twin[n] && !present.has(twin[n])) { note(`SKIP ${d.data().name}: its canonical twin is missing.`); continue }
    const s = d.data().stats || {}
    deleted.push(`${d.data().name} (${s.appearances ?? 0} apps, ${s.goals ?? 0} g, ${s.assists ?? 0} a)`)
    batch.delete(d.ref)
  }
  await batch.commit()
  note(deleted.length ? `Deleted ${deleted.length}: ${deleted.join('; ')}` : 'Nothing to delete (already clean).')
  note(`Kept canonical records: ${keepSafe.length} checked.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
