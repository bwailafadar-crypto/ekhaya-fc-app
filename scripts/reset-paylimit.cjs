// Clears the payment anti-spam limit for a user so they can try again now.
//   EMAIL=someone@example.com node scripts/reset-paylimit.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  const uid = (await getAuth().getUserByEmail(email)).uid
  await getFirestore().collection('payLimits').doc(uid).delete()
  note(`Cleared payment limit for ${email}. They can request a PIN again now.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
