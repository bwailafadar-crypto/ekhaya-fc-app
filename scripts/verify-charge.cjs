// Reads the latest pending/paid shop payment for a user and asks PayChangu
// directly whether that charge was completed. Read-only.
//   EMAIL=... PAYCHANGU_SECRET_KEY=... node scripts/verify-charge.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const API = 'https://api.paychangu.com'
const h = { authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`, accept: 'application/json' }

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  const uid = (await getAuth().getUserByEmail(email)).uid
  const db = getFirestore()
  const snap = await db.collection('shopPayments').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(1).get()
  if (snap.empty) { note('no payments'); return }
  const d = snap.docs[0]; const p = d.data()
  note(`latest payment ${d.id.slice(0, 14)} status=${p.status} chargeId=${p.chargeId}`)
  const r = await fetch(`${API}/mobile-money/payments/${encodeURIComponent(String(p.chargeId))}/verify`, { headers: h })
  const body = await r.text()
  note(`PayChangu verify -> ${r.status} ${body.slice(0, 300)}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
