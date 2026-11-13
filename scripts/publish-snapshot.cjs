// Rebuilds publicData/snapshot (the one document fans read for fixtures, the
// league table and teams) from the live collections. Runs after every deploy
// and after the squad/cup workflows. Same rules as src/data/snapshotPayload.ts.
//   node scripts/publish-snapshot.cjs
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const MAX_BYTES = 900000
const PRIVATE_FIXTURE_FIELDS = ['statsAppliedChanges']

function db() {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) { initializeApp({ projectId: 'demo-ekhaya' }); return getFirestore() }
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
    if (!fs.existsSync(keyFile)) throw new Error('Firebase key not found')
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
  }
  return getFirestore()
}

const clean = (docs, drop = []) => docs
  .map((doc) => ({ ...doc.data(), id: doc.id }))
  .filter((row) => !row.isTest)
  .map((row) => { for (const f of drop) delete row[f]; return row })
  .sort((a, b) => String(a.id).localeCompare(String(b.id)))

const size = (value) => JSON.stringify(value, (_k, v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v)).length

async function writeDoc(store, name, payload, label) {
  const ref = store.collection('publicData').doc(name)
  const bytes = size(payload)
  if (bytes > MAX_BYTES) {
    await ref.set({ disabled: true, reason: 'too-large', hash: 'disabled', updatedAt: FieldValue.serverTimestamp() })
    console.log(`${label}: too large (${bytes} bytes), fans will read it directly.`)
    return
  }
  await ref.set({ ...payload, hash: `script-${Date.now().toString(36)}`, bytes, updatedAt: FieldValue.serverTimestamp() })
  console.log(`${label}: ${Math.round(bytes / 1024)} KB (${Math.round((bytes / 1048576) * 100)}% of the limit).`)
}

// Read the live collections and build the two fan payloads. Shared by the
// Firestore publisher below and by scripts/bake-snapshot.cjs (static files).
async function collect(store) {
  const [fixtures, standings, teams] = await Promise.all(['fixtures', 'standings', 'teams'].map((name) => store.collection(name).get()))
  return {
    snapshot: { fixtures: clean(fixtures.docs, PRIVATE_FIXTURE_FIELDS), standings: clean(standings.docs) },
    teams: { teams: clean(teams.docs) },
  }
}

async function publishSnapshot() {
  const store = db()
  const { snapshot: match, teams: clubs } = await collect(store)
  await writeDoc(store, 'snapshot', match, `Shared fan data (${match.fixtures.length} fixtures, ${match.standings.length} table rows)`)
  await writeDoc(store, 'teams', clubs, `Shared teams (${clubs.teams.length})`)
}

module.exports = { publishSnapshot, collect, db, size }

if (require.main === module) {
  publishSnapshot().catch((error) => { console.error('Snapshot failed:', error.message); process.exit(1) })
}
