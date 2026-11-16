// Updates the men's squad from the FDH Premiership 1st-round minutes sheet.
// Matches each player to an existing one by name (keeping their number and
// goals), sets position and appearances, and creates any who are missing.
// Never deletes a player.  node scripts/update-men-squad.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const roster = [
  { name: 'Amos Sande', pos: 'GK', apps: 0 }, { name: 'Clever Mkungula', pos: 'GK', apps: 4 },
  { name: 'Joshua Waka', pos: 'GK', apps: 0 }, { name: 'Lucky Tizola', pos: 'GK', apps: 1 },
  { name: 'Charles Mafaiti', pos: 'DEF', apps: 5 }, { name: 'Happy Mphepo', pos: 'DEF', apps: 3 },
  { name: 'Fanizo Mwansambo', pos: 'DEF', apps: 1 }, { name: 'Mudrick Salomu', pos: 'DEF', apps: 0 },
  { name: 'Andrew Lameck', pos: 'DEF', apps: 5 }, { name: 'Josephy McDonald', pos: 'DEF', apps: 2 },
  { name: 'Joseph Saiwa', pos: 'DEF', apps: 0 }, { name: 'Aubrey Simbi', pos: 'DEF', apps: 1 },
  { name: 'Hermas Masinja', pos: 'DEF', apps: 5 }, { name: 'Alick Lungu', pos: 'DEF', apps: 0 },
  { name: 'Samuel Rukura', pos: 'FWD', apps: 4 }, { name: 'Vincent Salawira', pos: 'MID', apps: 5 },
  { name: 'Moses Banda', pos: 'MID', apps: 1 }, { name: 'Hadji James', pos: 'MID', apps: 0 },
  { name: 'Isaiah Nyirenda', pos: 'MID', apps: 5 }, { name: 'Blessings Malinda', pos: 'MID', apps: 5 },
  { name: 'Limbani Kutambe', pos: 'MID', apps: 0 }, { name: 'Alfred Chizinga', pos: 'MID', apps: 1 },
  { name: 'Levison Mnyenyembe', pos: 'FWD', apps: 3 }, { name: 'James Lumbe', pos: 'FWD', apps: 5 },
  { name: 'Wongani Kaponya', pos: 'FWD', apps: 3 }, { name: 'Gift Magola', pos: 'FWD', apps: 0 },
  { name: 'Allen Chihana', pos: 'FWD', apps: 5 }, { name: 'George Mateyo', pos: 'FWD', apps: 0 },
  { name: 'Chimwemwe Chunga', pos: 'FWD', apps: 5 }, { name: 'James Stambuli', pos: 'FWD', apps: 4 },
  { name: 'Gift Chunga', pos: 'FWD', apps: 2 }, { name: 'Davie Juao', pos: 'FWD', apps: 0 },
]
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

;(async () => {
  const snap = await db.collection('players').get()
  const men = snap.docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const byName = new Map(men.map((d) => [norm(d.data().name), d]))
  const batch = db.batch()
  let updated = 0, created = 0
  for (const p of roster) {
    const existing = byName.get(norm(p.name))
    if (existing) {
      batch.set(existing.ref, { position: p.pos, appearances: p.apps, team: 'Ekhaya FC', squad: 'men', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      updated += 1
    } else {
      batch.set(db.collection('players').doc(`men-${slug(p.name)}`), { name: p.name, position: p.pos, appearances: p.apps, team: 'Ekhaya FC', squad: 'men', goals: 0, assists: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      created += 1
    }
  }
  await batch.commit()
  note(`Men's squad: ${updated} players updated, ${created} created (from ${roster.length} on the sheet).`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
