// End-to-end payment test from the server side: acts as the user's account,
// creates a real order, and calls the LIVE payment endpoint exactly like the
// app does. If it works, a real PIN prompt is sent to the user's phone.
//   EMAIL=... PHONE=0983333372 FB_API_KEY=... node scripts/e2e-pay.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const PAY = 'https://ekhaya-pay.netlify.app/.netlify/functions/shop-pay-start'

;(async () => {
  const email = (process.env.EMAIL || '').trim().toLowerCase()
  const phone = (process.env.PHONE || '').trim()
  const apiKey = process.env.FB_API_KEY
  if (!apiKey) throw new Error('No FB_API_KEY')
  const auth = getAuth(); const db = getFirestore()
  const user = await auth.getUserByEmail(email)

  // 1) Create a real order for this user (bypasses client, same shape).
  const orderRef = db.collection('shopOrders').doc()
  await orderRef.set({
    ref: 'E2E-' + Date.now().toString(36).toUpperCase(), uid: user.uid, name: 'Brian Kayamba', phone,
    lines: [{ productId: 'payment-test', qty: 1 }], delivery: 'pickup', deliveryFee: 0, total: 100,
    status: 'new', payment: { method: 'airtel' }, createdAt: FieldValue.serverTimestamp(),
  })
  note(`order ${orderRef.id} created`)

  // 2) Sign in as the user: custom token -> ID token.
  const custom = await auth.createCustomToken(user.uid)
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
  })
  const exj = await ex.json()
  if (!exj.idToken) { note('token exchange FAILED: ' + JSON.stringify(exj).slice(0, 200)); return }
  note('got ID token for ' + email)

  // 3) Call the live payment endpoint exactly like the app.
  const r = await fetch(PAY, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${exj.idToken}`, origin: 'https://ekhaya-fc-app.web.app' },
    body: JSON.stringify({ orderId: orderRef.id, method: 'airtel', phone }),
  })
  const body = await r.text()
  note(`PAY-START -> ${r.status} ${body.slice(0, 300)}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
