// Sets the Southern Region Women's League table (Week 4) on the women's
// standings docs, matched by team name. WRITE=1 to save.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\b(fc|womens|women|ladies|queens|united|stars|giants|all)\b/g, ' ').replace(/\s+/g, ' ').trim()

// pos, team, P, W, D, L, GF, GA, PTS
const T = [
  [1, 'Allan Ladies', 4, 3, 1, 0, 9, 2, 10],
  [2, 'Ekhaya Womens', 4, 3, 0, 1, 16, 3, 9],
  [3, 'Bangwe All Stars', 3, 2, 0, 1, 6, 5, 6],
  [4, 'Emmanuel Bullets', 3, 2, 0, 1, 6, 5, 6],
  [5, 'Nsuwadzi Queens', 4, 2, 0, 2, 8, 9, 6],
  [6, 'Ndirande Giants', 4, 1, 1, 2, 2, 5, 4],
  [7, 'Sitima Yoce', 4, 1, 0, 3, 6, 9, 3],
  [8, 'Fomo FC', 4, 0, 0, 4, 2, 18, 0],
]

;(async () => {
  const docs = (await db.collection('standings').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'women')
  note(`Women standings docs found: ${docs.length}`)
  const used = new Set()
  const find = (team) => {
    const q = norm(team)
    let hit = docs.find((d) => !used.has(d.id) && norm(d.data().team) === q)
    if (!hit) hit = docs.find((d) => { if (used.has(d.id)) return false; const n = norm(d.data().team); return n && (n.includes(q) || q.includes(n)) })
    if (!hit) { const first = q.split(' ')[0]; if (first && first.length > 2) hit = docs.find((d) => !used.has(d.id) && norm(d.data().team).split(' ')[0] === first) }
    if (hit) used.add(hit.id)
    return hit
  }
  const plan = T.map((r) => { const [pos, team, P, W, D, L, GF, GA, PTS] = r; const d = find(team); return { pos, team, P, W, D, L, GF, GA, PTS, GD: GF - GA, doc: d } })
  for (const p of plan) note(`${p.pos}. ${p.team} -> ${p.doc ? `"${p.doc.data().team}" [${p.doc.id}]` : '*** NO MATCH ***'} | P${p.P} ${p.W}-${p.D}-${p.L} ${p.GF}:${p.GA} ${p.PTS}pts`)
  const missing = plan.filter((p) => !p.doc)
  if (missing.length) { note(`Unmatched teams (${missing.length}): ${missing.map((m) => m.team).join(', ')} — fix matching before writing.`); if (WRITE) return }
  if (!WRITE) { note('DRY RUN (set WRITE=1 to save).'); return }
  const batch = db.batch()
  for (const p of plan) {
    batch.set(p.doc.ref, { position: p.pos, played: p.P, won: p.W, drawn: p.D, lost: p.L, goalsFor: p.GF, goalsAgainst: p.GA, goalDifference: p.GD, points: p.PTS, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  }
  await batch.commit()
  note('Saved Week 4 women\'s table.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
