// READ-ONLY: list women players, squad tag and photo status.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
;(async () => {
  const all = (await db.collection('players').get()).docs
  const women = all.filter((d) => d.data().squad === 'women')
  note(`Total players: ${all.length}; squad=women: ${women.length}`)
  for (const d of women) { const x = d.data(); note(`  ${x.name} | #${x.number ?? '?'} | ${x.position ?? '(no pos)'} | photo=${x.photoDataUrl ? 'YES' : 'no'} | team=${x.team ?? '(unset)'}`) }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
