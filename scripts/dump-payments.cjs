// Read-only: show the most recent shop payment attempts and the exact failure
// reason PayChangu returned (stored by startShopPayment on failure).
//   EMAIL=someone@example.com node scripts/dump-payments.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  const db = getFirestore()
  let uid = null
  if (email) { try { uid = (await getAuth().getUserByEmail(email)).uid } catch { /* ignore */ } }
  let q = db.collection('shopPayments').orderBy('createdAt', 'desc').limit(8)
  const snap = await q.get()
  let shown = 0
  snap.forEach((d) => {
    const p = d.data()
    if (uid && p.uid !== uid) return
    shown++
    note(`pay ${d.id.slice(0, 14)}… status=${p.status} phone=${p.phone} method=${p.method} amount=${p.amount} reason=${JSON.stringify(p.failureReason || '').slice(0, 220)}`)
  })
  if (!shown) note('No payment attempts found for this account.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
