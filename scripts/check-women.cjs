// Lists the women's players actually in the database (what the Squad page reads).
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
;(async () => {
  const all = await db.collection('players').get()
  const women = all.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.squad === 'women')
  note(`players total: ${all.size}; squad==women: ${women.length}`)
  women.sort((a, b) => (a.number ?? 999) - (b.number ?? 999)).forEach((p) => note(`  #${p.number ?? '-'} ${p.name} [${p.position ?? 'none'}]${p.team ? ' · ' + p.team : ''}`))
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
