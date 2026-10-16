// Finishes "Delete my account" requests (deletionRequests/{uid}) and removes
// old error reports. Runs every week on GitHub ("Weekly clean-up").
//   node scripts/purge-deleted.cjs          -> preview only
//   node scripts/purge-deleted.cjs --apply  -> delete
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const ERROR_DAYS = 90

async function refsFor(uid) {
  const refs = []
  const add = async (ref) => { if ((await ref.get()).exists) refs.push(ref) }
  for (const fixture of (await db.collection('fixtures').select().get()).docs) {
    for (const sub of ['predictions', 'motm', 'checkins', 'reactions']) await add(fixture.ref.collection(sub).doc(uid))
  }
  for (const poll of (await db.collection('polls').select().get()).docs) await add(poll.ref.collection('votes').doc(uid))
  for (const name of ['fanPoints', 'leaderboardEntries', 'fanCards', 'referrals', 'users']) await add(db.collection(name).doc(uid))
  const membership = await db.collection('memberships').doc(uid).get()
  // Paid memberships stay for the club's financial records; unpaid requests go.
  if (membership.exists && membership.data().status !== 'active') refs.push(membership.ref)
  for (const snap of [
    await db.collection('pushTokens').where('uid', '==', uid).get(),
    await db.collection('referrals').where('by', '==', uid).get(),
    await db.collection('clientErrors').where('uid', '==', uid).get(),
  ]) snap.docs.forEach((d) => refs.push(d.ref))
  return refs
}

async function deleteAll(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

async function main() {
  console.log(apply ? 'CLEAN-UP (deleting):' : 'PREVIEW - nothing is deleted:')
  const requests = (await db.collection('deletionRequests').get()).docs
  console.log(`\nAccount deletion requests: ${requests.length}`)
  for (const request of requests) {
    const uid = request.id
    const refs = await refsFor(uid)
    console.log(`  - ${request.data().email || uid}: ${refs.length} record(s) to remove`)
    if (!apply) continue
    await deleteAll(refs)
    await getAuth().deleteUser(uid).catch((error) => { if (error.code !== 'auth/user-not-found') throw error })
    await request.ref.delete()
  }

  const cutoff = Timestamp.fromMillis(Date.now() - ERROR_DAYS * 86_400_000)
  const oldErrors = (await db.collection('clientErrors').where('createdAt', '<', cutoff).get()).docs
  console.log(`\nError reports older than ${ERROR_DAYS} days: ${oldErrors.length}`)
  if (apply) await deleteAll(oldErrors.map((d) => d.ref))
  console.log(apply ? '\nDone.' : '\nRun with --apply to delete.')
  if (apply && requests.length) console.log('Tip: recalculate the Fan Zone leaderboard so deleted fans disappear from it.')
}

main().catch((error) => { console.error('Clean-up failed:', error.message); process.exit(1) })
