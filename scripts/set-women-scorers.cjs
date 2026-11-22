// Assigns scorers to the already-recorded Ekhaya Women goals (which have no
// player attached). Maps, in minute order, to the shirt numbers listed below.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const FIX = 'w-2026-11-21-ekhaya-nsuwadzi'
// Goals in minute order get these shirt numbers, in this order.
const SCORER_NUMBERS = [66, 8, 15]

;(async () => {
  const women = (await db.collection('players').get()).docs.filter((d) => d.data().squad === 'women')
  const byNumber = (n) => women.find((d) => Number(d.data().number) === n)
  const scorers = SCORER_NUMBERS.map((n) => { const d = byNumber(n); return d ? { id: d.id, name: d.data().name, number: n } : { id: null, name: null, number: n } })
  for (const s of scorers) note(`#${s.number} -> ${s.name || '*** NOT FOUND ***'}`)
  if (scorers.some((s) => !s.id)) { note('Some shirt numbers not found; aborting.'); return }

  const evs = (await db.collection('fixtures').doc(FIX).collection('events').get()).docs
    .map((d) => ({ ref: d.ref, ...d.data() }))
    .filter((e) => e.kind === 'goal' && e.team === 'Ekhaya Women')
    .sort((a, b) => (a.minute || 0) - (b.minute || 0))
  note(`Ekhaya goals found: ${evs.length}`)
  if (evs.length !== scorers.length) { note(`Goal count (${evs.length}) != scorer count (${scorers.length}); aborting so nothing is mis-assigned.`); return }

  for (let i = 0; i < evs.length; i++) note(`  ${evs[i].minute}' goal -> ${scorers[i].name} (#${scorers[i].number})`)
  if (!WRITE) { note('DRY RUN (set WRITE=1 to save).'); return }
  for (let i = 0; i < evs.length; i++) {
    await evs[i].ref.set({ playerId: scorers[i].id, playerName: scorers[i].name, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    note(`Saved: ${evs[i].minute}' -> ${scorers[i].name}`)
  }
  note('Scorers assigned.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
