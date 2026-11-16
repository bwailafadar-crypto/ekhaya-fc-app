// One-off men's stat fixes by name. node scripts/set-men-fixes.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// name -> { stats patch (merged into stats), injured }
const fixes = {
  'john mchema': { stats: { appearances: 3 } },
  'levison mnyenyembe': { stats: { assists: 5 }, injured: true },
}

;(async () => {
  const snap = await db.collection('players').get()
  const men = snap.docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const batch = db.batch()
  const done = []; const missing = Object.keys(fixes)
  for (const d of men) {
    const f = fixes[norm(d.data().name)]
    if (!f) continue
    const patch = { updatedAt: FieldValue.serverTimestamp() }
    if (f.stats) patch.stats = f.stats
    if (f.injured != null) patch.injured = f.injured
    batch.set(d.ref, patch, { merge: true })
    done.push(`${d.data().name}: ${JSON.stringify(f)}`)
    missing.splice(missing.indexOf(norm(d.data().name)), 1)
  }
  await batch.commit()
  for (const l of done) note(l)
  if (missing.length) note(`NOT FOUND: ${missing.join(', ')}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
