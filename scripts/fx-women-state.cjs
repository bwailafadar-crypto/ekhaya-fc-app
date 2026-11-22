const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const FIX = 'w-2026-11-21-ekhaya-nsuwadzi'
;(async () => {
  const f = (await db.doc('fixtures/' + FIX).get()).data()
  note(`status=${f.status} period=${f.period} score=${f.homeScore}-${f.awayScore} eventCount=${f.eventCount} home=${f.home} away=${f.away}`)
  const evs = (await db.collection('fixtures').doc(FIX).collection('events').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  note(`events in subcollection: ${evs.length}`)
  for (const e of evs.sort((a, b) => (a.minute || 0) - (b.minute || 0))) note(`  ${e.minute}' ${e.kind} | ${e.team} | ${e.playerName || e.playerId || ''}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
