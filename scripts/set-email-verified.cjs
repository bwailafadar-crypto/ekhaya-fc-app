// Marks a user's email as verified in Firebase Auth (admin action). Used to
// unblock the account owner when the verification email can't be found.
//   EMAIL=someone@example.com node scripts/set-email-verified.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getAuth } = require('firebase-admin/auth')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  if (!email) throw new Error('No EMAIL provided')
  const auth = getAuth()
  const user = await auth.getUserByEmail(email)
  if (user.emailVerified) { note(`Already verified: ${email}`); return }
  await auth.updateUser(user.uid, { emailVerified: true })
  note(`Email verified for ${email} (uid ${user.uid.slice(0, 8)}…). They must sign out and back in, or refresh, to pick it up.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
