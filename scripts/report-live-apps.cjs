// READ-ONLY: lists finished men's fixtures that were recorded live in the app
// (have a confirmed lineup or events), and counts live appearances per player.
// node scripts/report-live-apps.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const players = (await db.collection('players').get()).docs
  const nameById = new Map(players.map((d) => [d.id, d.data().name]))
  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && f.status === 'finished')

  const live = [] // fixtures recorded live (have a lineup)
  for (const f of fixtures) {
    const starters = f.startingPlayerIds ?? []
    const evSnap = await db.collection('fixtures').doc(f.id).collection('events').get()
    const events = evSnap.docs.map((d) => d.data())
    const hasLineup = starters.length > 0
    const hasEvents = events.length > 0
    if (hasLineup || f.statsApplied || hasEvents) live.push({ ...f, starters, events, hasLineup })
  }

  const liveApps = {} // playerId -> count
  for (const f of live) {
    const ids = new Set(f.starters)
    for (const e of f.events) { if (e.playerId) ids.add(e.playerId); if (e.assistPlayerId) ids.add(e.assistPlayerId); if (e.inPlayerId) ids.add(e.inPlayerId) }
    for (const id of ids) liveApps[id] = (liveApps[id] || 0) + 1
  }

  note(`Finished men's fixtures: ${fixtures.length}; recorded live (lineup/events/statsApplied): ${live.length}`)
  for (const f of live) note(`LIVE: ${f.date?.slice?.(0, 10) ?? '?'} ${f.home} v ${f.away} — ${f.starters.length} starters, ${f.events.length} events, statsApplied=${f.statsApplied === true}`)
  const rows = Object.entries(liveApps).map(([id, n]) => `${nameById.get(id) || id}: ${n}`).sort()
  for (const r of rows) note(`liveApp ${r}`)
  if (!rows.length) note('No live appearances found (no fixtures have lineups or events).')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
