// Sets the Ekhaya Women starting XI + subs for the next women's fixture
// (Ekhaya Women v Nsuwadzi Queens). Also fills in shirt numbers and broad
// positions from the team sheet. Dry run unless WRITE=1.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
const WRITE = process.env.WRITE === '1'

const FIXTURE = 'w-2026-11-21-ekhaya-nsuwadzi'
const FORMATION = '4-3-3'

// Team-sheet order: GK, defence (L->R), midfield, attack. role is the broad
// position code the app uses on the pitch (GK / DEF / MID / FWD).
const XI = [
  { name: 'Scolastica Chakalamba', number: 0, role: 'GK' },
  { name: 'Kettie Munthali', number: 47, role: 'DEF' },
  { name: 'Mirriam Dafter', number: 14, role: 'DEF' },
  { name: 'Precious Mwalilino', number: 20, role: 'DEF' },
  { name: 'Wonderful Genala', number: 17, role: 'DEF' },
  { name: 'Nirza Carlos', number: 6, role: 'MID' },
  { name: 'Stella Chinkusa', number: 8, role: 'MID' },
  { name: 'Catherine Nthambo', number: 9, role: 'MID' },
  { name: 'Tema Issa', number: 15, role: 'FWD' },
  { name: 'Eneless Fabiano', number: 66, role: 'FWD' },
  { name: 'Eliza Mugwa', number: 12, role: 'FWD' },
]
const SUBS = [
  { name: 'Rosette Mwadjuma', number: 1, role: 'GK' },
  { name: 'Tupo Mbisa', number: 26, role: null },
  { name: 'Ester Mhango', number: 18, role: null },
  { name: 'Joyce Kayira', number: 5, role: null },
  { name: 'Eunice Moses', number: 22, role: null },
  { name: 'Agness Jonathan', number: 30, role: null },
  { name: 'Evelyn Lloyd', number: 13, role: null },
  { name: 'Rabecca Mwale', number: 21, role: null },
  { name: 'Sina John', number: 48, role: null },
]
const EMPTY = { appearances: 0, goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0, redCards: 0, minutes: 0 }

;(async () => {
  const women = (await db.collection('players').get()).docs.filter((d) => d.data().squad === 'women')
  const find = (name) => {
    const q = norm(name), qt = q.split(' ').filter((w) => w.length > 2)
    let hit = women.find((d) => norm(d.data().name) === q)
    // Exact full-name match only, then "all team-sheet words present in the doc name".
    // Names are already spelled to match the squad, so no looser fuzzy matching
    // (which previously mis-matched new players onto existing ones).
    if (!hit) hit = women.find((d) => { const nt = norm(d.data().name).split(' '); return qt.every((w) => nt.includes(w)) })
    return hit
  }
  const resolve = (list) => list.map((p) => { const h = find(p.name); return { ...p, id: h?.id || null, matched: h ? h.data().name : null } })
  const S = resolve(XI), B = resolve(SUBS)
  for (const r of S) note(`XI  #${r.number} ${r.name} -> ${r.matched || '*** NOT FOUND ***'}`)
  for (const r of B) note(`SUB #${r.number} ${r.name} -> ${r.matched || '(will create)'}`)
  const missS = S.filter((r) => !r.id)
  note(`Matched XI: ${S.filter((r) => r.id).length}/11 | subs matched: ${B.filter((r) => r.id).length}/${B.length}`)
  if (missS.length) { note(`Cannot set XI: unmatched starters -> ${missS.map((r) => r.name).join(', ')}`); return }
  if (!WRITE) { note(`Will create new subs: ${B.filter((r) => !r.id).map((r) => r.name).join(', ') || 'none'}`); note('DRY RUN (set WRITE=1 to save).'); return }

  // Create any sub not yet in the women's squad.
  for (const r of B.filter((x) => !x.id)) {
    const id = 'women-' + norm(r.name).replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
    await db.doc(`players/${id}`).set({ name: r.name, number: r.number, team: 'Ekhaya Women', squad: 'women', position: r.role, nationality: 'Malawian', photoDataUrl: null, stats: { ...EMPTY }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    r.id = id; note(`Created new player: ${r.name} (${id})`)
  }
  // Update shirt number + position on every selected player (team sheet is authoritative).
  for (const r of [...S, ...B]) {
    const patch = { number: r.number, updatedAt: FieldValue.serverTimestamp() }
    if (r.role) patch.position = r.role
    await db.doc(`players/${r.id}`).set(patch, { merge: true })
  }
  // Save the line-up on the fixture.
  const ref = db.doc(`fixtures/${FIXTURE}`)
  const snap = await ref.get()
  if (!snap.exists) { note(`Fixture ${FIXTURE} not found`); return }
  await ref.set({ startingPlayerIds: S.map((r) => r.id), benchPlayerIds: B.map((r) => r.id), formation: FORMATION, lineupConfirmed: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  note(`Lineup saved to ${FIXTURE}: XI 11, subs ${B.length}, formation ${FORMATION}, confirmed.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
