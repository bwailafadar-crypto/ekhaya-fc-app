// Read-only: lists every men's player with apps/goals/assists, flagging those
// with no stats at all. node scripts/report-men-stats.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const men = (await db.collection('players').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const rows = men.map((d) => { const x = d.data(); const s = x.stats || {}; return { name: x.name, pos: x.position || '?', apps: s.appearances ?? 0, g: s.goals ?? 0, a: s.assists ?? 0, cs: s.cleanSheets ?? 0 } })
  rows.sort((p, q) => q.apps - p.apps || q.g - p.g)
  for (const r of rows) note(`${r.name} [${r.pos}] — ${r.apps} apps, ${r.g} g, ${r.a} a${r.pos === 'GK' ? `, ${r.cs} cs` : ''}`)
  const blank = rows.filter((r) => r.apps === 0 && r.g === 0 && r.a === 0)
  note(`TOTAL men: ${rows.length}. No stats at all (0/0/0): ${blank.length}${blank.length ? ' -> ' + blank.map((r) => r.name).join(', ') : ''}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
