// Looks up a user by email and shows or sets their role. Uses the admin SDK
// (service account), so it is not limited by the database rules.
//   EMAIL=someone@example.com node scripts/set-role.cjs            -> show current role
//   EMAIL=someone@example.com ROLE=superadmin node scripts/set-role.cjs --apply
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const EMAIL = String(process.env.EMAIL || '').trim().toLowerCase()
const ROLE = String(process.env.ROLE || '').trim()
const out = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
if (!EMAIL) { console.log('::error::Set EMAIL'); process.exit(1) }
if (apply && !['fan', 'admin', 'superadmin'].includes(ROLE)) { console.log('::error::ROLE must be fan, admin or superadmin'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const auth = getAuth(); const db = getFirestore()
;(async () => {
  let userRecord
  try { userRecord = await auth.getUserByEmail(EMAIL) } catch { console.log(`::error::No account signs in with ${EMAIL}. Check the exact email you log in with.`); process.exit(1) }
  const uid = userRecord.uid
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()
  const current = snap.exists ? (snap.data().role || '(none)') : '(no profile yet)'
  out(`${EMAIL} -> uid ${uid.slice(0, 8)}…, current role: ${current}`)
  if (!apply) { out('Preview only. Add ROLE and --apply to change it.'); return }
  await ref.set({ role: ROLE, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  out(`Done. ${EMAIL} is now "${ROLE}". They may need to sign out and back in once.`)
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1) })
