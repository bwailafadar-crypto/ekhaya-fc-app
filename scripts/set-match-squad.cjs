// Sets the named match-day squad for a fixture: ensures each named player exists
// in the men's squad (creating any who are missing — never deleting), then writes
// fixtures/{FIXTURE}.squadPlayerIds so the admin XI/subs pickers show only these
// players for this match. Existing players are never renamed or re-positioned.
//   node scripts/set-match-squad.cjs           (dry run)
//   WRITE=1 node scripts/set-match-squad.cjs   (apply)
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const FIXTURE = process.env.FIXTURE || '2026-11-28-masters-fc-v-ekhaya-fc'

// Away squad v Masters FC (FDH Bank Premiership, 29-11-2026). Positions here are
// only used when a player must be CREATED; existing players keep their own data.
const SQUAD = [
  { name: 'Clever Mkungula', pos: 'GK' },
  { name: 'Joshua Waka', pos: 'GK' },
  { name: 'Charles Mafaiti', pos: 'DEF' },
  { name: 'Happy Mphepo', pos: 'DEF' },
  { name: 'Hope Mustafa', pos: 'DEF' },
  { name: 'Joseph Saiwa', pos: 'DEF' },
  { name: 'Samuel Rukura', pos: 'DEF' },
  { name: 'Hermas Masinja', pos: 'DEF' },
  { name: 'Francis Chimbayo', pos: 'DEF' },
  { name: 'Aubrey Simbi', pos: 'DEF' },
  { name: 'Kenneth Mwale', pos: 'MID' },
  { name: 'Vincent Salawira', pos: 'MID' },
  { name: 'Moses Banda', pos: 'MID' },
  { name: 'Blessings Malinda', pos: 'MID' },
  { name: 'John Banda', pos: 'MID' },
  { name: 'Chimwemwe Chunga', pos: 'MID' },
  { name: 'James Lumbe', pos: 'MID' },
  { name: 'Alfred Chizinga', pos: 'MID' },
  { name: 'Levie Mnyenyembe', pos: 'MID' },   // matches existing "Levison Mnyenyembe"
  { name: 'John Mchema', pos: 'FWD' },
]

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const surname = (s) => norm(s).split(' ').pop()
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

;(async () => {
  const fx = await db.doc(`fixtures/${FIXTURE}`).get()
  if (!fx.exists) { console.log(`::error::fixture ${FIXTURE} not found`); process.exit(1) }

  const snap = await db.collection('players').get()
  const men = snap.docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  const byName = new Map(men.map((d) => [norm(d.data().name), d]))
  // surname index (only useful when a surname is unique among the men)
  const bySurname = new Map()
  for (const d of men) {
    const k = surname(d.data().name)
    bySurname.set(k, (bySurname.get(k) || []).concat(d))
  }

  const batch = db.batch()
  const ids = []
  let matched = 0, aliased = 0, created = 0
  for (const p of SQUAD) {
    const exact = byName.get(norm(p.name))
    if (exact) { ids.push(exact.id); matched += 1; continue }
    const sameSurname = bySurname.get(surname(p.name)) || []
    if (sameSurname.length === 1) {
      // unique surname -> treat as the same player under a short/alternate first name
      ids.push(sameSurname[0].id); aliased += 1
      note(`alias: "${p.name}" -> existing "${sameSurname[0].data().name}"`)
      continue
    }
    const id = `men-${slug(p.name)}`
    batch.set(db.collection('players').doc(id), {
      name: p.name, position: p.pos, team: 'Ekhaya FC', squad: 'men',
      appearances: 0, goals: 0, assists: 0, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    ids.push(id); created += 1
    note(`create: "${p.name}" (${p.pos}) -> ${id}`)
  }

  note(`Squad for ${FIXTURE}: ${ids.length} players — ${matched} matched, ${aliased} aliased, ${created} created.`)
  if (ids.length !== SQUAD.length) { console.log('::error::id count mismatch'); process.exit(1) }

  if (!WRITE) { note('DRY RUN — set WRITE=1 to apply.'); return }
  batch.set(db.doc(`fixtures/${FIXTURE}`), { squadPlayerIds: ids, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  await batch.commit()
  note(`Applied. ${created} players created, match squad of ${ids.length} saved on ${FIXTURE}.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
