// Posts a full-time result story for the women's match and verifies the stats
// that ending the match applied (table + scorers + keeper clean sheet). WRITE=1
// posts the story; the verification prints either way.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const FIX = 'w-2026-11-21-ekhaya-nsuwadzi'
const surname = (n) => { const p = String(n || '').trim().split(/\s+/); return p[p.length - 1] || n }

;(async () => {
  const fx = await db.doc(`fixtures/${FIX}`).get()
  if (!fx.exists) { note('fixture not found'); return }
  const f = fx.data()
  const opp = /ekhaya/i.test(f.home) ? f.away : f.home
  const ekhayaHome = /ekhaya/i.test(f.home)
  const us = ekhayaHome ? f.homeScore : f.awayScore
  const them = ekhayaHome ? f.awayScore : f.homeScore

  // Scorers from the goal events, in order, counted per player.
  const evs = (await db.collection('fixtures').doc(FIX).collection('events').get()).docs.map((d) => d.data())
  const goals = evs.filter((e) => e.kind === 'goal' && /ekhaya/i.test(e.team || ''))
  const tally = new Map()
  for (const g of goals) { const s = surname(g.playerName || ''); if (s) tally.set(s, (tally.get(s) || 0) + 1) }
  const scorerText = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => (n > 1 ? `${s} ${n}` : s)).join(', ')
  const caption = `Ekhaya Women ${us}–${them} ${opp}${scorerText ? ` — ${scorerText}` : ''}`.slice(0, 160)
  note(`Caption: ${caption}`)

  if (WRITE) {
    await db.collection('stories').doc().set({
      caption, label: 'Full time', thumb: null, crest: 'Ekhaya FC', hasImage: false,
      path: `/report/${FIX}`, createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 36 * 3600000), by: 'admin',
    })
    note('Posted full-time story.')
  } else { note('DRY RUN (WRITE=1 to post the story).') }

  // --- verify stats ---
  const women = (await db.collection('players').get()).docs.filter((d) => d.data().squad === 'women')
  const byNum = (n) => women.find((d) => Number(d.data().number) === n)
  for (const n of [8, 66, 15, 22, 0]) { const d = byNum(n); if (d) { const s = d.data().stats || {}; note(`#${n} ${d.data().name}: apps ${s.appearances ?? 0}, goals ${s.goals ?? 0}, assists ${s.assists ?? 0}, clean sheets ${s.cleanSheets ?? 0}`) } }
  const st = (await db.collection('standings').get()).docs.filter((d) => (d.data().squad) === 'women' && /ekhaya/i.test(d.data().team))
  for (const d of st) { const r = d.data(); note(`TABLE ${r.team}: P${r.played} ${r.won}-${r.drawn}-${r.lost} GF${r.goalsFor} GA${r.goalsAgainst} ${r.points}pts pos ${r.position}`) }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
