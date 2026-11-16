// Loads goals and assists for the men's squad from the Goals and Assists chart.
// Sets the listed scorers/assisters and zeroes everyone else, so the top-scorer
// table reflects the chart exactly. node scripts/update-men-goals.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const stats = [
  { name: 'Allen Chihana', g: 7, a: 1 }, { name: 'Blessings Malinda', g: 6, a: 2 },
  { name: 'Chimwemwe Chunga', g: 4, a: 1 }, { name: 'James Lumbe', g: 2, a: 1 },
  { name: 'Levison Mnyenyembe', g: 1, a: 4 }, { name: 'James Stambuli', g: 1, a: 1 },
  { name: 'Charles Mafaiti', g: 1, a: 0 }, { name: 'Samuel Rukura', g: 0, a: 2 },
  { name: 'Isaiah Nyirenda', g: 0, a: 2 }, { name: 'Alick Lungu', g: 1, a: 0 },
  { name: 'John Mchema', g: 2, a: 0 },
]
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const byName = new Map(stats.map((s) => [norm(s.name), s]))

;(async () => {
  const snap = await db.collection('players').get()
  const men = snap.docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const batch = db.batch()
  let set = 0, zeroed = 0, missing = []
  const seen = new Set()
  for (const d of men) {
    const s = byName.get(norm(d.data().name))
    if (s) { batch.set(d.ref, { goals: s.g, assists: s.a, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); set += 1; seen.add(norm(s.name)) }
    else { batch.set(d.ref, { goals: 0, assists: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); zeroed += 1 }
  }
  for (const s of stats) if (!seen.has(norm(s.name))) missing.push(s.name)
  await batch.commit()
  note(`Men's goals/assists: ${set} players set, ${zeroed} zeroed.`)
  if (missing.length) note(`Not found in squad (check spelling): ${missing.join(', ')}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
