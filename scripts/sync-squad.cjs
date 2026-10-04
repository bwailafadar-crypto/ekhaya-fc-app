// Makes the live squad match the official list in ekhaya-data.json:
// fixes names and shirt numbers, adds missing players, and lists players that
// are not on the official list (they are only removed with --remove-extras).
// Existing stats, photos, positions and dates of birth are never touched.
//   node scripts/sync-squad.cjs                    -> preview only
//   node scripts/sync-squad.cjs --apply            -> apply fixes and additions
//   node scripts/sync-squad.cjs --apply --remove-extras -> also delete extras
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const removeExtras = process.argv.includes('--remove-extras')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const official = require(path.resolve('ekhaya-data.json')).players

const norm = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')

async function main() {
  const snapshot = await db.collection('players').get()
  const live = snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
  const used = new Set()
  const updates = []
  const additions = []

  for (const player of official) {
    const match = live.find((item) => item.id === player.id) || live.find((item) => !used.has(item.id) && norm(item.name) === norm(player.name))
    if (!match) { additions.push(player); continue }
    used.add(match.id)
    const change = {}
    if (match.name !== player.name) change.name = player.name
    // Only set a number when the official list has one; never wipe an existing number.
    if (player.number != null && match.number !== player.number) change.number = player.number
    if (Object.keys(change).length) updates.push({ match, change })
  }
  const extras = live.filter((item) => !used.has(item.id))

  console.log(`Live squad: ${live.length} players · official list: ${official.length}\n`)
  console.log(updates.length ? 'Fixes:' : 'Fixes: none needed')
  updates.forEach(({ match, change }) => console.log(`  ~ ${match.name} (#${match.number ?? '-'}) -> ${change.name ?? match.name} (#${change.number ?? match.number ?? '-'})`))
  console.log(additions.length ? '\nNew players to add:' : '\nNew players: none')
  additions.forEach((player) => console.log(`  + ${player.name}${player.number != null ? ` #${player.number}` : ''}`))
  console.log(extras.length ? `\nNot on the official list${removeExtras ? ' (will be DELETED)' : ' (kept; add --remove-extras to delete)'}:` : '\nNot on the official list: none')
  extras.forEach((item) => console.log(`  ? ${item.name} #${item.number ?? '-'} (id ${item.id}, ${item.stats?.appearances ?? 0} apps)`))

  if (!apply) { console.log('\nPreview only. Nothing was changed.'); return }
  const batch = db.batch()
  updates.forEach(({ match, change }) => batch.update(match.ref, { ...change, updatedAt: FieldValue.serverTimestamp() }))
  additions.forEach(({ id, ...player }) => batch.set(db.collection('players').doc(id), { ...player, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }))
  if (removeExtras) extras.forEach((item) => batch.delete(item.ref))
  await batch.commit()
  console.log(`\n✔ Done: ${updates.length} fixed, ${additions.length} added${removeExtras ? `, ${extras.length} removed` : ''}.`)
}

main().catch((error) => { console.error('✖', error.message); process.exit(1) })
