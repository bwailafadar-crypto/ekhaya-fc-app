// Puts the 2026 Ekhaya jerseys (gold, white, purple; Fan and Player version)
// into the club shop, and sets the shop window and the WhatsApp order number.
// From data/shop-2026.json; photos are in public/shop/.
// Old empty starter kits ("Home Kit 2026", "Away Kit 2026") are hidden.
//   node scripts/load-shop.cjs [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const lines = []
const say = (t) => { lines.push(t); if (!process.env.GITHUB_ACTIONS) console.log(t) }
const flush = () => { if (process.env.GITHUB_ACTIONS) for (let i = 0; i < lines.length; i += 4) console.log(`::notice::${lines.slice(i, i + 4).join(' || ')}`) }
const data = JSON.parse(fs.readFileSync(path.resolve('data/shop-2026.json'), 'utf8'))

async function main() {
  for (const p of data.products) for (const img of p.images) if (!fs.existsSync(path.resolve('public', img.replace(/^\.\//, '')))) throw new Error(`Missing photo ${img}`)
  const existing = (await db.collection('shopProducts').get()).docs
  say(`${apply ? 'SAVING' : 'PREVIEW'}: shop has ${existing.length} product(s) now: ${existing.map((d) => `${d.data().name} (${d.data().active ? 'on sale' : 'hidden'}, MK ${d.data().price || 0})`).join(', ') || 'none'}`)
  const batch = db.batch()
  for (const p of data.products) {
    const { id, ...rest } = p
    const doc = { ...data.common, ...rest, price: Math.min(...data.common.variants.map((v) => v.price)), soldOut: false, updatedAt: FieldValue.serverTimestamp() }
    const before = existing.find((d) => d.id === id)
    if (!before) doc.createdAt = FieldValue.serverTimestamp()
    batch.set(db.collection('shopProducts').doc(id), doc, { merge: true })
    say(`${before ? 'Update' : 'Add'} ${p.name}: ${data.common.variants.map((v) => `${v.label} MK ${v.price}`).join(' / ')}, sizes ${data.common.sizes.join(' ')}, ${p.images.length} photos`)
  }
  for (const d of existing) {
    const p = d.data()
    if (/^(home|away) kit 2026$/i.test(p.name || '') && p.active) { batch.update(d.ref, { active: false }); say(`Hide old starter item ${p.name}`) }
  }
  batch.set(db.collection('shopSettings').doc('main'), { ...data.settings, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  say(`Shop window: "${data.settings.bannerTitle}" · orders to WhatsApp ${data.settings.whatsapp}`)
  if (apply) { await batch.commit(); say('Saved.') } else say('Nothing saved. Run with apply to save.')
  flush()
}
main().catch((e) => { console.error(e); flush(); process.exit(1) })
