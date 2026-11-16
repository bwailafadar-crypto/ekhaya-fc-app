// The app reads player.stats.{appearances,goals,assists} (a nested map), but
// earlier loads wrote those at the top level of the doc. This copies the loaded
// values into the stats map (preserving starts/minutes/cards/cleanSheets) and
// removes the stray top-level fields. Idempotent. node scripts/fix-men-stats.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

;(async () => {
  const snap = await db.collection('players').get()
  const men = snap.docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const batch = db.batch()
  let fixed = 0
  const lines = []
  for (const d of men) {
    const x = d.data()
    const st = x.stats && typeof x.stats === 'object' ? x.stats : {}
    // Prefer the value I loaded at top level; fall back to whatever stats already had.
    const appearances = num(x.appearances) ?? num(st.appearances) ?? 0
    const goals = num(x.goals) ?? num(st.goals) ?? 0
    const assists = num(x.assists) ?? num(st.assists) ?? 0
    batch.set(d.ref, {
      stats: { appearances, goals, assists },
      appearances: FieldValue.delete(), goals: FieldValue.delete(), assists: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    fixed += 1
    if (goals > 0 || assists > 0 || appearances > 0) lines.push(`${x.name}: ${appearances} app, ${goals} g, ${assists} a`)
  }
  await batch.commit()
  note(`Men stats moved into stats map for ${fixed} players.`)
  lines.sort((a, b) => Number(b.split(' ')[1]) - Number(a.split(' ')[1]))
  for (const l of lines) note(l)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
