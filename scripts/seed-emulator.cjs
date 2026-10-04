// Fills the LOCAL emulator with the club's real public data (ekhaya-data.json)
// and two test logins. Never touches the live database.
//   npm run emulators        (in one terminal)
//   npm run seed:emulator    (in another)
// Logins: admin@ekhaya.test / ekhaya123 (superadmin), fan@ekhaya.test / ekhaya123
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
const path = require('node:path')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')

initializeApp({ projectId: 'demo-ekhaya' })
const db = getFirestore()
const data = require(path.resolve('ekhaya-data.json'))

async function user(email, role, fullName) {
  const auth = getAuth()
  let account = await auth.getUserByEmail(email).catch(() => null)
  account ??= await auth.createUser({ email, password: 'ekhaya123', emailVerified: true, displayName: fullName })
  await db.collection('users').doc(account.uid).set({ role, email, fullName, phone: null, legacyFanDocId: null, legacyFanId: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
}

async function main() {
  const batch = db.batch()
  for (const name of ['teams', 'standings', 'players']) for (const row of data[name]) batch.set(db.collection(name).doc(row.id), row)
  for (const row of [...data.fixtures, ...(data.cupFixtures || [])]) {
    const { goals, ...fixture } = row
    batch.set(db.collection('fixtures').doc(row.id), fixture)
    ;(goals || []).forEach((goal, i) => batch.set(db.collection('fixtures').doc(row.id).collection('events').doc(`goal-${i + 1}`), { kind: 'goal', ...goal }))
  }
  await batch.commit()
  await user('admin@ekhaya.test', 'superadmin', 'Test Superadmin')
  await user('fan@ekhaya.test', 'fan', 'Test Fan')
  process.env.GOOGLE_APPLICATION_CREDENTIALS = ''
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log('Emulator ready: open http://localhost:5173 and sign in as admin@ekhaya.test / ekhaya123')
}
main().catch((error) => { console.error('Seeding failed:', error.message); process.exit(1) })
