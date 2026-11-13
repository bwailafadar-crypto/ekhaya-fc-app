// Read-only: dump a user's Firebase Auth + profile state to diagnose payment
// blocks (email verified? which provider? when last signed in / token refreshed?).
//   EMAIL=someone@example.com node scripts/dump-user.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  const auth = getAuth(); const db = getFirestore()
  const u = await auth.getUserByEmail(email)
  note(`uid=${u.uid.slice(0, 10)}… emailVerified=${u.emailVerified} disabled=${u.disabled}`)
  note(`providers=${u.providerData.map((p) => p.providerId).join(',') || 'none'}`)
  note(`created=${u.metadata.creationTime}`)
  note(`lastSignIn=${u.metadata.lastSignInTime}`)
  note(`lastTokenRefresh=${u.metadata.lastRefreshTime || 'n/a'}`)
  const snap = await db.collection('users').doc(u.uid).get()
  const d = snap.data() || {}
  note(`profile: role=${d.role} email=${d.email} disabled=${d.disabled}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
