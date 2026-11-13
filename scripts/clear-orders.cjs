// Deletes ALL shop orders and shop payments (resets the Sales dashboard to zero).
// Use only before the shop is opened to real fans — every current order is test
// data. Products, squad, standings and everything else are left untouched.
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

async function wipe(name) {
  let total = 0
  while (true) {
    const snap = await db.collection(name).limit(300).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    total += snap.size
    if (snap.size < 300) break
  }
  note(`Cleared ${total} from ${name}.`)
}

;(async () => { await wipe('shopOrders'); await wipe('shopPayments'); await wipe('payLimits'); note('Dashboard reset to zero.') })()
  .catch((e) => { console.log('::error::' + e.message); process.exit(1) })
