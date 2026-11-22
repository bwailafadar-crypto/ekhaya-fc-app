const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
;(async () => {
  const d = (await db.doc('publicData/snapshot').get()).data()
  if (!d) { note('publicData/snapshot MISSING'); return }
  note(`disabled=${d.disabled ?? false} bytes=${d.bytes} updatedAt=${d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt}`)
  const fx = d.fixtures || []
  const live = fx.filter((f) => f.status === 'live')
  note(`fixtures in doc: ${fx.length} | live: ${live.length}`)
  for (const f of live) note(`  LIVE: ${f.id} | ${f.home} ${f.homeScore}-${f.awayScore} ${f.away} | squad=${f.squad ?? 'men'} | isTest=${f.isTest ?? false} | editing=${f.editing ?? false}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
