// Sets a men's player's position group. node scripts/set-position.cjs
// Env: PLAYER="Samuel Rukura" POS=DEF
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const PLAYER = norm(process.env.PLAYER || '')
const POS = (process.env.POS || '').toUpperCase()

;(async () => {
  if (!['GK', 'DEF', 'MID', 'FWD'].includes(POS)) { note(`Bad POS: ${POS}`); process.exit(1) }
  const men = (await db.collection('players').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const hit = men.filter((d) => norm(d.data().name) === PLAYER)
  if (!hit.length) { note(`Not found: ${process.env.PLAYER}`); process.exit(1) }
  for (const d of hit) {
    const was = d.data().position
    await d.ref.set({ position: POS, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    note(`${d.data().name}: position ${was ?? '(none)'} -> ${POS}`)
  }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
