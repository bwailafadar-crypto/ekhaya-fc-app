// READ-ONLY: inspect one player's stored apps and how the new matches record him.
// node scripts/inspect-alick.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const TARGET = 'alick lungu'

;(async () => {
  const players = (await db.collection('players').get()).docs
  const me = players.find((d) => norm(d.data().name) === TARGET)
  const nameById = new Map(players.map((d) => [d.id, d.data().name]))
  if (!me) return note('player not found')
  note(`${me.data().name} id=${me.id} stored stats=${JSON.stringify(me.data().stats || {})}`)

  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && f.status === 'finished')
  // Any fixture that names Alick in starters or bench, or has an event about him
  for (const f of fixtures) {
    const starters = f.startingPlayerIds ?? []
    const bench = f.benchPlayerIds ?? []
    const evs = (await db.collection('fixtures').doc(f.id).collection('events').get()).docs.map((d) => d.data())
    const inStart = starters.includes(me.id), inBench = bench.includes(me.id)
    const cameOn = evs.some((e) => e.kind === 'substitution' && e.subbedInPlayerId === me.id)
    const mine = evs.filter((e) => e.playerId === me.id || e.assistPlayerId === me.id || e.subbedInPlayerId === me.id || e.subbedOutPlayerId === me.id)
    const played = inStart || cameOn || evs.some((e) => e.playerId === me.id || e.assistPlayerId === me.id)
    if (!inStart && !inBench && !mine.length) continue
    note(`${f.date?.slice(0,10)} ${f.home} v ${f.away}: start=${inStart} bench=${inBench} cameOn=${cameOn} PLAYED=${played} XI=${starters.length} | ${mine.map((e) => `${e.kind}@${e.minute ?? '?'}${e.subbedInPlayerId === me.id ? '(ON)' : ''}${e.subbedOutPlayerId === me.id ? '(OFF)' : ''}`).join(', ') || 'no events about him'}`)
    // also show all event kinds present to see if subs are recorded at all
    const kinds = {}; evs.forEach((e) => { kinds[e.kind] = (kinds[e.kind] || 0) + 1 })
    note(`   all event kinds in this match: ${JSON.stringify(kinds)}`)
  }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
