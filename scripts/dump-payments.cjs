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
  const snap = await db.collection('shopPayments').orderBy('createdAt', 'desc').limit(15).get()
  let shown = 0
  snap.forEach((d) => {
    const p = d.data()
    const t = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toISOString().slice(11, 19) : '?'
    const mine = uid && p.uid === uid ? '*' : ' '
    shown++
    note(`${mine}${t} ${d.id.slice(0, 12)} status=${p.status} phone=${p.phone} reason=${JSON.stringify(p.failureReason || '').slice(0, 180)}`)
  })
  if (!shown) note('No payment attempts at all.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
