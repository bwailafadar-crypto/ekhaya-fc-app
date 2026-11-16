// Loads yellow cards, red cards and strong foot for the men's squad from the
// FDH Bank Premiership sheet (no minutes). node scripts/set-men-discipline.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

const data = [
  { name: "Amos Sande", yellow: 0, red: 0, foot: "Right" },
  { name: "Clever Mkungula", yellow: 0, red: 0, foot: "Both" },
  { name: "Joshua Waka", yellow: 0, red: 0, foot: "Right" },
  { name: "Lucky Tizola", yellow: 0, red: 0, foot: "Right" },
  { name: "Charles Mafaiti", yellow: 0, red: 0, foot: "Right" },
  { name: "Happy Mphepo", yellow: 2, red: 0, foot: "Right" },
  { name: "Fanizo Mwansambo", yellow: 0, red: 0, foot: "Right" },
  { name: "Mudrick Salomu", yellow: 0, red: 0, foot: "Right" },
  { name: "Andrew Lameck", yellow: 2, red: 0, foot: "Right" },
  { name: "Josephy McDonald", yellow: 0, red: 0, foot: "Right" },
  { name: "Joseph Saiwa", yellow: 0, red: 0, foot: "Right" },
  { name: "Aubrey Simbi", yellow: 0, red: 0, foot: "Right" },
  { name: "Hermas Masinja", yellow: 2, red: 0, foot: "Right" },
  { name: "Alick Lungu", yellow: 0, red: 0, foot: "Left" },
  { name: "Samuel Rukura", yellow: 0, red: 0, foot: "Left" },
  { name: "Vincent Salawira", yellow: 2, red: 0, foot: "Right" },
  { name: "Moses Banda", yellow: 0, red: 0, foot: "Right" },
  { name: "Hadji James", yellow: 0, red: 0, foot: "Right" },
  { name: "Isaiah Nyirenda", yellow: 1, red: 0, foot: "Right" },
  { name: "Blessings Malinda", yellow: 3, red: 0, foot: "Right" },
  { name: "Limbani Kutambe", yellow: 0, red: 0, foot: "Right" },
  { name: "Alfred Chizinga", yellow: 0, red: 0, foot: "Right" },
  { name: "Levison Mnyenyembe", yellow: 3, red: 0, foot: "Right" },
  { name: "James Lumbe", yellow: 1, red: 0, foot: "Right" },
  { name: "Wongani kaponya", yellow: 0, red: 0, foot: "Right" },
  { name: "Gift Magola", yellow: 0, red: 0, foot: "Right" },
  { name: "Allen Chihana", yellow: 1, red: 0, foot: "Right" },
  { name: "George Mateyo", yellow: 0, red: 0, foot: "Right" },
  { name: "Chimwemwe Chunga", yellow: 3, red: 0, foot: "Right" },
  { name: "James Stambuli", yellow: 2, red: 0, foot: "Right" },
  { name: "Gift Chunga", yellow: 1, red: 0, foot: "Right" },
  { name: "Davie Juao", yellow: 0, red: 0, foot: "Right" },
]
const byName = new Map(data.map((d) => [norm(d.name), d]))

;(async () => {
  const men = (await db.collection('players').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const batch = db.batch()
  let set = 0; const missing = new Set(byName.keys())
  for (const d of men) {
    const info = byName.get(norm(d.data().name))
    if (!info) continue
    batch.set(d.ref, { stats: { yellowCards: info.yellow, redCards: info.red }, preferredFoot: info.foot, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    set += 1; missing.delete(norm(d.data().name))
  }
  await batch.commit()
  note(`Discipline + foot set for ${set} players. Yellows total: ${data.reduce((n, d) => n + d.yellow, 0)}, reds: ${data.reduce((n, d) => n + d.red, 0)}.`)
  if (missing.size) note(`Not matched in squad: ${[...missing].join(', ')}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
